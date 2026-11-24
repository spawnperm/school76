import type {
  CommunityProject,
  CubeSatTask,
  OnboardProgram,
  Subsystem,
  WsServerEvent,
} from '../../src/types/cubesat.ts';
import type {
  HarnessAgentRunResult,
  HarnessToolExecutionResult,
} from '../../src/harness/types.ts';

export interface HarnessStatePort {
  getTasks: () => CubeSatTask[];
  addTask: (input: {
    projectId?: string;
    title: string;
    description?: string;
    subsystem?: Subsystem;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    assignee?: string;
  }) => CubeSatTask;
  updateTaskStatus: (
    taskId: string,
    status: 'backlog' | 'in_progress' | 'review' | 'done',
    progressPct?: number
  ) => CubeSatTask | null;
  getProjects: () => CommunityProject[];
  getPrograms: () => OnboardProgram[];
  getUsersCount: () => number;
  getOnlineCount: () => number;
  broadcast: (event: WsServerEvent) => void;
  syncTasksToForgejo: (projectId: string, summary: string, author: string) => void;
  postgresQuery?: (sql: string) => Promise<unknown>;
  postgresTables?: () => unknown[];
  natsPublish?: (subject: string, payload: unknown, publisher?: string) => Promise<unknown>;
  natsQuery?: (subject: string) => unknown[];
  directusList?: (collection: string, search?: string) => { data: unknown[]; total: number };
  difyRun?: (workflowId: string, query: string, projectId?: string) => Promise<unknown>;
  traefikOverview?: () => unknown;
}

export interface StoreService {
  driver: string;
  getTasks: () => CubeSatTask[];
  addTask: HarnessStatePort['addTask'];
  updateTaskStatus: HarnessStatePort['updateTaskStatus'];
  getProjects: () => CommunityProject[];
  getPrograms: () => OnboardProgram[];
  getStats: () => {
    projects: number;
    tasks: number;
    programs: number;
    users: number;
    online: number;
  };
}

export interface ForgeService {
  driver: string;
  listFiles: (repo: string) => unknown[];
  readFile: (repo: string, filepath: string) => { path: string; content: string; sha: string };
  lintWiki: (repo: string, author: string) => Promise<unknown>;
  syncTasks: (projectId: string, summary: string, author: string) => void;
}

export interface S3Service {
  driver: string;
  listObjects: (bucket: string) => Promise<unknown[]>;
}

export interface CiService {
  driver: string;
  listForgejoRuns: (repo: string) => Promise<unknown[]>;
  dispatchForgejoRun: (repo: string, workflowName: string, actor: string) => Promise<unknown>;
  getGitHubStatus: () => unknown;
}

export interface RealtimeService {
  driver: string;
  broadcast: (event: WsServerEvent) => void;
  getOnlineCount: () => number;
}

export interface ToolHandlerEntry {
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolsService {
  execute: (toolName: string, args: Record<string, unknown>) => Promise<HarnessToolExecutionResult>;
}

export interface LlmService {
  providerId: 'dsh-llm-gemini' | 'dsh-llm-deterministic' | 'dsh-llm-dify';
  modelName: string;
  configured: boolean;
  planAndRun: (goal: string, projectId?: string) => Promise<HarnessAgentRunResult>;
}

export interface AgentLoopService {
  runGoal: (goal: string, projectId?: string) => Promise<HarnessAgentRunResult>;
  getHistory: () => HarnessAgentRunResult[];
}

export interface RegistryService {
  driver: string;
  getOverview: () => unknown;
  search: (query?: string) => unknown[];
  getPackage: (name: string) => unknown;
}

export interface ServerHarnessServices extends Record<string, unknown> {
  store: StoreService;
  forge: ForgeService;
  s3: S3Service;
  ci: CiService;
  realtime: RealtimeService;
  tools: ToolsService;
  llm: LlmService;
  agent: AgentLoopService;
  registry: RegistryService;
  uiSlots: Record<string, boolean>;
}
