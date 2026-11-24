import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  KeyRound,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Terminal,
  XCircle,
} from 'lucide-react';
import type { CiWorkflowRun, CommunityProject } from '../types/cubesat.ts';

interface CiActionsPanelProps {
  projects: CommunityProject[];
  activeProject: CommunityProject;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  authFetch: (url: string, options?: RequestInit) => Promise<any>;
}

function formatRunDate(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(sec?: number): string {
  if (sec === undefined || sec === null || Number.isNaN(sec)) return '';
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} м ${s} с`;
}

function getRunVisual(run: CiWorkflowRun): {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
} {
  if (run.status === 'in_progress') {
    return {
      label: 'Выполняется',
      badgeClass: 'text-amber-800 bg-amber-50 border-amber-200',
      icon: <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" />,
    };
  }
  if (run.status === 'queued') {
    return {
      label: 'В очереди',
      badgeClass: 'text-slate-700 bg-slate-100 border-slate-200',
      icon: <Clock className="w-4 h-4 text-slate-500 shrink-0" />,
    };
  }
  switch (run.conclusion) {
    case 'success':
      return {
        label: 'Успешно',
        badgeClass: 'text-emerald-800 bg-emerald-50 border-emerald-200',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
      };
    case 'failure':
      return {
        label: 'Ошибка сборки',
        badgeClass: 'text-rose-800 bg-rose-50 border-rose-200',
        icon: <XCircle className="w-4 h-4 text-rose-600 shrink-0" />,
      };
    case 'timed_out':
      return {
        label: 'Таймаут',
        badgeClass: 'text-rose-800 bg-rose-50 border-rose-200',
        icon: <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />,
      };
    case 'cancelled':
      return {
        label: 'Отменено',
        badgeClass: 'text-slate-700 bg-slate-100 border-slate-200',
        icon: <Ban className="w-4 h-4 text-slate-500 shrink-0" />,
      };
    default:
      return {
        label: 'Завершено',
        badgeClass: 'text-slate-700 bg-slate-100 border-slate-200',
        icon: <CheckCircle2 className="w-4 h-4 text-slate-500 shrink-0" />,
      };
  }
}

export const CiActionsPanel: React.FC<CiActionsPanelProps> = ({
  projects,
  activeProject,
  isAuthenticated,
  onRequireAuth,
  authFetch,
}) => {
  const [providerTab, setProviderTab] = useState<'github' | 'forgejo'>('github');

  // GitHub Actions state
  const [githubTarget, setGithubTarget] = useState<string>('current');
  const [currentGitRepo, setCurrentGitRepo] = useState<string>('spawnperm/school76');
  const [githubRuns, setGithubRuns] = useState<CiWorkflowRun[]>([]);
  const [githubTotalCount, setGithubTotalCount] = useState(0);
  const [githubTokenConfigured, setGithubTokenConfigured] = useState(false);
  const [githubPat, setGithubPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [loadingGithub, setLoadingGithub] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubNotice, setGithubNotice] = useState<string | null>(null);
  const [rerunningGithubId, setRerunningGithubId] = useState<string | null>(null);

  // Team GitHub binding editor
  const [editingTeamRepo, setEditingTeamRepo] = useState(false);
  const [teamRepoDraft, setTeamRepoDraft] = useState('');
  const [savingTeamRepo, setSavingTeamRepo] = useState(false);

  // Forgejo Actions state
  const [forgejoScope, setForgejoScope] = useState<'active' | 'all'>('active');
  const [forgejoRuns, setForgejoRuns] = useState<CiWorkflowRun[]>([]);
  const [forgejoExternal, setForgejoExternal] = useState(false);
  const [loadingForgejo, setLoadingForgejo] = useState(false);
  const [forgejoError, setForgejoError] = useState<string | null>(null);
  const [forgejoNotice, setForgejoNotice] = useState<string | null>(null);
  const [rerunningForgejoId, setRerunningForgejoId] = useState<string | null>(null);
  const [dispatchingForgejo, setDispatchingForgejo] = useState(false);
  const [expandedRunIds, setExpandedRunIds] = useState<Record<string, boolean>>({});

  const projectsWithGitHub = useMemo(
    () => projects.filter((p) => Boolean(p.githubRepo)),
    [projects]
  );

  const selectedGithubRepo = useMemo(() => {
    if (githubTarget === 'current') return '';
    const found = projects.find((p) => p.id === githubTarget);
    return found?.githubRepo || '';
  }, [githubTarget, projects]);

  const loadGitHubRuns = useCallback(async () => {
    setLoadingGithub(true);
    setGithubError(null);
    try {
      const params = new URLSearchParams();
      if (selectedGithubRepo) {
        params.set('repo', selectedGithubRepo);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      const headers: Record<string, string> = {};
      if (githubPat.trim()) {
        headers['X-GitHub-Token'] = githubPat.trim();
      }
      const res = await fetch(`/api/github/actions/runs${query}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось загрузить запуски GitHub Actions');
      }
      if (!selectedGithubRepo && data.repo) {
        setCurrentGitRepo(data.repo);
      }
      setGithubRuns(Array.isArray(data.runs) ? data.runs : []);
      setGithubTotalCount(typeof data.totalCount === 'number' ? data.totalCount : 0);
      setGithubTokenConfigured(Boolean(data.tokenConfigured));
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Ошибка GitHub Actions');
      setGithubRuns([]);
    } finally {
      setLoadingGithub(false);
    }
  }, [selectedGithubRepo, githubPat]);

  const loadForgejoRuns = useCallback(async () => {
    setLoadingForgejo(true);
    setForgejoError(null);
    try {
      const query =
        forgejoScope === 'active'
          ? `?projectId=${encodeURIComponent(activeProject.id)}`
          : '';
      const res = await fetch(`/api/forgejo/actions/runs${query}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось загрузить запуски Forgejo Actions');
      }
      setForgejoExternal(Boolean(data.externalConfigured));
      setForgejoRuns(Array.isArray(data.runs) ? data.runs : []);
    } catch (err) {
      setForgejoError(err instanceof Error ? err.message : 'Ошибка Forgejo Actions');
    } finally {
      setLoadingForgejo(false);
    }
  }, [forgejoScope, activeProject.id]);

  useEffect(() => {
    loadGitHubRuns();
  }, [loadGitHubRuns]);

  useEffect(() => {
    loadForgejoRuns();
  }, [loadForgejoRuns]);

  useEffect(() => {
    setTeamRepoDraft(activeProject.githubRepo || '');
  }, [activeProject.id, activeProject.githubRepo]);

  const handleRerunGitHub = async (run: CiWorkflowRun) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setRerunningGithubId(run.id);
    setGithubError(null);
    setGithubNotice(null);
    try {
      const result = await authFetch(`/api/github/actions/runs/${encodeURIComponent(run.id)}/rerun`, {
        method: 'POST',
        body: JSON.stringify({
          repo: run.repo,
          ...(githubPat.trim() ? { token: githubPat.trim() } : {}),
        }),
      });
      setGithubNotice(
        `Запущен перезапуск сборки #${run.runNumber} (${run.workflowName}) в ${result.repo}.`
      );
      await loadGitHubRuns();
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Не удалось перезапустить сборку');
    } finally {
      setRerunningGithubId(null);
    }
  };

  const handleSaveTeamGithubRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setSavingTeamRepo(true);
    setGithubError(null);
    try {
      const res = await authFetch(`/api/projects/${encodeURIComponent(activeProject.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ githubRepo: teamRepoDraft.trim() }),
      });
      setEditingTeamRepo(false);
      if (res.project?.githubRepo) {
        setGithubTarget(activeProject.id);
        setGithubNotice(
          `К команде «${activeProject.name}» привязан репозиторий ${res.project.githubRepo}.`
        );
      } else {
        setGithubTarget('current');
        setGithubNotice(`Привязка GitHub-репозитория для «${activeProject.name}» снята.`);
      }
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Не удалось сохранить репозиторий');
    } finally {
      setSavingTeamRepo(false);
    }
  };

  const handleRerunForgejo = async (run: CiWorkflowRun) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const repoSlug = run.repo.includes('/') ? run.repo.split('/').pop()! : run.repo;
    setRerunningForgejoId(run.id);
    setForgejoError(null);
    setForgejoNotice(null);
    try {
      const result = await authFetch(
        `/api/v1/repos/school76/${encodeURIComponent(repoSlug)}/actions/runs/${encodeURIComponent(run.id)}/rerun`,
        { method: 'POST' }
      );
      const updated = result.run as CiWorkflowRun;
      setForgejoNotice(
        `Сборка #${updated.runNumber} (${updated.workflowName}) перезапущена — результат: ${
          updated.conclusion === 'success' ? 'успешно' : 'ошибка'
        }.`
      );
      setExpandedRunIds((prev) => ({ ...prev, [updated.id]: true }));
      await loadForgejoRuns();
    } catch (err) {
      setForgejoError(err instanceof Error ? err.message : 'Ошибка перезапуска Forgejo Actions');
    } finally {
      setRerunningForgejoId(null);
    }
  };

  const handleDispatchForgejo = async () => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setDispatchingForgejo(true);
    setForgejoError(null);
    setForgejoNotice(null);
    try {
      const result = await authFetch(
        `/api/v1/repos/school76/${encodeURIComponent(activeProject.forgejoRepo)}/actions/dispatch`,
        {
          method: 'POST',
          body: JSON.stringify({ workflowName: 'llm-wiki-ci.yml' }),
        }
      );
      const created = result.run as CiWorkflowRun;
      setForgejoNotice(
        `Выполнена проверка CI #${created.runNumber} для «${activeProject.name}» (${
          created.conclusion === 'success' ? 'успешно' : 'обнаружены замечания'
        }).`
      );
      setExpandedRunIds((prev) => ({ ...prev, [created.id]: true }));
      await loadForgejoRuns();
    } catch (err) {
      setForgejoError(err instanceof Error ? err.message : 'Не удалось запустить сборку Forgejo');
    } finally {
      setDispatchingForgejo(false);
    }
  };

  const failedGithubCount = githubRuns.filter((r) => r.canRerun).length;
  const failedForgejoCount = forgejoRuns.filter((r) => r.canRerun).length;

  return (
    <section
      aria-label="Сборка и CI/CD запуски GitHub Actions и Forgejo"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      {/* Top Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-sky-600 shrink-0" />
            <h2 className="text-sm font-bold text-slate-900">
              Сборка и CI/CD (Actions)
            </h2>
          </div>

          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setProviderTab('github')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-colors ${
                providerTab === 'github'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>GitHub Actions</span>
              {failedGithubCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-rose-500 text-white">
                  {failedGithubCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setProviderTab('forgejo')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-colors ${
                providerTab === 'forgejo'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Forgejo · Проекты команд</span>
              {failedForgejoCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-rose-500 text-white">
                  {failedForgejoCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {providerTab === 'forgejo' && (
            <button
              type="button"
              onClick={handleDispatchForgejo}
              disabled={dispatchingForgejo}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${dispatchingForgejo ? 'animate-pulse' : ''}`} />
              {dispatchingForgejo ? 'Запуск...' : 'Запустить проверку'}
            </button>
          )}
          <button
            type="button"
            onClick={providerTab === 'github' ? loadGitHubRuns : loadForgejoRuns}
            disabled={providerTab === 'github' ? loadingGithub : loadingForgejo}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                (providerTab === 'github' ? loadingGithub : loadingForgejo)
                  ? 'animate-spin'
                  : ''
              }`}
            />
            Обновить
          </button>
        </div>
      </div>

      {/* GITHUB ACTIONS TAB */}
      {providerTab === 'github' && (
        <div className="p-5 space-y-4">
          {/* Controls bar: repo selector + optional PAT + team repo binding */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-md p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium inline-flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                Репозиторий:
              </span>
              <select
                value={githubTarget}
                onChange={(e) => setGithubTarget(e.target.value)}
                className="px-2.5 py-1 text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="current">Текущий ({currentGitRepo})</option>
                {projectsWithGitHub.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    Команда «{proj.name}» ({proj.githubRepo})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setEditingTeamRepo((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-100"
                title={`Привязать GitHub-репозиторий к проекту «${activeProject.name}»`}
              >
                <Link2 className="w-3 h-3" />
                {activeProject.githubRepo
                  ? `GitHub команды: ${activeProject.githubRepo}`
                  : `Привязать к «${activeProject.name}»`}
              </button>
            </div>

            {/* Optional GitHub PAT for private repos & reruns */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPat ? 'text' : 'password'}
                  value={githubPat}
                  onChange={(e) => setGithubPat(e.target.value)}
                  placeholder={
                    githubTokenConfigured
                      ? 'Ключ сервера активен (опц.)'
                      : 'Ключ GitHub PAT для перезапуска'
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="w-56 pl-7 pr-7 py-1 text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPat((prev) => !prev)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showPat ? 'Скрыть ключ' : 'Показать ключ'}
                >
                  {showPat ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {editingTeamRepo && (
            <form
              onSubmit={handleSaveTeamGithubRepo}
              className="flex flex-wrap items-center gap-2 bg-sky-50/60 border border-sky-200 rounded-md p-3 text-xs"
            >
              <span className="font-medium text-slate-700">
                GitHub-репозиторий для команды «{activeProject.name}»:
              </span>
              <input
                type="text"
                value={teamRepoDraft}
                onChange={(e) => setTeamRepoDraft(e.target.value)}
                placeholder="owner/repo (например, spawnperm/school76)"
                className="flex-1 min-w-[220px] px-2.5 py-1 text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="submit"
                disabled={savingTeamRepo}
                className="px-3 py-1 text-xs font-semibold text-white bg-sky-600 rounded hover:bg-sky-700 disabled:opacity-50"
              >
                {savingTeamRepo ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => setEditingTeamRepo(false)}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
              >
                Отмена
              </button>
            </form>
          )}

          {githubError && (
            <div className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
              {githubError}
            </div>
          )}

          {githubNotice && (
            <div className="px-3 py-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{githubNotice}</span>
            </div>
          )}

          {loadingGithub && githubRuns.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Загрузка последних запусков GitHub Actions...
            </div>
          ) : githubRuns.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-md p-6 text-center space-y-1.5 bg-slate-50/50">
              <div className="text-xs font-semibold text-slate-800">
                Запусков GitHub Actions для репозитория{' '}
                <span className="font-mono">{selectedGithubRepo || currentGitRepo}</span> пока нет
                {githubTotalCount === 0 ? ' (0 сборок)' : ''}.
              </div>
              <p className="text-xs text-slate-500 max-w-xl mx-auto">
                Добавьте workflow-файл в <span className="font-mono">.github/workflows/</span> и отправьте изменения в GitHub — здесь появятся последние запуски с кнопкой перезапуска неудачных сборок.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-md overflow-hidden">
              {githubRuns.map((run) => {
                const visual = getRunVisual(run);
                const isRerunning = rerunningGithubId === run.id;
                return (
                  <div
                    key={run.id}
                    className="p-3.5 bg-white hover:bg-slate-50/60 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="mt-0.5">{visual.icon}</div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {run.title}
                          </span>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium border rounded ${visual.badgeClass}`}
                          >
                            {visual.label}
                          </span>
                          {run.runAttempt > 1 && (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              попытка #{run.runAttempt}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 font-mono">
                          <span className="text-slate-700 font-medium">
                            {run.workflowName} #{run.runNumber}
                          </span>
                          <span>·</span>
                          <span>{run.branch}</span>
                          {run.commitSha && (
                            <>
                              <span>·</span>
                              <span>{run.commitSha}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="font-sans">{run.actor}</span>
                          <span>·</span>
                          <span>{formatRunDate(run.createdAt)}</span>
                          {run.durationSec !== undefined && (
                            <>
                              <span>·</span>
                              <span>{formatDuration(run.durationSec)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {run.htmlUrl && (
                        <a
                          href={run.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50"
                        >
                          <ExternalLink className="w-3 h-3" />
                          GitHub
                        </a>
                      )}
                      {run.canRerun && (
                        <button
                          type="button"
                          onClick={() => handleRerunGitHub(run)}
                          disabled={isRerunning}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-rose-600 rounded hover:bg-rose-700 disabled:opacity-50"
                        >
                          <RotateCcw
                            className={`w-3.5 h-3.5 ${isRerunning ? 'animate-spin' : ''}`}
                          />
                          {isRerunning ? 'Перезапуск...' : 'Перезапустить'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FORGEJO ACTIONS (TEAM PROJECTS) TAB */}
      {providerTab === 'forgejo' && (
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-md p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 font-medium">Проекты команд:</span>
              <div className="inline-flex rounded border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setForgejoScope('active')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    forgejoScope === 'active'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {activeProject.name} (school76/{activeProject.forgejoRepo})
                </button>
                <button
                  type="button"
                  onClick={() => setForgejoScope('all')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    forgejoScope === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Все проекты команд ({projects.length})
                </button>
              </div>
            </div>

            <span className="font-mono text-[11px] text-slate-500">
              {forgejoExternal ? 'Внешний Forgejo Runner' : 'Встроенный Forgejo Actions'}
            </span>
          </div>

          {forgejoError && (
            <div className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
              {forgejoError}
            </div>
          )}

          {forgejoNotice && (
            <div className="px-3 py-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{forgejoNotice}</span>
            </div>
          )}

          {loadingForgejo && forgejoRuns.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Загрузка сборок Forgejo Actions...
            </div>
          ) : forgejoRuns.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-md p-6 text-center text-xs text-slate-500 bg-slate-50/50">
              Запусков Forgejo Actions для выбранного проекта пока нет. Нажмите «Запустить проверку», чтобы выполнить сборку.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-md overflow-hidden">
              {forgejoRuns.map((run) => {
                const visual = getRunVisual(run);
                const isRerunning = rerunningForgejoId === run.id;
                const isExpanded = Boolean(expandedRunIds[run.id]);
                return (
                  <div key={run.id} className="bg-white">
                    <div className="p-3.5 hover:bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="mt-0.5">{visual.icon}</div>
                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {run.projectName && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded">
                                {run.projectName}
                              </span>
                            )}
                            <span className="text-xs font-semibold text-slate-900">
                              {run.title}
                            </span>
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium border rounded ${visual.badgeClass}`}
                            >
                              {visual.label}
                            </span>
                            {run.runAttempt > 1 && (
                              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                попытка #{run.runAttempt}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 font-mono">
                            <span className="text-slate-700 font-medium">{run.repo}</span>
                            <span>·</span>
                            <span>
                              {run.workflowName} #{run.runNumber}
                            </span>
                            <span>·</span>
                            <span>{run.branch}</span>
                            {run.commitSha && (
                              <>
                                <span>·</span>
                                <span>{run.commitSha}</span>
                              </>
                            )}
                            <span>·</span>
                            <span className="font-sans">{run.actor}</span>
                            <span>·</span>
                            <span>{formatRunDate(run.updatedAt || run.createdAt)}</span>
                            {run.durationSec !== undefined && (
                              <>
                                <span>·</span>
                                <span>{formatDuration(run.durationSec)}</span>
                              </>
                            )}
                          </div>

                          {run.errorSummary && run.conclusion === 'failure' && (
                            <div className="text-[11px] text-rose-700 bg-rose-50/70 border border-rose-200/80 rounded px-2.5 py-1 mt-1">
                              {run.errorSummary}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {run.steps && run.steps.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRunIds((prev) => ({
                                ...prev,
                                [run.id]: !prev[run.id],
                              }))
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            Шаги ({run.steps.length})
                          </button>
                        )}
                        {run.canRerun && (
                          <button
                            type="button"
                            onClick={() => handleRerunForgejo(run)}
                            disabled={isRerunning}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-rose-600 rounded hover:bg-rose-700 disabled:opacity-50"
                          >
                            <RotateCcw
                              className={`w-3.5 h-3.5 ${isRerunning ? 'animate-spin' : ''}`}
                            />
                            {isRerunning ? 'Перезапуск...' : 'Перезапустить'}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && run.steps && run.steps.length > 0 && (
                      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 space-y-1.5">
                        {run.steps.map((step, idx) => (
                          <div
                            key={`${run.id}-step-${idx}`}
                            className="flex items-start justify-between gap-3 text-xs bg-white border border-slate-200 rounded px-3 py-2"
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              {step.conclusion === 'success' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="font-medium text-slate-800">{step.name}</div>
                                {step.logLine && (
                                  <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                                    {step.logLine}
                                  </div>
                                )}
                              </div>
                            </div>
                            {step.durationSec !== undefined && (
                              <span className="font-mono text-[11px] text-slate-400 shrink-0">
                                {formatDuration(step.durationSec)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
