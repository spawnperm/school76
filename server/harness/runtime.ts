import type express from 'express';
import { GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';
import { HarnessKernel } from '../../src/harness/cordis.ts';
import type {
  HarnessAgentRunResult,
  HarnessAgentStep,
  HarnessProfileDescriptor,
  HarnessRuntimeSnapshot,
  HarnessToolExecutionResult,
  HarnessToolSchema,
  MarketplaceSnapshot,
} from '../../src/harness/types.ts';
import { createMarketplaceController } from './marketplace.ts';
import {
  dispatchForgejoActionRun,
  lintForgejoWiki,
  listForgejoActionRuns,
  listForgejoTree,
  readForgejoFile,
} from '../forgejoStore.ts';
import { listGarageObjects } from '../garageS3.ts';
import { getGitHubStatus } from '../githubSync.ts';
import type {
  HarnessStatePort,
  ServerHarnessServices,
  ToolHandlerEntry,
} from './types.ts';

const PROFILES: HarnessProfileDescriptor[] = [
  {
    id: 'cubesat-full',
    name: 'CubeSat 1U Full',
    description:
      'Полная конфигурация DeepSeek-Harness: проекты, доска задач, Forgejo llm-wiki, mBlock ПО, CI/CD, техчат и агентский цикл.',
    bundles: ['dsh-base', 'dsh-cubesat', 'dsh-devops', 'dsh-collab'],
    enabledPlugins: [
      'dsh-store-json',
      'dsh-forge-forgejo',
      'dsh-s3-garage',
      'dsh-ci-hybrid',
      'dsh-realtime-ws',
      'dsh-tools-cubesat',
      'dsh-llm-gemini',
      'dsh-agent-loop',
      'dsh-ui-harness',
      'dsh-ui-marketplace',
      'dsh-ui-projects',
      'dsh-ui-tasks',
      'dsh-ui-wiki',
      'dsh-ui-mblock',
      'dsh-ui-ci',
      'dsh-ui-chat',
    ],
    seamProviders: {
      'dsh-store': 'dsh-store-json',
      'dsh-forge': 'dsh-forge-forgejo',
      'dsh-s3': 'dsh-s3-garage',
      'dsh-ci': 'dsh-ci-hybrid',
      'dsh-realtime': 'dsh-realtime-ws',
      'dsh-tools': 'dsh-tools-cubesat',
      'dsh-llm': 'dsh-llm-gemini',
    },
  },
  {
    id: 'firmware-lab',
    name: 'Firmware & mBlock Lab',
    description:
      'Лабораторный контур бортового ПО: визуальный редактор mBlock, стенд 1U, задачи подсистем и инструменты инспекции.',
    bundles: ['dsh-base', 'dsh-cubesat'],
    enabledPlugins: [
      'dsh-store-json',
      'dsh-forge-forgejo',
      'dsh-tools-cubesat',
      'dsh-llm-deterministic',
      'dsh-agent-loop',
      'dsh-ui-harness',
      'dsh-ui-marketplace',
      'dsh-ui-projects',
      'dsh-ui-tasks',
      'dsh-ui-mblock',
    ],
    seamProviders: {
      'dsh-store': 'dsh-store-json',
      'dsh-forge': 'dsh-forge-forgejo',
      'dsh-tools': 'dsh-tools-cubesat',
      'dsh-llm': 'dsh-llm-deterministic',
    },
  },
  {
    id: 'headless-ci',
    name: 'Headless CI & Wiki Audit',
    description:
      'Контур автоматизации DevOps: Forgejo Actions, GitHub Sync, проверка wiki-графа и агентный цикл без лишних UI-слотов.',
    bundles: ['dsh-base', 'dsh-devops'],
    enabledPlugins: [
      'dsh-store-json',
      'dsh-forge-forgejo',
      'dsh-s3-garage',
      'dsh-ci-hybrid',
      'dsh-tools-cubesat',
      'dsh-llm-gemini',
      'dsh-agent-loop',
      'dsh-ui-harness',
      'dsh-ui-marketplace',
      'dsh-ui-wiki',
      'dsh-ui-ci',
    ],
    seamProviders: {
      'dsh-store': 'dsh-store-json',
      'dsh-forge': 'dsh-forge-forgejo',
      'dsh-s3': 'dsh-s3-garage',
      'dsh-ci': 'dsh-ci-hybrid',
      'dsh-tools': 'dsh-tools-cubesat',
      'dsh-llm': 'dsh-llm-gemini',
    },
  },
  {
    id: 'sdk-minimal',
    name: 'SDK Minimal',
    description:
      'Минимальное ядро Cordis: только хранилище состояния, реестр базовых инструментов и консоль DeepSeek-Harness.',
    bundles: ['dsh-base'],
    enabledPlugins: [
      'dsh-store-json',
      'dsh-tools-cubesat',
      'dsh-llm-deterministic',
      'dsh-agent-loop',
      'dsh-ui-harness',
      'dsh-ui-marketplace',
    ],
    seamProviders: {
      'dsh-store': 'dsh-store-json',
      'dsh-tools': 'dsh-tools-cubesat',
      'dsh-llm': 'dsh-llm-deterministic',
    },
  },
];

export interface ServerHarnessRuntime {
  kernel: HarnessKernel<ServerHarnessServices>;
  getSnapshot: () => HarnessRuntimeSnapshot;
  activateProfile: (profileId: string) => HarnessRuntimeSnapshot;
  togglePlugin: (pluginId: string, enabled?: boolean) => HarnessRuntimeSnapshot;
  switchSeamProvider: (seamId: string, providerId: string) => HarnessRuntimeSnapshot;
  executeTool: (toolName: string, args: Record<string, unknown>) => Promise<HarnessToolExecutionResult>;
  runAgentGoal: (goal: string, projectId?: string) => Promise<HarnessAgentRunResult>;
  getAgentHistory: () => HarnessAgentRunResult[];
  getMarketplace: () => MarketplaceSnapshot;
  installMarketplaceModule: (moduleId: string) => MarketplaceSnapshot;
  uninstallMarketplaceModule: (moduleId: string) => MarketplaceSnapshot;
  activateMarketplaceModule: (moduleId: string) => MarketplaceSnapshot;
  deactivateMarketplaceModule: (moduleId: string) => MarketplaceSnapshot;
}

export function createServerHarness(
  rootDir: string,
  port: HarnessStatePort
): ServerHarnessRuntime {
  const kernel = new HarnessKernel<ServerHarnessServices>('DeepSeek-Harness (Cordis)');
  const toolHandlers = new Map<string, ToolHandlerEntry>();
  const agentHistory: HarnessAgentRunResult[] = [];
  const marketplace = createMarketplaceController(rootDir, kernel);

  kernel
    .defineSeam('dsh-store', 'Хранилище состояния', 'Управление проектами, задачами, программами ПО и профилями.')
    .defineSeam('dsh-forge', 'Git и база знаний', 'Репозиторий Forgejo, граф llm-wiki и история коммитов.')
    .defineSeam('dsh-s3', 'Объектное хранилище S3', 'Бакеты Garage S3 для схем, медиафайлов и артефактов.')
    .defineSeam('dsh-ci', 'Раннеры CI/CD', 'Запуск и инспекция конвейеров GitHub Actions и Forgejo Actions.')
    .defineSeam('dsh-realtime', 'Транспорт реального времени', 'WebSocket-канал техчата и онлайн-присутствие команды.')
    .defineSeam('dsh-tools', 'Реестр инструментов', 'Типизированные инструменты (dsh-tools) для агента и консоли.')
    .defineSeam('dsh-llm', 'Адаптер рассуждений', 'Провайдер планирования для цикла DeepSeek-Harness.');

  for (const profile of PROFILES) {
    kernel.registerProfile(profile);
  }

  kernel.plugin({
    id: 'dsh-store-json',
    name: 'JSON Mission Store',
    description: 'Провайдер персистентности состояния миссии в data/school76.json.',
    bundle: 'dsh-base',
    kind: 'seam-provider',
    locked: true,
    provides: ['store'],
    providesSeam: 'dsh-store',
    apply(ctx) {
      ctx.provide('store', {
        driver: 'json-file (data/school76.json)',
        getTasks: port.getTasks,
        addTask: port.addTask,
        updateTaskStatus: port.updateTaskStatus,
        getProjects: port.getProjects,
        getPrograms: port.getPrograms,
        getStats: () => ({
          projects: port.getProjects().length,
          tasks: port.getTasks().length,
          programs: port.getPrograms().length,
          users: port.getUsersCount(),
          online: port.getOnlineCount(),
        }),
      });
    },
  });

  kernel.plugin({
    id: 'dsh-forge-forgejo',
    name: 'Forgejo Git & llm-wiki',
    description: 'Провайдер репозиториев, Markdown-знаний [[wikilinks]] и аудита целостности.',
    bundle: 'dsh-devops',
    kind: 'seam-provider',
    provides: ['forge'],
    providesSeam: 'dsh-forge',
    apply(ctx) {
      ctx.provide('forge', {
        driver: 'forgejo-local-store',
        listFiles: (repo: string) => listForgejoTree(repo),
        readFile: (repo: string, filepath: string) => readForgejoFile(repo, filepath),
        lintWiki: (repo: string, author: string) => lintForgejoWiki(repo, author),
        syncTasks: (projectId: string, summary: string, author: string) =>
          port.syncTasksToForgejo(projectId, summary, author),
      });
    },
  });

  kernel.plugin({
    id: 'dsh-s3-garage',
    name: 'Garage S3 Storage',
    description: 'Провайдер бакетов S3 для медиаресурсов, схем и снимков телеметрии.',
    bundle: 'dsh-devops',
    kind: 'seam-provider',
    provides: ['s3'],
    providesSeam: 'dsh-s3',
    apply(ctx) {
      ctx.provide('s3', {
        driver: 'garage-s3-compat',
        listObjects: (bucket: string) => listGarageObjects(bucket),
      });
    },
  });

  kernel.plugin({
    id: 'dsh-ci-hybrid',
    name: 'Hybrid CI Runner (GitHub + Forgejo)',
    description: 'Провайдер запуска и мониторинга CI/CD-прогонов.',
    bundle: 'dsh-devops',
    kind: 'seam-provider',
    provides: ['ci'],
    providesSeam: 'dsh-ci',
    apply(ctx) {
      ctx.provide('ci', {
        driver: 'github+forgejo-actions',
        listForgejoRuns: async (repo: string) => {
          const data = await listForgejoActionRuns(repo);
          return data.runs;
        },
        dispatchForgejoRun: (repo: string, workflowName: string, actor: string) =>
          dispatchForgejoActionRun(repo, workflowName, actor),
        getGitHubStatus: () => getGitHubStatus(rootDir),
      });
    },
  });

  kernel.plugin({
    id: 'dsh-realtime-ws',
    name: 'WebSocket Presence & Chat',
    description: 'Провайдер широковещательных событий и присутствия инженеров в реальном времени.',
    bundle: 'dsh-collab',
    kind: 'seam-provider',
    provides: ['realtime'],
    providesSeam: 'dsh-realtime',
    apply(ctx) {
      ctx.provide('realtime', {
        driver: 'ws-broadcast-hub',
        broadcast: port.broadcast,
        getOnlineCount: port.getOnlineCount,
      });
    },
  });

  kernel.plugin({
    id: 'dsh-tools-cubesat',
    name: 'CubeSat Tool Pack',
    description: 'Регистрирует модель-вызываемые инструменты по задачам, wiki, mBlock ПО, CI и инспекции ядра.',
    bundle: 'dsh-base',
    kind: 'tool-pack',
    inject: ['store'],
    provides: ['tools'],
    providesSeam: 'dsh-tools',
    apply(ctx) {
      const register = (
        schema: Omit<HarnessToolSchema, 'pluginId'>,
        execute: ToolHandlerEntry['execute']
      ) => {
        ctx.registerTool(schema);
        toolHandlers.set(schema.name, { execute });
        ctx.effect(() => {
          toolHandlers.delete(schema.name);
        });
      };

      register(
        {
          name: 'harness.inspect',
          seam: 'dsh-tools',
          description: 'Возвращает снимок активного профиля, плагинов Cordis, швов (seams) и эффектов.',
          mutating: false,
          parameters: {},
        },
        async () => {
          const snap = kernel.getSnapshot();
          return {
            engine: snap.engine,
            activeProfileId: snap.activeProfileId,
            metrics: snap.metrics,
            seams: snap.seams.map((s) => ({
              id: s.id,
              activeProviderId: s.activeProviderId,
              consumers: s.consumerIds.length,
            })),
          };
        }
      );

      register(
        {
          name: 'tasks.list',
          seam: 'dsh-store',
          description: 'Получить список инженерных задач проекта с фильтрацией по подсистеме или статусу.',
          mutating: false,
          parameters: {
            projectId: { type: 'string', description: 'ID проекта (по умолчанию school76-1u)' },
            subsystem: {
              type: 'string',
              description: 'Фильтр подсистемы: OBC, EPS, ADCS, COMMS, PAYLOAD, GROUND',
              enum: ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'],
            },
            status: {
              type: 'string',
              description: 'Фильтр статуса: backlog, in_progress, review, done',
              enum: ['backlog', 'in_progress', 'review', 'done'],
            },
          },
        },
        async (args) => {
          const store = ctx.service('store');
          const projectId = typeof args.projectId === 'string' && args.projectId.trim() ? args.projectId.trim() : '';
          const subsystem = typeof args.subsystem === 'string' ? args.subsystem.trim().toUpperCase() : '';
          const status = typeof args.status === 'string' ? args.status.trim() : '';
          let list = store.getTasks();
          if (projectId) list = list.filter((t) => t.projectId === projectId);
          if (subsystem) list = list.filter((t) => t.subsystem === subsystem);
          if (status) list = list.filter((t) => t.status === status);
          return {
            count: list.length,
            tasks: list.slice(0, 15).map((t) => ({
              id: t.id,
              title: t.title,
              subsystem: t.subsystem,
              status: t.status,
              priority: t.priority,
              progressPct: t.progressPct ?? 0,
              assignee: t.assignee,
            })),
          };
        }
      );

      register(
        {
          name: 'tasks.create',
          seam: 'dsh-store',
          description: 'Создать новую задачу подсистемы и синхронизировать её в рабочее пространство.',
          mutating: true,
          parameters: {
            title: { type: 'string', description: 'Краткое название инженерной задачи', required: true },
            subsystem: {
              type: 'string',
              description: 'Подсистема (OBC, EPS, ADCS, COMMS, PAYLOAD, GROUND)',
              enum: ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'],
            },
            priority: {
              type: 'string',
              description: 'Приоритет (low, medium, high, critical)',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            projectId: { type: 'string', description: 'ID проекта' },
            description: { type: 'string', description: 'Подробное описание' },
          },
        },
        async (args) => {
          const store = ctx.service('store');
          const title = typeof args.title === 'string' ? args.title.trim() : '';
          if (!title) {
            throw new Error('Параметр title обязателен для tasks.create');
          }
          const created = store.addTask({
            projectId: typeof args.projectId === 'string' ? args.projectId : 'school76-1u',
            title,
            description: typeof args.description === 'string' ? args.description : '',
            subsystem: (typeof args.subsystem === 'string' ? args.subsystem : 'OBC') as any,
            priority: (typeof args.priority === 'string' ? args.priority : 'medium') as any,
            assignee: 'DeepSeek-Harness Agent',
          });
          ctx.services.realtime?.broadcast({ type: 'task:created', payload: created });
          ctx.services.forge?.syncTasks(
            created.projectId,
            `Создана задача через Harness ${created.id}: ${created.title}`,
            'DeepSeek-Harness'
          );
          return { created: true, task: created };
        }
      );

      register(
        {
          name: 'programs.list',
          seam: 'dsh-store',
          description: 'Показать зарегистрированные бортовые программы mBlock (MicroPython / STM32 C++).',
          mutating: false,
          parameters: {
            projectId: { type: 'string', description: 'ID проекта' },
          },
        },
        async (args) => {
          const store = ctx.service('store');
          const projectId = typeof args.projectId === 'string' && args.projectId.trim() ? args.projectId.trim() : '';
          const progs = store
            .getPrograms()
            .filter((p) => (!projectId ? true : (p.projectId || 'school76-1u') === projectId));
          return {
            count: progs.length,
            programs: progs.map((p) => ({
              id: p.id,
              name: p.name,
              subsystem: p.subsystem,
              targetBoard: p.targetBoard,
              versions: p.versions?.length ?? 0,
              updatedAt: p.updatedAt,
            })),
          };
        }
      );

      register(
        {
          name: 'wiki.list',
          seam: 'dsh-forge',
          description: 'Получить дерево файлов базы знаний llm-wiki и документов проекта в Forgejo.',
          mutating: false,
          parameters: {
            repo: { type: 'string', description: 'Имя репозитория (по умолчанию school76-1u)' },
          },
        },
        async (args) => {
          const forge = ctx.services.forge;
          if (!forge) {
            throw new Error('Шов dsh-forge отключён: включите плагин dsh-forge-forgejo');
          }
          const repo = typeof args.repo === 'string' && args.repo.trim() ? args.repo.trim() : 'school76-1u';
          const files = forge.listFiles(repo);
          return { repo, count: files.length, files };
        }
      );

      register(
        {
          name: 'wiki.lint',
          seam: 'dsh-forge',
          description: 'Провести аудит базы знаний llm-wiki: найти битые [[wikilinks]] и сиротские страницы.',
          mutating: true,
          parameters: {
            repo: { type: 'string', description: 'Имя репозитория (по умолчанию school76-1u)' },
          },
        },
        async (args) => {
          const forge = ctx.services.forge;
          if (!forge) {
            throw new Error('Шов dsh-forge отключён: включите плагин dsh-forge-forgejo');
          }
          const repo = typeof args.repo === 'string' && args.repo.trim() ? args.repo.trim() : 'school76-1u';
          return await forge.lintWiki(repo, 'DeepSeek-Harness');
        }
      );

      register(
        {
          name: 'ci.list_runs',
          seam: 'dsh-ci',
          description: 'Показать последние запуски Forgejo Actions и статус подключения GitHub Sync.',
          mutating: false,
          parameters: {
            repo: { type: 'string', description: 'Имя репозитория (по умолчанию school76-1u)' },
          },
        },
        async (args) => {
          const ci = ctx.services.ci;
          if (!ci) {
            throw new Error('Шов dsh-ci отключён: включите плагин dsh-ci-hybrid');
          }
          const repo = typeof args.repo === 'string' && args.repo.trim() ? args.repo.trim() : 'school76-1u';
          const runs = await ci.listForgejoRuns(repo);
          return {
            repo,
            runsCount: runs.length,
            recentRuns: runs.slice(0, 6),
            github: ci.getGitHubStatus(),
          };
        }
      );

      register(
        {
          name: 's3.list_objects',
          seam: 'dsh-s3',
          description: 'Получить список медиаобъектов и артефактов в бакете Garage S3.',
          mutating: false,
          parameters: {
            bucket: { type: 'string', description: 'Имя бакета (по умолчанию school76-media)' },
          },
        },
        async (args) => {
          const s3 = ctx.services.s3;
          if (!s3) {
            throw new Error('Шов dsh-s3 отключён: включите плагин dsh-s3-garage');
          }
          const bucket = typeof args.bucket === 'string' && args.bucket.trim() ? args.bucket.trim() : 'school76-media';
          const objects = await s3.listObjects(bucket);
          return { bucket, count: objects.length, objects };
        }
      );

      register(
        {
          name: 'marketplace.list',
          seam: 'dsh-tools',
          description: 'Показать активный контроллер и установленные модули Маркетплейса оборудования и расширений.',
          mutating: false,
          parameters: {
            category: {
              type: 'string',
              description: 'Фильтр категории: device, portal, extension',
              enum: ['device', 'portal', 'extension'],
            },
          },
        },
        async (args) => {
          const snap = marketplace.getSnapshot();
          const cat = typeof args.category === 'string' ? args.category.trim() : '';
          const filtered = cat ? snap.modules.filter((m) => m.category === cat) : snap.modules;
          return {
            activeDeviceId: snap.activeDeviceId,
            activeBoardProfile: snap.activeBoardProfile,
            activeMBlockExtensions: snap.activeMBlockExtensions,
            modules: filtered.map((m) => ({
              id: m.id,
              name: m.shortLabel,
              category: m.category,
              installed: m.installed,
              active: m.active,
            })),
          };
        }
      );

      register(
        {
          name: 'marketplace.activate',
          seam: 'dsh-tools',
          description: 'Установить и активировать устройство, программный модуль портала или расширение mBlock из Маркетплейса.',
          mutating: true,
          parameters: {
            moduleId: {
              type: 'string',
              description: 'Идентификатор модуля (например dev-cyberpi-esp32, mdrawbot_azel_kinematics, mod-portal-chat)',
              required: true,
            },
          },
        },
        async (args) => {
          const moduleId = typeof args.moduleId === 'string' ? args.moduleId.trim() : '';
          if (!moduleId) throw new Error('Параметр moduleId обязателен');
          const snap = marketplace.activateModule(moduleId);
          return {
            activated: moduleId,
            activeDeviceId: snap.activeDeviceId,
            activeBoardProfile: snap.activeBoardProfile,
            activeMBlockExtensions: snap.activeMBlockExtensions,
          };
        }
      );

      ctx.provide('tools', {
        execute: async (toolName, args) => {
          const started = Date.now();
          const handler = toolHandlers.get(toolName);
          if (!handler) {
            return {
              toolName,
              ok: false,
              durationMs: Date.now() - started,
              output: null,
              error: `Инструмент "${toolName}" не зарегистрирован или его плагин-поставщик отключён`,
            };
          }
          try {
            const output = await handler.execute(args || {});
            const durationMs = Date.now() - started;
            kernel.recordEvent('tool:execute', toolName, `Выполнен инструмент ${toolName} (${durationMs} мс)`);
            return {
              toolName,
              ok: true,
              durationMs,
              output,
            };
          } catch (err) {
            return {
              toolName,
              ok: false,
              durationMs: Date.now() - started,
              output: null,
              error: err instanceof Error ? err.message : 'Ошибка выполнения инструмента',
            };
          }
        },
      });
    },
  });

  async function runDeterministicLoop(
    providerId: 'dsh-llm-gemini' | 'dsh-llm-deterministic',
    goal: string,
    projectId: string | undefined,
    toolsSvc: ServerHarnessServices['tools']
  ): Promise<HarnessAgentRunResult> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const steps: HarnessAgentStep[] = [];
    const lower = goal.toLowerCase();
    const targetProject = projectId || 'school76-1u';
    const repo = port.getProjects().find((p) => p.id === targetProject)?.forgejoRepo || 'school76-1u';

    let stepNum = 1;
    steps.push({
      id: `step-${stepNum}`,
      step: stepNum++,
      kind: 'thought',
      title: 'Разбор инженерной цели и выбор активных инструментов',
      detail: `Анализирую запрос «${goal}» в контексте активного профиля «${kernel.getActiveProfileId()}».`,
    });

    const invokeTool = async (toolName: string, args: Record<string, unknown>, label: string) => {
      steps.push({
        id: `step-${stepNum}`,
        step: stepNum++,
        kind: 'tool_call',
        title: label,
        detail: `Вызов ${toolName}`,
        toolName,
        toolArgs: args,
      });
      const res = await toolsSvc.execute(toolName, args);
      steps.push({
        id: `step-${stepNum}`,
        step: stepNum++,
        kind: 'tool_result',
        title: res.ok ? `Результат ${toolName}` : `Сбой ${toolName}`,
        detail: res.ok ? `Выполнено за ${res.durationMs} мс` : res.error || 'Ошибка',
        toolName,
        toolOutput: res.ok ? res.output : { error: res.error },
        durationMs: res.durationMs,
      });
      return res;
    };

    const summaryParts: string[] = [];

    if (lower.includes('harness') || lower.includes('плагин') || lower.includes('cordis') || lower.includes('шов') || lower.includes('seam')) {
      const r = await invokeTool('harness.inspect', {}, 'Инспекция графа Cordis и швов');
      if (r.ok) {
        const d = r.output as any;
        summaryParts.push(
          `Активен профиль ${d.activeProfileId}: смонтировано ${d.metrics?.activePlugins}/${d.metrics?.totalPlugins} плагинов, ${d.metrics?.registeredTools} инструментов и ${d.metrics?.activeEffects} обратимых эффектов.`
        );
      }
    }

    const createMatch = goal.match(/созда[йть]\s+задач[уи](?:\s+по\s+([a-zа-я0-9-]+))?[:\s]+(.+)/i);
    if (createMatch) {
      const rawText = (createMatch[2] || goal).trim();
      const subsystemMatch = goal.match(/\b(OBC|EPS|ADCS|COMMS|PAYLOAD|GROUND)\b/i);
      const subsystem = subsystemMatch ? subsystemMatch[1].toUpperCase() : 'OBC';
      const r = await invokeTool(
        'tasks.create',
        { projectId: targetProject, title: rawText.slice(0, 110), subsystem, priority: 'high' },
        `Создание задачи в подсистеме ${subsystem}`
      );
      if (r.ok) {
        const created = (r.output as any).task;
        summaryParts.push(`Создана задача ${created.id} (${created.subsystem}): «${created.title}».`);
      } else if (r.error) {
        summaryParts.push(`Не удалось создать задачу: ${r.error}.`);
      }
    }

    if (lower.includes('wiki') || lower.includes('вики') || lower.includes('аудит') || lower.includes('знан')) {
      const r = await invokeTool('wiki.lint', { repo }, `Аудит целостности llm-wiki (${repo})`);
      if (r.ok) {
        const out = r.output as any;
        const broken = Array.isArray(out.brokenLinks) ? out.brokenLinks.length : 0;
        const orphans = Array.isArray(out.orphanPages) ? out.orphanPages.length : 0;
        summaryParts.push(
          `Проверка llm-wiki (${repo}): просканировано ${out.scannedFiles ?? '?'} документов, битых ссылок ${broken}, изолированных страниц ${orphans}.`
        );
      } else if (r.error) {
        summaryParts.push(`Аудит wiki недоступен: ${r.error}`);
      }
    }

    if (lower.includes('ci') || lower.includes('сборк') || lower.includes('тест') || lower.includes('actions')) {
      const r = await invokeTool('ci.list_runs', { repo }, `Проверка прогонов CI/CD (${repo})`);
      if (r.ok) {
        const out = r.output as any;
        summaryParts.push(`В реестре CI обнаружено ${out.runsCount ?? 0} прогонов Forgejo Actions для ${repo}.`);
      } else if (r.error) {
        summaryParts.push(`Инспекция CI пропущена: ${r.error}`);
      }
    }

    if (lower.includes('mblock') || lower.includes('программ') || lower.includes('по') || lower.includes('firmware')) {
      const r = await invokeTool('programs.list', { projectId: targetProject }, 'Список бортовых программ mBlock');
      if (r.ok) {
        const out = r.output as any;
        summaryParts.push(`Бортовых программ mBlock в проекте: ${out.count ?? 0}.`);
      }
    }

    if (
      summaryParts.length === 0 ||
      lower.includes('задач') ||
      lower.includes('obc') ||
      lower.includes('eps') ||
      lower.includes('adcs') ||
      lower.includes('comms') ||
      lower.includes('сводк')
    ) {
      const subMatch = goal.match(/\b(OBC|EPS|ADCS|COMMS|PAYLOAD|GROUND)\b/i);
      const r = await invokeTool(
        'tasks.list',
        { projectId: targetProject, ...(subMatch ? { subsystem: subMatch[1].toUpperCase() } : {}) },
        'Выборка задач подсистем'
      );
      if (r.ok) {
        const out = r.output as any;
        summaryParts.push(
          `Найдено задач${subMatch ? ` по ${subMatch[1].toUpperCase()}` : ''}: ${out.count ?? 0}.`
        );
      }
    }

    const finalAnswer = summaryParts.join(' ');
    steps.push({
      id: `step-${stepNum}`,
      step: stepNum++,
      kind: 'answer',
      title: 'Итоговая сводка агентского цикла',
      detail: finalAnswer,
    });

    const finishedAt = new Date().toISOString();
    return {
      runId: `run-${Date.now().toString(36)}`,
      goal,
      providerId,
      profileId: kernel.getActiveProfileId(),
      status: 'completed',
      startedAt,
      finishedAt,
      durationMs: Date.now() - t0,
      steps,
      finalAnswer,
    };
  }

  kernel.plugin({
    id: 'dsh-llm-gemini',
    name: 'Gemini Function-Calling Adapter',
    description: 'Адаптер рассуждений через @google/genai с вызовом инструментов Cordis (с автоматическим откатом на локальный планировщик без ключа).',
    bundle: 'dsh-base',
    kind: 'seam-provider',
    inject: ['tools'],
    provides: ['llm'],
    providesSeam: 'dsh-llm',
    apply(ctx) {
      const apiKey = process.env.GEMINI_API_KEY?.trim() || '';
      ctx.provide('llm', {
        providerId: 'dsh-llm-gemini',
        modelName: apiKey ? 'gemini-2.5-flash' : 'gemini-2.5-flash (fallback)',
        configured: Boolean(apiKey),
        planAndRun: async (goal, projectId) => {
          const toolsSvc = ctx.service('tools');
          if (!apiKey) {
            return runDeterministicLoop('dsh-llm-gemini', goal, projectId, toolsSvc);
          }

          const startedAt = new Date().toISOString();
          const t0 = Date.now();
          const steps: HarnessAgentStep[] = [];
          let stepNum = 1;

          try {
            const ai = new GoogleGenAI({ apiKey });
            const schemas = kernel.getToolSchemas();
            const declarations: FunctionDeclaration[] = schemas.map((s) => ({
              name: s.name.replace(/\./g, '_'),
              description: s.description,
              parameters: {
                type: Type.OBJECT,
                properties: Object.fromEntries(
                  Object.entries(s.parameters).map(([k, v]) => [
                    k,
                    {
                      type:
                        v.type === 'number'
                          ? Type.NUMBER
                          : v.type === 'boolean'
                            ? Type.BOOLEAN
                            : Type.STRING,
                      description: v.description,
                      ...(v.enum ? { enum: v.enum } : {}),
                    },
                  ])
                ),
              },
            }));

            const nameMap = new Map<string, string>(
              schemas.map((s) => [s.name.replace(/\./g, '_'), s.name])
            );

            const contents: any[] = [
              {
                role: 'user',
                parts: [
                  {
                    text: `Ты — инженерный агент внутри DeepSeek-Harness (Cordis) для проекта кубсата 1U (projectId="${projectId || 'school76-1u'}"). Используй доступные инструменты, чтобы точно выполнить цель и ответить кратко по-русски без выдумывания данных. Цель: ${goal}`,
                  },
                ],
              },
            ];

            let finalAnswer = '';
            for (let turn = 0; turn < 4; turn++) {
              const resp = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents,
                config: {
                  tools: [{ functionDeclarations: declarations }],
                },
              });

              const calls = resp.functionCalls;
              if (!calls || calls.length === 0) {
                finalAnswer = resp.text?.trim() || 'Цикл завершён.';
                break;
              }

              contents.push(resp.candidates?.[0]?.content || { role: 'model', parts: calls.map((c) => ({ functionCall: c })) });

              const responseParts: any[] = [];
              for (const call of calls) {
                const realTool = nameMap.get(call.name || '') || call.name || '';
                const args = (call.args || {}) as Record<string, unknown>;
                steps.push({
                  id: `step-${stepNum}`,
                  step: stepNum++,
                  kind: 'tool_call',
                  title: `Вызов ${realTool}`,
                  detail: `Аргументы: ${JSON.stringify(args)}`,
                  toolName: realTool,
                  toolArgs: args,
                });
                const execRes = await toolsSvc.execute(realTool, args);
                steps.push({
                  id: `step-${stepNum}`,
                  step: stepNum++,
                  kind: 'tool_result',
                  title: execRes.ok ? `Результат ${realTool}` : `Ошибка ${realTool}`,
                  detail: execRes.ok ? `Выполнено за ${execRes.durationMs} мс` : execRes.error || 'Ошибка',
                  toolName: realTool,
                  toolOutput: execRes.ok ? execRes.output : { error: execRes.error },
                  durationMs: execRes.durationMs,
                });
                responseParts.push({
                  functionResponse: {
                    name: call.name,
                    response: execRes.ok ? { result: execRes.output } : { error: execRes.error },
                  },
                });
              }

              contents.push({ role: 'user', parts: responseParts });
            }

            if (!finalAnswer) {
              finalAnswer = 'Агентский цикл выполнен.';
            }

            steps.push({
              id: `step-${stepNum}`,
              step: stepNum++,
              kind: 'answer',
              title: 'Ответ DeepSeek-Harness (Gemini)',
              detail: finalAnswer,
            });

            return {
              runId: `run-${Date.now().toString(36)}`,
              goal,
              providerId: 'dsh-llm-gemini',
              profileId: kernel.getActiveProfileId(),
              status: 'completed',
              startedAt,
              finishedAt: new Date().toISOString(),
              durationMs: Date.now() - t0,
              steps,
              finalAnswer,
            };
          } catch {
            return runDeterministicLoop('dsh-llm-gemini', goal, projectId, toolsSvc);
          }
        },
      });
    },
  });

  kernel.plugin(
    {
      id: 'dsh-llm-deterministic',
      name: 'Deterministic Rule Planner',
      description: 'Детерминированный оффлайн-планировщик без внешних API-ключей для воспроизводимого прогона инструментов.',
      bundle: 'dsh-base',
      kind: 'seam-provider',
      inject: ['tools'],
      provides: ['llm'],
      providesSeam: 'dsh-llm',
      apply(ctx) {
        ctx.provide('llm', {
          providerId: 'dsh-llm-deterministic',
          modelName: 'dsh-deterministic-v1',
          configured: true,
          planAndRun: async (goal, projectId) =>
            runDeterministicLoop('dsh-llm-deterministic', goal, projectId, ctx.service('tools')),
        });
      },
    },
    false
  );

  kernel.plugin({
    id: 'dsh-agent-loop',
    name: 'DeepSeek-Harness Agent Loop',
    description: 'Исполнительный цикл агента: принимает инженерную цель, вызывает инструменты Cordis и фиксирует трассировку.',
    bundle: 'dsh-base',
    kind: 'consumer',
    inject: ['llm', 'tools'],
    consumesSeam: 'dsh-llm',
    provides: ['agent'],
    apply(ctx) {
      ctx.provide('agent', {
        runGoal: async (goal, projectId) => {
          const llm = ctx.service('llm');
          const res = await llm.planAndRun(goal, projectId);
          agentHistory.unshift(res);
          if (agentHistory.length > 20) agentHistory.length = 20;
          kernel.recordEvent(
            'agent:run',
            llm.providerId,
            `Агентский цикл завершён за ${res.durationMs} мс (${res.steps.length} шагов)`
          );
          return res;
        },
        getHistory: () => [...agentHistory],
      });
    },
  });

  const uiSlots: Array<{
    id: string;
    name: string;
    description: string;
    bundle: 'dsh-base' | 'dsh-cubesat' | 'dsh-devops' | 'dsh-collab';
    uiTab: 'harness' | 'marketplace' | 'projects' | 'tasks' | 'wiki' | 'mblock' | 'ci' | 'chat';
    inject: string[];
    locked?: boolean;
  }> = [
    {
      id: 'dsh-ui-harness',
      name: 'Консоль DeepSeek-Harness',
      description: 'Управление профилями Cordis, швами (seams), плагинами и запуском агентского цикла.',
      bundle: 'dsh-base',
      uiTab: 'harness',
      inject: ['store', 'tools'],
      locked: true,
    },
    {
      id: 'dsh-ui-marketplace',
      name: 'Маркетплейс оборудования и модулей',
      description: 'Центр установки и активации контроллеров, программных модулей портала и расширений mBlock 5.',
      bundle: 'dsh-base',
      uiTab: 'marketplace',
      inject: ['store'],
      locked: true,
    },
    {
      id: 'dsh-ui-projects',
      name: 'Рабочее пространство проектов',
      description: '3D-модель кубсата 1U, стенд подсистем, граф архитектуры и лента команды.',
      bundle: 'dsh-cubesat',
      uiTab: 'projects',
      inject: ['store'],
    },
    {
      id: 'dsh-ui-tasks',
      name: 'Канбан и Гант подсистем',
      description: 'Планирование и трекинг задач OBC, EPS, ADCS, COMMS и PAYLOAD.',
      bundle: 'dsh-cubesat',
      uiTab: 'tasks',
      inject: ['store'],
    },
    {
      id: 'dsh-ui-wiki',
      name: 'База знаний llm-wiki и Univer',
      description: 'Markdown-репозиторий Forgejo с [[wikilinks]] и редактором документов Univer.',
      bundle: 'dsh-devops',
      uiTab: 'wiki',
      inject: ['forge'],
    },
    {
      id: 'dsh-ui-mblock',
      name: 'Студия бортового ПО mBlock',
      description: 'Визуальный конструктор Blockly, трансляция Python/C++ и онлайн-стенд 1U.',
      bundle: 'dsh-cubesat',
      uiTab: 'mblock',
      inject: ['store'],
    },
    {
      id: 'dsh-ui-ci',
      name: 'Конвейер CI/CD и GitHub Sync',
      description: 'Прогоны GitHub Actions, Forgejo Actions и предпушевые проверки.',
      bundle: 'dsh-devops',
      uiTab: 'ci',
      inject: ['ci'],
    },
    {
      id: 'dsh-ui-chat',
      name: 'Техчат команды реального времени',
      description: 'Каналы подсистем по WebSocket со ссылками на задачи и программы.',
      bundle: 'dsh-collab',
      uiTab: 'chat',
      inject: ['realtime'],
    },
  ];

  for (const slot of uiSlots) {
    kernel.plugin({
      id: slot.id,
      name: slot.name,
      description: slot.description,
      bundle: slot.bundle,
      kind: 'ui-slot',
      uiTab: slot.uiTab,
      inject: slot.inject,
      locked: slot.locked,
      apply(ctx) {
        ctx.effect(() => {
          // Reversible UI slot mount tracked by Cordis effect count
        });
      },
    });
  }

  kernel.activateProfile('cubesat-full');
  marketplace.syncToKernel();

  return {
    kernel,
    getSnapshot: () => kernel.getSnapshot(),
    activateProfile: (profileId) => {
      const snap = kernel.activateProfile(profileId);
      marketplace.syncFromKernel();
      return snap;
    },
    togglePlugin: (pluginId, enabled) => {
      kernel.togglePlugin(pluginId, enabled);
      marketplace.syncFromKernel();
      return kernel.getSnapshot();
    },
    switchSeamProvider: (seamId, providerId) => {
      kernel.switchSeamProvider(seamId, providerId);
      marketplace.syncFromKernel();
      return kernel.getSnapshot();
    },
    executeTool: async (toolName, args) => {
      const toolsSvc = kernel.services.tools;
      if (!toolsSvc) {
        return {
          toolName,
          ok: false,
          durationMs: 0,
          output: null,
          error: 'Реестр инструментов dsh-tools-cubesat не активен в текущем профиле',
        };
      }
      return toolsSvc.execute(toolName, args);
    },
    runAgentGoal: async (goal, projectId) => {
      const agentSvc = kernel.services.agent;
      if (!agentSvc) {
        throw new Error('Плагин dsh-agent-loop не активен (проверьте зависимости dsh-llm и dsh-tools)');
      }
      return agentSvc.runGoal(goal, projectId);
    },
    getAgentHistory: () => [...agentHistory],
    getMarketplace: () => marketplace.getSnapshot(),
    installMarketplaceModule: (moduleId) => marketplace.installModule(moduleId),
    uninstallMarketplaceModule: (moduleId) => marketplace.uninstallModule(moduleId),
    activateMarketplaceModule: (moduleId) => marketplace.activateModule(moduleId),
    deactivateMarketplaceModule: (moduleId) => marketplace.deactivateModule(moduleId),
  };
}

export function registerHarnessRoutes(
  app: express.Express,
  runtime: ServerHarnessRuntime
): void {
  app.get('/api/harness/state', (_req, res) => {
    res.json({
      snapshot: runtime.getSnapshot(),
      agentHistory: runtime.getAgentHistory(),
    });
  });

  app.post('/api/harness/profiles/:profileId/activate', (req, res) => {
    try {
      const snapshot = runtime.activateProfile(req.params.profileId);
      res.json({ ok: true, snapshot, marketplace: runtime.getMarketplace() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Profile activation failed' });
    }
  });

  app.post('/api/harness/plugins/:pluginId/toggle', (req, res) => {
    try {
      const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined;
      const snapshot = runtime.togglePlugin(req.params.pluginId, enabled);
      res.json({ ok: true, snapshot, marketplace: runtime.getMarketplace() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Plugin toggle failed' });
    }
  });

  app.post('/api/harness/seams/:seamId/provider', (req, res) => {
    try {
      const providerId = typeof req.body?.providerId === 'string' ? req.body.providerId.trim() : '';
      if (!providerId) {
        res.status(400).json({ error: 'Не указан providerId' });
        return;
      }
      const snapshot = runtime.switchSeamProvider(req.params.seamId, providerId);
      res.json({ ok: true, snapshot, marketplace: runtime.getMarketplace() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Seam swap failed' });
    }
  });

  app.post('/api/harness/tools/:toolName/execute', async (req, res) => {
    try {
      const args = req.body && typeof req.body === 'object' ? (req.body.args || req.body) : {};
      const result = await runtime.executeTool(req.params.toolName, args);
      res.json({
        result,
        snapshot: runtime.getSnapshot(),
        marketplace: runtime.getMarketplace(),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Tool execution failed' });
    }
  });

  app.post('/api/harness/agent/run', async (req, res) => {
    try {
      const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
      const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : undefined;
      if (!goal) {
        res.status(400).json({ error: 'Введите инженерную цель для запуска цикла' });
        return;
      }
      const run = await runtime.runAgentGoal(goal, projectId);
      res.json({
        run,
        snapshot: runtime.getSnapshot(),
        agentHistory: runtime.getAgentHistory(),
        marketplace: runtime.getMarketplace(),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Agent loop failed' });
    }
  });

  app.get('/api/marketplace', (_req, res) => {
    res.json({
      marketplace: runtime.getMarketplace(),
      snapshot: runtime.getSnapshot(),
    });
  });

  app.post('/api/marketplace/modules/:moduleId/install', (req, res) => {
    try {
      const marketplace = runtime.installMarketplaceModule(req.params.moduleId);
      res.json({ ok: true, marketplace, snapshot: runtime.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Marketplace install failed' });
    }
  });

  app.post('/api/marketplace/modules/:moduleId/uninstall', (req, res) => {
    try {
      const marketplace = runtime.uninstallMarketplaceModule(req.params.moduleId);
      res.json({ ok: true, marketplace, snapshot: runtime.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Marketplace uninstall failed' });
    }
  });

  app.post('/api/marketplace/modules/:moduleId/activate', (req, res) => {
    try {
      const marketplace = runtime.activateMarketplaceModule(req.params.moduleId);
      res.json({ ok: true, marketplace, snapshot: runtime.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Marketplace activate failed' });
    }
  });

  app.post('/api/marketplace/modules/:moduleId/deactivate', (req, res) => {
    try {
      const marketplace = runtime.deactivateMarketplaceModule(req.params.moduleId);
      res.json({ ok: true, marketplace, snapshot: runtime.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Marketplace deactivate failed' });
    }
  });
}
