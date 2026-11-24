import React, { useMemo, useState } from 'react';
import { Plus, Search, MessageSquare, Cpu, Trash2, X } from 'lucide-react';
import type {
  ChatChannelId,
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
}

const STATUS_ORDER: TaskStatus[] = ['backlog', 'in_progress', 'review', 'done'];
const SUBSYSTEM_FILTERS: ('ALL' | Subsystem)[] = ['ALL', 'OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'];

const PRIORITY_TEXT_CLASS: Record<TaskPriority, string> = {
  low: 'text-slate-500',
  medium: 'text-sky-700',
  high: 'text-amber-700',
  critical: 'text-rose-700 font-semibold',
};

export const TaskBoard: React.FC<TaskBoardProps> = ({
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
}) => {
  const [subsystemFilter, setSubsystemFilter] = useState<'ALL' | Subsystem>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subsystem, setSubsystem] = useState<Subsystem>('OBC');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assignee, setAssignee] = useState(engineerName);
  const [linkedProgramId, setLinkedProgramId] = useState('');
  const [linkedChannel, setLinkedChannel] = useState<ChatChannelId>('obc-firmware');
  const [dueDate, setDueDate] = useState('2026-12-01');

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (subsystemFilter !== 'ALL' && t.subsystem !== subsystemFilter) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.assignee.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [tasks, subsystemFilter, searchQuery]);

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === focusedTaskId) || null,
    [tasks, focusedTaskId]
  );

  const subsystemProgress = useMemo(() => {
    const subs: Subsystem[] = ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'];
    return subs.map((sub) => {
      const subTasks = tasks.filter((t) => t.subsystem === sub);
      const total = subTasks.length;
      const done = subTasks.filter((t) => t.status === 'done').length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return { sub, total, done, pct };
    });
  }, [tasks]);

  const overallStats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [tasks]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreateTask({
      title: title.trim(),
      description: description.trim(),
      subsystem,
      status: 'backlog',
      priority,
      assignee: assignee.trim() || engineerName,
      linkedProgramId: linkedProgramId || undefined,
      linkedChannel: linkedChannel || undefined,
      dueDate: dueDate || undefined,
    });
    setTitle('');
    setDescription('');
    setLinkedProgramId('');
    setShowCreateModal(false);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Управление задачами кубсата school76
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Координация подсистем OBC, EPS, ADCS, связи и полезной нагрузки с привязкой к программам mBlock
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
              className="pl-9 pr-3 py-1.5 w-64 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Доска
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Таблица
            </button>
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

      {/* Loading / Empty / Kanban / Table */}
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
            Создайте новую задачу для подсистемы кубсата или сбросьте поисковый запрос.
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
                          {task.dueDate && (
                            <span className="font-mono tabular-nums shrink-0">
                              {task.dueDate}
                            </span>
                          )}
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
      ) : (
        /* Dense Table View */
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">ID</th>
                <th className="py-2.5 px-4">Подсистема</th>
                <th className="py-2.5 px-4">Задача</th>
                <th className="py-2.5 px-4">Статус</th>
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

      {/* Task Detail Drawer / Modal */}
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
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Техническое описание
                </label>
                <textarea
                  rows={4}
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
              Новая задача по разработке кубсата
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Подсистема
                  </label>
                  <select
                    value={subsystem}
                    onChange={(e) => setSubsystem(e.target.value as Subsystem)}
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-md"
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
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-md"
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
                    Срок
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-md"
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
