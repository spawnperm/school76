import { HarnessKernel } from './cordis.ts';
import type { HarnessBundleId, HarnessRuntimeSnapshot } from './types.ts';

export type WorkspaceTab =
  | 'harness'
  | 'marketplace'
  | 'projects'
  | 'tasks'
  | 'wiki'
  | 'mblock'
  | 'ci'
  | 'chat'
  | 'cabinet';

export type HarnessWorkspaceSlotId = Exclude<WorkspaceTab, 'cabinet'>;

export interface FrontendNavSlot {
  tab: HarnessWorkspaceSlotId;
  pluginId: string;
  label: string;
  bundle: HarnessBundleId;
  order: number;
}

interface ClientHarnessServices extends Record<string, unknown> {
  snapshot: HarnessRuntimeSnapshot | null;
  slots: Record<string, FrontendNavSlot>;
}

const SLOT_DEFS: Array<{
  pluginId: string;
  tab: HarnessWorkspaceSlotId;
  label: string;
  name: string;
  description: string;
  bundle: HarnessBundleId;
  order: number;
  locked?: boolean;
}> = [
  {
    pluginId: 'dsh-ui-harness',
    tab: 'harness',
    label: 'Harness',
    name: 'Консоль DeepSeek-Harness',
    description: 'Управление профилями Cordis, швами (seams), плагинами и запуском агентского цикла.',
    bundle: 'dsh-base',
    order: 0,
    locked: true,
  },
  {
    pluginId: 'dsh-ui-marketplace',
    tab: 'marketplace',
    label: 'Маркетплейс',
    name: 'Маркетплейс оборудования и модулей',
    description: 'Установка и активация контроллеров, программных модулей портала и расширений mBlock 5.',
    bundle: 'dsh-base',
    order: 1,
    locked: true,
  },
  {
    pluginId: 'dsh-ui-projects',
    tab: 'projects',
    label: 'Проекты',
    name: 'Проекты и стенд 1U',
    description: '3D-модель кубсата 1U, граф подсистем и лента команды.',
    bundle: 'dsh-cubesat',
    order: 2,
  },
  {
    pluginId: 'dsh-ui-tasks',
    tab: 'tasks',
    label: 'Задачи',
    name: 'Задачи подсистем',
    description: 'Канбан, таблица, календарь и диаграмма Ганта.',
    bundle: 'dsh-cubesat',
    order: 3,
  },
  {
    pluginId: 'dsh-ui-wiki',
    tab: 'wiki',
    label: 'База знаний',
    name: 'Forgejo llm-wiki и Univer',
    description: 'Markdown-документация, граф [[wikilinks]] и редактор документов.',
    bundle: 'dsh-devops',
    order: 4,
  },
  {
    pluginId: 'dsh-ui-mblock',
    tab: 'mblock',
    label: 'mBlock ПО',
    name: 'Студия mBlock',
    description: 'Визуальный конструктор бортового ПО, MicroPython/C++ и стенд.',
    bundle: 'dsh-cubesat',
    order: 5,
  },
  {
    pluginId: 'dsh-ui-ci',
    tab: 'ci',
    label: 'CI/CD',
    name: 'CI/CD и GitHub Sync',
    description: 'Конвейеры GitHub Actions, Forgejo Actions и публикация в репозиторий.',
    bundle: 'dsh-devops',
    order: 6,
  },
  {
    pluginId: 'dsh-ui-chat',
    tab: 'chat',
    label: 'Техчат',
    name: 'Техчат команды',
    description: 'Каналы подсистем реального времени по WebSocket.',
    bundle: 'dsh-collab',
    order: 7,
  },
];

export class ClientHarnessRegistry {
  public readonly kernel = new HarnessKernel<ClientHarnessServices>('DeepSeek-Harness Client');
  private readonly mountedSlots = new Map<string, FrontendNavSlot>();

  constructor() {
    this.kernel.plugin({
      id: 'dsh-client-bridge',
      name: 'Client State Bridge',
      description: 'Связывает клиентские UI-слоты с состоянием серверного ядра Cordis.',
      bundle: 'dsh-base',
      kind: 'core',
      locked: true,
      provides: ['snapshot'],
      apply: (ctx) => {
        ctx.provide('snapshot', null);
      },
    });

    for (const def of SLOT_DEFS) {
      this.kernel.plugin({
        id: def.pluginId,
        name: def.name,
        description: def.description,
        bundle: def.bundle,
        kind: 'ui-slot',
        uiTab: def.tab,
        locked: def.locked,
        inject: ['snapshot'],
        apply: (ctx) => {
          const slot: FrontendNavSlot = {
            tab: def.tab,
            pluginId: def.pluginId,
            label: def.label,
            bundle: def.bundle,
            order: def.order,
          };
          this.mountedSlots.set(def.pluginId, slot);
          ctx.effect(() => {
            this.mountedSlots.delete(def.pluginId);
          });
        },
      });
    }
  }

  syncWithServerSnapshot(snapshot: HarnessRuntimeSnapshot | null): FrontendNavSlot[] {
    if (snapshot) {
      const serverStateById = new Map(snapshot.plugins.map((p) => [p.id, p]));
      for (const def of SLOT_DEFS) {
        if (def.locked) continue;
        const serverPlugin = serverStateById.get(def.pluginId);
        const shouldMount = serverPlugin ? serverPlugin.status === 'active' : true;
        this.kernel.togglePlugin(def.pluginId, shouldMount);
      }
    }
    return this.getMountedNavSlots();
  }

  getMountedNavSlots(): FrontendNavSlot[] {
    return Array.from(this.mountedSlots.values()).sort((a, b) => a.order - b.order);
  }
}

export const clientHarnessRegistry = new ClientHarnessRegistry();
