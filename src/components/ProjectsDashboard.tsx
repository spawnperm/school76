import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Download,
  FileText,
  GitBranch,
  GitCommit,
  ListChecks,
  PieChart as PieChartIcon,
  RefreshCw,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type {
  CommunityProject,
  CubeSatTask,
  ForgejoCommit,
  OnboardProgram,
  Subsystem,
} from '../types/cubesat.ts';

interface GitRecentCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface GitHubStatusSummary {
  gitAvailable: boolean;
  repo: string;
  branch: string;
  lastCommitSha: string;
  lastCommitMessage: string;
  lastCommitAt: string;
  commitCount?: number;
  recentCommits?: GitRecentCommit[];
  changedFiles: { status: string; path: string }[];
  aheadCount: number;
  tokenConfigured: boolean;
}

interface ProjectsDashboardProps {
  project: CommunityProject;
  tasks: CubeSatTask[];
  programs: OnboardProgram[];
  membersCount: number;
  onOpenSubsystemTasks: (subsystem: Subsystem) => void;
  onNavigateTab: (tab: 'tasks' | 'wiki' | 'mblock' | 'chat') => void;
  onOpenGitHubSync: () => void;
  onOpenTask?: (taskId: string) => void;
  onOpenWikiDoc?: (docPath: string) => void;
  onGenerateDescription?: () => Promise<void>;
  generatingDescription?: boolean;
  descriptionError?: string | null;
  onGenerateReadme?: () => Promise<{
    readme: string;
    filename: string;
    repo: string;
    generatedAt: string;
  } | null>;
  onUploadReadme?: (
    content: string,
    commitMessage?: string
  ) => Promise<{
    ok: boolean;
    path: string;
    repo: string;
    commit: ForgejoCommit;
  }>;
}

interface DeadlineAlert {
  task: CubeSatTask;
  deadlineTs: number;
  diffMs: number;
  severity: 'overdue' | 'due_24h' | 'upcoming';
  timeLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SUBSYSTEM_ORDER: Subsystem[] = ['OBC', 'EPS', 'COMMS', 'PAYLOAD', 'ADCS', 'GROUND'];

const SUBSYSTEM_RU_NAMES: Record<Subsystem, string> = {
  OBC: 'ОБС',
  EPS: 'ЭПС',
  COMMS: 'Командная радиолиния',
  PAYLOAD: 'Полезная нагрузка',
  ADCS: 'ADCS · Ориентация',
  GROUND: 'Наземный сегмент',
};

const SUBSYSTEM_ACCENT: Record<
  Subsystem,
  { bar: string; badge: string; borderHover: string; hex: string }
> = {
  OBC: {
    bar: 'bg-sky-600',
    badge: 'text-sky-700 bg-sky-50 border-sky-200',
    borderHover: 'hover:border-sky-300',
    hex: '#0284c7',
  },
  EPS: {
    bar: 'bg-amber-500',
    badge: 'text-amber-700 bg-amber-50 border-amber-200',
    borderHover: 'hover:border-amber-300',
    hex: '#f59e0b',
  },
  COMMS: {
    bar: 'bg-emerald-600',
    badge: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    borderHover: 'hover:border-emerald-300',
    hex: '#059669',
  },
  PAYLOAD: {
    bar: 'bg-rose-500',
    badge: 'text-rose-700 bg-rose-50 border-rose-200',
    borderHover: 'hover:border-rose-300',
    hex: '#e11d48',
  },
  ADCS: {
    bar: 'bg-violet-600',
    badge: 'text-violet-700 bg-violet-50 border-violet-200',
    borderHover: 'hover:border-violet-300',
    hex: '#7c3aed',
  },
  GROUND: {
    bar: 'bg-slate-600',
    badge: 'text-slate-700 bg-slate-100 border-slate-200',
    borderHover: 'hover:border-slate-300',
    hex: '#475569',
  },
};

function formatCommitDate(iso: string): string {
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

function parseDeadlineTimestamp(dueDate?: string): number | null {
  if (!dueDate) return null;
  const trimmed = dueDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }
  const ts = new Date(trimmed).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function formatDeadlineDelta(diffMs: number): string {
  const absMin = Math.max(1, Math.round(Math.abs(diffMs) / 60000));
  const hours = Math.floor(absMin / 60);
  const mins = absMin % 60;
  if (diffMs < 0) {
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `просрочено на ${days} дн.`;
    }
    return hours > 0 ? `просрочено на ${hours} ч ${mins} мин` : `просрочено на ${mins} мин`;
  }
  if (hours >= 24) {
    const days = Math.ceil(hours / 24);
    return `через ${days} дн.`;
  }
  return hours > 0 ? `осталось ${hours} ч ${mins} мин` : `осталось ${mins} мин`;
}

export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({
  project,
  tasks,
  programs,
  membersCount,
  onOpenSubsystemTasks,
  onNavigateTab,
  onOpenGitHubSync,
  onOpenTask,
  onOpenWikiDoc,
  onGenerateDescription,
  generatingDescription = false,
  descriptionError = null,
  onGenerateReadme,
  onUploadReadme,
}) => {
  const [gitStatus, setGitStatus] = useState<GitHubStatusSummary | null>(null);
  const [forgejoCommits, setForgejoCommits] = useState<ForgejoCommit[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [showDeadlineDrawer, setShowDeadlineDrawer] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  const [generatingReadme, setGeneratingReadme] = useState(false);
  const [readmeModalOpen, setReadmeModalOpen] = useState(false);
  const [readmeDraft, setReadmeDraft] = useState('');
  const [readmeCommitMsg, setReadmeCommitMsg] = useState('');
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const [uploadingReadme, setUploadingReadme] = useState(false);
  const [uploadedCommit, setUploadedCommit] = useState<ForgejoCommit | null>(null);
  const [copiedReadme, setCopiedReadme] = useState(false);
  const [readmeTab, setReadmeTab] = useState<'edit' | 'preview'>('preview');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadCommitMetrics = useCallback(async () => {
    setLoadingCommits(true);
    try {
      const [gitRes, forgejoRes] = await Promise.all([
        fetch('/api/github/status'),
        fetch(`/api/v1/repos/school76/${encodeURIComponent(project.forgejoRepo)}/commits`),
      ]);
      if (gitRes.ok) {
        const gitData = (await gitRes.json()) as GitHubStatusSummary;
        setGitStatus(gitData);
      }
      if (forgejoRes.ok) {
        const forgejoData = (await forgejoRes.json()) as { commits?: ForgejoCommit[] };
        setForgejoCommits(Array.isArray(forgejoData.commits) ? forgejoData.commits : []);
      }
    } catch {
      // Keep UI responsive if offline
    } finally {
      setLoadingCommits(false);
    }
  }, [project.forgejoRepo]);

  useEffect(() => {
    loadCommitMetrics();
  }, [loadCommitMetrics, tasks, programs, membersCount, project.description]);

  // Deadline Tracking & 24h Alert Calculation
  const deadlineAnalysis = useMemo(() => {
    const alerts: DeadlineAlert[] = [];
    for (const task of tasks) {
      if (task.status === 'done') continue;
      const deadlineTs = parseDeadlineTimestamp(task.dueDate);
      if (deadlineTs === null) continue;
      const diffMs = deadlineTs - nowTs;
      const severity: DeadlineAlert['severity'] =
        diffMs < 0 ? 'overdue' : diffMs <= DAY_MS ? 'due_24h' : 'upcoming';
      alerts.push({
        task,
        deadlineTs,
        diffMs,
        severity,
        timeLabel: formatDeadlineDelta(diffMs),
      });
    }
    alerts.sort((a, b) => a.diffMs - b.diffMs);

    const urgentAll = alerts.filter(
      (a) => a.severity === 'overdue' || a.severity === 'due_24h'
    );
    const activeAlerts = urgentAll.filter(
      (a) => !dismissedAlertIds.includes(`${a.task.id}:${a.task.dueDate}`)
    );
    const due24hCount = urgentAll.filter((a) => a.severity === 'due_24h').length;
    const overdueCount = urgentAll.filter((a) => a.severity === 'overdue').length;
    const urgentBySubsystem = new Map<Subsystem, number>();
    for (const a of urgentAll) {
      urgentBySubsystem.set(a.task.subsystem, (urgentBySubsystem.get(a.task.subsystem) || 0) + 1);
    }

    return {
      allDeadlines: alerts,
      urgentAll,
      activeAlerts,
      due24hCount,
      overdueCount,
      nextUpcoming: alerts[0] || null,
      urgentBySubsystem,
    };
  }, [tasks, nowTs, dismissedAlertIds]);

  const taskSummary = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const review = tasks.filter((t) => t.status === 'review').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const backlog = tasks.filter((t) => t.status === 'backlog').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, review, inProgress, backlog, pct };
  }, [tasks]);

  const subsystemStats = useMemo(() => {
    return SUBSYSTEM_ORDER.map((sub) => {
      const subTasks = tasks.filter((t) => t.subsystem === sub);
      const total = subTasks.length;
      const done = subTasks.filter((t) => t.status === 'done').length;
      const review = subTasks.filter((t) => t.status === 'review').length;
      const inProgress = subTasks.filter((t) => t.status === 'in_progress').length;
      const backlog = subTasks.filter((t) => t.status === 'backlog').length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const sharePct =
        tasks.length > 0 ? Math.round((total / tasks.length) * 100) : 0;

      return {
        sub,
        name: SUBSYSTEM_RU_NAMES[sub],
        total,
        done,
        review,
        inProgress,
        backlog,
        pct,
        sharePct,
        color: SUBSYSTEM_ACCENT[sub].hex,
        urgentDeadlines: deadlineAnalysis.urgentBySubsystem.get(sub) || 0,
      };
    });
  }, [tasks, deadlineAnalysis.urgentBySubsystem]);

  const pieData = useMemo(
    () => subsystemStats.filter((item) => item.total > 0),
    [subsystemStats]
  );

  const mblockVersionsCount = useMemo(() => {
    const projectPrograms = programs.filter(
      (p) => !p.projectId || p.projectId === project.id
    );
    return projectPrograms.reduce((acc, p) => acc + (p.versions?.length || 1), 0);
  }, [programs, project.id]);

  const gitCommitCount = gitStatus?.commitCount ?? (gitStatus?.lastCommitSha ? 1 : 0);
  const wikiCommitCount = forgejoCommits.length;
  const totalActiveCommits = gitCommitCount + wikiCommitCount;
  const pendingChangesCount = gitStatus?.changedFiles.length ?? 0;
  const aheadCount = gitStatus?.aheadCount ?? 0;

  const recentFeed = useMemo(() => {
    const items: {
      id: string;
      source: 'Git' | 'Forgejo';
      sha: string;
      message: string;
      author: string;
      timestamp: string;
    }[] = [];

    if (gitStatus?.recentCommits) {
      for (const c of gitStatus.recentCommits) {
        items.push({
          id: `git-${c.sha}`,
          source: 'Git',
          sha: c.sha,
          message: c.message,
          author: c.author,
          timestamp: c.date,
        });
      }
    } else if (gitStatus?.lastCommitSha) {
      items.push({
        id: `git-${gitStatus.lastCommitSha}`,
        source: 'Git',
        sha: gitStatus.lastCommitSha,
        message: gitStatus.lastCommitMessage,
        author: 'school76',
        timestamp: gitStatus.lastCommitAt,
      });
    }

    for (const fc of forgejoCommits) {
      items.push({
        id: `fg-${fc.sha}-${fc.timestamp}`,
        source: 'Forgejo',
        sha: fc.sha.slice(0, 7),
        message: fc.message,
        author: fc.author,
        timestamp: fc.timestamp,
      });
    }

    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 4);
  }, [gitStatus, forgejoCommits]);

  const handleAlertClick = (task: CubeSatTask) => {
    if (onOpenTask) {
      onOpenTask(task.id);
    } else {
      onOpenSubsystemTasks(task.subsystem);
    }
  };

  const handleGenerateReadmeClick = async () => {
    if (!onGenerateReadme) return;
    setGeneratingReadme(true);
    setReadmeError(null);
    setUploadedCommit(null);
    try {
      const result = await onGenerateReadme();
      if (!result) return;
      setReadmeDraft(result.readme);
      setReadmeCommitMsg(`[AI] Обновлён README.md проекта «${project.name}»`);
      setReadmeTab('preview');
      setReadmeModalOpen(true);
    } catch (err) {
      setReadmeError(
        err instanceof Error ? err.message : 'Не удалось сформировать README.md с помощью ИИ'
      );
    } finally {
      setGeneratingReadme(false);
    }
  };

  const handleUploadReadmeClick = async () => {
    if (!onUploadReadme || !readmeDraft.trim()) return;
    setUploadingReadme(true);
    setReadmeError(null);
    try {
      const result = await onUploadReadme(readmeDraft, readmeCommitMsg.trim() || undefined);
      setUploadedCommit(result.commit);
      await loadCommitMetrics();
    } catch (err) {
      setReadmeError(
        err instanceof Error ? err.message : 'Не удалось загрузить README.md в Forgejo'
      );
    } finally {
      setUploadingReadme(false);
    }
  };

  const handleDownloadReadme = () => {
    if (!readmeDraft) return;
    const blob = new Blob([readmeDraft], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'README.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyReadme = async () => {
    if (!readmeDraft) return;
    try {
      await navigator.clipboard.writeText(readmeDraft);
      setCopiedReadme(true);
      window.setTimeout(() => setCopiedReadme(false), 2000);
    } catch {
      // Ignore clipboard permissions issues
    }
  };

  const hasUrgent = deadlineAnalysis.urgentAll.length > 0;

  return (
    <section
      aria-label="Панель сводных показателей проекта"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      {/* Top Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <Activity className="w-4 h-4 text-sky-600 shrink-0" />
          <h2 className="text-sm font-bold text-slate-900 truncate">
            Сводные показатели · {project.name}
          </h2>
          <span className="text-[11px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">
            {gitStatus?.repo || 'spawnperm/school76'} ({gitStatus?.branch || 'main'})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 24h Deadline Notification Indicator */}
          <button
            type="button"
            onClick={() => setShowDeadlineDrawer((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded transition-colors ${
              deadlineAnalysis.overdueCount > 0
                ? 'text-rose-800 bg-rose-50 border-rose-300 hover:bg-rose-100'
                : deadlineAnalysis.due24hCount > 0
                  ? 'text-amber-800 bg-amber-50 border-amber-300 hover:bg-amber-100'
                  : 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
            }`}
            title="Мониторинг дедлайнов задач (за 24 часа)"
          >
            {hasUrgent ? (
              <BellRing className="w-3.5 h-3.5 animate-pulse" />
            ) : (
              <Bell className="w-3.5 h-3.5" />
            )}
            <span>Дедлайны (24 ч):</span>
            <span className="font-mono tabular-nums font-bold">
              {deadlineAnalysis.urgentAll.length}
            </span>
          </button>

          <button
            type="button"
            onClick={loadCommitMetrics}
            disabled={loadingCommits}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
            title="Обновить метрики коммитов"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCommits ? 'animate-spin' : ''}`} />
            Обновить
          </button>
          <button
            type="button"
            onClick={onOpenGitHubSync}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100"
          >
            <GitBranch className="w-3.5 h-3.5" />
            GitHub Sync
          </button>
          {onGenerateDescription && (
            <button
              type="button"
              onClick={onGenerateDescription}
              disabled={generatingDescription}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded hover:bg-violet-100 disabled:opacity-50"
              title="Автоматически сформировать описание проекта с ИИ на основе задач и прогресса"
            >
              <Sparkles className={`w-3.5 h-3.5 ${generatingDescription ? 'animate-pulse' : ''}`} />
              {generatingDescription ? 'Генерация ИИ...' : 'Описание с ИИ'}
            </button>
          )}
          {onGenerateReadme && (
            <button
              type="button"
              onClick={handleGenerateReadmeClick}
              disabled={generatingReadme}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 disabled:opacity-50"
              title="Сформировать README.md со структурой и текущим статусом проекта с помощью ИИ для Forgejo"
            >
              <FileText className={`w-3.5 h-3.5 ${generatingReadme ? 'animate-pulse' : ''}`} />
              {generatingReadme ? 'Формирование README...' : 'README.md (ИИ)'}
            </button>
          )}
        </div>
      </div>

      {/* AI Project Summary / Description Strip */}
      <div className="px-5 py-3 border-b border-slate-200 bg-white space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-xs text-slate-700 leading-relaxed flex-1">
            <span className="font-semibold text-slate-900 mr-1.5">Сводка проекта:</span>
            {project.description || 'Описание ещё не заполнено. Нажмите «Описание с ИИ», чтобы сформировать его по задачам и прогрессу.'}
          </p>
        </div>
        {descriptionError && (
          <div className="px-3 py-1.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded">
            {descriptionError}
          </div>
        )}
        {readmeError && !readmeModalOpen && (
          <div className="px-3 py-1.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded">
            {readmeError}
          </div>
        )}
      </div>

      {/* Automatic 24h Deadline Alert Banner (shown whenever tasks are <= 24h or overdue, or when user opens drawer) */}
      {(deadlineAnalysis.activeAlerts.length > 0 || showDeadlineDrawer) && (
        <div
          role="region"
          aria-label="Уведомления о дедлайнах задач"
          className={`px-5 py-3.5 border-b space-y-2.5 ${
            deadlineAnalysis.overdueCount > 0
              ? 'bg-rose-50/70 border-rose-200'
              : hasUrgent
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              {hasUrgent ? (
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 ${
                    deadlineAnalysis.overdueCount > 0 ? 'text-rose-600' : 'text-amber-600'
                  }`}
                />
              ) : (
                <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>
                {hasUrgent
                  ? `Внимание: задач со сроком ≤ 24 ч или просроченных — ${deadlineAnalysis.urgentAll.length}`
                  : 'Мониторинг дедлайнов (24 ч): критичных приближений нет'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              {dismissedAlertIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDismissedAlertIds([])}
                  className="text-sky-700 hover:underline font-medium"
                >
                  Показать скрытые ({dismissedAlertIds.length})
                </button>
              )}
              {showDeadlineDrawer && (
                <button
                  type="button"
                  onClick={() => setShowDeadlineDrawer(false)}
                  className="text-slate-500 hover:text-slate-800"
                  aria-label="Свернуть панель дедлайнов"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {hasUrgent ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(showDeadlineDrawer
                ? deadlineAnalysis.urgentAll
                : deadlineAnalysis.activeAlerts
              ).map((alert) => {
                const dismissKey = `${alert.task.id}:${alert.task.dueDate}`;
                const isOverdue = alert.severity === 'overdue';
                return (
                  <div
                    key={dismissKey}
                    className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-white ${
                      isOverdue ? 'border-rose-200' : 'border-amber-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleAlertClick(alert.task)}
                      className="min-w-0 text-left flex-1 space-y-0.5"
                    >
                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="font-semibold text-slate-800">
                          {alert.task.id} · {alert.task.subsystem}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-semibold ${
                            isOverdue
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {alert.timeLabel}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-slate-900 truncate">
                        {alert.task.title}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Срок: {alert.task.dueDate} · {alert.task.assignee}
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAlertClick(alert.task)}
                        className="px-2 py-1 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100"
                      >
                        Открыть
                      </button>
                      {!dismissedAlertIds.includes(dismissKey) && (
                        <button
                          type="button"
                          onClick={() =>
                            setDismissedAlertIds((prev) => [...prev, dismissKey])
                          }
                          className="p-1 text-slate-400 hover:text-slate-700"
                          title="Скрыть уведомление"
                          aria-label="Скрыть уведомление"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-md px-3 py-2">
              <span>
                {deadlineAnalysis.nextUpcoming
                  ? `Ближайший дедлайн: ${deadlineAnalysis.nextUpcoming.task.id} (${deadlineAnalysis.nextUpcoming.task.subsystem}) — «${deadlineAnalysis.nextUpcoming.task.title}» (${deadlineAnalysis.nextUpcoming.task.dueDate}, ${deadlineAnalysis.nextUpcoming.timeLabel})`
                  : 'Активных задач с установленным дедлайном нет.'}
              </span>
              {deadlineAnalysis.nextUpcoming && (
                <button
                  type="button"
                  onClick={() => handleAlertClick(deadlineAnalysis.nextUpcoming!.task)}
                  className="text-sky-700 hover:underline font-medium shrink-0"
                >
                  Перейти к задаче
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 border-b border-slate-200">
        {/* KPI 1: Overall Tasks Progress */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Выполнение задач
            </span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {taskSummary.pct}%
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {taskSummary.done}
              <span className="text-sm font-normal text-slate-400">/{taskSummary.total}</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('tasks')}
              className="text-xs text-sky-700 hover:underline font-medium"
            >
              Открыть доску
            </button>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
            {taskSummary.total > 0 && (
              <>
                <div
                  className="bg-emerald-600 transition-all duration-300"
                  style={{ width: `${(taskSummary.done / taskSummary.total) * 100}%` }}
                  title={`Готово: ${taskSummary.done}`}
                />
                <div
                  className="bg-sky-500 transition-all duration-300"
                  style={{ width: `${(taskSummary.review / taskSummary.total) * 100}%` }}
                  title={`На проверке: ${taskSummary.review}`}
                />
                <div
                  className="bg-amber-400 transition-all duration-300"
                  style={{ width: `${(taskSummary.inProgress / taskSummary.total) * 100}%` }}
                  title={`В работе: ${taskSummary.inProgress}`}
                />
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-500">
            <span>В работе: {taskSummary.inProgress}</span>
            <span>Проверка: {taskSummary.review}</span>
            <span>Бэклог: {taskSummary.backlog}</span>
          </div>
        </div>

        {/* KPI 2: Active Commits */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <GitCommit className="w-3.5 h-3.5 text-sky-600" />
              Активные коммиты
            </span>
            {(pendingChangesCount > 0 || aheadCount > 0) && (
              <span className="font-mono text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                {aheadCount > 0 ? `+${aheadCount} push` : `${pendingChangesCount} изм.`}
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {totalActiveCommits}
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('wiki')}
              className="text-xs text-sky-700 hover:underline font-medium"
            >
              Журнал Wiki
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 pt-0.5 text-[11px] font-mono tabular-nums">
            <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1">
              <div className="text-slate-400 text-[10px]">Git</div>
              <div className="font-semibold text-slate-800">{gitCommitCount}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1">
              <div className="text-slate-400 text-[10px]">Forgejo</div>
              <div className="font-semibold text-slate-800">{wikiCommitCount}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1">
              <div className="text-slate-400 text-[10px]">mBlock</div>
              <div className="font-semibold text-slate-800">{mblockVersionsCount}</div>
            </div>
          </div>
        </div>

        {/* KPI 3: Subsystem Readiness & Deadlines */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Cpu className="w-3.5 h-3.5 text-violet-600" />
              Подсистемы 1U
            </span>
            <span className="font-mono tabular-nums text-slate-700">
              {subsystemStats.filter((s) => s.total > 0 && s.pct === 100).length}/
              {subsystemStats.filter((s) => s.total > 0).length || 6} готово
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {programs.filter((p) => !p.projectId || p.projectId === project.id).length}
              <span className="text-xs font-sans font-normal text-slate-500 ml-1.5">
                программ ПО
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('mblock')}
              className="text-xs text-sky-700 hover:underline font-medium"
            >
              mBlock ПО
            </button>
          </div>
          <div className="text-[11px] text-slate-500 leading-snug">
            {deadlineAnalysis.nextUpcoming ? (
              <span>
                Ближайший дедлайн:{' '}
                <span className="font-mono font-medium text-slate-700">
                  {deadlineAnalysis.nextUpcoming.task.id} ({deadlineAnalysis.nextUpcoming.timeLabel})
                </span>
              </span>
            ) : (
              'Нажмите на подсистему ниже, чтобы открыть её задачи.'
            )}
          </div>
        </div>

        {/* KPI 4: Engineering Team */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Users className="w-3.5 h-3.5 text-slate-600" />
              Команда проекта
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {project.forgejoRepo}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {membersCount}
            <span className="text-xs font-sans font-normal text-slate-500 ml-1.5">
              участников
            </span>
          </div>
          {gitStatus?.lastCommitSha ? (
            <div className="text-[11px] text-slate-500 truncate font-mono" title={gitStatus.lastCommitMessage}>
              HEAD {gitStatus.lastCommitSha}: {gitStatus.lastCommitMessage}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">
              Локальный статус Git синхронизирован
            </div>
          )}
        </div>
      </div>

      {/* Subsystem Progress Bars + Recharts Pie Chart */}
      <div className="p-5 grid grid-cols-1 xl:grid-cols-12 gap-6 border-b border-slate-200">
        {/* Progress Bars by Subsystem */}
        <div className="xl:col-span-7 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 inline-flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5 text-sky-600" />
              Прогресс выполнения задач по подсистемам
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              Итого завершено: {taskSummary.done} из {taskSummary.total} ({taskSummary.pct}%)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {subsystemStats.map((item) => {
              const accent = SUBSYSTEM_ACCENT[item.sub];
              const isComplete = item.total > 0 && item.pct === 100;
              return (
                <button
                  key={item.sub}
                  type="button"
                  onClick={() => onOpenSubsystemTasks(item.sub)}
                  className={`text-left p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-2 ${accent.borderHover}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-semibold border rounded ${accent.badge}`}
                      >
                        {item.sub}
                      </span>
                      {item.urgentDeadlines > 0 && (
                        <span
                          title={`Срочных дедлайнов (≤ 24 ч): ${item.urgentDeadlines}`}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {item.urgentDeadlines}
                        </span>
                      )}
                    </div>
                    <span
                      className={`font-mono tabular-nums text-xs font-bold ${
                        isComplete ? 'text-emerald-700' : 'text-slate-800'
                      }`}
                    >
                      {item.pct}%
                    </span>
                  </div>

                  <div className="text-xs font-medium text-slate-800 truncate">
                    {item.name}
                  </div>

                  <div
                    role="progressbar"
                    aria-valuenow={item.pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Выполнение задач ${item.name}: ${item.pct}%`}
                    className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isComplete ? 'bg-emerald-600' : accent.bar
                      }`}
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500">
                    <span>
                      {item.total > 0 ? `${item.done}/${item.total} готово` : 'Нет задач'}
                    </span>
                    {item.inProgress + item.review > 0 && (
                      <span className="text-sky-700">
                        {item.inProgress + item.review} в работе
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recharts Pie Chart: Task Distribution by Subsystem */}
        <div className="xl:col-span-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 inline-flex items-center gap-1.5">
              <PieChartIcon className="w-3.5 h-3.5 text-sky-600" />
              Распределение задач по подсистемам
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              Задач: {taskSummary.total}
            </span>
          </div>

          <div className="border border-slate-200 rounded-lg bg-slate-50/40 p-4">
            {pieData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-xs text-slate-500">
                В проекте пока нет задач для построения диаграммы.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
                <div className="sm:col-span-6 h-[210px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={3}
                        stroke="#ffffff"
                        strokeWidth={2}
                        onClick={(_entry, index) => {
                          const target = pieData[index];
                          if (target?.sub) {
                            onOpenSubsystemTasks(target.sub);
                          }
                        }}
                        className="cursor-pointer focus:outline-none"
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.sub} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, item) => {
                          const payload = item?.payload as
                            | { name: string; sharePct: number; done: number }
                            | undefined;
                          return [
                            `${value} задач (${payload?.sharePct ?? 0}%, готово: ${payload?.done ?? 0})`,
                            payload?.name ?? '',
                          ];
                        }}
                        contentStyle={{
                          fontSize: '12px',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="sm:col-span-6 space-y-1.5">
                  {pieData.map((item) => (
                    <button
                      key={item.sub}
                      type="button"
                      onClick={() => onOpenSubsystemTasks(item.sub)}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md hover:bg-white border border-transparent hover:border-slate-200 transition-colors text-left"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-xs font-medium text-slate-800 truncate">
                          {item.name}
                        </span>
                      </span>
                      <span className="text-xs font-mono tabular-nums text-slate-600 shrink-0">
                        {item.total} ({item.sharePct}%)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Active Commits Strip */}
      <div className="px-5 py-4 bg-slate-50/40 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 inline-flex items-center gap-1.5">
            <GitCommit className="w-3.5 h-3.5 text-sky-600" />
            Последние коммиты проекта
          </h3>
          <span className="text-[11px] font-mono tabular-nums text-slate-500">
            Всего активных коммитов: {totalActiveCommits}
          </span>
        </div>

        {recentFeed.length === 0 ? (
          <div className="text-xs text-slate-500 py-2">
            История коммитов пока пуста.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {recentFeed.map((commit) => (
              <div
                key={commit.id}
                className="bg-white border border-slate-200 rounded-md p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold ${
                        commit.source === 'Git'
                          ? 'bg-slate-900 text-white'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {commit.source}
                    </span>
                    <span className="font-mono text-slate-600">{commit.sha}</span>
                  </div>
                  <span className="font-mono text-slate-400 shrink-0">
                    {formatCommitDate(commit.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-slate-800 line-clamp-1 font-medium" title={commit.message}>
                  {commit.message}
                </p>
                <div className="text-[11px] text-slate-500 truncate">{commit.author}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI-Generated README.md Preview & Forgejo Upload Modal */}
      {readmeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Сформированный README.md для Forgejo"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  README.md для Forgejo · {project.name}
                </h3>
                <span className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
                  school76/{project.forgejoRepo}/README.md
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReadmeModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
                aria-label="Закрыть окно README.md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
              <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-50 text-xs">
                <button
                  type="button"
                  onClick={() => setReadmeTab('preview')}
                  className={`px-3 py-1 rounded font-medium transition-colors ${
                    readmeTab === 'preview'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Предпросмотр
                </button>
                <button
                  type="button"
                  onClick={() => setReadmeTab('edit')}
                  className={`px-3 py-1 rounded font-medium transition-colors ${
                    readmeTab === 'edit'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Редактор Markdown
                </button>
              </div>

              <div className="flex-1 min-w-[220px] max-w-md flex items-center gap-2">
                <label
                  htmlFor="readme-commit-msg"
                  className="text-[11px] font-medium text-slate-500 whitespace-nowrap"
                >
                  Коммит:
                </label>
                <input
                  id="readme-commit-msg"
                  type="text"
                  value={readmeCommitMsg}
                  onChange={(e) => setReadmeCommitMsg(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs font-mono border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="[AI] Обновлён README.md"
                />
              </div>
            </div>

            {readmeError && (
              <div className="mx-5 mt-3 px-3 py-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded">
                {readmeError}
              </div>
            )}

            {uploadedCommit && (
              <div className="mx-5 mt-3 px-3.5 py-2.5 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Файл <code className="font-mono font-semibold">README.md</code> загружен в
                    Forgejo (<code className="font-mono">{uploadedCommit.sha}</code>).
                  </span>
                </div>
                {onOpenWikiDoc && (
                  <button
                    type="button"
                    onClick={() => {
                      setReadmeModalOpen(false);
                      onOpenWikiDoc('README.md');
                    }}
                    className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-950"
                  >
                    Открыть в Базе знаний Forgejo
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 min-h-[280px] overflow-y-auto p-5 bg-slate-50/40">
              {readmeTab === 'edit' ? (
                <textarea
                  value={readmeDraft}
                  onChange={(e) => setReadmeDraft(e.target.value)}
                  spellCheck={false}
                  className="w-full h-[420px] p-4 text-xs font-mono leading-relaxed text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              ) : (
                <div className="bg-white border border-slate-200 rounded-md p-5 space-y-2 text-xs text-slate-800 leading-relaxed">
                  {readmeDraft.split('\n').map((line, idx) => {
                    if (line.startsWith('# ')) {
                      return (
                        <h1 key={idx} className="text-lg font-bold text-slate-900 pt-1 pb-1 border-b border-slate-200">
                          {line.slice(2)}
                        </h1>
                      );
                    }
                    if (line.startsWith('## ')) {
                      return (
                        <h2 key={idx} className="text-sm font-bold text-slate-900 pt-3">
                          {line.slice(3)}
                        </h2>
                      );
                    }
                    if (line.startsWith('### ')) {
                      return (
                        <h3 key={idx} className="text-xs font-bold text-slate-800 pt-2">
                          {line.slice(4)}
                        </h3>
                      );
                    }
                    if (line.startsWith('```')) {
                      return (
                        <div key={idx} className="text-[10px] font-mono text-slate-400">
                          {line}
                        </div>
                      );
                    }
                    if (line.startsWith('- ') || line.startsWith('* ')) {
                      return (
                        <div key={idx} className="pl-3 flex gap-1.5">
                          <span className="text-slate-400">•</span>
                          <span className="font-sans">{line.slice(2)}</span>
                        </div>
                      );
                    }
                    if (line.startsWith('|')) {
                      return (
                        <div key={idx} className="font-mono text-[11px] bg-slate-50 px-2 py-0.5 rounded overflow-x-auto whitespace-pre">
                          {line}
                        </div>
                      );
                    }
                    if (!line.trim()) {
                      return <div key={idx} className="h-1.5" />;
                    }
                    return (
                      <p key={idx} className="whitespace-pre-wrap font-mono text-[11.5px] text-slate-700">
                        {line}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateReadmeClick}
                  disabled={generatingReadme}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${generatingReadme ? 'animate-pulse' : ''}`} />
                  {generatingReadme ? 'Обновление...' : 'Перегенерировать'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyReadme}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  {copiedReadme ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedReadme ? 'Скопировано' : 'Копировать'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadReadme}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Скачать README.md
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReadmeModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Закрыть
                </button>
                {onUploadReadme && (
                  <button
                    type="button"
                    onClick={handleUploadReadmeClick}
                    disabled={uploadingReadme || !readmeDraft.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingReadme ? 'Загрузка в Forgejo...' : 'Загрузить в Forgejo'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
