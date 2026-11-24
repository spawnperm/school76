import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Code2, Cpu, ListChecks, Copy, Check, X } from 'lucide-react';
import type {
  ChatChannelId,
  ChatMessage,
  CubeSatTask,
  OnboardProgram,
  TeamPresence,
} from '../types/cubesat.ts';
import { CHAT_CHANNELS } from '../types/cubesat.ts';
import type { EngineerProfile } from '../hooks/useMissionSync.ts';
import { filterProjectPrograms, filterProjectTasks } from '../constants/subsystems.ts';
import { formatTimeRu, useCopyFeedback } from '../utils/formatters.ts';

interface EngineeringChatProps {
  projectId: string;
  projectName: string;
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

export const EngineeringChat: React.FC<EngineeringChatProps> = ({
  projectId,
  projectName,
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
  const { copiedKey: copiedId, copyText } = useCopyFeedback(1500);

  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !codeText.trim()) return;
    onSendMessage({
      projectId,
      channel: activeChannel,
      author: profile.name,
      authorRole: `${profile.role} · ${profile.subsystem}`,
      text: text.trim(),
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
              В канале #{activeChannelMeta.title} пока нет сообщений. Начните техническое обсуждение или прикрепите задачу.
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

              return (
                <article
                  key={msg.id}
                  className="max-w-3xl space-y-1.5 pb-4 border-b border-slate-100 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline gap-2 text-xs">
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

                  <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </p>

                  {/* Linked Task / mBlock Program References */}
                  {(refTask || refProgram) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {refTask && (
                        <button
                          type="button"
                          onClick={() => onOpenTask(refTask.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 bg-slate-50 hover:bg-sky-50 hover:text-sky-800 border border-slate-200 rounded-md transition-colors text-left"
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 bg-slate-50 hover:bg-sky-50 hover:text-sky-800 border border-slate-200 rounded-md transition-colors text-left"
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
          className="px-6 py-4 border-t border-slate-200 bg-slate-50 space-y-2.5"
        >
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

          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={`Написать в #${activeChannelMeta.title} (Enter — отправить, Shift+Enter — перенос)...`}
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
