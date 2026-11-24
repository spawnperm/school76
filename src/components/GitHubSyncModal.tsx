import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  GitBranch,
  GitCommit,
  RefreshCw,
  UploadCloud,
  X,
} from 'lucide-react';

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
}

export const GitHubSyncModal: React.FC<GitHubSyncModalProps> = ({
  isOpen,
  onClose,
  isAuthenticated,
  onRequireAuth,
  authFetch,
}) => {
  const [status, setStatus] = useState<GitHubStatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка проверки Git');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSuccessMsg(null);
      setError(null);
      loadStatus();
    }
  }, [isOpen, loadStatus]);

  if (!isOpen) return null;

  const handleCommitAndPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
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
              title="Обновить статус Git"
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

        <form onSubmit={handleCommitAndPush} className="p-6 space-y-4">
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

          {status && !status.tokenConfigured && (
            <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md">
              Для автоматического <span className="font-mono">git push</span> на GitHub укажите <span className="font-mono font-semibold">GITHUB_TOKEN</span> в настройках Secrets сервера.
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
              <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100 bg-white">
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

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-[11px] text-slate-400">
              {isAuthenticated
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
                disabled={pushing || loading || (status ? !hasPendingWork : false)}
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
