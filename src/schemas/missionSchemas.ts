import { z } from 'zod';

export const SubsystemSchema = z.enum([
  'OBC',
  'EPS',
  'ADCS',
  'COMMS',
  'PAYLOAD',
  'GROUND',
]);

export const TaskStatusSchema = z.enum(['backlog', 'in_progress', 'review', 'done']);
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const CrmDealStageSchema = z.enum([
  'lead',
  'review',
  'contract',
  'flight_ready',
  'completed',
]);

export const CrmContactSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  firstName: z.string().min(1, 'Укажите имя').max(64),
  lastName: z.string().min(1, 'Укажите фамилию').max(64),
  email: z.string().email('Некорректный email').max(120),
  phone: z.string().max(40).optional().default(''),
  organization: z.string().min(1, 'Укажите организацию').max(120),
  role: z.string().min(1, 'Укажите должность/роль').max(80),
  subsystemFocus: SubsystemSchema.optional().default('OBC'),
  segment: z
    .enum(['school', 'university', 'launch_provider', 'ground_station', 'sponsor', 'vendor'])
    .default('school'),
  notes: z.string().max(1000).optional().default(''),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const CrmDealSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().min(2, 'Укажите название сделки/гранта').max(160),
  organization: z.string().min(1, 'Укажите организацию').max(120),
  contactId: z.string().max(64).optional().default(''),
  stage: CrmDealStageSchema.default('lead'),
  amountRub: z.number().min(0).max(500_000_000).default(0),
  probabilityPct: z.number().min(0).max(100).default(50),
  subsystem: SubsystemSchema.default('PAYLOAD'),
  expectedCloseDate: z.string().max(20).optional().default('2026-12-20'),
  ownerName: z.string().max(64).optional().default('Артём Соколов'),
  description: z.string().max(1500).optional().default(''),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const TinaDocSchema = z.object({
  collection: z.enum(['mission-briefs', 'subsystems-wiki', 'release-notes', 'team-guides']),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9/_-]+$/i, 'Допустимы латинские буквы, цифры, /, _ и -'),
  title: z.string().min(2, 'Укажите заголовок').max(140),
  subsystem: SubsystemSchema.default('OBC'),
  status: z.enum(['draft', 'review', 'published']).default('published'),
  author: z.string().min(1).max(64).default('Артём Соколов'),
  summary: z.string().max(400).optional().default(''),
  tags: z.array(z.string().max(32)).max(10).optional().default([]),
  body: z.string().min(1, 'Содержимое документа не может быть пустым').max(50_000),
});

export const NatsPublishSchema = z.object({
  subject: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Тема NATS должна содержать только буквы, цифры, точки, _ и -'),
  payload: z.union([z.record(z.string(), z.unknown()), z.string().max(8000)]),
  stream: z.string().max(64).optional(),
});

export const PostgresQuerySchema = z.object({
  sql: z.string().min(4, 'Введите SQL-запрос').max(1500),
});

export const DifyWorkflowRunInputSchema = z.object({
  workflowId: z.string().min(1).max(64).optional(),
  inputs: z.record(z.string(), z.unknown()).default({}),
  query: z.string().max(2000).optional(),
  projectId: z.string().max(64).optional().default('school76-1u'),
});

export const TraefikRouterUpsertSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  rule: z.string().min(3).max(200),
  service: z.string().min(2).max(80),
  entryPoints: z.array(z.enum(['web', 'websecure', 'nats'])).min(1).default(['websecure']),
  middlewares: z.array(z.string().max(64)).default([]),
  tls: z.boolean().default(true),
  enabled: z.boolean().default(true),
  targetPort: z.number().int().min(1).max(65535).default(3000),
});

export const DirectusItemPayloadSchema = z.record(z.string(), z.unknown());

export type CrmContact = z.infer<typeof CrmContactSchema> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmDeal = z.infer<typeof CrmDealSchema> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmDealStage = z.infer<typeof CrmDealStageSchema>;
export type TinaDoc = z.infer<typeof TinaDocSchema> & {
  path: string;
  updatedAt: string;
  sha?: string;
};

function safeToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema) as Record<string, unknown>;
  } catch {
    return { type: 'object' };
  }
}

export function generateSchool76OpenApiSpec(serverUrl = '/'): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'school76 CubeSat 1U Platform API',
      version: '2.4.0',
      description:
        'Единый OpenAPI 3.1 контракт платформы school76 (DeepSeek-Harness Cordis): PostgreSQL Store, Directus Collections, Refine + AtomicCRM, TinaCMS, NATS JetStream, Dify LLMOps, Traefik Gateway и валидация Zod.',
    },
    servers: [{ url: serverUrl, description: 'school76 Express + Traefik Gateway' }],
    tags: [
      { name: 'Mission & Health', description: 'Состояние миссии 1U и ядро Cordis' },
      { name: 'PostgreSQL', description: 'Реляционное хранилище PostgreSQL и SQL-консоль' },
      { name: 'Directus & Refine', description: 'Headless CMS коллекции Directus и REST провайдер Refine' },
      { name: 'AtomicCRM', description: 'Контакты, школы-партнёры, наземные станции и воронка грантов' },
      { name: 'TinaCMS', description: 'Git-репозиторий контента со схемами и frontmatter' },
      { name: 'NATS JetStream', description: 'Шина событий реального времени и стримы телеметрии' },
      { name: 'Dify LLMOps', description: 'Агентские DAG-пайплайны и RAG по базе знаний' },
      { name: 'Traefik & Archify', description: 'Динамический шлюз Traefik и граф топологии Archify' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT/HMAC',
        },
      },
      schemas: {
        CrmContact: safeToJsonSchema(CrmContactSchema),
        CrmDeal: safeToJsonSchema(CrmDealSchema),
        TinaDoc: safeToJsonSchema(TinaDocSchema),
        NatsPublish: safeToJsonSchema(NatsPublishSchema),
        PostgresQuery: safeToJsonSchema(PostgresQuerySchema),
        DifyWorkflowRunInput: safeToJsonSchema(DifyWorkflowRunInputSchema),
        TraefikRouter: safeToJsonSchema(TraefikRouterUpsertSchema),
      },
    },
    paths: {
      '/api/health': {
        get: {
          tags: ['Mission & Health'],
          summary: 'Проверка состояния сервера и активного профиля Cordis',
          responses: { '200': { description: 'Статус ядра и метрики миссии' } },
        },
      },
      '/api/state': {
        get: {
          tags: ['Mission & Health'],
          summary: 'Снимок проектов, задач, программ mBlock, чата и команды',
          responses: { '200': { description: 'MissionSnapshot JSON' } },
        },
      },
      '/api/postgres/schema': {
        get: {
          tags: ['PostgreSQL'],
          summary: 'Схема реляционных таблиц PostgreSQL и статус подключения pg.Pool',
          responses: { '200': { description: 'Список таблиц, колонок и число строк' } },
        },
      },
      '/api/postgres/query': {
        post: {
          tags: ['PostgreSQL'],
          summary: 'Выполнить безопасный SELECT/SHOW запрос к реляционному хранилищу',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PostgresQuery' },
              },
            },
          },
          responses: {
            '200': { description: 'Строки результата SQL и время выполнения' },
            '400': { description: 'Ошибка валидации Zod или синтаксиса SQL' },
          },
        },
      },
      '/api/directus/collections': {
        get: {
          tags: ['Directus & Refine'],
          summary: 'Список коллекций и полей Directus Data Studio',
          responses: { '200': { description: 'Метаданные коллекций Directus' } },
        },
      },
      '/api/directus/items/{collection}': {
        get: {
          tags: ['Directus & Refine'],
          summary: 'Получить записи коллекции Directus (поддержка Refine DataProvider)',
          parameters: [
            {
              name: 'collection',
              in: 'path',
              required: true,
              schema: { type: 'string', example: 'crm_deals' },
            },
          ],
          responses: { '200': { description: 'Массив записей в формате { data, meta }' } },
        },
        post: {
          tags: ['Directus & Refine'],
          summary: 'Создать запись в коллекции Directus (Zod-валидация)',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'collection',
              in: 'path',
              required: true,
              schema: { type: 'string', example: 'crm_contacts' },
            },
          ],
          responses: { '201': { description: 'Созданная запись' } },
        },
      },
      '/api/crm/contacts': {
        get: {
          tags: ['AtomicCRM'],
          summary: 'Список контактов партнёров и инженеров AtomicCRM',
          responses: { '200': { description: 'Массив CrmContact' } },
        },
        post: {
          tags: ['AtomicCRM'],
          summary: 'Создать контакт AtomicCRM',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CrmContact' },
              },
            },
          },
          responses: { '201': { description: 'Контакт создан' } },
        },
      },
      '/api/crm/deals': {
        get: {
          tags: ['AtomicCRM'],
          summary: 'Список сделок, грантов и контрактов на запуск в AtomicCRM',
          responses: { '200': { description: 'Массив CrmDeal' } },
        },
        post: {
          tags: ['AtomicCRM'],
          summary: 'Создать сделку или грант AtomicCRM',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CrmDeal' },
              },
            },
          },
          responses: { '201': { description: 'Сделка создана' } },
        },
      },
      '/api/tinacms/documents': {
        get: {
          tags: ['TinaCMS'],
          summary: 'Список Git-документов TinaCMS (Forgejo Markdown + frontmatter)',
          responses: { '200': { description: 'Коллекции и документы TinaCMS' } },
        },
        post: {
          tags: ['TinaCMS'],
          summary: 'Сохранить документ TinaCMS и зафиксировать коммит в Forgejo Git',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TinaDoc' },
              },
            },
          },
          responses: { '200': { description: 'Документ сохранён в Git' } },
        },
      },
      '/api/nats/messages': {
        get: {
          tags: ['NATS JetStream'],
          summary: 'Подписка и выборка сообщений NATS по фильтру темы (поддержка * и >)',
          parameters: [
            {
              name: 'subject',
              in: 'query',
              schema: { type: 'string', example: 'cubesat.>' },
            },
          ],
          responses: { '200': { description: 'Список сообщений и статус JetStream' } },
        },
      },
      '/api/nats/publish': {
        post: {
          tags: ['NATS JetStream'],
          summary: 'Опубликовать событие в шину NATS JetStream',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/NatsPublish' },
              },
            },
          },
          responses: { '201': { description: 'Сообщение опубликовано в стрим' } },
        },
      },
      '/api/dify/workflows': {
        get: {
          tags: ['Dify LLMOps'],
          summary: 'Список DAG-пайплайнов Dify и история запусков',
          responses: { '200': { description: 'Конфигурация пайплайнов Dify' } },
        },
      },
      '/api/dify/workflows/{workflowId}/run': {
        post: {
          tags: ['Dify LLMOps'],
          summary: 'Запустить Dify LLMOps пайплайн (RAG + LLM + NATS)',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'workflowId',
              in: 'path',
              required: true,
              schema: { type: 'string', example: 'wf-wiki-rag' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DifyWorkflowRunInput' },
              },
            },
          },
          responses: { '200': { description: 'Трассировка узлов DAG и итоговый ответ' } },
        },
      },
      '/api/traefik/overview': {
        get: {
          tags: ['Traefik & Archify'],
          summary: 'Состояние маршрутизаторов, сервисов и middleware шлюза Traefik',
          responses: { '200': { description: 'Динамическая таблица маршрутизации Traefik' } },
        },
      },
      '/api/archify/topology': {
        get: {
          tags: ['Traefik & Archify'],
          summary: 'Живая топология узлов и связей Archify для платформы school76',
          responses: { '200': { description: 'Граф узлов, рёбер и Mermaid-схема' } },
        },
      },
    },
  };
}
