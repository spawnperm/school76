import React from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  XCircle,
} from 'lucide-react';
import type { CiRunConclusion, CiRunStatus, CiWorkflowRun } from '../types/cubesat.ts';

export interface CiRunVisual {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
}

export function getCiRunVisual(
  statusOrRun?: CiRunStatus | CiWorkflowRun | null,
  conclusionArg?: CiRunConclusion,
  variant: 'run' | 'tests' = 'run'
): CiRunVisual {
  const status =
    typeof statusOrRun === 'object' && statusOrRun !== null
      ? statusOrRun.status
      : (statusOrRun ?? undefined);
  const conclusion =
    typeof statusOrRun === 'object' && statusOrRun !== null
      ? statusOrRun.conclusion
      : conclusionArg;

  if (!status) {
    return {
      label: 'Не запускались',
      badgeClass: 'text-slate-600 bg-slate-100 border-slate-200',
      icon: <Clock className="w-4 h-4 text-slate-400 shrink-0" />,
    };
  }
  if (status === 'in_progress') {
    return {
      label: variant === 'tests' ? 'Выполняются (live)' : 'Выполняется',
      badgeClass: 'text-amber-800 bg-amber-50 border-amber-200',
      icon: <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" />,
    };
  }
  if (status === 'queued') {
    return {
      label: 'В очереди',
      badgeClass: 'text-slate-700 bg-slate-100 border-slate-200',
      icon: <Clock className="w-4 h-4 text-slate-500 shrink-0" />,
    };
  }
  switch (conclusion) {
    case 'success':
      return {
        label: variant === 'tests' ? 'Тесты пройдены' : 'Успешно',
        badgeClass: 'text-emerald-800 bg-emerald-50 border-emerald-200',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
      };
    case 'failure':
      return {
        label: variant === 'tests' ? 'Ошибка тестов' : 'Ошибка сборки',
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

export function getCiStepIcon(status: CiRunStatus, conclusion: CiRunConclusion): React.ReactNode {
  if (status === 'in_progress') {
    return <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin shrink-0" />;
  }
  if (status === 'queued') {
    return <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  }
  if (conclusion === 'success') {
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
  }
  if (conclusion === 'failure' || conclusion === 'timed_out') {
    return <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
  }
  return <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
}

export function formatRunElapsed(createdAtIso?: string, nowMs = Date.now()): string {
  if (!createdAtIso) return '00:00';
  const start = new Date(createdAtIso).getTime();
  if (Number.isNaN(start)) return '00:00';
  const diffSec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const mm = String(Math.floor(diffSec / 60)).padStart(2, '0');
  const ss = String(diffSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function isErrorLogLine(line: string): boolean {
  return (
    line.includes('##[error]') ||
    /\b(ERROR|FAIL|AssertionError|TypeError|SyntaxError)\b/i.test(line)
  );
}

interface GitHubPatInputProps {
  value: string;
  onChange: (next: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder?: string;
  className?: string;
}

export const GitHubPatInput: React.FC<GitHubPatInputProps> = ({
  value,
  onChange,
  show,
  onToggleShow,
  placeholder = 'GitHub PAT для приватных логов/перезапуска',
  className = '',
}) => (
  <div className={`relative ${className}`}>
    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
    <input
      type={show ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-8 pr-8 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
    />
    <button
      type="button"
      onClick={onToggleShow}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
      aria-label="Показать или скрыть токен"
    >
      {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
    </button>
  </div>
);

interface CiLogPreProps {
  lines: string[];
  className?: string;
}

export const CiLogPre: React.FC<CiLogPreProps> = ({
  lines,
  className = 'p-3 max-h-60 overflow-auto font-mono text-[11px] leading-relaxed bg-slate-900 text-slate-100 whitespace-pre-wrap break-all',
}) => (
  <pre className={className}>
    {lines.map((line, lIdx) => (
      <div
        key={lIdx}
        className={isErrorLogLine(line) ? 'text-rose-300 bg-rose-950/50 px-1 rounded' : ''}
      >
        {line || ' '}
      </div>
    ))}
  </pre>
);
