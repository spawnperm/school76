export type HarnessBundleId =
  | 'dsh-base'
  | 'dsh-cubesat'
  | 'dsh-devops'
  | 'dsh-collab';

export type HarnessPluginStatus = 'active' | 'disabled' | 'waiting_deps' | 'error';

export type HarnessPluginKind = 'core' | 'seam-provider' | 'consumer' | 'tool-pack' | 'ui-slot';

export interface HarnessSeamDescriptor {
  id: string;
  title: string;
  description: string;
  activeProviderId: string | null;
  availableProviderIds: string[];
  consumerIds: string[];
}

export interface HarnessPluginSnapshot {
  id: string;
  name: string;
  description: string;
  bundle: HarnessBundleId;
  kind: HarnessPluginKind;
  status: HarnessPluginStatus;
  locked?: boolean;
  inject: string[];
  provides: string[];
  consumesSeam?: string;
  providesSeam?: string;
  missingDeps: string[];
  effectCount: number;
  uiTab?: 'harness' | 'marketplace' | 'projects' | 'tasks' | 'wiki' | 'mblock' | 'ci' | 'chat' | 'studio' | 'stack';
  errorMessage?: string;
}

export interface HarnessProfileDescriptor {
  id: string;
  name: string;
  description: string;
  bundles: HarnessBundleId[];
  enabledPlugins: string[];
  seamProviders: Record<string, string>;
}

export interface HarnessToolSchema {
  name: string;
  pluginId: string;
  seam: string;
  description: string;
  mutating: boolean;
  parameters: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean';
      description: string;
      required?: boolean;
      enum?: string[];
    }
  >;
}

export interface HarnessToolExecutionResult {
  toolName: string;
  ok: boolean;
  durationMs: number;
  output: unknown;
  error?: string;
}

export interface HarnessEventEntry {
  id: string;
  timestamp: string;
  type:
    | 'kernel:boot'
    | 'plugin:mount'
    | 'plugin:unmount'
    | 'seam:swap'
    | 'profile:activate'
    | 'tool:execute'
    | 'agent:run';
  source: string;
  message: string;
}

export interface HarnessAgentStep {
  id: string;
  step: number;
  kind: 'thought' | 'tool_call' | 'tool_result' | 'answer';
  title: string;
  detail: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOutput?: unknown;
  durationMs?: number;
}

export interface HarnessAgentRunResult {
  runId: string;
  goal: string;
  providerId: string;
  profileId: string;
  status: 'completed' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: HarnessAgentStep[];
  finalAnswer: string;
}

export interface HarnessRuntimeSnapshot {
  engine: 'DeepSeek-Harness (Cordis)';
  activeProfileId: string;
  profiles: HarnessProfileDescriptor[];
  seams: HarnessSeamDescriptor[];
  plugins: HarnessPluginSnapshot[];
  tools: HarnessToolSchema[];
  events: HarnessEventEntry[];
  metrics: {
    activePlugins: number;
    totalPlugins: number;
    activeEffects: number;
    registeredTools: number;
    seamsCount: number;
  };
}

export type MarketplaceCategory = 'device' | 'portal' | 'extension';

export type MakeblockBoardProfileId = 'auriga_stm32' | 'codey_esp32' | 'gizduino_avr';

export interface MarketplaceModuleDescriptor {
  id: string;
  name: string;
  shortLabel: string;
  category: MarketplaceCategory;
  subsystem: string;
  version: string;
  author: string;
  description: string;
  locked?: boolean;
  defaultInstalled: boolean;
  defaultActive: boolean;
  boardProfile?: MakeblockBoardProfileId;
  baudRate?: number;
  protocol?: string;
  cordisPlugins?: string[];
  seamBinding?: { seamId: string; providerId: string };
  mblockExtensionId?: string;
  toolboxCategoryName?: string;
  recommendedExtensions?: string[];
  blocksPreview?: string[];
}

export interface MarketplaceModuleState {
  installed: boolean;
  active: boolean;
  installedAt?: string;
}

export type MarketplaceEntry = MarketplaceModuleDescriptor & MarketplaceModuleState;

export interface MarketplaceSnapshot {
  activeDeviceId: string;
  activeBoardProfile: MakeblockBoardProfileId;
  activeMBlockExtensions: string[];
  modules: MarketplaceEntry[];
  updatedAt: string;
}

