import fs from 'fs';
import path from 'path';
import type { HarnessKernel } from '../../src/harness/cordis.ts';
import { MARKETPLACE_CATALOG } from '../../src/harness/marketplaceCatalog.ts';
import type {
  MakeblockBoardProfileId,
  MarketplaceEntry,
  MarketplaceModuleState,
  MarketplaceSnapshot,
} from '../../src/harness/types.ts';
import type { ServerHarnessServices } from './types.ts';

interface PersistedMarketplaceFile {
  activeDeviceId: string;
  modules: Record<string, MarketplaceModuleState>;
  updatedAt: string;
}

export interface MarketplaceController {
  getSnapshot: () => MarketplaceSnapshot;
  installModule: (moduleId: string) => MarketplaceSnapshot;
  uninstallModule: (moduleId: string) => MarketplaceSnapshot;
  activateModule: (moduleId: string) => MarketplaceSnapshot;
  deactivateModule: (moduleId: string) => MarketplaceSnapshot;
  syncToKernel: () => void;
  syncFromKernel: () => void;
}

export function createMarketplaceController(
  rootDir: string,
  kernel: HarnessKernel<ServerHarnessServices>
): MarketplaceController {
  const dataDir = path.join(rootDir, 'data');
  const filePath = path.join(dataDir, 'marketplace.json');

  const states = new Map<string, MarketplaceModuleState>();
  let activeDeviceId = 'dev-auriga-stm32';
  let updatedAt = new Date().toISOString();

  const initDefaults = () => {
    states.clear();
    for (const desc of MARKETPLACE_CATALOG) {
      states.set(desc.id, {
        installed: desc.defaultInstalled,
        active: desc.defaultActive,
        installedAt: desc.defaultInstalled ? updatedAt : undefined,
      });
    }
    activeDeviceId = 'dev-auriga-stm32';
  };

  const loadFromDisk = () => {
    initDefaults();
    try {
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedMarketplaceFile>;
      if (parsed && parsed.modules && typeof parsed.modules === 'object') {
        for (const desc of MARKETPLACE_CATALOG) {
          const saved = parsed.modules[desc.id];
          if (saved && typeof saved.installed === 'boolean' && typeof saved.active === 'boolean') {
            states.set(desc.id, {
              installed: desc.locked ? true : saved.installed,
              active: desc.locked ? true : saved.installed && saved.active,
              installedAt: saved.installedAt,
            });
          }
        }
      }
      if (typeof parsed.activeDeviceId === 'string') {
        const dev = MARKETPLACE_CATALOG.find((m) => m.id === parsed.activeDeviceId && m.category === 'device');
        if (dev) {
          activeDeviceId = dev.id;
          for (const d of MARKETPLACE_CATALOG.filter((m) => m.category === 'device')) {
            const st = states.get(d.id)!;
            states.set(d.id, {
              ...st,
              installed: d.id === activeDeviceId ? true : st.installed,
              active: d.id === activeDeviceId,
            });
          }
        }
      }
      if (typeof parsed.updatedAt === 'string') {
        updatedAt = parsed.updatedAt;
      }
    } catch {
      initDefaults();
    }
  };

  const saveToDisk = () => {
    updatedAt = new Date().toISOString();
    const record: Record<string, MarketplaceModuleState> = {};
    for (const [id, st] of states.entries()) {
      record[id] = st;
    }
    const payload: PersistedMarketplaceFile = {
      activeDeviceId,
      modules: record,
      updatedAt,
    };
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // Ignore write failures in read-only edge cases
    }
  };

  const getDescriptor = (moduleId: string) => {
    const desc = MARKETPLACE_CATALOG.find((m) => m.id === moduleId);
    if (!desc) {
      throw new Error(`Модуль Маркетплейса "${moduleId}" не найден`);
    }
    return desc;
  };

  const applyPortalModuleToKernel = (descId: string, active: boolean) => {
    const desc = getDescriptor(descId);
    if (desc.category !== 'portal') return;

    if (desc.id === 'mod-portal-llm-gemini') {
      if (active) {
        kernel.switchSeamProvider('dsh-llm', 'dsh-llm-gemini');
      } else {
        kernel.switchSeamProvider('dsh-llm', 'dsh-llm-deterministic');
      }
      return;
    }

    if (desc.seamBinding && active) {
      kernel.switchSeamProvider(desc.seamBinding.seamId, desc.seamBinding.providerId);
    }

    if (desc.cordisPlugins) {
      const ordered = active ? desc.cordisPlugins : [...desc.cordisPlugins].reverse();
      for (const pluginId of ordered) {
        try {
          kernel.togglePlugin(pluginId, active);
        } catch {
          // Ignore locked or unknown plugin errors
        }
      }
    }
  };

  const syncToKernel = () => {
    for (const desc of MARKETPLACE_CATALOG) {
      if (desc.category !== 'portal') continue;
      const st = states.get(desc.id);
      if (!st) continue;
      applyPortalModuleToKernel(desc.id, st.installed && st.active);
    }
  };

  const syncFromKernel = () => {
    const snap = kernel.getSnapshot();
    const statusById = new Map(snap.plugins.map((p) => [p.id, p.status === 'active']));
    let changed = false;

    for (const desc of MARKETPLACE_CATALOG) {
      if (desc.category !== 'portal' || !desc.cordisPlugins?.length) continue;
      const allActive = desc.cordisPlugins.every((pid) => statusById.get(pid) === true);
      const cur = states.get(desc.id);
      if (cur && cur.active !== allActive) {
        states.set(desc.id, {
          installed: allActive ? true : cur.installed,
          active: allActive,
          installedAt: cur.installedAt || (allActive ? new Date().toISOString() : undefined),
        });
        changed = true;
      }
    }
    if (changed) saveToDisk();
  };

  const getSnapshot = (): MarketplaceSnapshot => {
    const modules: MarketplaceEntry[] = MARKETPLACE_CATALOG.map((desc) => {
      const st = states.get(desc.id) || {
        installed: desc.defaultInstalled,
        active: desc.defaultActive,
      };
      return { ...desc, ...st };
    });

    const activeDevice =
      modules.find((m) => m.id === activeDeviceId && m.category === 'device') ||
      modules.find((m) => m.category === 'device' && m.active) ||
      modules[0];

    const activeBoardProfile: MakeblockBoardProfileId =
      activeDevice?.boardProfile || 'auriga_stm32';

    const activeMBlockExtensions = modules
      .filter((m) => m.category === 'extension' && m.installed && m.active && m.mblockExtensionId)
      .map((m) => m.mblockExtensionId as string);

    return {
      activeDeviceId: activeDevice?.id || 'dev-auriga-stm32',
      activeBoardProfile,
      activeMBlockExtensions,
      modules,
      updatedAt,
    };
  };

  const installModule = (moduleId: string): MarketplaceSnapshot => {
    const desc = getDescriptor(moduleId);
    const cur = states.get(desc.id) || { installed: false, active: false };
    states.set(desc.id, {
      ...cur,
      installed: true,
      installedAt: cur.installedAt || new Date().toISOString(),
    });
    kernel.recordEvent(
      'plugin:mount',
      `marketplace:${desc.id}`,
      `Установлен модуль Маркетплейса «${desc.shortLabel}» (v${desc.version})`
    );
    saveToDisk();
    return getSnapshot();
  };

  const activateModule = (moduleId: string): MarketplaceSnapshot => {
    const desc = getDescriptor(moduleId);
    const now = new Date().toISOString();

    if (desc.category === 'device') {
      for (const item of MARKETPLACE_CATALOG) {
        if (item.category !== 'device') continue;
        const prev = states.get(item.id) || { installed: false, active: false };
        if (item.id === desc.id) {
          states.set(item.id, {
            installed: true,
            active: true,
            installedAt: prev.installedAt || now,
          });
        } else {
          states.set(item.id, { ...prev, active: false });
        }
      }
      activeDeviceId = desc.id;
      kernel.recordEvent(
        'seam:swap',
        `marketplace:${desc.id}`,
        `Подключено оборудование «${desc.shortLabel}» (${desc.boardProfile}, ${desc.baudRate} бод)`
      );
    } else if (desc.category === 'portal') {
      const prev = states.get(desc.id);
      states.set(desc.id, {
        installed: true,
        active: true,
        installedAt: prev?.installedAt || now,
      });
      applyPortalModuleToKernel(desc.id, true);
      kernel.recordEvent(
        'plugin:mount',
        `marketplace:${desc.id}`,
        `Активирован модуль портала «${desc.shortLabel}»`
      );
    } else {
      const prev = states.get(desc.id);
      states.set(desc.id, {
        installed: true,
        active: true,
        installedAt: prev?.installedAt || now,
      });
      kernel.recordEvent(
        'plugin:mount',
        `marketplace:${desc.id}`,
        `Подключено расширение mBlock «${desc.shortLabel}»`
      );
    }

    saveToDisk();
    return getSnapshot();
  };

  const deactivateModule = (moduleId: string): MarketplaceSnapshot => {
    const desc = getDescriptor(moduleId);
    if (desc.locked) {
      throw new Error(`Базовый модуль «${desc.shortLabel}» защищён от отключения`);
    }
    if (desc.category === 'device') {
      if (desc.id === activeDeviceId) {
        // Fallback to default primary controller rather than leaving 0 hardware devices
        return activateModule('dev-auriga-stm32');
      }
      const prev = states.get(desc.id) || { installed: true, active: false };
      states.set(desc.id, { ...prev, active: false });
    } else if (desc.category === 'portal') {
      const prev = states.get(desc.id) || { installed: true, active: false };
      states.set(desc.id, { ...prev, active: false });
      applyPortalModuleToKernel(desc.id, false);
      kernel.recordEvent(
        'plugin:unmount',
        `marketplace:${desc.id}`,
        `Отключён модуль портала «${desc.shortLabel}»`
      );
    } else {
      const prev = states.get(desc.id) || { installed: true, active: false };
      states.set(desc.id, { ...prev, active: false });
      kernel.recordEvent(
        'plugin:unmount',
        `marketplace:${desc.id}`,
        `Отключено расширение mBlock «${desc.shortLabel}»`
      );
    }

    saveToDisk();
    return getSnapshot();
  };

  const uninstallModule = (moduleId: string): MarketplaceSnapshot => {
    const desc = getDescriptor(moduleId);
    if (desc.locked) {
      throw new Error(`Базовый модуль «${desc.shortLabel}» нельзя удалить`);
    }
    if (desc.category === 'portal') {
      applyPortalModuleToKernel(desc.id, false);
    }
    states.set(desc.id, { installed: false, active: false });
    if (desc.category === 'device' && activeDeviceId === desc.id) {
      activeDeviceId = 'dev-auriga-stm32';
      const fallback = states.get(activeDeviceId);
      states.set(activeDeviceId, {
        installed: true,
        active: true,
        installedAt: fallback?.installedAt || new Date().toISOString(),
      });
    }
    kernel.recordEvent(
      'plugin:unmount',
      `marketplace:${desc.id}`,
      `Удалён модуль Маркетплейса «${desc.shortLabel}»`
    );
    saveToDisk();
    return getSnapshot();
  };

  loadFromDisk();

  return {
    getSnapshot,
    installModule,
    uninstallModule,
    activateModule,
    deactivateModule,
    syncToKernel,
    syncFromKernel,
  };
}
