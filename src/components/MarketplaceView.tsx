import React, { useMemo, useState } from 'react';
import {
  Archive,
  Blocks,
  Check,
  Copy,
  Cpu,
  Download,
  FileCode2,
  Lock,
  PackagePlus,
  Power,
  Puzzle,
  RefreshCw,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type {
  HarnessBundleId,
  HarnessRuntimeSnapshot,
  MarketplaceCategory,
  MarketplaceEntry,
  MarketplaceSnapshot,
  VerdaccioPackageRecord,
} from '../harness/types.ts';
import type { WorkspaceTab } from '../harness/frontendRegistry.ts';

interface MarketplaceViewProps {
  marketplace: MarketplaceSnapshot | null;
  snapshot: HarnessRuntimeSnapshot | null;
  loading: boolean;
  busyAction: string | null;
  error: string | null;
  onRefresh: () => void;
  onInstallModule: (moduleId: string) => Promise<MarketplaceSnapshot | null>;
  onUninstallModule: (moduleId: string) => Promise<MarketplaceSnapshot | null>;
  onActivateModule: (moduleId: string) => Promise<MarketplaceSnapshot | null>;
  onDeactivateModule: (moduleId: string) => Promise<MarketplaceSnapshot | null>;
  onPublishToVerdaccio: (payload: {
    name: string;
    version: string;
    description: string;
    subsystem?: string;
    bundle?: HarnessBundleId;
    dshTools?: string[];
  }) => Promise<boolean>;
  onSyncVerdaccio: () => Promise<void>;
  onOpenTab: (tab: WorkspaceTab) => void;
}

type FilterTab = 'all' | MarketplaceCategory | 'installed' | 'verdaccio';

const CATEGORY_LABEL: Record<MarketplaceCategory, string> = {
  device: 'Оборудование',
  portal: 'Модуль портала',
  extension: 'Расширение mBlock',
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  marketplace,
  snapshot,
  loading,
  busyAction,
  error,
  onRefresh,
  onInstallModule,
  onUninstallModule,
  onActivateModule,
  onDeactivateModule,
  onPublishToVerdaccio,
  onSyncVerdaccio,
  onOpenTab,
}) => {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPkg, setCopiedPkg] = useState<string | null>(null);
  const [inspectPackument, setInspectPackument] = useState<{
    pkg: VerdaccioPackageRecord;
    packument: Record<string, unknown>;
  } | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const [showPublishForm, setShowPublishForm] = useState(false);
  const [pubName, setPubName] = useState('@school76/dsh-radiation-log');
  const [pubVersion, setPubVersion] = useState('1.0.0');
  const [pubSubsystem, setPubSubsystem] = useState('PAYLOAD · Radiation');
  const [pubBundle, setPubBundle] = useState<HarnessBundleId>('dsh-cubesat');
  const [pubTools, setPubTools] = useState('payload.dose_rate');
  const [pubDesc, setPubDesc] = useState(
    'Модуль DeepSeek-Harness для расчёта накопленной дозы радиации и порогов защиты SRAM памяти OBC.'
  );

  const modules = useMemo(() => marketplace?.modules ?? [], [marketplace]);
  const verdaccio = marketplace?.verdaccio;

  const activeDevice = useMemo(
    () => modules.find((m) => m.category === 'device' && m.active) || null,
    [modules]
  );

  const counts = useMemo(() => {
    const installed = modules.filter((m) => m.installed).length;
    const devices = modules.filter((m) => m.category === 'device').length;
    const portal = modules.filter((m) => m.category === 'portal').length;
    const extension = modules.filter((m) => m.category === 'extension').length;
    const activePortal = modules.filter((m) => m.category === 'portal' && m.active).length;
    const activeExtensions = modules.filter((m) => m.category === 'extension' && m.active).length;
    const verdaccioCount = verdaccio?.totalPackages ?? 0;
    return { installed, devices, portal, extension, activePortal, activeExtensions, verdaccioCount };
  }, [modules, verdaccio]);

  const filteredModules = useMemo(() => {
    if (filterTab === 'verdaccio') return [];
    const q = searchQuery.trim().toLowerCase();
    return modules.filter((m) => {
      if (filterTab === 'installed' && !m.installed) return false;
      if (filterTab !== 'all' && filterTab !== 'installed' && m.category !== filterTab) {
        return false;
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.shortLabel.toLowerCase().includes(q) ||
        m.subsystem.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.author.toLowerCase().includes(q) ||
        (m.verdaccioPackage?.toLowerCase().includes(q) ?? false) ||
        (m.dshTools?.some((t) => t.toLowerCase().includes(q)) ?? false)
      );
    });
  }, [modules, filterTab, searchQuery]);

  const filteredVerdaccioPackages = useMemo(() => {
    const pkgs = verdaccio?.packages ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pkgs;
    return pkgs.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.subsystem.toLowerCase().includes(q) ||
        p.dshTools.some((t) => t.toLowerCase().includes(q)) ||
        p.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [verdaccio, searchQuery]);

  const moduleByVerdaccioName = useMemo(() => {
    const map = new Map<string, MarketplaceEntry>();
    for (const m of modules) {
      if (m.verdaccioPackage) map.set(m.verdaccioPackage, m);
    }
    return map;
  }, [modules]);

  const handleActivateWithDeps = async (mod: MarketplaceEntry) => {
    const updated = await onActivateModule(mod.id);
    if (updated && mod.category === 'device' && mod.recommendedExtensions?.length) {
      for (const extId of mod.recommendedExtensions) {
        const target = updated.modules.find((m) => m.id === extId);
        if (target && !target.active) {
          await onActivateModule(extId);
        }
      }
    }
  };

  const handleCopyNpmInstall = async (pkg: VerdaccioPackageRecord) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const cmd = `npm install ${pkg.name}@${pkg.version} --registry ${origin}/verdaccio`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedPkg(pkg.name);
      window.setTimeout(() => setCopiedPkg(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleInspectPackument = async (pkg: VerdaccioPackageRecord) => {
    setInspectLoading(true);
    try {
      const res = await fetch(`/api/verdaccio/package?name=${encodeURIComponent(pkg.name)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.packument) {
        setInspectPackument({ pkg, packument: data.packument as Record<string, unknown> });
      }
    } finally {
      setInspectLoading(false);
    }
  };

  const handleSubmitPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubName.trim() || !pubDesc.trim()) return;
    const tools = pubTools
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ok = await onPublishToVerdaccio({
      name: pubName.trim(),
      version: pubVersion.trim() || '1.0.0',
      description: pubDesc.trim(),
      subsystem: pubSubsystem.trim() || 'DSH · Module',
      bundle: pubBundle,
      dshTools: tools,
    });
    if (ok) {
      setShowPublishForm(false);
    }
  };

  if (loading && !marketplace) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-600">
          Загрузка каталога оборудования, модулей DSH и хранилища Verdaccio…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
      {/* Header & Active Hardware + Verdaccio Summary Strip */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2">
              <Puzzle className="w-4 h-4 text-sky-600 shrink-0" />
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Маркетплейс модулей DSH, оборудования и реестр Verdaccio
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Подключение контроллеров mBlock 5, модулей{' '}
              <span className="font-mono text-slate-800">DeepSeek-Harness (Cordis)</span> и управление
              пакетами <span className="font-mono text-slate-800">@school76/dsh-*</span> в локальном
              npm-хранилище Verdaccio с реальными <span className="font-mono text-slate-800">.tgz</span>{' '}
              тарболами.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFilterTab('verdaccio')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              Хранилище Verdaccio ({counts.verdaccioCount})
            </button>
            <button
              type="button"
              onClick={() => onOpenTab('mblock')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors"
            >
              <Blocks className="w-3.5 h-3.5" />
              Открыть студию mBlock
            </button>
            <button
              type="button"
              onClick={() => onOpenTab('harness')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            >
              Ядро Harness
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Обновить
            </button>
          </div>
        </div>

        {/* Connected Hardware & Runtime & Verdaccio Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-4 border-t border-slate-100">
          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Активное оборудование
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-sm font-semibold text-slate-900 truncate">
                {activeDevice ? activeDevice.shortLabel : 'Не выбрано'}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums truncate">
              {activeDevice
                ? `${activeDevice.boardProfile} · ${activeDevice.baudRate ?? 115200} бод`
                : 'Подключите устройство ниже'}
            </div>
          </div>

          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Модули портала (DSH)
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900 font-mono tabular-nums">
              {counts.activePortal} / {counts.portal}
            </div>
            <div className="text-[11px] text-slate-500">Плагины и швы ядра</div>
          </div>

          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Расширения mBlock
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900 font-mono tabular-nums">
              {counts.activeExtensions} / {counts.extension}
            </div>
            <div className="text-[11px] text-slate-500">Категорий блоков Blockly</div>
          </div>

          <div className="px-3.5 py-2.5 bg-emerald-50/70 border border-emerald-200 rounded-md">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
              Хранилище Verdaccio
            </div>
            <div className="mt-1 text-lg font-bold text-emerald-900 font-mono tabular-nums">
              {verdaccio ? `${verdaccio.totalPackages} пак.` : '—'}
            </div>
            <div className="font-mono text-[11px] text-emerald-800 tabular-nums truncate">
              {verdaccio
                ? `${formatBytes(verdaccio.totalBytes)} · ${verdaccio.totalDownloads} скач.`
                : '/verdaccio'}
            </div>
          </div>

          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Профиль DeepSeek-Harness
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 font-mono truncate">
              {snapshot?.activeProfileId || 'cubesat-full'}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
              {snapshot
                ? `${snapshot.metrics.activePlugins} плаг. · ${snapshot.metrics.registeredTools} tools`
                : 'Синхронизация…'}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all' as FilterTab, label: `Все (${modules.length})` },
            { id: 'device' as FilterTab, label: `Оборудование (${counts.devices})` },
            { id: 'portal' as FilterTab, label: `Модули DSH (${counts.portal})` },
            { id: 'extension' as FilterTab, label: `Расширения mBlock (${counts.extension})` },
            { id: 'installed' as FilterTab, label: `Установленные (${counts.installed})` },
            { id: 'verdaccio' as FilterTab, label: `Хранилище Verdaccio (${counts.verdaccioCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterTab === tab.id
                  ? tab.id === 'verdaccio'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по модулю, пакету @school76 или tool…"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Verdaccio Registry Explorer View */}
      {filterTab === 'verdaccio' ? (
        <section className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-700">
                <span className="font-semibold text-emerald-800">{verdaccio?.engine}</span>
                <span>·</span>
                <span>Реестр: {verdaccio?.registryUrl || '/verdaccio'}</span>
                <span>·</span>
                <span>Диск: {verdaccio?.storageDir || 'data/verdaccio'}</span>
              </div>
              <p className="text-xs text-slate-600">
                Каждый пакет сохранён как реальный gzipped tarball (<span className="font-mono">.tgz</span>) с
                хэшем SHA-512 и доступен через стандартный npm CLI{' '}
                <span className="font-mono text-slate-800">--registry {verdaccio?.registryUrl || '/verdaccio'}</span>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void onSyncVerdaccio()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Синхронизировать
              </button>
              <button
                type="button"
                onClick={() => setShowPublishForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                {showPublishForm ? 'Скрыть форму' : 'Опубликовать пакет в Verdaccio'}
              </button>
            </div>
          </div>

          {showPublishForm && (
            <form
              onSubmit={handleSubmitPublish}
              className="bg-white border border-emerald-200 rounded-lg p-4 space-y-3"
            >
              <div className="text-sm font-semibold text-slate-900">
                Публикация нового пакета dsh в хранилище Verdaccio и Маркетплейс
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Имя npm-пакета
                  </label>
                  <input
                    type="text"
                    required
                    value={pubName}
                    onChange={(e) => setPubName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Версия</label>
                  <input
                    type="text"
                    value={pubVersion}
                    onChange={(e) => setPubVersion(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Подсистема
                  </label>
                  <input
                    type="text"
                    value={pubSubsystem}
                    onChange={(e) => setPubSubsystem(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Бандл Cordis
                  </label>
                  <select
                    value={pubBundle}
                    onChange={(e) => setPubBundle(e.target.value as HarnessBundleId)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md bg-white"
                  >
                    <option value="dsh-cubesat">dsh-cubesat</option>
                    <option value="dsh-devops">dsh-devops</option>
                    <option value="dsh-collab">dsh-collab</option>
                    <option value="dsh-base">dsh-base</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Инструменты dsh-tools (через запятую)
                  </label>
                  <input
                    type="text"
                    value={pubTools}
                    onChange={(e) => setPubTools(e.target.value)}
                    placeholder="payload.dose_rate, payload.reset_counter"
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Описание модуля
                  </label>
                  <input
                    type="text"
                    required
                    value={pubDesc}
                    onChange={(e) => setPubDesc(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPublishForm(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md disabled:opacity-50"
                >
                  {busyAction === 'verdaccio:publish' ? 'Публикация…' : 'Собрать .tgz и опубликовать'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Пакет Verdaccio</th>
                    <th className="px-4 py-3">Версия / Плагин</th>
                    <th className="px-4 py-3">Инструменты dsh-tools</th>
                    <th className="px-4 py-3">Архив .tgz</th>
                    <th className="px-4 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredVerdaccioPackages.map((pkg) => {
                    const linkedModule = moduleByVerdaccioName.get(pkg.name);
                    const isBusy = linkedModule ? (busyAction?.endsWith(`:${linkedModule.id}`) ?? false) : false;
                    return (
                      <tr key={pkg.name} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 align-top max-w-sm">
                          <div className="font-mono font-semibold text-slate-900">{pkg.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{pkg.subsystem}</div>
                          <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{pkg.description}</p>
                        </td>
                        <td className="px-4 py-3 align-top font-mono text-[11px]">
                          <div className="text-slate-900 font-semibold tabular-nums">
                            v{pkg.version} <span className="text-slate-400">· latest</span>
                          </div>
                          <div className="text-slate-600 mt-0.5">{pkg.dshPluginId || '—'}</div>
                          <div className="text-slate-400 mt-0.5">{pkg.bundle}</div>
                        </td>
                        <td className="px-4 py-3 align-top font-mono text-[11px] text-slate-700">
                          {pkg.dshTools.length > 0 ? pkg.dshTools.join(', ') : '—'}
                        </td>
                        <td className="px-4 py-3 align-top font-mono text-[11px] tabular-nums">
                          <div className="text-slate-800">
                            {formatBytes(pkg.dist.tarballBytes)} ({pkg.dist.fileCount} файла)
                          </div>
                          <div className="text-slate-400 truncate max-w-[160px]" title={pkg.dist.integrity}>
                            sha1:{pkg.dist.shasum.slice(0, 10)}
                          </div>
                          <div className="text-slate-500 mt-0.5">скач.: {pkg.downloads}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleCopyNpmInstall(pkg)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50"
                              title="Скопировать команду npm install"
                            >
                              {copiedPkg === pkg.name ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              npm i
                            </button>
                            <button
                              type="button"
                              disabled={inspectLoading}
                              onClick={() => void handleInspectPackument(pkg)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50"
                            >
                              <FileCode2 className="w-3 h-3" />
                              Packument
                            </button>
                            <a
                              href={pkg.dist.tarball}
                              download
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100"
                            >
                              <Download className="w-3 h-3" />
                              .tgz
                            </a>
                            {linkedModule && !linkedModule.active && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleActivateWithDeps(linkedModule)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-sky-600 rounded hover:bg-sky-700 disabled:opacity-50"
                              >
                                <Power className="w-3 h-3" />
                                Подключить
                              </button>
                            )}
                            {linkedModule && linkedModule.active && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Активен
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : filteredModules.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          По выбранному фильтру модули не найдены.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredModules.map((mod) => {
            const isBusy = busyAction?.endsWith(`:${mod.id}`) ?? false;
            const CategoryIcon =
              mod.category === 'device' ? Cpu : mod.category === 'extension' ? Blocks : Zap;

            return (
              <article
                key={mod.id}
                className={`bg-white border rounded-lg p-4 flex flex-col justify-between gap-4 transition-colors ${
                  mod.active ? 'border-sky-300 bg-sky-50/15' : 'border-slate-200'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <CategoryIcon className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>
                        {CATEGORY_LABEL[mod.category]} · {mod.subsystem}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 shrink-0 tabular-nums">
                      <span>v{mod.version}</span>
                      <span>·</span>
                      {mod.active ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {mod.category === 'device' ? 'Подключено' : 'Активен'}
                        </span>
                      ) : mod.installed ? (
                        <span className="inline-flex items-center gap-1 font-medium text-sky-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                          Установлен
                        </span>
                      ) : (
                        <span className="text-slate-400">Не установлен</span>
                      )}
                    </span>
                  </div>

                  <div>
                    <h2 className="text-sm font-bold text-slate-900 leading-snug flex items-center gap-1.5">
                      <span>{mod.name}</span>
                      {mod.locked && (
                        <Lock
                          className="w-3 h-3 text-slate-400 shrink-0"
                          aria-label="Базовый системный модуль"
                        />
                      )}
                    </h2>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">{mod.description}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] font-mono text-slate-500">
                    <div>
                      Автор: <span className="text-slate-700">{mod.author}</span>
                    </div>
                    {mod.protocol && (
                      <div className="truncate">
                        Протокол: <span className="text-slate-700">{mod.protocol}</span>
                      </div>
                    )}
                    {mod.cordisPlugins && mod.cordisPlugins.length > 0 && (
                      <div className="truncate">
                        Cordis: <span className="text-slate-700">{mod.cordisPlugins.join(', ')}</span>
                      </div>
                    )}
                    {mod.verdaccio && (
                      <div className="flex items-center justify-between gap-2 truncate">
                        <span className="truncate">
                          Verdaccio:{' '}
                          <span className="text-emerald-700 font-semibold">{mod.verdaccio.name}</span>{' '}
                          <span className="text-slate-400 tabular-nums">
                            ({formatBytes(mod.verdaccio.dist.tarballBytes)})
                          </span>
                        </span>
                        <a
                          href={mod.verdaccio.dist.tarball}
                          download
                          className="text-sky-700 hover:underline shrink-0"
                        >
                          .tgz
                        </a>
                      </div>
                    )}
                    {mod.dshTools && mod.dshTools.length > 0 && (
                      <div className="truncate">
                        dsh-tools: <span className="text-slate-700">{mod.dshTools.join(', ')}</span>
                      </div>
                    )}
                    {mod.toolboxCategoryName && (
                      <div className="truncate">
                        Палитра Blockly: <span className="text-slate-700">{mod.toolboxCategoryName}</span>
                      </div>
                    )}
                    {mod.recommendedExtensions && mod.recommendedExtensions.length > 0 && (
                      <div className="truncate">
                        Реком. модули: <span className="text-slate-700">{mod.recommendedExtensions.length} шт.</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  {!mod.installed ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void onInstallModule(mod.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5 text-sky-600" />
                        Установить
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleActivateWithDeps(mod)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
                      >
                        <Power className="w-3.5 h-3.5" />
                        {mod.category === 'device' ? 'Подключить' : 'Установить и включить'}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        {mod.active ? (
                          mod.category === 'device' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <Check className="w-3.5 h-3.5" />
                              Активный контроллер
                            </span>
                          ) : mod.locked ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                              <Lock className="w-3 h-3" />
                              Обязательный
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void onDeactivateModule(mod.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
                            >
                              Отключить
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleActivateWithDeps(mod)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
                          >
                            <Power className="w-3.5 h-3.5" />
                            {mod.category === 'device' ? 'Подключить' : 'Активировать'}
                          </button>
                        )}
                      </div>

                      {!mod.locked && !mod.active && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void onUninstallModule(mod.id)}
                          title="Удалить модуль из установленных"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Удалить
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Packument JSON Inspector Modal */}
      {inspectPackument && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-mono text-sm font-bold text-slate-900">
                  {inspectPackument.pkg.name}@{inspectPackument.pkg.version}
                </div>
                <div className="font-mono text-[11px] text-slate-500">
                  GET /verdaccio/{inspectPackument.pkg.name} · {inspectPackument.pkg.dist.integrity.slice(0, 36)}…
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectPackument(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="p-4 text-[11px] font-mono text-slate-800 bg-slate-50 overflow-auto flex-1">
              {JSON.stringify(inspectPackument.packument, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
