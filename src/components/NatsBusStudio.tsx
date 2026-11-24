import React, { useCallback, useEffect, useState } from 'react';
import { Radio, RefreshCw, Send } from 'lucide-react';
import type { AuthFetchFn } from '../providers/refineDataProvider.ts';

interface NatsStream {
  name: string;
  subjects: string[];
  retention: string;
  messages: number;
  bytes: number;
}

interface NatsMessage {
  seq: number;
  stream: string;
  subject: string;
  payload: unknown;
  publisher: string;
  timestamp: string;
}

interface NatsBusStudioProps {
  authFetch: AuthFetchFn;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
}

const QUICK_FILTERS = ['>', 'cubesat.>', 'crm.>', 'dify.>', 'tinacms.>'];

export const NatsBusStudio: React.FC<NatsBusStudioProps> = ({
  authFetch,
  isAuthenticated,
  onRequireAuth,
}) => {
  const [subjectFilter, setSubjectFilter] = useState('>');
  const [streams, setStreams] = useState<NatsStream[]>([]);
  const [messages, setMessages] = useState<NatsMessage[]>([]);
  const [mode, setMode] = useState('embedded-jetstream');
  const [pubSubject, setPubSubject] = useState('cubesat.obc.ping');
  const [pubPayload, setPubPayload] = useState('{"mode":"NOMINAL","vbatMv":8160,"tempC":22.1}');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadMessages = useCallback(async (filter: string) => {
    const res = await fetch(`/api/nats/messages?subject=${encodeURIComponent(filter)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.status?.mode) setMode(data.status.mode);
    if (Array.isArray(data.status?.streams)) setStreams(data.status.streams);
    if (Array.isArray(data.messages)) setMessages(data.messages);
  }, []);

  useEffect(() => {
    void loadMessages(subjectFilter);
  }, [subjectFilter, loadMessages]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setErrorMsg(null);
    let parsedPayload: unknown = pubPayload;
    try {
      parsedPayload = JSON.parse(pubPayload);
    } catch {
      parsedPayload = { text: pubPayload };
    }

    const res = await authFetch('/api/nats/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: pubSubject.trim(),
        payload: parsedPayload,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErrorMsg(json.error || 'Ошибка публикации в NATS');
      return;
    }
    await loadMessages(subjectFilter);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* JetStream Streams & Publish */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-900">NATS JetStream</span>
            </div>
            <span className="font-mono text-[11px] text-emerald-700">{mode}</span>
          </div>

          <div className="space-y-2">
            {streams.map((st) => (
              <button
                key={st.name}
                type="button"
                onClick={() => setSubjectFilter(st.subjects[0] || '>')}
                className="w-full text-left p-2.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-white transition-colors"
              >
                <div className="flex items-center justify-between text-xs font-mono font-semibold text-slate-900">
                  <span>{st.name}</span>
                  <span className="text-sky-700">{st.messages} msgs</span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  subjects: {st.subjects.join(', ')} · {st.bytes} B
                </div>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handlePublish} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="text-xs font-bold text-slate-900">Публикация события в NATS</div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Subject</label>
            <input
              value={pubSubject}
              onChange={(e) => setPubSubject(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Payload (JSON или текст)
            </label>
            <textarea
              rows={3}
              value={pubPayload}
              onChange={(e) => setPubPayload(e.target.value)}
              className="w-full p-2.5 text-xs font-mono border border-slate-200 rounded-md bg-slate-50"
            />
          </div>
          {errorMsg && <div className="text-xs text-rose-700">{errorMsg}</div>}
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800"
          >
            <Send className="w-3.5 h-3.5" />
            Publish в JetStream
          </button>
        </form>
      </div>

      {/* Live Messages */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSubjectFilter(f)}
                className={`px-2.5 py-1 text-[11px] font-mono rounded-md ${
                  subjectFilter === f
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              placeholder="Фильтр subject..."
              className="px-2.5 py-1 text-xs font-mono border border-slate-200 rounded-md w-44"
            />
            <button
              type="button"
              onClick={() => void loadMessages(subjectFilter)}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-2 max-h-[460px] overflow-y-auto">
          {messages.map((m) => (
            <div
              key={m.seq}
              className="p-3 rounded-md border border-slate-200 bg-slate-50 space-y-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">#{m.seq}</span>
                  <span className="font-bold text-sky-700">{m.subject}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                    {m.stream}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {m.publisher} · {new Date(m.timestamp).toLocaleTimeString('ru-RU')}
                </span>
              </div>
              <pre className="text-[11px] font-mono text-slate-800 whitespace-pre-wrap break-all">
                {typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
