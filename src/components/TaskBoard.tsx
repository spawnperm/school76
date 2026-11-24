import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Cpu,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
} from 'lucide-react';
import type {
  ChatChannelId,
  ChecklistItem,
  CubeSatTask,
  OnboardProgram,
  Subsystem,
  TaskPriority,
  TaskStatus,
} from '../types/cubesat.ts';
import {
  CHAT_CHANNELS,
  SUBSYSTEM_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from '../types/cubesat.ts';

interface TaskBoardProps {
  projectId: string;
  projectName: string;
  tasks: CubeSatTask[];
  programs: OnboardProgram[];
  loading: boolean;
  engineerName: string;
  focusedTaskId: string | null;
  onFocusTask: (id: string | null) => void;
  onCreateTask: (payload: Omit<CubeSatTask, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateTask: (id: string, patch: Partial<Omit<CubeSatTask, 'id' | 'createdAt'>>) => void;
  onDeleteTask: (id: string) => void;
  onOpenProgram: (programId: string) => void;
  onDiscussTask: (task: CubeSatTask) => void;
  initialSubsystemFilter?: Subsystem | null;
  onConsumeSubsystemFilter?: () => void;
}

const STATUS_ORDER: TaskStatus[] = ['backlog', 'in_progress', 'review', 'done'];
const SUBSYSTEM_FILTERS: ('ALL' | Subsystem)[] = ['ALL', 'OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'];

const PRIORITY_TEXT_CLASS: Record<TaskPriority, string> = {
  low: 'text-slate-500',
  medium: 'text-sky-700',
  high: 'text-amber-700',
  critical: 'text-rose-700 font-semibold',
};

const SUBSYSTEM_BAR_CLASS: Record<Subsystem, string> = {
  OBC: 'bg-sky-600',
  EPS: 'bg-amber-500',
  ADCS: 'bg-violet-600',
  COMMS: 'bg-emerald-600',
  PAYLOAD: 'bg-rose-500',
  GROUND: 'bg-slate-600',
};

function parseIsoDate(iso?: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export const TaskBoard: React.FC<TaskBoardProps> = ({
  projectId,
  projectName,
  tasks,
  programs,
  loading,
  engineerName,
  focusedTaskId,
  onFocusTask,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onOpenProgram,
  onDiscussTask,
  initialSubsystemFilter,
  onConsumeSubsystemFilter,
}) => {
  const [subsystemFilter, setSubsystemFilter] = useState<'ALL' | Subsystem>('ALL');

  useEffect(() => {
    if (initialSubsystemFilter) {
      setSubsystemFilter(initialSubsystemFilter);
      onConsumeSubsystemFilter?.();
    }
  }, [initialSubsystemFilter, onConsumeSubsystemFilter]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'gantt' | 'calendar' | 'todo' | 'table'>('kanban');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(2026, 10, 1)); // Nov 2026

  // Todo quick-add inputs keyed by task ID
  const [todoDrafts, setTodoDrafts] = useState<Record<string, string>>({});

  // Create form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subsystem, setSubsystem] = useState<Subsystem>('OBC');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assignee, setAssignee] = useState(engineerName);
  const [linkedProgramId, setLinkedProgramId] = useState('');
  const [linkedChannel, setLinkedChannel] = useState<ChatChannelId>('obc-firmware');
  const [startDate, setStartDate] = useState('2026-11-24');
  const [dueDate, setDueDate] = useState('2026-12-01');

  const projectTasks = useMemo(
    () => tasks.filter((t) => (t.projectId || 'school76-1u') === projectId),
    [tasks, projectId]
  );

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projectTasks.filter((t) => {
      if (subsystemFilter !== 'ALL' && t.subsystem !== subsystemFilter) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.assignee.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [projectTasks, subsystemFilter, searchQuery]);

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === focusedTaskId) || null,
    [tasks, focusedTaskId]
  );

  const subsystemProgress = useMemo(() => {
    const subs: Subsystem[] = ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'];
    return subs.map((sub) => {
      const subTasks = projectTasks.filter((t) => t.subsystem === sub);
      const total = subTasks.length;
      const done = subTasks.filter((t) => t.status === 'done').length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return { sub, total, done, pct };
    });
  }, [projectTasks]);

  const overallStats = useMemo(() => {
    const total = projectTasks.length;
    const done = projectTasks.filter((t) => t.status === 'done').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [projectTasks]);

  // Gantt Timeline Window Calculation
  const ganttRange = useMemo(() => {
    const dates: Date[] = [];
    for (const t of filteredTasks) {
      const s = parseIsoDate(t.startDate || t.createdAt);
      const e = parseIsoDate(t.dueDate);
      if (s) dates.push(s);
      if (e) dates.push(e);
    }
    const minTs =
      dates.length > 0
        ? Math.min(...dates.map((d) => d.getTime())) - 2 * 86400000
        : new Date(2026, 10, 18).getTime();
    const maxTs =
      dates.length > 0
        ? Math.max(...dates.map((d) => d.getTime())) + 2 * 86400000
        : new Date(2026, 11, 8).getTime();
    const totalDays = Math.max(10, Math.min(45, Math.ceil((maxTs - minTs) / 86400000) + 1));
    const start = new Date(minTs);
    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return { start, totalDays, days };
  }, [filteredTasks]);

  // Calendar Grid Days
  const calendarDays = useMemo(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const firstDay = new Date(y, m, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: { date: Date; inMonth: boolean; iso: string }[] = [];
    for (let i = -startOffset; i < daysInMonth + ((7 - ((startOffset + daysInMonth) % 7)) % 7); i++) {
      const d = new Date(y, m, 1 + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      cells.push({ date: d, inMonth: d.getMonth() === m, iso });
    }
    return cells;
  }, [calendarMonth]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreateTask({
      projectId,
      title: title.trim(),
      description: description.trim(),
      subsystem,
      status: 'backlog',
      priority,
      assignee: assignee.trim() || engineerName,
      linkedProgramId: linkedProgramId || undefined,
      linkedChannel: linkedChannel || undefined,
      startDate: startDate || undefined,
      dueDate: dueDate || undefined,
      progressPct: 0,
      checklist: [],
    });
    setTitle('');
    setDescription('');
    setLinkedProgramId('');
    setShowCreateModal(false);
  };

  const handleToggleChecklistItem = (task: CubeSatTask, itemId: string) => {
    const current = task.checklist || [];
    const updated: ChecklistItem[] = current.map((c) =>
      c.id === itemId ? { ...c, done: !c.done } : c
    );
    const doneCount = updated.filter((c) => c.done).length;
    const progressPct = updated.length > 0 ? Math.round((doneCount / updated.length) * 100) : task.progressPct;
    onUpdateTask(task.id, { checklist: updated, progressPct });
  };

  const handleAddChecklistItem = (task: CubeSatTask) => {
    const draft = (todoDrafts[task.id] || '').trim();
    if (!draft) return;
    const updated: ChecklistItem[] = [
      ...(task.checklist || []),
      { id: `chk-${Date.now().toString(36)}`, text: draft, done: false },
    ];
    const doneCount = updated.filter((c) => c.done).length;
    const progressPct = Math.round((doneCount / updated.length) * 100);
    onUpdateTask(task.id, { checklist: updated, progressPct });
    setTodoDrafts((prev) => ({ ...prev, [task.id]: '' }));
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Задачи и планирование · {projectName}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Канбан-доска, диаграмма Ганта, календарь сроков, todo-листы и сводка готовности подсистем
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по ID, названию, инженеру..."
              className="pl-9 pr-3 py-1.5 w-60 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-lg overflow-x-auto">
            {(
              [
                ['kanban', 'Доска'],
                ['gantt', 'Гант'],
                ['calendar', 'Календарь'],
                ['todo', 'Todo-листы'],
                ['table', 'Таблица'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === mode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setAssignee(engineerName);
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Новая задача
          </button>
        </div>
      </div>

      {/* Subsystem Readiness Progress Bars */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Готовность бортового ПО по подсистемам
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-600">
            Общий прогресс: {overallStats.done}/{overallStats.total} ({overallStats.pct}%)
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {subsystemProgress.map(({ sub, total, done, pct }) => {
            const isSelected = subsystemFilter === sub;
            return (
              <button
                key={sub}
                type="button"
                onClick={() => setSubsystemFilter(isSelected ? 'ALL' : sub)}
                className={`text-left p-2.5 rounded-md border transition-colors space-y-1.5 ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/50'
                    : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-semibold text-slate-900">{sub}</span>
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      pct === 100 && total > 0 ? 'text-emerald-700' : 'text-slate-700'
                    }`}
                  >
                    {pct}%
                  </span>
                </div>

                <progress
                  value={total > 0 ? done : 0}
                  max={Math.max(total, 1)}
                  aria-label={`Готовность ${sub}: ${pct}%`}
                  className={`block w-full h-1.5 rounded-full overflow-hidden appearance-none [&::-webkit-progress-bar]:bg-slate-200/80 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:rounded-full ${
                    pct === 100 && total > 0
                      ? '[&::-webkit-progress-value]:bg-emerald-600 [&::-moz-progress-bar]:bg-emerald-600'
                      : '[&::-webkit-progress-value]:bg-sky-600 [&::-moz-progress-bar]:bg-sky-600'
                  }`}
                />

                <div className="text-[11px] font-mono tabular-nums text-slate-500">
                  {total > 0 ? `${done} из ${total} завершено` : 'Задач нет'}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Subsystem Filter Segmented Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {SUBSYSTEM_FILTERS.map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setSubsystemFilter(sub)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                subsystemFilter === sub
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {sub === 'ALL' ? 'Все подсистемы' : sub}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-500">
          Показано задач: {filteredTasks.length} · Завершено:{' '}
          {filteredTasks.filter((t) => t.status === 'done').length}
        </div>
      </div>

      {/* Main View Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-3">
          <div className="text-base font-semibold text-slate-900">
            Нет задач по выбранному фильтру
          </div>
          <p className="text-sm text-slate-500">
            Создайте новую задачу для проекта «{projectName}» или сбросьте фильтры.
          </p>
          <button
            type="button"
            onClick={() => {
              setSubsystemFilter('ALL');
              setSearchQuery('');
            }}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : viewMode === 'kanban' ? (
        /* 1. KANBAN BOARD */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {STATUS_ORDER.map((status) => {
            const colTasks = filteredTasks.filter((t) => t.status === status);
            return (
              <section
                key={status}
                className="bg-slate-100/70 border border-slate-200 rounded-lg p-3 space-y-3"
              >
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    {TASK_STATUS_LABELS[status]}
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {colTasks.map((task) => {
                    const linkedProg = programs.find((p) => p.id === task.linkedProgramId);
                    const chkTotal = task.checklist?.length || 0;
                    const chkDone = task.checklist?.filter((c) => c.done).length || 0;
                    return (
                      <article
                        key={task.id}
                        onClick={() => onFocusTask(task.id)}
                        className="bg-white border border-slate-200 rounded-md p-3.5 hover:border-sky-400 transition-colors cursor-pointer space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span className="font-mono font-medium text-slate-700">
                            {task.id} · {task.subsystem}
                          </span>
                          <span className={PRIORITY_TEXT_CLASS[task.priority]}>
                            {TASK_PRIORITY_LABELS[task.priority]}
                          </span>
                        </div>

                        <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                          {task.title}
                        </h3>

                        <div className="flex items-center justify-between gap-2 pt-1 text-xs text-slate-500">
                          <span className="truncate">{task.assignee}</span>
                          <span className="font-mono tabular-nums shrink-0">
                            {chkTotal > 0 ? `✓ ${chkDone}/${chkTotal} · ` : ''}
                            {task.dueDate || '—'}
                          </span>
                        </div>

                        {(linkedProg || task.linkedChannel) && (
                          <div
                            className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {linkedProg ? (
                              <button
                                type="button"
                                onClick={() => onOpenProgram(linkedProg.id)}
                                className="inline-flex items-center gap-1 text-sky-700 hover:underline truncate"
                              >
                                <Cpu className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{linkedProg.name}</span>
                              </button>
                            ) : (
                              <span />
                            )}
                            <button
                              type="button"
                              onClick={() => onDiscussTask(task)}
                              className="inline-flex items-center gap-1 text-slate-600 hover:text-sky-700 shrink-0"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Чат
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : viewMode === 'gantt' ? (
        /* 2. GANTT CHART */
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-700">
              График Ганта по задачам и зависимостям ({formatShortDate(ganttRange.days[0])} —{' '}
              {formatShortDate(ganttRange.days[ganttRange.days.length - 1])})
            </div>
            <div className="text-xs text-slate-500">
              Нажмите на строку или полосу задачи для изменения сроков и прогресса
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[960px]">
              {/* Timeline Header */}
              <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50/60 text-[11px] font-mono text-slate-500">
                <div className="col-span-4 px-4 py-2 font-sans font-semibold text-slate-600 border-r border-slate-200">
                  Задача и подсистема
                </div>
                <div
                  className="col-span-8 grid"
                  style={{ gridTemplateColumns: `repeat(${ganttRange.totalDays}, minmax(0, 1fr))` }}
                >
                  {ganttRange.days.map((day, idx) => (
                    <div
                      key={day.toISOString()}
                      className={`py-2 text-center border-r border-slate-100 last:border-r-0 ${
                        day.getDay() === 0 || day.getDay() === 6 ? 'bg-slate-100/70' : ''
                      }`}
                    >
                      {idx % 2 === 0 ? formatShortDate(day) : day.getDate()}
                    </div>
                  ))}
                </div>
              </div>

              {/* Gantt Rows */}
              <div className="divide-y divide-slate-100">
                {filteredTasks.map((task) => {
                  const s = parseIsoDate(task.startDate || task.createdAt) || ganttRange.start;
                  const e = parseIsoDate(task.dueDate) || new Date(s.getTime() + 3 * 86400000);
                  const startIdx = Math.max(
                    0,
                    Math.floor((s.getTime() - ganttRange.start.getTime()) / 86400000)
                  );
                  const endIdx = Math.min(
                    ganttRange.totalDays - 1,
                    Math.max(startIdx, Math.floor((e.getTime() - ganttRange.start.getTime()) / 86400000))
                  );
                  const spanDays = Math.max(1, endIdx - startIdx + 1);
                  const pct =
                    typeof task.progressPct === 'number'
                      ? task.progressPct
                      : task.status === 'done'
                        ? 100
                        : 25;

                  return (
                    <div
                      key={task.id}
                      onClick={() => onFocusTask(task.id)}
                      className="grid grid-cols-12 items-center hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <div className="col-span-4 px-4 py-2.5 border-r border-slate-200 space-y-0.5 min-w-0">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-medium text-slate-700">
                            {task.id} · {task.subsystem}
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-slate-500">
                            {pct}%
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-900 truncate">
                          {task.title}
                        </div>
                        {task.dependsOn && task.dependsOn.length > 0 && (
                          <div className="text-[11px] font-mono text-slate-400">
                            После: {task.dependsOn.join(', ')}
                          </div>
                        )}
                      </div>

                      <div
                        className="col-span-8 grid items-center py-2.5 relative"
                        style={{ gridTemplateColumns: `repeat(${ganttRange.totalDays}, minmax(0, 1fr))` }}
                      >
                        <div
                          style={{
                            gridColumn: `${startIdx + 1} / span ${spanDays}`,
                          }}
                          className="mx-0.5 h-6 rounded bg-slate-200 overflow-hidden relative flex items-center"
                        >
                          <div
                            style={{ width: `${pct}%` }}
                            className={`h-full ${SUBSYSTEM_BAR_CLASS[task.subsystem]} opacity-90`}
                          />
                          <span className="absolute inset-0 px-2 flex items-center justify-between text-[10px] font-mono font-medium text-slate-900 mix-blend-normal truncate">
                            <span className="bg-white/80 px-1 rounded truncate">
                              {task.assignee.split(' ')[0]} · {formatShortDate(s)}–{formatShortDate(e)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : viewMode === 'calendar' ? (
        /* 3. MISSION CALENDAR */
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 capitalize">
              {calendarMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                }
                className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-100"
                aria-label="Предыдущий месяц"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(2026, 10, 1))}
                className="px-3 py-1 text-xs font-medium bg-white border border-slate-200 rounded hover:bg-slate-100"
              >
                Ноябрь 2026
              </button>
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                }
                className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-100"
                aria-label="Следующий месяц"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <div key={d} className="py-2 px-3 border-r border-slate-200 last:border-r-0">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
            {calendarDays.map((cell) => {
              const dayTasks = filteredTasks.filter((t) => t.dueDate === cell.iso);
              return (
                <div
                  key={cell.iso}
                  className={`min-h-[112px] p-2 space-y-1.5 ${
                    cell.inMonth ? 'bg-white' : 'bg-slate-50/70 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span className={cell.inMonth ? 'font-medium text-slate-700' : 'text-slate-400'}>
                      {cell.date.getDate()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setStartDate(cell.iso);
                        setDueDate(cell.iso);
                        setAssignee(engineerName);
                        setShowCreateModal(true);
                      }}
                      title="Добавить задачу на эту дату"
                      className="text-slate-400 hover:text-sky-600 text-xs px-1"
                    >
                      +
                    </button>
                  </div>

                  <div className="space-y-1">
                    {dayTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onFocusTask(t.id)}
                        className="w-full text-left px-2 py-1 text-[11px] bg-slate-50 hover:bg-sky-50 border border-slate-200 rounded truncate transition-colors"
                      >
                        <span className="font-mono font-semibold text-slate-700">{t.id}</span>{' '}
                        <span className="text-slate-800">{t.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : viewMode === 'todo' ? (
        /* 4. INTERACTIVE TODO & CHECKLISTS VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredTasks.map((task) => {
            const items = task.checklist || [];
            const doneCount = items.filter((c) => c.done).length;
            return (
              <section
                key={task.id}
                className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-slate-500">
                      {task.id} · {task.subsystem} · {TASK_STATUS_LABELS[task.status]}
                    </div>
                    <button
                      type="button"
                      onClick={() => onFocusTask(task.id)}
                      className="text-sm font-semibold text-slate-900 hover:text-sky-700 text-left mt-0.5"
                    >
                      {task.title}
                    </button>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                    {doneCount}/{items.length}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {items.length === 0 ? (
                    <div className="text-xs text-slate-400">
                      Чек-лист пуст — добавьте первый шаг ниже.
                    </div>
                  ) : (
                    items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleToggleChecklistItem(task, item.id)}
                        className="w-full flex items-start gap-2.5 text-left py-1 px-1.5 rounded hover:bg-slate-50 transition-colors"
                      >
                        {item.done ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <span
                          className={`text-xs leading-relaxed ${
                            item.done ? 'line-through text-slate-400' : 'text-slate-800'
                          }`}
                        >
                          {item.text}
                        </span>
                      </button>
                    ))
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddChecklistItem(task);
                  }}
                  className="flex items-center gap-2 pt-2 border-t border-slate-100"
                >
                  <input
                    type="text"
                    value={todoDrafts[task.id] || ''}
                    onChange={(e) =>
                      setTodoDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))
                    }
                    placeholder="Добавить пункт чек-листа..."
                    className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
                  >
                    Добавить
                  </button>
                </form>
              </section>
            );
          })}
        </div>
      ) : (
        /* 5. DENSE TABLE VIEW */
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">ID</th>
                <th className="py-2.5 px-4">Подсистема</th>
                <th className="py-2.5 px-4">Задача</th>
                <th className="py-2.5 px-4">Статус</th>
                <th className="py-2.5 px-4">Прогресс</th>
                <th className="py-2.5 px-4">Приоритет</th>
                <th className="py-2.5 px-4">Ответственный</th>
                <th className="py-2.5 px-4 text-right">Срок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredTasks.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => onFocusTask(task.id)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-700 whitespace-nowrap">
                    {task.id}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                    {task.subsystem}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">
                    {task.title}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                    {TASK_STATUS_LABELS[task.status]}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                    {task.progressPct ?? 0}%
                  </td>
                  <td className={`py-2.5 px-4 text-xs whitespace-nowrap ${PRIORITY_TEXT_CLASS[task.priority]}`}>
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                    {task.assignee}
                  </td>
                  <td className="py-2.5 px-4 text-xs font-mono tabular-nums text-slate-500 text-right whitespace-nowrap">
                    {task.dueDate || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Task Detail Drawer */}
      {activeTask && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
          <div className="w-full max-w-lg bg-white h-full border-l border-slate-200 shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="text-xs font-mono font-semibold text-slate-600">
                {activeTask.id} · {SUBSYSTEM_LABELS[activeTask.subsystem]}
              </div>
              <button
                type="button"
                onClick={() => onFocusTask(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Название задачи
                </label>
                <input
                  type="text"
                  value={activeTask.title}
                  onChange={(e) => onUpdateTask(activeTask.id, { title: e.target.value })}
                  className="w-full px-3 py-2 text-base font-semibold text-slate-900 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Статус
                  </label>
                  <select
                    value={activeTask.status}
                    onChange={(e) =>
                      onUpdateTask(activeTask.id, { status: e.target.value as TaskStatus })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {TASK_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Приоритет
                  </label>
                  <select
                    value={activeTask.priority}
                    onChange={(e) =>
                      onUpdateTask(activeTask.id, { priority: e.target.value as TaskPriority })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    {(['low', 'medium', 'high', 'critical'] as TaskPriority[]).map((p) => (
                      <option key={p} value={p}>
                        {TASK_PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Начало (Гант)
                  </label>
                  <input
                    type="date"
                    value={activeTask.startDate || ''}
                    onChange={(e) => onUpdateTask(activeTask.id, { startDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Срок (Дедлайн)
                  </label>
                  <input
                    type="date"
                    value={activeTask.dueDate || ''}
                    onChange={(e) => onUpdateTask(activeTask.id, { dueDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Подсистема
                  </label>
                  <select
                    value={activeTask.subsystem}
                    onChange={(e) =>
                      onUpdateTask(activeTask.id, { subsystem: e.target.value as Subsystem })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    {(Object.keys(SUBSYSTEM_LABELS) as Subsystem[]).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Ответственный
                  </label>
                  <input
                    type="text"
                    value={activeTask.assignee}
                    onChange={(e) => onUpdateTask(activeTask.id, { assignee: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-slate-500">Прогресс выполнения</span>
                  <span className="font-mono tabular-nums text-slate-800">
                    {activeTask.progressPct ?? 0}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={activeTask.progressPct ?? 0}
                  onChange={(e) =>
                    onUpdateTask(activeTask.id, { progressPct: Number(e.target.value) })
                  }
                  className="w-full accent-sky-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Техническое описание
                </label>
                <textarea
                  rows={3}
                  value={activeTask.description}
                  onChange={(e) => onUpdateTask(activeTask.id, { description: e.target.value })}
                  className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Программа mBlock
                  </label>
                  <select
                    value={activeTask.linkedProgramId || ''}
                    onChange={(e) =>
                      onUpdateTask(activeTask.id, {
                        linkedProgramId: e.target.value || undefined,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    <option value="">Без привязки</option>
                    {programs.map((prog) => (
                      <option key={prog.id} value={prog.id}>
                        {prog.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Канал обсуждения
                  </label>
                  <select
                    value={activeTask.linkedChannel || 'general'}
                    onChange={(e) =>
                      onUpdateTask(activeTask.id, {
                        linkedChannel: e.target.value as ChatChannelId,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    {CHAT_CHANNELS.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        #{ch.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-2">
                {activeTask.linkedProgramId && (
                  <button
                    type="button"
                    onClick={() => {
                      const progId = activeTask.linkedProgramId!;
                      onFocusTask(null);
                      onOpenProgram(progId);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700"
                  >
                    <Cpu className="w-4 h-4" />
                    Открыть программу в mBlock
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const target = activeTask;
                    onFocusTask(null);
                    onDiscussTask(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  <MessageSquare className="w-4 h-4" />
                  Обсудить в техчате
                </button>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  onDeleteTask(activeTask.id);
                  onFocusTask(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 hover:text-rose-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Удалить задачу
              </button>
              <button
                type="button"
                onClick={() => onFocusTask(null)}
                className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-lg p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-900">
              Новая задача · {projectName}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Заголовок задачи
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Настроить порог обогрева Li-Ion АКБ"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Подсистема
                  </label>
                  <select
                    value={subsystem}
                    onChange={(e) => setSubsystem(e.target.value as Subsystem)}
                    className="w-full px-2 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    {(Object.keys(SUBSYSTEM_LABELS) as Subsystem[]).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Приоритет
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full px-2 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    {(['low', 'medium', 'high', 'critical'] as TaskPriority[]).map((p) => (
                      <option key={p} value={p}>
                        {TASK_PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Начало
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-2 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Дедлайн
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-2 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ответственный инженер
                  </label>
                  <input
                    type="text"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Канал техчата
                  </label>
                  <select
                    value={linkedChannel}
                    onChange={(e) => setLinkedChannel(e.target.value as ChatChannelId)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    {CHAT_CHANNELS.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        #{ch.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Связанная программа mBlock (необязательно)
                </label>
                <select
                  value={linkedProgramId}
                  onChange={(e) => setLinkedProgramId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                >
                  <option value="">Не выбрана</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.subsystem} · {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Технические детали и критерии приёмки
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Опишите параметры, пины, телеметрию или ожидаемое поведение на стенде..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700"
              >
                Создать задачу
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
