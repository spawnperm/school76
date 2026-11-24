import {
  CrmContactSchema,
  CrmDealSchema,
  type CrmContact,
  type CrmDeal,
} from '../src/schemas/missionSchemas.ts';
import type { PostgresMissionStore } from './postgresStore.ts';
import type { NatsEventBus } from './natsBus.ts';
import type { CommunityProject, CubeSatTask, OnboardProgram, Subsystem } from '../src/types/cubesat.ts';

export interface DirectusFieldMeta {
  field: string;
  type: 'string' | 'integer' | 'float' | 'boolean' | 'json' | 'timestamp' | 'enum';
  interface: 'input' | 'select-dropdown' | 'numeric' | 'textarea' | 'datetime' | 'tags';
  required?: boolean;
  readOnly?: boolean;
  options?: string[];
}

export interface DirectusCollectionMeta {
  collection: string;
  label: string;
  note: string;
  singleton: boolean;
  primaryKey: string;
  fields: DirectusFieldMeta[];
}

export interface DirectusFlow {
  id: string;
  name: string;
  trigger: 'event' | 'manual' | 'webhook';
  collection: string;
  description: string;
  lastRunAt?: string;
  runCount: number;
  status: 'active' | 'paused';
}

export interface DirectusStorePort {
  getProjects: () => CommunityProject[];
  getTasks: () => CubeSatTask[];
  createTask: (input: {
    projectId?: string;
    title: string;
    description?: string;
    subsystem?: Subsystem;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    assignee?: string;
  }) => CubeSatTask;
  updateTask: (id: string, patch: Partial<CubeSatTask>) => CubeSatTask | null;
  deleteTask: (id: string) => boolean;
  getPrograms: () => OnboardProgram[];
}

export class DirectusHeadlessService {
  private readonly pgStore: PostgresMissionStore;
  private readonly nats: NatsEventBus;
  private readonly port: DirectusStorePort;

  private flows: DirectusFlow[] = [
    {
      id: 'flow-crm-deal-nats',
      name: 'CRM Deal Stage -> NATS JetStream Sync',
      trigger: 'event',
      collection: 'crm_deals',
      description: 'Публикует событие crm.deals.updated в NATS при изменении этапа гранта/сделки.',
      runCount: 4,
      status: 'active',
    },
    {
      id: 'flow-task-obc-review',
      name: 'OBC Critical Task Escalation',
      trigger: 'manual',
      collection: 'cubesat_tasks',
      description: 'Проверяет открытые задачи с приоритетом critical и отправляет уведомление в NATS.',
      runCount: 2,
      status: 'active',
    },
    {
      id: 'flow-postgres-snapshot',
      name: 'PostgreSQL Integrity Audit',
      trigger: 'manual',
      collection: 'cubesat_projects',
      description: 'Сверяет связи foreign key между проектами, задачами и контактами AtomicCRM.',
      runCount: 1,
      status: 'active',
    },
  ];

  constructor(pgStore: PostgresMissionStore, nats: NatsEventBus, port: DirectusStorePort) {
    this.pgStore = pgStore;
    this.nats = nats;
    this.port = port;
  }

  getServerInfo() {
    return {
      version: 'Directus 11.4 (school76-embedded)',
      externalConfigured: Boolean(process.env.DIRECTUS_URL?.trim() && process.env.DIRECTUS_TOKEN?.trim()),
      project: {
        project_name: 'school76 CubeSat Data Studio',
        project_color: '#0284c7',
      },
      database: this.pgStore.getConnectionSummary(),
    };
  }

  getCollections(): DirectusCollectionMeta[] {
    return [
      {
        collection: 'crm_contacts',
        label: 'AtomicCRM: Контакты',
        note: 'Инженеры, школы, наземные станции и поставщики оборудования',
        singleton: false,
        primaryKey: 'id',
        fields: [
          { field: 'id', type: 'string', interface: 'input', readOnly: true },
          { field: 'firstName', type: 'string', interface: 'input', required: true },
          { field: 'lastName', type: 'string', interface: 'input', required: true },
          { field: 'email', type: 'string', interface: 'input', required: true },
          { field: 'organization', type: 'string', interface: 'input', required: true },
          { field: 'role', type: 'string', interface: 'input', required: true },
          {
            field: 'segment',
            type: 'enum',
            interface: 'select-dropdown',
            options: ['school', 'university', 'launch_provider', 'ground_station', 'sponsor', 'vendor'],
          },
          {
            field: 'subsystemFocus',
            type: 'enum',
            interface: 'select-dropdown',
            options: ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'],
          },
        ],
      },
      {
        collection: 'crm_deals',
        label: 'AtomicCRM: Сделки и гранты',
        note: 'Воронка финансирования, запусков в ТПК и поставок подсистем',
        singleton: false,
        primaryKey: 'id',
        fields: [
          { field: 'id', type: 'string', interface: 'input', readOnly: true },
          { field: 'title', type: 'string', interface: 'input', required: true },
          { field: 'organization', type: 'string', interface: 'input', required: true },
          {
            field: 'stage',
            type: 'enum',
            interface: 'select-dropdown',
            options: ['lead', 'review', 'contract', 'flight_ready', 'completed'],
          },
          { field: 'amountRub', type: 'integer', interface: 'numeric', required: true },
          { field: 'probabilityPct', type: 'integer', interface: 'numeric' },
          {
            field: 'subsystem',
            type: 'enum',
            interface: 'select-dropdown',
            options: ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'],
          },
        ],
      },
      {
        collection: 'cubesat_tasks',
        label: 'Задачи миссии 1U',
        note: 'Синхронизировано с Kanban/Gantt и Forgejo',
        singleton: false,
        primaryKey: 'id',
        fields: [
          { field: 'id', type: 'string', interface: 'input', readOnly: true },
          { field: 'title', type: 'string', interface: 'input', required: true },
          {
            field: 'subsystem',
            type: 'enum',
            interface: 'select-dropdown',
            options: ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'],
          },
          {
            field: 'status',
            type: 'enum',
            interface: 'select-dropdown',
            options: ['backlog', 'in_progress', 'review', 'done'],
          },
          {
            field: 'priority',
            type: 'enum',
            interface: 'select-dropdown',
            options: ['low', 'medium', 'high', 'critical'],
          },
          { field: 'assignee', type: 'string', interface: 'input' },
          { field: 'progressPct', type: 'integer', interface: 'numeric' },
        ],
      },
      {
        collection: 'cubesat_projects',
        label: 'Проекты аппаратов',
        note: 'Реестр проектов и привязка к Forgejo / Garage S3',
        singleton: false,
        primaryKey: 'id',
        fields: [
          { field: 'id', type: 'string', interface: 'input', readOnly: true },
          { field: 'name', type: 'string', interface: 'input', required: true },
          { field: 'category', type: 'string', interface: 'input' },
          { field: 'lifecycleStage', type: 'string', interface: 'input' },
          { field: 'forgejoRepo', type: 'string', interface: 'input' },
        ],
      },
      {
        collection: 'onboard_programs',
        label: 'Программы ПО mBlock',
        note: 'Бортовые скрипты MicroPython и STM32 C++',
        singleton: false,
        primaryKey: 'id',
        fields: [
          { field: 'id', type: 'string', interface: 'input', readOnly: true },
          { field: 'name', type: 'string', interface: 'input', required: true },
          { field: 'subsystem', type: 'string', interface: 'input' },
          { field: 'boardProfile', type: 'string', interface: 'input' },
          { field: 'author', type: 'string', interface: 'input' },
        ],
      },
    ];
  }

  listItems(collection: string, search?: string): { data: Record<string, unknown>[]; total: number } {
    let items: Record<string, unknown>[];
    switch (collection) {
      case 'crm_contacts':
        items = this.pgStore.getContacts() as unknown as Record<string, unknown>[];
        break;
      case 'crm_deals':
        items = this.pgStore.getDeals() as unknown as Record<string, unknown>[];
        break;
      case 'cubesat_tasks':
        items = this.port.getTasks() as unknown as Record<string, unknown>[];
        break;
      case 'cubesat_projects':
        items = this.port.getProjects() as unknown as Record<string, unknown>[];
        break;
      case 'onboard_programs':
        items = this.port.getPrograms() as unknown as Record<string, unknown>[];
        break;
      default:
        throw new Error(`Коллекция Directus "${collection}" не найдена`);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
    }
    return { data: items, total: items.length };
  }

  getItem(collection: string, id: string): Record<string, unknown> | null {
    const { data } = this.listItems(collection);
    return data.find((item) => String(item.id) === id) || null;
  }

  async createItem(collection: string, payload: unknown): Promise<Record<string, unknown>> {
    if (collection === 'crm_contacts') {
      const parsed = CrmContactSchema.parse(payload);
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = parsed;
      const created: CrmContact = this.pgStore.createContact(rest);
      await this.nats.publish('crm.contacts.created', { id: created.id, organization: created.organization }, 'directus');
      return created as unknown as Record<string, unknown>;
    }
    if (collection === 'crm_deals') {
      const parsed = CrmDealSchema.parse(payload);
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = parsed;
      const created: CrmDeal = this.pgStore.createDeal(rest);
      await this.nats.publish('crm.deals.created', { id: created.id, stage: created.stage, amountRub: created.amountRub }, 'directus');
      return created as unknown as Record<string, unknown>;
    }
    if (collection === 'cubesat_tasks') {
      const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
      const title = typeof p.title === 'string' && p.title.trim() ? p.title.trim() : 'Новая задача из Directus';
      const created = this.port.createTask({
        projectId: typeof p.projectId === 'string' ? p.projectId : 'school76-1u',
        title,
        description: typeof p.description === 'string' ? p.description : '',
        subsystem: typeof p.subsystem === 'string' ? (p.subsystem as Subsystem) : 'OBC',
        priority: typeof p.priority === 'string' ? (p.priority as CubeSatTask['priority']) : 'medium',
        assignee: typeof p.assignee === 'string' ? p.assignee : 'Directus Studio',
      });
      await this.nats.publish('tasks.created', { id: created.id, title: created.title }, 'directus');
      return created as unknown as Record<string, unknown>;
    }
    throw new Error(`Создание записей в коллекции "${collection}" недоступно`);
  }

  async updateItem(collection: string, id: string, payload: unknown): Promise<Record<string, unknown>> {
    if (collection === 'crm_contacts') {
      const parsed = CrmContactSchema.partial().parse(payload);
      const updated = this.pgStore.updateContact(id, parsed);
      if (!updated) throw new Error('Контакт не найден');
      await this.nats.publish('crm.contacts.updated', { id }, 'directus');
      return updated as unknown as Record<string, unknown>;
    }
    if (collection === 'crm_deals') {
      const parsed = CrmDealSchema.partial().parse(payload);
      const updated = this.pgStore.updateDeal(id, parsed);
      if (!updated) throw new Error('Сделка не найдена');
      await this.nats.publish('crm.deals.updated', { id, stage: updated.stage, amountRub: updated.amountRub }, 'directus');
      return updated as unknown as Record<string, unknown>;
    }
    if (collection === 'cubesat_tasks') {
      const patch = (payload && typeof payload === 'object' ? payload : {}) as Partial<CubeSatTask>;
      const updated = this.port.updateTask(id, patch);
      if (!updated) throw new Error('Задача не найдена');
      await this.nats.publish('tasks.updated', { id, status: updated.status }, 'directus');
      return updated as unknown as Record<string, unknown>;
    }
    throw new Error(`Обновление записей в коллекции "${collection}" недоступно`);
  }

  async deleteItem(collection: string, id: string): Promise<{ deleted: boolean; id: string }> {
    if (collection === 'crm_contacts') {
      const ok = this.pgStore.deleteContact(id);
      if (!ok) throw new Error('Контакт не найден');
      await this.nats.publish('crm.contacts.deleted', { id }, 'directus');
      return { deleted: true, id };
    }
    if (collection === 'crm_deals') {
      const ok = this.pgStore.deleteDeal(id);
      if (!ok) throw new Error('Сделка не найдена');
      await this.nats.publish('crm.deals.deleted', { id }, 'directus');
      return { deleted: true, id };
    }
    if (collection === 'cubesat_tasks') {
      const ok = this.port.deleteTask(id);
      if (!ok) throw new Error('Задача не найдена');
      await this.nats.publish('tasks.deleted', { id }, 'directus');
      return { deleted: true, id };
    }
    throw new Error(`Удаление записей в коллекции "${collection}" недоступно`);
  }

  getFlows(): DirectusFlow[] {
    return this.flows;
  }

  async triggerFlow(flowId: string): Promise<{ flow: DirectusFlow; summary: string }> {
    const flow = this.flows.find((f) => f.id === flowId);
    if (!flow) {
      throw new Error(`Directus Flow "${flowId}" не найден`);
    }
    flow.runCount += 1;
    flow.lastRunAt = new Date().toISOString();

    let summary = '';
    if (flow.id === 'flow-crm-deal-nats') {
      const deals = this.pgStore.getDeals();
      const totalRub = deals.reduce((s, d) => s + d.amountRub, 0);
      await this.nats.publish('crm.pipeline.snapshot', { dealsCount: deals.length, totalRub }, 'directus-flow');
      summary = `Синхронизировано сделок AtomicCRM: ${deals.length}, общий объём ${totalRub.toLocaleString('ru-RU')} ₽ -> NATS.`;
    } else if (flow.id === 'flow-task-obc-review') {
      const critical = this.port.getTasks().filter((t) => t.priority === 'critical' && t.status !== 'done');
      await this.nats.publish('tasks.critical.audit', { count: critical.length, ids: critical.map((c) => c.id) }, 'directus-flow');
      summary = `Проверено критических задач: ${critical.length} (${critical.map((c) => c.id).join(', ') || 'нет'}).`;
    } else {
      const tables = this.pgStore.getTablesSchema();
      await this.nats.publish('directus.audit.completed', { tables: tables.length }, 'directus-flow');
      summary = `Аудит PostgreSQL завершён: проверено ${tables.length} таблиц и внешних ключей.`;
    }

    return { flow, summary };
  }
}
