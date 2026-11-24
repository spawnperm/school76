import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ListChecks, Rocket } from 'lucide-react';
import type {
  CommunityProject,
  CubeSatTask,
  MissionLifecycleStage,
  OnboardProgram,
  UserProfile,
} from '../types/cubesat.ts';
import {
  computeMissionLifecycle,
  MISSION_LIFECYCLE_STAGES,
} from '../utils/missionLifecycle.ts';

interface MissionStatusBadgeProps {
  activeProject: CommunityProject;
  projects: CommunityProject[];
  tasks: CubeSatTask[];
  programs: OnboardProgram[];
  currentUser: UserProfile | null;
  onSelectProject: (projectId: string) => void;
  onUpdateLifecycleStage: (
    projectId: string,
    stage: MissionLifecycleStage | null
  ) => Promise<void>;
  onRequireAuth: () => void;
  onOpenTasks: () => void;
}

const STAGE_TEXT_TONE: Record<MissionLifecycleStage, string> = {
  design: 'text-slate-700',
  assembly: 'text-amber-700',
  testing: 'text-sky-700',
  launch: 'text-emerald-700',
};

const STAGE_BAR_ACTIVE: Record<MissionLifecycleStage, string> = {
  design: 'bg-slate-700',
  assembly: 'bg-amber-500',
  testing: 'bg-sky-600',
  launch: 'bg-emerald-600',
};

export const MissionStatusBadge: React.FC<MissionStatusBadgeProps> = ({
  activeProject,
  projects,
  tasks,
  programs,
  currentUser,
  onSelectProject,
  onUpdateLifecycleStage,
  onRequireAuth,
  onOpenTasks,
}) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const summary = useMemo(
    () => computeMissionLifecycle(activeProject, tasks, programs),
    [activeProject, tasks, programs]
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const isMember = currentUser
    ? activeProject.ownerId === currentUser.id ||
      activeProject.memberIds.includes(currentUser.id)
    : false;

  const handleStageSelect = async (stage: MissionLifecycleStage | null) => {
    if (!currentUser) {
      setOpen(false);
      onRequireAuth();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onUpdateLifecycleStage(activeProject.id, stage);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не удалось обновить этап миссии'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Статус миссии «${activeProject.name}»: ${summary.label} (${summary.progressPct}%)`}
        className={`inline-flex items-center gap-2.5 px-3 py-1.5 text-xs border rounded-md transition-colors whitespace-nowrap shrink-0 ${
          open
            ? 'bg-slate-100 border-slate-300 text-slate-900'
            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
        }`}
      >
        <Rocket className="w-3.5 h-3.5 text-sky-600 shrink-0" />
        <span className="hidden xl:inline text-slate-500">Статус миссии:</span>
        <span className={`font-semibold ${STAGE_TEXT_TONE[summary.stage]}`}>
          {summary.label}
        </span>

        {/* 4-phase lifecycle progress bar */}
        <span
          className="hidden sm:inline-flex items-center gap-0.5"
          aria-hidden="true"
        >
          {MISSION_LIFECYCLE_STAGES.map((st) => (
            <span
              key={st.id}
              className={`w-2.5 h-1.5 rounded-[1px] transition-colors ${
                st.index <= summary.stageIndex
                  ? STAGE_BAR_ACTIVE[summary.stage]
                  : 'bg-slate-200'
              }`}
            />
          ))}
        </span>

        <span className="font-mono text-[11px] text-slate-500 tabular-nums hidden md:inline">
          {summary.progressPct}%
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Статус жизненного цикла миссии кубсата"
          className="absolute right-0 mt-2 w-[340px] sm:w-[370px] bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden text-left"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900">
                Статус миссии кубсата
              </span>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                {summary.isManual ? 'Зафиксирован вручную' : 'Авто по данным проекта'}
              </span>
            </div>

            {projects.length > 1 ? (
              <select
                value={activeProject.id}
                onChange={(e) => {
                  setError(null);
                  onSelectProject(e.target.value);
                }}
                aria-label="Активный проект для статуса миссии"
                className="w-full px-2.5 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs font-medium text-slate-800 truncate">
                {activeProject.name}
              </div>
            )}
          </div>

          {/* Metrics Summary */}
          <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-white text-center">
            <div className="py-2.5 px-2">
              <div className="text-[10px] text-slate-500">Готовность</div>
              <div className="text-sm font-mono font-bold tabular-nums text-slate-900">
                {summary.progressPct}%
              </div>
            </div>
            <div className="py-2.5 px-2">
              <div className="text-[10px] text-slate-500">Задач закрыто</div>
              <div className="text-sm font-mono font-bold tabular-nums text-slate-900">
                {summary.doneTasks}/{summary.totalTasks}
              </div>
            </div>
            <div className="py-2.5 px-2">
              <div className="text-[10px] text-slate-500">На проверке</div>
              <div className="text-sm font-mono font-bold tabular-nums text-slate-900">
                {summary.reviewTasks}
              </div>
            </div>
          </div>

          {/* Lifecycle Stages List */}
          <div className="p-3 space-y-1.5">
            {error && (
              <div className="px-2.5 py-1.5 text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded">
                {error}
              </div>
            )}

            {MISSION_LIFECYCLE_STAGES.map((st) => {
              const isCurrent = st.id === summary.stage;
              const isReached = st.index < summary.stageIndex;
              return (
                <button
                  key={st.id}
                  type="button"
                  disabled={saving}
                  onClick={() => void handleStageSelect(st.id)}
                  className={`w-full text-left px-3 py-2 rounded-md border transition-colors flex items-start justify-between gap-2 ${
                    isCurrent
                      ? 'bg-sky-50/70 border-sky-300'
                      : isReached
                        ? 'bg-emerald-50/40 border-slate-200 hover:bg-slate-50'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        0{st.index + 1}.
                      </span>
                      <span className={isCurrent ? STAGE_TEXT_TONE[st.id] : ''}>
                        {st.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 pl-6 mt-0.5 leading-snug">
                      {st.shortDesc}
                    </div>
                  </div>
                  <div className="shrink-0 pt-0.5 text-[11px] font-mono">
                    {isCurrent ? (
                      <span className="font-semibold text-sky-700">Текущий</span>
                    ) : isReached ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer Controls */}
          <div className="px-3 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 text-[11px]">
            {summary.isManual ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleStageSelect(null)}
                className="text-sky-700 hover:underline font-medium"
              >
                Вернуть авторасчёт
              </button>
            ) : (
              <span className="text-slate-500">
                {currentUser
                  ? isMember
                    ? 'Нажмите на этап для фиксации'
                    : 'Вступите в проект для смены этапа'
                  : 'Войдите для ручной смены этапа'}
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenTasks();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <ListChecks className="w-3 h-3 text-sky-600" />
              К задачам
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
