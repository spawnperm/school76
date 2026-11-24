import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Boxes,
  Cpu,
  Layers,
  Loader2,
  Play,
  Power,
  RefreshCw,
  Terminal,
  Wrench,
} from 'lucide-react';
import type {
  HarnessAgentRunResult,
  HarnessBundleId,
  HarnessPluginSnapshot,
  HarnessRuntimeSnapshot,
  HarnessToolExecutionResult,
  HarnessToolSchema,
} from '../harness/types.ts';
import type { HarnessWorkspaceSlotId } from '../harness/frontendRegistry.ts';

type ConsoleSection = 'overview' | 'plugins' | 'tools' | 'agent';

interface HarnessConsoleProps {
  snapshot: HarnessRuntimeSnapshot | null;
  agentHistory: HarnessAgentRunResult[];
  activeProjectId: string;
  activeProjectName: string;
  loading: boolean;
  busyAction: string | null;
  error: string | null;
  onRefresh: () => Promise<void>;
  onActivateProfile: (profileId: string) => Promise<void>;
  onTogglePlugin: (pluginId: string, enabled?: boolean) => Promise<void>;
  onSwitchSeamProvider: (seamId: string, providerId: string) => Promise<void>;
  onExecuteTool: (
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<HarnessToolExecutionResult>;
  onRunAgentGoal: (goal: string, projectId?: string) => Promise<HarnessAgentRunResult | null>;
  onOpenSlot: (tab: HarnessWorkspaceSlotId) => void;
  onSyncAppState?: () => void;
}

const BUNDLE_LABELS: Record<HarnessBundleId, string> = {
  'dsh-base': 'Базовое ядро (dsh-base)',
  'dsh-cubesat': 'Контур кубсата 1U (dsh-cubesat)',
  'dsh-devops': 'DevOps и знания (dsh-devops)',
  'dsh-collab': 'Командная связь (dsh-collab)',
};

const STATUS_TEXT: Record<HarnessPluginSnapshot['status'], { label: string; cls: string }> = {
  active: { label: 'Активен', cls: 'text-emerald-700' },
  disabled: { label: 'Отключён', cls: 'text-slate-500' },
  waiting_deps: { label: 'Ожидает зависимости', cls: 'text-amber-700' },
  error: { label: 'Ошибка', cls: 'text-rose-700' },
};

const QUICK_GOALS: string[] = [
  'Провести аудит llm-wiki и проверить открытые задачи OBC',
  'Собрать сводку по последним прогонам CI/CD и программам mBlock',
  'Инспектировать граф Cordis, активные швы и инструменты',
  'Создать задачу по OBC: Добавить телеметрию температуры контроллера в цикл маяка',
];

function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const HarnessConsole: React.FC<HarnessConsoleProps> = ({
  snapshot,
  agentHistory,
  activeProjectId,
  activeProjectName,
  loading,
  busyAction,
  error,
  onRefresh,
  onActivateProfile,
  onTogglePlugin,
  onSwitchSeamProvider,
  onExecuteTool,
  onRunAgentGoal,
  onOpenSlot,
  onSyncAppState,
}) => {
  const [section, setSection] = useState<ConsoleSection>('overview');
  const [bundleFilter, setBundleFilter] = useState<HarnessBundleId | 'all'>('all');
  const [pluginQuery, setPluginQuery] = useState('');

  const [selectedToolName, setSelectedToolName] = useState<string>('harness.inspect');
  const [toolArgsDraft, setToolArgsDraft] = useState<string>('{}');
  const [toolResult, setToolResult] = useState<HarnessToolExecutionResult | null>(null);

  const [goalInput, setGoalInput] = useState<string>(QUICK_GOALS[0]);
  const [latestRun, setLatestRun] = useState<HarnessAgentRunResult | null>(null);

  const activeProfile = useMemo(
    () => snapshot?.profiles.find((p) => p.id === snapshot.activeProfileId) || null,
    [snapshot]
  );

  const filteredPlugins = useMemo(() => {
    if (!snapshot) return [];
    const q = pluginQuery.trim().toLowerCase();
    return snapshot.plugins.filter((p) => {
      if (bundleFilter !== 'all' && p.bundle !== bundleFilter) return false;
      if (!q) return true;
      return (
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [snapshot, bundleFilter, pluginQuery]);

  const selectedTool: HarnessToolSchema | null = useMemo(() => {
    if (!snapshot || snapshot.tools.length === 0) return null;
    return snapshot.tools.find((t) => t.name === selectedToolName) || snapshot.tools[0];
  }, [snapshot, selectedToolName]);

  const displayedRun = latestRun || agentHistory[0] || null;

  const handleSelectTool = (tool: HarnessToolSchema) => {
    setSelectedToolName(tool.name);
    const defaults: Record<string, string> = {};
    for (const [k, meta] of Object.entries(tool.parameters)) {
      if (k === 'projectId') defaults[k] = activeProjectId;
      else if (k === 'repo') defaults[k] = 'school76-1u';
      else if (k === 'bucket') defaults[k] = 'school76-media';
      else if (meta.required) defaults[k] = '';
    }
    setToolArgsDraft(JSON.stringify(defaults, null, 2));
    setToolResult(null);
  };

  const handleRunSelectedTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTool) return;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = toolArgsDraft.trim() ? JSON.parse(toolArgsDraft) : {};
    } catch {
      setToolResult({
        toolName: selectedTool.name,
        ok: false,
        durationMs: 0,
        output: null,
        error: 'Некорректный JSON в параметрах инструмента',
      });
      return;
    }
    const res = await onExecuteTool(selectedTool.name, parsed);
    setToolResult(res);
    if (res.ok && selectedTool.mutating && onSyncAppState) {
      onSyncAppState();
    }
  };

  const handleSubmitAgentGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim()) return;
    const run = await onRunAgentGoal(goalInput.trim(), activeProjectId);
    if (run) {
      setLatestRun(run);
      onSyncAppState?.();
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-4">
        <div className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-800">DeepSeek-Harness</span>
            <span aria-hidden="true">·</span>
            <span>Архитектура Cordis (Everything is a Plugin)</span>
            <span aria-hidden="true">·</span>
            <span>Проект: {activeProjectName}</span>
          </div>
          <h1 className="font-display text-xl font-bold text-slate-900 text-balance">
            Модульное ядро, швы возможностей и агентский цикл
          </h1>
          <p className="text-sm text-slate-600">
            Каждый компонент платформы — от хранилища миссии и Forgejo llm-wiki до студии mBlock и
            чата — монтируется как плагин Cordis с обратимыми эффектами и подменяемыми провайдерами.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'overview', label: 'Профили и контекст' },
                { id: 'plugins', label: 'Плагины и швы' },
                { id: 'tools', label: 'Инструменты' },
                { id: 'agent', label: 'Агентский цикл' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  section === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busyAction ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {snapshot && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3.5">
            <div className="text-xs text-slate-500">Активный профиль</div>
            <div className="mt-1 font-mono text-base font-semibold text-slate-900 truncate">
              {activeProfile?.name || snapshot.activeProfileId}
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
              {snapshot.activeProfileId}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3.5">
            <div className="text-xs text-slate-500">Плагины Cordis</div>
            <div className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
              {snapshot.metrics.activePlugins} / {snapshot.metrics.totalPlugins}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {snapshot.metrics.seamsCount} швов возможностей
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3.5">
            <div className="text-xs text-slate-500">Обратимые эффекты</div>
            <div className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
              {snapshot.metrics.activeEffects}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Откатываются при выгрузке
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3.5">
            <div className="text-xs text-slate-500">Реестр dsh-tools</div>
            <div className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
              {snapshot.metrics.registeredTools}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {agentHistory.length} запусков агента
            </div>
          </div>
        </div>
      )}

      {section === 'overview' && snapshot && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Профили композиции
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Переключение профиля атомарно монтирует бандлы, бэкенд-швы и разделы интерфейса.
                </p>
              </div>
              <Layers className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            {snapshot.profiles.map((prof) => {
              const isActive = prof.id === snapshot.activeProfileId;
              const isBusy = busyAction === `profile:${prof.id}`;
              return (
                <div
                  key={prof.id}
                  className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                    isActive ? 'bg-sky-50/50' : ''
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-semibold text-slate-900">
                        {prof.name}
                      </span>
                      <span className="font-mono text-xs text-slate-500">{prof.id}</span>
                      {isActive && (
                        <span className="text-xs font-medium text-sky-700">· Активен</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">{prof.description}</p>
                    <div className="text-xs text-slate-500 font-mono">
                      Бандлы: {prof.bundles.join(' · ')}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isActive || busyAction !== null}
                    onClick={() => void onActivateProfile(prof.id)}
                    className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-slate-100 text-slate-500 cursor-default'
                        : 'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50'
                    }`}
                  >
                    {isBusy ? 'Применение...' : isActive ? 'Текущий профиль' : 'Активировать'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Смонтированные модули кубсата
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Слоты интерфейса, активные в текущем дереве Cordis.
                  </p>
                </div>
                <Boxes className="w-4 h-4 text-slate-400 shrink-0" />
              </div>

              {snapshot.plugins
                .filter((p) => p.kind === 'ui-slot' && p.uiTab && p.uiTab !== 'harness')
                .map((slot) => {
                  const active = slot.status === 'active';
                  return (
                    <div
                      key={slot.id}
                      className="px-5 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {slot.name}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {slot.id} · {STATUS_TEXT[slot.status].label}
                        </div>
                      </div>
                      {active && slot.uiTab ? (
                        <button
                          type="button"
                          onClick={() => onOpenSlot(slot.uiTab!)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 hover:bg-sky-50 rounded-md whitespace-nowrap shrink-0"
                        >
                          Открыть
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                          Выгружен
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
              <div className="px-5 py-3.5 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Журнал жизненного цикла Cordis
                </h3>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {snapshot.events.length} событий
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {snapshot.events.slice(0, 14).map((ev) => (
                  <div key={ev.id} className="px-5 py-2.5 text-xs space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-slate-500 font-mono">
                      <span className="truncate">{ev.source}</span>
                      <span className="tabular-nums shrink-0">{formatClock(ev.timestamp)}</span>
                    </div>
                    <div className="text-slate-700">{ev.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {section === 'plugins' && snapshot && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Швы возможностей (Three-Role Seams)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Разделение контракта (Seam), конкретной реализации (Provider) и потребителей (Consumers).
                </p>
              </div>
              <Cpu className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-5">Шов (Seam)</th>
                    <th className="py-2.5 px-4">Назначение</th>
                    <th className="py-2.5 px-4">Активный провайдер</th>
                    <th className="py-2.5 px-5 text-right">Потребители</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {snapshot.seams.map((seam) => (
                    <tr key={seam.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-5 align-top">
                        <div className="font-medium text-slate-900">{seam.title}</div>
                        <div className="font-mono text-xs text-slate-500">{seam.id}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 align-top max-w-md">
                        {seam.description}
                      </td>
                      <td className="py-3 px-4 align-top">
                        {seam.availableProviderIds.length > 1 ? (
                          <select
                            value={seam.activeProviderId || ''}
                            disabled={busyAction !== null}
                            onChange={(e) => {
                              if (e.target.value) {
                                void onSwitchSeamProvider(seam.id, e.target.value);
                              }
                            }}
                            className="font-mono text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                          >
                            {seam.availableProviderIds.map((pid) => (
                              <option key={pid} value={pid}>
                                {pid}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-mono text-xs text-slate-800">
                            {seam.activeProviderId || 'Отключён'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right font-mono text-xs text-slate-600 tabular-nums align-top">
                        {seam.consumerIds.length > 0 ? seam.consumerIds.join(', ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Реестр плагинов Cordis
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  При отключении поставщика зависимые плагины автоматически переходят в ожидание и откатывают свои эффекты.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={pluginQuery}
                  onChange={(e) => setPluginQuery(e.target.value)}
                  placeholder="Поиск плагина..."
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <select
                  value={bundleFilter}
                  onChange={(e) => setBundleFilter(e.target.value as HarnessBundleId | 'all')}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">Все бандлы</option>
                  {(Object.keys(BUNDLE_LABELS) as HarnessBundleId[]).map((bid) => (
                    <option key={bid} value={bid}>
                      {BUNDLE_LABELS[bid]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divide-y divide-slate-200">
              {filteredPlugins.map((plugin) => {
                const st = STATUS_TEXT[plugin.status];
                const isBusy = busyAction === `plugin:${plugin.id}`;
                const canToggle = !plugin.locked;
                return (
                  <div
                    key={plugin.id}
                    className="px-5 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm text-slate-900">{plugin.name}</span>
                        <span className="font-mono text-xs text-slate-500">{plugin.id}</span>
                        <span className={`text-xs font-medium ${st.cls}`}>· {st.label}</span>
                      </div>
                      <p className="text-xs text-slate-600">{plugin.description}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
                        <span>бандл: {plugin.bundle}</span>
                        {plugin.inject.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>inject: {plugin.inject.join(', ')}</span>
                          </>
                        )}
                        {plugin.provides.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>provides: {plugin.provides.join(', ')}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">эффектов: {plugin.effectCount}</span>
                      </div>
                      {plugin.missingDeps.length > 0 && (
                        <div className="text-xs text-amber-700 font-mono">
                          Отсутствуют сервисы: {plugin.missingDeps.join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {canToggle ? (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() =>
                            void onTogglePlugin(plugin.id, plugin.status === 'disabled')
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                            plugin.status === 'disabled'
                              ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {isBusy
                            ? 'Обновление...'
                            : plugin.status === 'disabled'
                              ? 'Включить'
                              : 'Выгрузить'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                          Ядро (locked)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {section === 'tools' && snapshot && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Инструменты dsh-tools
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Вызываемые операции над задачами, wiki, mBlock, CI/CD и S3.
                </p>
              </div>
              <Wrench className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            {snapshot.tools.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                Нет активных инструментов. Включите плагин dsh-tools-cubesat.
              </div>
            ) : (
              snapshot.tools.map((tool) => {
                const isSelected = selectedTool?.name === tool.name;
                return (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => handleSelectTool(tool)}
                    className={`w-full text-left px-5 py-3.5 transition-colors ${
                      isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {tool.name}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {tool.seam} · {tool.mutating ? 'запись' : 'чтение'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{tool.description}</p>
                  </button>
                );
              })
            )}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            {selectedTool ? (
              <>
                <div className="border-b border-slate-200 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-mono text-base font-semibold text-slate-900">
                      {selectedTool.name}
                    </h3>
                    <span className="font-mono text-xs text-slate-500">
                      плагин: {selectedTool.pluginId}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{selectedTool.description}</p>
                </div>

                {Object.keys(selectedTool.parameters).length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-slate-700">Схема параметров</div>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                      {Object.entries(selectedTool.parameters).map(([param, meta]) => (
                        <div
                          key={param}
                          className="px-3 py-2 flex items-start justify-between gap-4 text-xs"
                        >
                          <div className="font-mono text-slate-900">
                            {param}
                            {meta.required ? ' *' : ''}
                          </div>
                          <div className="text-slate-600 text-right">
                            <span className="font-mono text-slate-500 mr-2">{meta.type}</span>
                            {meta.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={handleRunSelectedTool} className="space-y-3">
                  <div>
                    <label
                      htmlFor="dsh-tool-args"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Аргументы вызова (JSON)
                    </label>
                    <textarea
                      id="dsh-tool-args"
                      rows={5}
                      value={toolArgsDraft}
                      onChange={(e) => setToolArgsDraft(e.target.value)}
                      className="w-full font-mono text-xs p-3 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50"
                  >
                    {busyAction === `tool:${selectedTool.name}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Выполнить инструмент
                  </button>
                </form>

                {toolResult && (
                  <div className="border-t border-slate-200 pt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`font-medium ${
                          toolResult.ok ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {toolResult.ok ? 'Успешно выполнено' : `Ошибка: ${toolResult.error}`}
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {toolResult.durationMs} мс
                      </span>
                    </div>
                    <pre className="p-3 bg-slate-900 text-slate-100 rounded-md text-xs font-mono overflow-x-auto max-h-80">
                      {JSON.stringify(toolResult.output ?? { error: toolResult.error }, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-sm text-slate-500">
                Выберите инструмент слева для просмотра схемы и запуска.
              </div>
            )}
          </div>
        </div>
      )}

      {section === 'agent' && snapshot && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Запуск цикла DeepSeek-Harness
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Провайдер шва dsh-llm:{' '}
                  <span className="font-mono text-slate-700">
                    {snapshot.seams.find((s) => s.id === 'dsh-llm')?.activeProviderId || 'не активен'}
                  </span>
                </p>
              </div>
              <Terminal className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <form onSubmit={handleSubmitAgentGoal} className="space-y-3">
              <div>
                <label
                  htmlFor="dsh-agent-goal"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Инженерная цель
                </label>
                <textarea
                  id="dsh-agent-goal"
                  rows={4}
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="Например: Проведи аудит llm-wiki и проверь задачи OBC"
                  className="w-full text-sm p-3 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={!goalInput.trim() || busyAction !== null}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50"
              >
                {busyAction === 'agent:run' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Запустить агентский цикл
              </button>
            </form>

            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="text-xs font-medium text-slate-500">Готовые сценарии</div>
              <div className="space-y-1.5">
                {QUICK_GOALS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setGoalInput(preset)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-md transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Трассировка выполнения (Tool Loop)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Последовательность шагов рассуждения и реальных вызовов инструментов.
                </p>
              </div>
              {displayedRun && (
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {displayedRun.providerId} · {displayedRun.durationMs} мс
                </span>
              )}
            </div>

            {!displayedRun ? (
              <div className="px-5 py-12 text-center text-sm text-slate-500">
                Запустите цикл слева, чтобы увидеть трассировку вызовов dsh-tools.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                <div className="px-5 py-3 bg-slate-50 text-xs text-slate-700">
                  <span className="font-semibold">Цель:</span> {displayedRun.goal}
                </div>

                {displayedRun.steps.map((step) => (
                  <div key={step.id} className="px-5 py-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-900">
                        <span className="font-mono text-slate-400 mr-2 tabular-nums">
                          {String(step.step).padStart(2, '0')}.
                        </span>
                        {step.title}
                      </span>
                      <span className="font-mono text-slate-500">
                        {step.kind}
                        {step.durationMs !== undefined ? ` · ${step.durationMs} мс` : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{step.detail}</p>
                    {step.toolArgs && Object.keys(step.toolArgs).length > 0 && (
                      <pre className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-800 overflow-x-auto">
                        {JSON.stringify(step.toolArgs, null, 2)}
                      </pre>
                    )}
                    {step.toolOutput !== undefined && (
                      <pre className="p-2.5 bg-slate-900 text-slate-100 rounded text-xs font-mono overflow-x-auto max-h-56">
                        {JSON.stringify(step.toolOutput, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
