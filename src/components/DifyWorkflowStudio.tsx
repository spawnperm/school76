import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bot, CheckCircle2, Loader2, Play } from 'lucide-react';
import type { AuthFetchFn } from '../providers/refineDataProvider.ts';

interface DifyNode {
  id: string;
  type: string;
  title: string;
  description: string;
}

interface DifyWorkflow {
  id: string;
  name: string;
  mode: string;
  description: string;
  defaultQuery: string;
  nodes: DifyNode[];
}

interface DifyRunResult {
  runId: string;
  workflowId: string;
  workflowName: string;
  provider: string;
  status: string;
  query: string;
  answer: string;
  durationMs: number;
  totalTokens: number;
  traces: Array<{
    nodeId: string;
    title: string;
    status: string;
    durationMs: number;
    outputs: Record<string, unknown>;
  }>;
  createdAt: string;
}

interface DifyWorkflowStudioProps {
  authFetch: AuthFetchFn;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  activeProjectId: string;
}

export const DifyWorkflowStudio: React.FC<DifyWorkflowStudioProps> = ({
  authFetch,
  isAuthenticated,
  onRequireAuth,
  activeProjectId,
}) => {
  const [workflows, setWorkflows] = useState<DifyWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState<string>('wf-wiki-rag');
  const [query, setQuery] = useState<string>('');
  const [runs, setRuns] = useState<DifyRunResult[]>([]);
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadWorkflows = useCallback(async () => {
    const res = await fetch('/api/dify/workflows');
    if (!res.ok) return;
    const data = await res.json();
    const list: DifyWorkflow[] = Array.isArray(data.workflows) ? data.workflows : [];
    setWorkflows(list);
    if (Array.isArray(data.runs)) setRuns(data.runs);
    if (list.length > 0 && !query) {
      setQuery(list[0].defaultQuery);
    }
  }, [query]);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const activeWf = workflows.find((w) => w.id === selectedId) || workflows[0];

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    if (!activeWf) return;
    setRunning(true);
    setErrorMsg(null);
    try {
      const res = await authFetch(`/api/dify/workflows/${encodeURIComponent(activeWf.id)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim() || activeWf.defaultQuery,
          projectId: activeProjectId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || 'Ошибка запуска пайплайна Dify');
        return;
      }
      if (json.run) {
        setRuns((prev) => [json.run, ...prev]);
      }
    } finally {
      setRunning(false);
    }
  };

  const latestRun = runs[0] || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Workflow List */}
      <div className="lg:col-span-4 space-y-3">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-900">Dify LLMOps Workflows</span>
          </div>
          <div className="space-y-2">
            {workflows.map((wf) => (
              <button
                key={wf.id}
                type="button"
                onClick={() => {
                  setSelectedId(wf.id);
                  setQuery(wf.defaultQuery);
                }}
                className={`w-full text-left p-3 rounded-md border text-xs transition-colors ${
                  activeWf?.id === wf.id
                    ? 'bg-indigo-50 border-indigo-200 text-slate-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                }`}
              >
                <div className="font-semibold">{wf.name}</div>
                <div className="text-[11px] text-slate-500 mt-1">{wf.description}</div>
                <div className="text-[10px] font-mono text-indigo-700 mt-1.5">
                  {wf.nodes.length} узлов DAG · mode: {wf.mode}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DAG Visualizer + Runner */}
      <div className="lg:col-span-8 space-y-4">
        {activeWf && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{activeWf.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{activeWf.description}</p>
            </div>

            {/* Visual DAG Nodes */}
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              {activeWf.nodes.map((node, idx) => (
                <React.Fragment key={node.id}>
                  <div className="bg-white border border-slate-200 rounded-md px-3 py-2 min-w-[130px]">
                    <div className="text-[10px] font-mono text-indigo-600 uppercase">{node.type}</div>
                    <div className="text-xs font-semibold text-slate-900">{node.title}</div>
                  </div>
                  {idx < activeWf.nodes.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>

            <form onSubmit={handleRun} className="space-y-2.5">
              <label className="block text-[11px] font-semibold text-slate-600">
                Запрос для выполнения пайплайна Dify
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-md"
                  placeholder="Введите вопрос или задачу..."
                />
                <button
                  type="submit"
                  disabled={running}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 shrink-0"
                >
                  {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Запустить DAG
                </button>
              </div>
              {errorMsg && <div className="text-xs text-rose-700">{errorMsg}</div>}
            </form>
          </div>
        )}

        {/* Latest Run Trace */}
        {latestRun && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Результат запуска {latestRun.runId}
              </div>
              <div className="text-[11px] font-mono text-slate-500">
                {latestRun.provider} · {latestRun.totalTokens} tokens · {latestRun.durationMs} мс
              </div>
            </div>
            <div className="p-3 rounded-md bg-indigo-50/60 border border-indigo-200 text-xs text-slate-900 leading-relaxed whitespace-pre-wrap">
              {latestRun.answer}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {latestRun.traces.map((tr) => (
                <div
                  key={tr.nodeId}
                  className="p-2 rounded border border-slate-200 bg-slate-50 text-[11px]"
                >
                  <div className="font-semibold text-slate-800 truncate">{tr.title}</div>
                  <div className="font-mono text-[10px] text-emerald-700 mt-0.5">
                    {tr.status} · {tr.durationMs} мс
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
