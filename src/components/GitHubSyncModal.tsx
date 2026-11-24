import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FlaskConical,
  GitBranch,
  GitCommit,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import type {
  CiRunConclusion,
  CiRunStatus,
  CiWorkflowRun,
  CommunityProject,
  GitHubRunStatusSnapshot,
  GitHubWorkflowDescriptor,
} from '../types/cubesat.ts';

interface GitChangedFile {
  status: string;
  path: string;
}

interface GitHubStatusPayload {
  gitAvailable: boolean;
  repo: string;
  branch: string;
  lastCommitSha: string;
  lastCommitMessage: string;
  lastCommitAt: string;
  changedFiles: GitChangedFile[];
  aheadCount: number;
  tokenConfigured: boolean;
}

interface GitHubSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  authFetch: (url: string, options?: RequestInit) => Promise<any>;
  activeProject?: Pick<CommunityProject, 'id' | 'name' | 'githubRepo'>;
}

function formatRunElapsed(createdAtIso?: string, nowMs = Date.now()): string {
  if (!createdAtIso) return '00:00';
  const start = new Date(createdAtIso).getTime();
  if (Number.isNaN(start)) return '00:00';
  const diffSec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const mm = String(Math.floor(diffSec / 60)).padStart(2, '0');
  const ss = String(diffSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function getStatusBadgeInfo(status?: CiRunStatus, conclusion?: CiRunConclusion) {
  if (!status) {
    return {
      label: 'Не запускались',
      cls: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }
  if (status === 'queued') {
    return {
      label: 'В очереди',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (status === 'in_progress') {
    return {
      label: 'Выполняются (live)',
      cls: 'bg-sky-50 text-sky-800 border-sky-200',
    };
  }
  if (conclusion === 'success') {
    return {
      label: 'Тесты пройдены',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (conclusion === 'cancelled') {
    return {
      label: 'Отменено',
      cls: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }
  return {
    label: conclusion === 'timed_out' ? 'Таймаут' : 'Ошибка тестов',
    cls: 'bg-rose-50 text-rose-800 border-rose-200',
  };
}

export const GitHubSyncModal: React.FC<GitHubSyncModalProps> = ({
  isOpen,
  onClose,
  isAuthenticated,
  onRequireAuth,
  authFetch,
  activeProject,
}) => {
  const [status, setStatus] = useState<GitHubStatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Pre-push GitHub Actions Unit Tests state
  const [workflows, setWorkflows] = useState<GitHubWorkflowDescriptor[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [dispatchingTests, setDispatchingTests] = useState(false);
  const [waitingQueueSince, setWaitingQueueSince] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<GitHubRunStatusSnapshot | null>(null);
  const [fallbackLatestRun, setFallbackLatestRun] = useState<CiWorkflowRun | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [requireTestsBeforePush, setRequireTestsBeforePush] = useState(false);
  const [nowTickMs, setNowTickMs] = useState(() => Date.now());
  const [showCondLogs, setShowCondLogs] = useState(false);

  const tokenRef = useRef(githubToken);
  tokenRef.current = githubToken;

  const targetRepo = useMemo(() => {
    return activeProject?.githubRepo?.trim() || status?.repo || '';
  }, [activeProject?.githubRepo, status?.repo]);

  const loadWorkflows = useCallback(
    async (repoOverride?: string) => {
      const repoToLoad = repoOverride || targetRepo;
      if (!repoToLoad && !activeProject?.id) return;
      setLoadingWorkflows(true);
      setWorkflowError(null);
      try {
        const params = new URLSearchParams();
        if (repoToLoad) params.set('repo', repoToLoad);
        if (activeProject?.id) params.set('projectId', activeProject.id);
        const headers: Record<string, string> = {};
        if (tokenRef.current.trim()) {
          headers['X-GitHub-Token'] = tokenRef.current.trim();
        }
        const res = await fetch(`/api/github/actions/workflows?${params.toString()}`, { headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось загрузить workflows GitHub Actions');
        }
        const list = Array.isArray(data.workflows)
          ? (data.workflows as GitHubWorkflowDescriptor[])
          : [];
        setWorkflows(list);
        setSelectedWorkflowId((prev) => {
          if (prev && list.some((w) => w.id === prev)) return prev;
          return list.find((w) => w.isUnitTestCandidate)?.id || list[0]?.id || '';
        });
      } catch (err) {
        setWorkflowError(err instanceof Error ? err.message : 'Ошибка загрузки workflows');
        setWorkflows([]);
      } finally {
        setLoadingWorkflows(false);
      }
    },
    [targetRepo, activeProject?.id]
  );

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/github/status');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось получить статус Git');
      }
      setStatus(data);
      setTargetBranch((prev) => prev || data.branch || 'main');
      const resolvedRepo = activeProject?.githubRepo?.trim() || data.repo;
      await loadWorkflows(resolvedRepo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка проверки Git');
    } finally {
      setLoading(false);
    }
  }, [activeProject?.githubRepo, loadWorkflows]);

  useEffect(() => {
    if (isOpen) {
      setSuccessMsg(null);
      setError(null);
      setTestError(null);
      setFallbackLatestRun(null);
      loadStatus();
    } else {
      setGithubToken('');
      setShowToken(false);
      setWaitingQueueSince(null);
      setActiveRunId(null);
      setLiveSnapshot(null);
      setFallbackLatestRun(null);
    }
  }, [isOpen, loadStatus]);

  // Poll to discover newly dispatched run ID while queued in GitHub Actions
  useEffect(() => {
    if (!isOpen || !waitingQueueSince || activeRunId || !selectedWorkflowId) return;
    let cancelled = false;
    let attempts = 0;

    const checkForNewRun = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const params = new URLSearchParams({
          branch: targetBranch || status?.branch || 'main',
          since: waitingQueueSince,
        });
        if (targetRepo) params.set('repo', targetRepo);
        const headers: Record<string, string> = {};
        if (tokenRef.current.trim()) {
          headers['X-GitHub-Token'] = tokenRef.current.trim();
        }
        const res = await fetch(
          `/api/github/actions/workflows/${encodeURIComponent(selectedWorkflowId)}/latest-run?${params.toString()}`,
          { headers }
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data.run?.id) {
          setActiveRunId(String(data.run.id));
          setWaitingQueueSince(null);
          return;
        }
      } catch {
        // retry on next interval
      }
      if (!cancelled && attempts >= 15) {
        setWaitingQueueSince(null);
        setTestError(
          'Запуск отправлен в GitHub Actions, но новый прогон не появился вовремя. Нажмите обновить или проверьте вкладку Actions.'
        );
      }
    };

    const timer = window.setInterval(checkForNewRun, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, waitingQueueSince, activeRunId, selectedWorkflowId, targetBranch, status?.branch, targetRepo]);

  // Real-time status polling for active GitHub Actions run (every 2.5s until completed)
  const fetchRunStatusNow = useCallback(
    async (runIdToCheck: string) => {
      const params = new URLSearchParams();
      if (targetRepo) params.set('repo', targetRepo);
      const headers: Record<string, string> = {};
      if (tokenRef.current.trim()) {
        headers['X-GitHub-Token'] = tokenRef.current.trim();
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(
        `/api/github/actions/runs/${encodeURIComponent(runIdToCheck)}/status${query}`,
        { headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось обновить статус тестов');
      }
      setLiveSnapshot(data as GitHubRunStatusSnapshot);
      return data as GitHubRunStatusSnapshot;
    },
    [targetRepo]
  );

  useEffect(() => {
    if (!isOpen || !activeRunId) return;
    let cancelled = false;
    let intervalId: number | null = null;

    const poll = async () => {
      try {
        const snap = await fetchRunStatusNow(activeRunId);
        if (!cancelled && snap.run.status === 'completed' && intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
          if (snap.run.conclusion === 'failure' || snap.run.conclusion === 'timed_out') {
            setShowCondLogs(true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setTestError(err instanceof Error ? err.message : 'Ошибка отслеживания запуска');
        }
      }
    };

    void poll();
    intervalId = window.setInterval(() => {
      void poll();
    }, 2500);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [isOpen, activeRunId, fetchRunStatusNow]);

  // Elapsed 1s live timer while tests are running
  const liveRun = liveSnapshot?.run || null;
  const isRunActive = Boolean(
    waitingQueueSince ||
      (liveRun && (liveRun.status === 'queued' || liveRun.status === 'in_progress'))
  );

  useEffect(() => {
    if (!isOpen || !isRunActive) return;
    const id = window.setInterval(() => setNowTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isOpen, isRunActive]);

  if (!isOpen) return null;

  const handleDispatchUnitTests = async () => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const trimmedToken = githubToken.trim();
    if (status && !status.tokenConfigured && !trimmedToken) {
      setTestError(
        'Введите ключ доступа GitHub (PAT с правами actions:write / repo) для принудительного запуска тестов.'
      );
      return;
    }

    setDispatchingTests(true);
    setTestError(null);
    setFallbackLatestRun(null);
    setLiveSnapshot(null);
    setActiveRunId(null);
    setShowCondLogs(false);

    try {
      const result = await authFetch('/api/github/actions/dispatch-tests', {
        method: 'POST',
        body: JSON.stringify({
          projectId: activeProject?.id,
          repo: targetRepo || undefined,
          branch: targetBranch.trim() || status?.branch || 'main',
          workflowId: selectedWorkflowId || undefined,
          ...(trimmedToken ? { token: trimmedToken } : {}),
        }),
      });

      if (result.workflowId) {
        setSelectedWorkflowId(String(result.workflowId));
      }
      if (result.run?.id) {
        setActiveRunId(String(result.run.id));
        setWaitingQueueSince(null);
      } else {
        setWaitingQueueSince(result.dispatchedAt || new Date().toISOString());
      }
    } catch (err) {
      const customErr = err as Error & {
        data?: { code?: string; latestRun?: CiWorkflowRun | null };
      };
      setTestError(err instanceof Error ? err.message : 'Не удалось запустить тесты в GitHub Actions');
      if (customErr?.data?.code === 'NO_WORKFLOW_DISPATCH' && customErr.data.latestRun) {
        setFallbackLatestRun(customErr.data.latestRun);
      }
    } finally {
      setDispatchingTests(false);
    }
  };

  const handleRerunFallbackRun = async (runToRerun: CiWorkflowRun) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setDispatchingTests(true);
    setTestError(null);
    setShowCondLogs(false);
    try {
      await authFetch(`/api/github/actions/runs/${encodeURIComponent(runToRerun.id)}/rerun`, {
        method: 'POST',
        body: JSON.stringify({
          repo: runToRerun.repo || targetRepo,
          ...(githubToken.trim() ? { token: githubToken.trim() } : {}),
        }),
      });
      setFallbackLatestRun(null);
      setActiveRunId(runToRerun.id);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Ошибка перезапуска последнего прогона');
    } finally {
      setDispatchingTests(false);
    }
  };

  const handleCommitAndPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const trimmedToken = githubToken.trim();
    if (status && !status.tokenConfigured && !trimmedToken) {
      setError('Введите ключ доступа GitHub (Personal Access Token) для отправки изменений');
      return;
    }
    if (requireTestsBeforePush && !(liveRun?.status === 'completed' && liveRun.conclusion === 'success')) {
      setError('Дождитесь успешного завершения модульных тестов в GitHub Actions перед пушем.');
      return;
    }

    setPushing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await authFetch('/api/github/commit-push', {
        method: 'POST',
        body: JSON.stringify({
          message: commitMessage.trim() || 'chore: update school76 workspace',
          ...(trimmedToken ? { token: trimmedToken } : {}),
        }),
      });
      setSuccessMsg(
        `Коммит ${result.commitSha} отправлен в ${status?.repo || 'spawnperm/school76'} (${result.branch})`
      );
      setCommitMessage('');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отправки в GitHub');
      await loadStatus();
    } finally {
      setPushing(false);
    }
  };

  const hasPendingWork = Boolean(
    status && (status.changedFiles.length > 0 || status.aheadCount > 0)
  );
  const testsPassed = Boolean(liveRun?.status === 'completed' && liveRun.conclusion === 'success');
  const pushBlockedByTestGate = requireTestsBeforePush && !testsPassed;

  const badge = waitingQueueSince
    ? { label: 'Ожидание запуска (live)', cls: 'bg-sky-50 text-sky-800 border-sky-200' }
    : getStatusBadgeInfo(liveRun?.status, liveRun?.conclusion);

  const safeRunUrl =
    liveRun?.htmlUrl && /^https:\/\/github\.com\//i.test(liveRun.htmlUrl) ? liveRun.htmlUrl : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-sky-600" />
            <h3 className="text-base font-bold text-slate-900">
              Фиксация изменений на GitHub
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadStatus}
              disabled={loading}
              className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-md"
              title="Обновить статус Git и Actions"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleCommitAndPush} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="px-3 py-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {status && (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-2 text-xs">
              {activeProject && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Текущий проект</span>
                  <span className="font-semibold text-slate-900 truncate">
                    {activeProject.name}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Репозиторий и ветка</span>
                <span className="font-mono font-semibold text-slate-900">
                  {status.repo} · {status.branch}
                </span>
              </div>

              {status.lastCommitSha && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Последний коммит</span>
                  <span className="font-mono text-slate-700 text-right truncate">
                    {status.lastCommitSha} · {status.lastCommitMessage}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Неотправленных коммитов</span>
                <span className="font-mono tabular-nums text-slate-800">
                  {status.aheadCount}
                </span>
              </div>
            </div>
          )}

          {/* Pre-push GitHub Actions Unit Test Runner */}
          <div className="border border-slate-200 rounded-md bg-slate-50/70 overflow-hidden">
            <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-sky-600" />
                <span className="text-xs font-semibold text-slate-900">
                  Модульные тесты через GitHub Actions
                </span>
                {targetRepo && (
                  <span className="text-[11px] font-mono text-slate-500">
                    ({targetRepo})
                  </span>
                )}
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium border rounded ${badge.cls}`}
              >
                {isRunActive && <Loader2 className="w-3 h-3 animate-spin" />}
                {liveRun?.status === 'completed' && liveRun.conclusion === 'success' && (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                {liveRun?.status === 'completed' &&
                  liveRun.conclusion !== 'success' &&
                  liveRun.conclusion !== 'cancelled' && <XCircle className="w-3 h-3" />}
                {badge.label}
              </span>
            </div>

            <div className="p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Workflow для тестов
                  </label>
                  <select
                    value={selectedWorkflowId}
                    onChange={(e) => setSelectedWorkflowId(e.target.value)}
                    disabled={loadingWorkflows || workflows.length === 0 || dispatchingTests}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                  >
                    {workflows.length === 0 ? (
                      <option value="">
                        {loadingWorkflows ? 'Загрузка workflows...' : 'Нет активных workflows'}
                      </option>
                    ) : (
                      workflows.map((wf) => (
                        <option key={wf.id} value={wf.id}>
                          {wf.name} ({wf.path.replace('.github/workflows/', '')})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Ветка
                  </label>
                  <input
                    type="text"
                    value={targetBranch}
                    onChange={(e) => setTargetBranch(e.target.value)}
                    placeholder={status?.branch || 'main'}
                    disabled={dispatchingTests}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="sm:col-span-4 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleDispatchUnitTests}
                    disabled={dispatchingTests || loadingWorkflows || workflows.length === 0}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50 transition-colors"
                  >
                    {dispatchingTests ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    {dispatchingTests ? 'Запуск...' : 'Запустить тесты'}
                  </button>

                  <button
                    type="button"
                    onClick={() => loadWorkflows()}
                    disabled={loadingWorkflows}
                    title="Обновить список workflows"
                    className="p-1.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-md"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingWorkflows ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {workflowError && (
                <div className="px-2.5 py-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded">
                  {workflowError}
                </div>
              )}

              {testError && (
                <div className="px-2.5 py-2 text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded space-y-2">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
                    <span>{testError}</span>
                  </div>
                  {fallbackLatestRun && (
                    <button
                      type="button"
                      onClick={() => void handleRerunFallbackRun(fallbackLatestRun)}
                      disabled={dispatchingTests}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-rose-900 bg-white border border-rose-300 rounded hover:bg-rose-100 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Перезапустить последний прогон #{fallbackLatestRun.runNumber}
                    </button>
                  )}
                </div>
              )}

              {!loadingWorkflows && workflows.length === 0 && !workflowError && (
                <div className="px-2.5 py-2 text-[11px] text-slate-600 bg-white border border-slate-200 rounded">
                  В <span className="font-mono">{targetRepo || 'репозитории'}</span> не найден активный файл{' '}
                  <span className="font-mono">.github/workflows/*.yml</span> с триггером{' '}
                  <span className="font-mono">workflow_dispatch</span>.
                </div>
              )}

              {waitingQueueSince && !liveRun && (
                <div className="px-3 py-2.5 bg-white border border-sky-200 rounded-md flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-sky-800">
                    <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
                    <span>Запрос отправлен в GitHub Actions — ожидание создания прогона в реальном времени...</span>
                  </div>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                    {formatRunElapsed(waitingQueueSince, nowTickMs)}
                  </span>
                </div>
              )}

              {liveRun && (
                <div className="bg-white border border-slate-200 rounded-md p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-slate-900">
                        #{liveRun.runNumber || liveRun.id}
                      </span>
                      <span className="font-medium text-slate-800 truncate">
                        {liveRun.workflowName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {liveRun.branch}
                        {liveRun.commitSha ? ` · ${liveRun.commitSha}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[11px] text-slate-500">
                        <Clock className="w-3 h-3" />
                        {liveRun.durationSec !== undefined && liveRun.status === 'completed'
                          ? `${liveRun.durationSec} с`
                          : formatRunElapsed(liveRun.createdAt, nowTickMs)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void fetchRunStatusNow(liveRun.id)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded"
                        title="Обновить статус сейчас"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      {safeRunUrl && (
                        <a
                          href={safeRunUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline"
                        >
                          GitHub
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Live Jobs & Steps */}
                  {liveSnapshot && liveSnapshot.jobs.length > 0 && (
                    <div className="space-y-2 border-t border-slate-100 pt-2">
                      {liveSnapshot.jobs.map((job) => (
                        <div key={job.id} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-slate-700">{job.name}</span>
                            <span className="font-mono tabular-nums text-slate-400">
                              {job.durationSec !== undefined ? `${job.durationSec} с` : job.status}
                            </span>
                          </div>
                          {job.steps.length > 0 && (
                            <div className="grid grid-cols-1 gap-1 pl-2 border-l-2 border-slate-200">
                              {job.steps.map((step) => (
                                <div
                                  key={`${job.id}-${step.number}`}
                                  className="flex items-center justify-between gap-2 text-[11px]"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {step.status === 'completed' ? (
                                      step.conclusion === 'success' ? (
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                      ) : step.conclusion === 'skipped' ? (
                                        <span className="w-3 h-3 inline-block text-center text-slate-400 shrink-0">
                                          –
                                        </span>
                                      ) : (
                                        <XCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                      )
                                    ) : step.status === 'in_progress' ? (
                                      <Loader2 className="w-3 h-3 animate-spin text-sky-600 shrink-0" />
                                    ) : (
                                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                    )}
                                    <span
                                      className={`truncate ${
                                        step.conclusion === 'failure'
                                          ? 'font-medium text-rose-800'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      {step.name}
                                    </span>
                                  </div>
                                  {step.durationSec !== undefined && (
                                    <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
                                      {step.durationSec} с
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {job.logLines.length > 0 && (
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => setShowCondLogs((prev) => !prev)}
                                className="text-[11px] font-medium text-sky-700 hover:underline"
                              >
                                {showCondLogs ? 'Скрыть вывод лога' : `Показать лог (${job.logLines.length} строк)`}
                              </button>
                              {showCondLogs && (
                                <pre className="mt-1 max-h-36 overflow-auto p-2 bg-slate-950 text-slate-100 rounded text-[10px] font-mono leading-relaxed">
                                  {job.logLines.join('\n')}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {liveSnapshot?.condensedSummary && (
                    <div className="text-[11px] text-slate-600 border-t border-slate-100 pt-1.5 flex items-center justify-between gap-2">
                      <span>{liveSnapshot.condensedSummary}</span>
                    </div>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={requireTestsBeforePush}
                  onChange={(e) => setRequireTestsBeforePush(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>Блокировать отправку в GitHub до успешного прохождения тестов</span>
              </label>
            </div>
          </div>

          {status && !status.tokenConfigured && (
            <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md">
              Переменная <span className="font-mono font-semibold">GITHUB_TOKEN</span> на сервере не задана — укажите ключ доступа ниже, чтобы запускать Actions и выполнять <span className="font-mono">git push</span>.
            </div>
          )}

          {/* Changed files list */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                Изменённые файлы ({status?.changedFiles.length ?? 0})
              </span>
              {!loading && status && !hasPendingWork && (
                <span className="text-emerald-700">Рабочее дерево чистое</span>
              )}
            </div>

            {status && status.changedFiles.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100 bg-white">
                {status.changedFiles.map((file) => (
                  <div
                    key={file.path}
                    className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs font-mono"
                  >
                    <span className="truncate text-slate-700">{file.path}</span>
                    <span className="text-sky-700 shrink-0">{file.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Сообщение коммита
            </label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="feat: обновление документации и модулей school76"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor="github-pat-input"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                <span>Ключ доступа GitHub (PAT)</span>
              </label>
              {status?.tokenConfigured && (
                <span className="text-[11px] text-emerald-700">
                  Настроен на сервере (можно переопределить)
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="github-pat-input"
                type={showToken ? 'text' : 'password'}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder={
                  status?.tokenConfigured
                    ? 'Оставьте пустым для использования ключа сервера'
                    : 'ghp_... или github_pat_...'
                }
                autoComplete="off"
                spellCheck={false}
                className="w-full pl-3 pr-9 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="button"
                onClick={() => setShowToken((prev) => !prev)}
                className="absolute inset-y-0 right-0 px-2.5 flex items-center text-slate-400 hover:text-slate-700"
                aria-label={showToken ? 'Скрыть ключ' : 'Показать ключ'}
                title={showToken ? 'Скрыть ключ' : 'Показать ключ'}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Используется только для текущей сессии и не сохраняется на диске или в истории браузера.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <span className="text-[11px] text-slate-400">
              {pushBlockedByTestGate
                ? 'Зафиксируйте изменения после зелёного статуса тестов'
                : isAuthenticated
                  ? 'Выполняется от имени вашего профиля'
                  : 'Требуется вход в кабинет'}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Закрыть
              </button>
              <button
                type="submit"
                disabled={
                  pushing ||
                  loading ||
                  pushBlockedByTestGate ||
                  (status ? !hasPendingWork : false)
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {pushing ? (
                  <GitCommit className="w-3.5 h-3.5 animate-pulse" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5" />
                )}
                {pushing ? 'Отправка...' : 'Зафиксировать в GitHub'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
