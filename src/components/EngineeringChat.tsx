import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Code2,
  Cpu,
  ListChecks,
  Copy,
  Check,
  X,
  Terminal,
  AlertCircle,
} from 'lucide-react';
import type {
  ChatChannelId,
  ChatMessage,
  CommunityProject,
  CubeSatTask,
  OnboardProgram,
  Subsystem,
  TeamPresence,
} from '../types/cubesat.ts';
import {
  CHAT_CHANNELS,
  MISSION_STAGE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from '../types/cubesat.ts';
import type { EngineerProfile } from '../hooks/useMissionSync.ts';
import { filterProjectPrograms, filterProjectTasks } from '../constants/subsystems.ts';
import { formatTimeRu, useCopyFeedback } from '../utils/formatters.ts';

interface EngineeringChatProps {
  projectId: string;
  projectName: string;
  project?: CommunityProject;
  messages: ChatMessage[];
  tasks: CubeSatTask[];
  programs: OnboardProgram[];
  presence: TeamPresence[];
  connected: boolean;
  profile: EngineerProfile;
  activeChannel: ChatChannelId;
  onSelectChannel: (channel: ChatChannelId) => void;
  draftTaskRefId: string | null;
  draftProgramRefId: string | null;
  onClearDraftRefs: () => void;
  onSendMessage: (payload: Omit<ChatMessage, 'id' | 'createdAt'>) => void;
  onOpenTask: (taskId: string) => void;
  onOpenProgram: (programId: string) => void;
}

interface SlashCommandContext {
  arg: string;
  projectId: string;
  projectName: string;
  project?: CommunityProject;
  projectTasks: CubeSatTask[];
  projectPrograms: OnboardProgram[];
  presence: TeamPresence[];
  connected: boolean;
  activeChannelTitle: string;
  activeChannelTopic: string;
  channelMessageCount: number;
  profile: EngineerProfile;
}

interface SlashCommandResult {
  text: string;
  taskRefId?: string;
  programRefId?: string;
}

interface SlashCommandSpec {
  name: string;
  usage: string;
  description: string;
  aliases?: string[];
  build: (ctx: SlashCommandContext) => SlashCommandResult;
}

const VALID_SUBSYSTEMS: Subsystem[] = [
  'OBC',
  'EPS',
  'ADCS',
  'COMMS',
  'PAYLOAD',
  'GROUND',
];

const SLASH_COMMANDS: SlashCommandSpec[] = [
  {
    name: '/status',
    usage: '/status',
    description: 'Сводка по проекту, задачам, ПО mBlock и синхронизации',
    aliases: ['/stat'],
    build: (ctx) => {
      const total = ctx.projectTasks.length;
      const done = ctx.projectTasks.filter((t) => t.status === 'done').length;
      const inProgress = ctx.projectTasks.filter((t) => t.status === 'in_progress').length;
      const review = ctx.projectTasks.filter((t) => t.status === 'review').length;
      const backlog = ctx.projectTasks.filter((t) => t.status === 'backlog').length;
      const openCritical = ctx.projectTasks.filter(
        (t) => t.priority === 'critical' && t.status !== 'done'
      );
      const avgProgress =
        total > 0
          ? Math.round(
              ctx.projectTasks.reduce(
                (acc, t) => acc + (typeof t.progressPct === 'number' ? t.progressPct : t.status === 'done' ? 100 : 0),
                0
              ) / total
            )
          : 0;
      const stageLabel = ctx.project?.lifecycleStage
        ? MISSION_STAGE_LABELS[ctx.project.lifecycleStage]
        : 'Не указан';
      const leadTask =
        openCritical[0] ||
        ctx.projectTasks.find((t) => t.status === 'in_progress' || t.status === 'review');

      const lines = [
        `Системная сводка по проекту «${ctx.projectName}» (${ctx.projectId})`,
        `• Этап миссии: ${stageLabel} · Канал: #${ctx.activeChannelTitle} (сообщений: ${ctx.channelMessageCount})`,
        `• Связь и команда: ${ctx.connected ? 'WebSocket онлайн' : 'Переподключение'} · онлайн инженеров: ${ctx.presence.length}`,
        `• Задачи (${total}, средний прогресс ${avgProgress}%): В работе — ${inProgress}, На проверке — ${review}, Бэклог — ${backlog}, Готово — ${done}`,
        `• Открытые критичные задачи: ${
          openCritical.length > 0
            ? openCritical.map((t) => `${t.id} (${t.subsystem})`).join(', ')
            : 'нет'
        }`,
        `• Бортовое ПО mBlock: ${ctx.projectPrograms.length} прогр.`,
      ];

      return {
        text: lines.join('\n'),
        taskRefId: leadTask?.id,
        programRefId: ctx.projectPrograms[0]?.id,
      };
    },
  },
  {
    name: '/tasks',
    usage: '/tasks [OBC|EPS|ADCS|COMMS|PAYLOAD|GROUND]',
    description: 'Список активных задач проекта (можно указать подсистему)',
    aliases: ['/task'],
    build: (ctx) => {
      const requested = ctx.arg.trim().toUpperCase() as Subsystem | '';
      const isSubsystemFilter =
        requested !== '' && VALID_SUBSYSTEMS.includes(requested as Subsystem);
      const filtered = isSubsystemFilter
        ? ctx.projectTasks.filter((t) => t.subsystem === requested)
        : ctx.projectTasks;

      if (ctx.arg.trim() && !isSubsystemFilter) {
        return {
          text: `Подсистема «${ctx.arg.trim()}» не распознана для проекта «${ctx.projectName}».\nДоступные подсистемы: ${VALID_SUBSYSTEMS.join(', ')}.`,
        };
      }

      if (filtered.length === 0) {
        return {
          text: isSubsystemFilter
            ? `В проекте «${ctx.projectName}» нет задач по подсистеме ${requested}.`
            : `В проекте «${ctx.projectName}» пока нет задач.`,
        };
      }

      const priorityRank: Record<CubeSatTask['priority'], number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      const sorted = [...filtered].sort((a, b) => {
        if ((a.status === 'done') !== (b.status === 'done')) {
          return a.status === 'done' ? 1 : -1;
        }
        return priorityRank[a.priority] - priorityRank[b.priority];
      });
      const shown = sorted.slice(0, 6);
      const header = isSubsystemFilter
        ? `Задачи проекта «${ctx.projectName}» · подсистема ${requested} (${filtered.length}):`
        : `Актуальные задачи проекта «${ctx.projectName}» (показано ${shown.length} из ${filtered.length}):`;
      const rows = shown.map((t) => {
        const pct = typeof t.progressPct === 'number' ? `${t.progressPct}%` : t.status === 'done' ? '100%' : '0%';
        return `• ${t.id} [${t.subsystem}] — ${t.title} · ${TASK_STATUS_LABELS[t.status]} (${pct}, приоритет: ${TASK_PRIORITY_LABELS[t.priority]}, отв.: ${t.assignee})`;
      });
      return {
        text: [header, ...rows].join('\n'),
        taskRefId: sorted[0]?.id,
      };
    },
  },
  {
    name: '/programs',
    usage: '/programs',
    description: 'Реестр бортовых программ mBlock текущего проекта',
    aliases: ['/prog', '/mblock'],
    build: (ctx) => {
      if (ctx.projectPrograms.length === 0) {
        return {
          text: `В проекте «${ctx.projectName}» пока нет сохранённых программ mBlock.`,
        };
      }
      const rows = ctx.projectPrograms.slice(0, 6).map((p) => {
        const versionsCount = p.versions?.length ?? 1;
        return `• ${p.name} [${p.subsystem}] — ${p.targetBoard} · автор: ${p.author} · версий: ${versionsCount}`;
      });
      return {
        text: [
          `Бортовое ПО mBlock проекта «${ctx.projectName}» (${ctx.projectPrograms.length}):`,
          ...rows,
        ].join('\n'),
        programRefId: ctx.projectPrograms[0]?.id,
      };
    },
  },
  {
    name: '/team',
    usage: '/team',
    description: 'Список инженеров проекта, находящихся сейчас онлайн',
    aliases: ['/who'],
    build: (ctx) => {
      const totalMembers = ctx.project?.memberIds.length;
      const header =
        typeof totalMembers === 'number'
          ? `Команда проекта «${ctx.projectName}» — онлайн сейчас: ${ctx.presence.length} (участников в проекте: ${totalMembers}):`
          : `Инженеры онлайн в проекте «${ctx.projectName}» (${ctx.presence.length}):`;
      if (ctx.presence.length === 0) {
        return {
          text: `${header}\n• Активных WebSocket-подключений сейчас нет.`,
        };
      }
      const rows = ctx.presence.map(
        (m) => `• ${m.name} — ${m.role} (${m.subsystem}) · вкладка: ${m.activeTab}`
      );
      return {
        text: [header, ...rows].join('\n'),
      };
    },
  },
  {
    name: '/project',
    usage: '/project',
    description: 'Паспорт текущего проекта: этап, репозитории, S3 и теги',
    aliases: ['/info'],
    build: (ctx) => {
      const stage = ctx.project?.lifecycleStage
        ? MISSION_STAGE_LABELS[ctx.project.lifecycleStage]
        : 'Не задан';
      const tags = ctx.project?.tags?.length ? ctx.project.tags.join(', ') : 'нет';
      const lines = [
        `Паспорт проекта «${ctx.projectName}»`,
        `• ID / Slug: ${ctx.projectId}${ctx.project?.slug ? ` (${ctx.project.slug})` : ''}`,
        `• Категория и этап: ${ctx.project?.category || 'CubeSat'} · ${stage}`,
        `• Репозиторий Forgejo: ${ctx.project?.forgejoRepo || ctx.projectId}`,
        ctx.project?.githubRepo ? `• Зеркало GitHub: ${ctx.project.githubRepo}` : null,
        `• Хранилище S3 / Garage: ${ctx.project?.s3Bucket || `${ctx.projectId}-artifacts`}`,
        `• Теги: ${tags}`,
        `• Текущий канал: #${ctx.activeChannelTitle} (${ctx.activeChannelTopic})`,
      ].filter(Boolean);
      return {
        text: lines.join('\n'),
      };
    },
  },
  {
    name: '/help',
    usage: '/help',
    description: 'Показать список всех быстрых команд чата',
    aliases: ['/?'],
    build: (ctx) => {
      const rows = SLASH_COMMANDS.map((cmd) => `• ${cmd.usage} — ${cmd.description}`);
      return {
        text: [
          `Быстрые системные команды для проекта «${ctx.projectName}» (#${ctx.activeChannelTitle}):`,
          ...rows,
          'Подсказка: начните сообщение с «/» или нажмите на команду над полем ввода, чтобы отправить системное сообщение в канал.',
        ].join('\n'),
      };
    },
  },
];

function findSlashCommand(rawToken: string): SlashCommandSpec | undefined {
  const token = rawToken.toLowerCase();
  return SLASH_COMMANDS.find(
    (cmd) => cmd.name === token || cmd.aliases?.includes(token)
  );
}

export const EngineeringChat: React.FC<EngineeringChatProps> = ({
  projectId,
  projectName,
  project,
  messages,
  tasks,
  programs,
  presence,
  connected,
  profile,
  activeChannel,
  onSelectChannel,
  draftTaskRefId,
  draftProgramRefId,
  onClearDraftRefs,
  onSendMessage,
  onOpenTask,
  onOpenProgram,
}) => {
  const [text, setText] = useState('');
  const [taskRefId, setTaskRefId] = useState<string>('');
  const [programRefId, setProgramRefId] = useState<string>('');
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [codeLang, setCodeLang] = useState<'python' | 'cpp'>('python');
  const [codeText, setCodeText] = useState('');
  const [commandError, setCommandError] = useState<string | null>(null);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);
  const [dismissedAutocomplete, setDismissedAutocomplete] = useState(false);
  const { copiedKey: copiedId, copyText } = useCopyFeedback(1500);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setTaskRefId(draftTaskRefId || '');
    setProgramRefId(draftProgramRefId || '');
  }, [projectId, draftTaskRefId, draftProgramRefId]);

  const projectMessages = useMemo(
    () => messages.filter((m) => (m.projectId || 'school76-1u') === projectId),
    [messages, projectId]
  );

  const projectTasks = useMemo(
    () => filterProjectTasks(tasks, projectId),
    [tasks, projectId]
  );

  const projectPrograms = useMemo(
    () => filterProjectPrograms(programs, projectId),
    [programs, projectId]
  );

  const channelMessages = useMemo(
    () => projectMessages.filter((m) => m.channel === activeChannel),
    [projectMessages, activeChannel]
  );

  const activeChannelMeta =
    CHAT_CHANNELS.find((c) => c.id === activeChannel) || CHAT_CHANNELS[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length, activeChannel]);

  const trimmedInput = text.trimStart();
  const isTypingSlash = trimmedInput.startsWith('/') && !trimmedInput.includes('\n');
  const firstToken = isTypingSlash ? trimmedInput.split(/\s+/)[0].toLowerCase() : '';
  const hasArgsPart = isTypingSlash && /\s/.test(trimmedInput);

  const matchingSuggestions = useMemo(() => {
    if (!isTypingSlash || dismissedAutocomplete || hasArgsPart) return [];
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.name.startsWith(firstToken) ||
        cmd.aliases?.some((a) => a.startsWith(firstToken))
    );
  }, [isTypingSlash, dismissedAutocomplete, hasArgsPart, firstToken]);

  useEffect(() => {
    setSelectedSuggestionIdx(0);
  }, [firstToken, matchingSuggestions.length]);

  const executeSlashCommand = (rawInput: string): boolean => {
    const trimmed = rawInput.trim();
    const spaceIdx = trimmed.search(/\s/);
    const cmdToken = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
    const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

    const spec = findSlashCommand(cmdToken);
    if (!spec) {
      setCommandError(
        `Неизвестная команда «${cmdToken}». Доступно: ${SLASH_COMMANDS.map((c) => c.name).join(', ')}`
      );
      return false;
    }

    const result = spec.build({
      arg,
      projectId,
      projectName,
      project,
      projectTasks,
      projectPrograms,
      presence,
      connected,
      activeChannelTitle: activeChannelMeta.title,
      activeChannelTopic: activeChannelMeta.topic,
      channelMessageCount: channelMessages.length,
      profile,
    });

    onSendMessage({
      projectId,
      channel: activeChannel,
      author: 'Система school76',
      authorRole: `Команда ${spec.name} · ${profile.name}`,
      text: result.text,
      kind: 'system',
      command: spec.name,
      taskRefId: taskRefId || result.taskRefId || undefined,
      programRefId: programRefId || result.programRefId || undefined,
    });

    setCommandError(null);
    setText('');
    setDismissedAutocomplete(false);
    setTaskRefId('');
    setProgramRefId('');
    onClearDraftRefs();
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && !codeText.trim()) return;

    if (trimmed.startsWith('/')) {
      executeSlashCommand(trimmed);
      return;
    }

    setCommandError(null);
    onSendMessage({
      projectId,
      channel: activeChannel,
      author: profile.name,
      authorRole: `${profile.role} · ${profile.subsystem}`,
      text: trimmed,
      kind: 'user',
      taskRefId: taskRefId || undefined,
      programRefId: programRefId || undefined,
      codeSnippet:
        showCodeEditor && codeText.trim()
          ? { lang: codeLang, code: codeText.trim() }
          : undefined,
    });
    setText('');
    setCodeText('');
    setShowCodeEditor(false);
    setTaskRefId('');
    setProgramRefId('');
    onClearDraftRefs();
  };

  const handleQuickCommandClick = (cmd: SlashCommandSpec, e: React.MouseEvent) => {
    if (e.shiftKey || cmd.name === '/tasks') {
      // If user holds Shift or clicks /tasks, allow either immediate execution or arg editing:
      // Actually execute /tasks immediately on regular click, and Shift+Click inserts for filtering.
      if (e.shiftKey) {
        setText(`${cmd.name} `);
        setCommandError(null);
        setDismissedAutocomplete(false);
        textareaRef.current?.focus();
        return;
      }
    }
    executeSlashCommand(cmd.name);
  };

  const handleCopySnippet = (id: string, code: string) => {
    void copyText(id, code);
  };

  return (
    <div className="flex h-[calc(100vh-57px)] bg-slate-50">
      {/* Left Rail: Channels & Real-Time Presence */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between overflow-y-auto">
        <div className="p-4 space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-2 mb-2">
              Технические каналы
            </div>
            <nav className="space-y-0.5">
              {CHAT_CHANNELS.map((ch) => {
                const count = projectMessages.filter((m) => m.channel === ch.id).length;
                const isActive = ch.id === activeChannel;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onSelectChannel(ch.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-sm rounded-md transition-colors text-left ${
                      isActive
                        ? 'bg-sky-50 text-sky-900 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">#{ch.title}</span>
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Команда онлайн
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {presence.length}
              </span>
            </div>
            <div className="space-y-2 px-2">
              {presence.map((member) => (
                <div key={member.clientId} className="text-xs space-y-0.5">
                  <div className="font-medium text-slate-800 truncate">
                    {member.name}
                  </div>
                  <div className="text-slate-500 truncate">
                    {member.subsystem} · {member.role}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>Синхронизация</span>
          <span className={`font-mono ${connected ? 'text-emerald-700' : 'text-amber-700'}`}>
            {connected ? '● WebSocket' : '○ Переподключение'}
          </span>
        </div>
      </aside>

      {/* Main Chat Viewport */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Channel Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">
              #{activeChannelMeta.title}
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {projectName} · {activeChannelMeta.topic}
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
            Сообщений: {channelMessages.length}
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {channelMessages.length === 0 ? (
            <div className="text-center py-16 text-sm text-slate-500">
              В канале #{activeChannelMeta.title} пока нет сообщений. Начните техническое обсуждение или выполните{' '}
              <button
                type="button"
                onClick={() => executeSlashCommand('/status')}
                className="font-mono text-sky-700 hover:underline"
              >
                /status
              </button>
              .
            </div>
          ) : (
            channelMessages.map((msg) => {
              const refTask = msg.taskRefId
                ? tasks.find((t) => t.id === msg.taskRefId)
                : undefined;
              const refProgram = msg.programRefId
                ? programs.find((p) => p.id === msg.programRefId)
                : undefined;
              const timeStr = formatTimeRu(msg.createdAt);
              const isSystem =
                msg.kind === 'system' || msg.author === 'Система school76';

              return (
                <article
                  key={msg.id}
                  className={
                    isSystem
                      ? 'max-w-3xl space-y-2 bg-slate-50 border border-slate-200 border-l-4 border-l-sky-600 rounded-md px-4 py-3'
                      : 'max-w-3xl space-y-1.5 pb-4 border-b border-slate-100 last:border-b-0'
                  }
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {isSystem && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-mono text-[11px] font-medium">
                        <Terminal className="w-3 h-3" />
                        {msg.command || 'СИСТЕМА'}
                      </span>
                    )}
                    <span className="font-semibold text-sm text-slate-900">
                      {msg.author}
                    </span>
                    <span className="text-slate-500">{msg.authorRole}</span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono tabular-nums text-slate-400">
                      {timeStr}
                    </span>
                  </div>

                  <p
                    className={`leading-relaxed whitespace-pre-wrap ${
                      isSystem
                        ? 'text-[13px] text-slate-800'
                        : 'text-sm text-slate-800'
                    }`}
                  >
                    {msg.text}
                  </p>

                  {/* Linked Task / mBlock Program References */}
                  {(refTask || refProgram) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {refTask && (
                        <button
                          type="button"
                          onClick={() => onOpenTask(refTask.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 bg-white hover:bg-sky-50 hover:text-sky-800 border border-slate-200 rounded-md transition-colors text-left"
                        >
                          <ListChecks className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span className="font-mono font-medium">{refTask.id}</span>
                          <span className="truncate max-w-xs">{refTask.title}</span>
                        </button>
                      )}
                      {refProgram && (
                        <button
                          type="button"
                          onClick={() => onOpenProgram(refProgram.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 bg-white hover:bg-sky-50 hover:text-sky-800 border border-slate-200 rounded-md transition-colors text-left"
                        >
                          <Cpu className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span className="font-medium">mBlock:</span>
                          <span className="truncate max-w-xs">{refProgram.name}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Optional Code Snippet */}
                  {msg.codeSnippet && msg.codeSnippet.code && (
                    <div className="mt-2 border border-slate-200 rounded-md overflow-hidden bg-slate-950 text-slate-100">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
                        <span>{msg.codeSnippet.lang === 'python' ? 'MicroPython' : 'Arduino C++'}</span>
                        <button
                          type="button"
                          onClick={() => handleCopySnippet(msg.id, msg.codeSnippet!.code)}
                          className="inline-flex items-center gap-1 text-slate-400 hover:text-white"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedId === msg.id ? 'Скопировано' : 'Копия'}
                        </button>
                      </div>
                      <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed">
                        <code>{msg.codeSnippet.code}</code>
                      </pre>
                    </div>
                  )}
                </article>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="relative px-6 py-4 border-t border-slate-200 bg-slate-50 space-y-2.5"
        >
          {/* Slash Command Autocomplete Popover */}
          {matchingSuggestions.length > 0 && (
            <div
              role="listbox"
              aria-label="Быстрые команды"
              className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden divide-y divide-slate-100"
            >
              <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500 flex items-center justify-between">
                <span>Быстрые команды для проекта «{projectName}»</span>
                <span className="font-mono text-[10px] text-slate-400">
                  Tab — подставить · Enter — выполнить
                </span>
              </div>
              {matchingSuggestions.map((cmd, idx) => {
                const isSelected = idx === selectedSuggestionIdx;
                return (
                  <button
                    key={cmd.name}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setSelectedSuggestionIdx(idx)}
                    onClick={() => executeSlashCommand(cmd.name)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-3 text-xs transition-colors ${
                      isSelected ? 'bg-sky-50 text-sky-900' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Terminal className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span className="font-mono font-semibold text-slate-900 shrink-0">
                        {cmd.usage}
                      </span>
                    </div>
                    <span className="text-slate-500 truncate">{cmd.description}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick Slash Commands Bar */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 mr-1">
              <Terminal className="w-3.5 h-3.5 text-sky-600" />
              Команды:
            </span>
            {SLASH_COMMANDS.map((cmd) => (
              <button
                key={cmd.name}
                type="button"
                title={`${cmd.description} (Shift+клик — вставить в поле)`}
                onClick={(e) => handleQuickCommandClick(cmd, e)}
                className="px-2 py-1 font-mono text-[11px] bg-white border border-slate-200 rounded text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 transition-colors"
              >
                {cmd.name}
              </button>
            ))}
          </div>

          {/* Attachment selectors */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={taskRefId}
              onChange={(e) => setTaskRefId(e.target.value)}
              className="max-w-[220px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">Прикрепить задачу...</option>
              {projectTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.title}
                </option>
              ))}
            </select>

            <select
              value={programRefId}
              onChange={(e) => setProgramRefId(e.target.value)}
              className="max-w-[240px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">Прикрепить mBlock ПО...</option>
              {projectPrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.subsystem} · {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowCodeEditor((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border transition-colors ${
                showCodeEditor
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Фрагмент кода
            </button>

            {(taskRefId || programRefId) && (
              <button
                type="button"
                onClick={() => {
                  setTaskRefId('');
                  setProgramRefId('');
                  onClearDraftRefs();
                }}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
              >
                <X className="w-3.5 h-3.5" />
                Сбросить вложения
              </button>
            )}
          </div>

          {showCodeEditor && (
            <div className="bg-white border border-slate-200 rounded-md p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Бортовой код</span>
                <select
                  value={codeLang}
                  onChange={(e) => setCodeLang(e.target.value as 'python' | 'cpp')}
                  className="px-2 py-0.5 border border-slate-200 rounded text-xs"
                >
                  <option value="python">MicroPython</option>
                  <option value="cpp">Arduino / STM32 C++</option>
                </select>
              </div>
              <textarea
                rows={3}
                value={codeText}
                onChange={(e) => setCodeText(e.target.value)}
                placeholder="Вставьте фрагмент кода из mBlock..."
                className="w-full px-2.5 py-1.5 font-mono text-xs bg-slate-950 text-slate-100 rounded border border-slate-800 focus:outline-none"
              />
            </div>
          )}

          {commandError && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-md">
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="truncate">{commandError}</span>
              </div>
              <button
                type="button"
                onClick={() => executeSlashCommand('/help')}
                className="font-mono font-medium text-sky-700 hover:underline shrink-0"
              >
                Отправить /help
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={2}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setCommandError(null);
                setDismissedAutocomplete(false);
              }}
              onKeyDown={(e) => {
                if (matchingSuggestions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedSuggestionIdx(
                      (prev) => (prev + 1) % matchingSuggestions.length
                    );
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedSuggestionIdx(
                      (prev) =>
                        (prev - 1 + matchingSuggestions.length) %
                        matchingSuggestions.length
                    );
                    return;
                  }
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const picked = matchingSuggestions[selectedSuggestionIdx];
                    if (picked) {
                      setText(picked.name === '/tasks' ? `${picked.name} ` : picked.name);
                    }
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setDismissedAutocomplete(true);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const exact = findSlashCommand(firstToken);
                    const target = exact || matchingSuggestions[selectedSuggestionIdx];
                    if (target) {
                      executeSlashCommand(target.name);
                    }
                    return;
                  }
                }

                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={`Написать в #${activeChannelMeta.title} или введите /status, /help...`}
              className="flex-1 px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" />
              Отправить
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};
