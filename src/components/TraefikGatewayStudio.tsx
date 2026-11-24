import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Plus, ShieldCheck } from 'lucide-react';
import type { AuthFetchFn } from '../providers/refineDataProvider.ts';

interface TraefikRouter {
  id: string;
  rule: string;
  service: string;
  entryPoints: string[];
  middlewares: string[];
  tls: boolean;
  enabled: boolean;
  targetPort: number;
  requestsCount: number;
  avgLatencyMs: number;
}

interface TraefikMiddleware {
  id: string;
  type: string;
  description: string;
  active: boolean;
}

interface TraefikGatewayStudioProps {
  authFetch: AuthFetchFn;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
}

export const TraefikGatewayStudio: React.FC<TraefikGatewayStudioProps> = ({
  authFetch,
  isAuthenticated,
  onRequireAuth,
}) => {
  const [routers, setRouters] = useState<TraefikRouter[]>([]);
  const [middlewares, setMiddlewares] = useState<TraefikMiddleware[]>([]);
  const [yamlConfig, setYamlConfig] = useState('');
  const [newId, setNewId] = useState('');
  const [newRule, setNewRule] = useState('PathPrefix(`/api/custom`)');
  const [newService, setNewService] = useState('custom-microservice');
  const [newPort, setNewPort] = useState('3000');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    const res = await fetch('/api/traefik/overview');
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.routers)) setRouters(data.routers);
    if (Array.isArray(data.middlewares)) setMiddlewares(data.middlewares);
    if (typeof data.dynamicYaml === 'string') setYamlConfig(data.dynamicYaml);
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleToggleRouter = async (router: TraefikRouter) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const res = await authFetch(`/api/traefik/routers/${encodeURIComponent(router.id)}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !router.enabled }),
    });
    if (res.ok) {
      await loadOverview();
    }
  };

  const handleToggleMiddleware = async (mw: TraefikMiddleware) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const res = await authFetch(`/api/traefik/middlewares/${encodeURIComponent(mw.id)}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !mw.active }),
    });
    if (res.ok) {
      await loadOverview();
    }
  };

  const handleAddRouter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setErrorMsg(null);
    const res = await authFetch('/api/traefik/routers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newId.trim(),
        rule: newRule.trim(),
        service: newService.trim(),
        targetPort: Number(newPort) || 3000,
        entryPoints: ['websecure'],
        middlewares: ['security-headers'],
        tls: true,
        enabled: true,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErrorMsg(json.error || 'Ошибка добавления маршрута');
      return;
    }
    setNewId('');
    await loadOverview();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Routers */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Traefik v3 HTTP Routers (активное middleware Express)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              EntryPoints: :80, :443 (TLS), :4222 (NATS)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 px-3">Router</th>
                  <th className="py-2 px-3">Rule</th>
                  <th className="py-2 px-3">Service</th>
                  <th className="py-2 px-3">Traffic</th>
                  <th className="py-2 px-3 text-right">Состояние</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {routers.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-semibold text-slate-900">{r.id}</td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{r.rule}</td>
                    <td className="py-2 px-3 font-mono text-[11px] text-sky-700">
                      {r.service}:{r.targetPort}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                      {r.requestsCount} req · {r.avgLatencyMs}ms
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleToggleRouter(r)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                          r.enabled
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {r.enabled ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleAddRouter} className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-5 gap-2">
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="id (напр. telemetry-gw)"
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
              required
            />
            <input
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder="Rule"
              className="sm:col-span-2 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
              required
            />
            <input
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              placeholder="Port"
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800"
            >
              <Plus className="w-3.5 h-3.5" />
              Router
            </button>
          </form>
          {errorMsg && <div className="text-xs text-rose-700">{errorMsg}</div>}
        </div>

        {/* Middlewares */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Middlewares</h3>
          </div>
          <div className="space-y-2">
            {middlewares.map((mw) => (
              <div
                key={mw.id}
                className="p-2.5 rounded-md border border-slate-200 bg-slate-50 flex items-start justify-between gap-2"
              >
                <div>
                  <div className="text-xs font-mono font-semibold text-slate-900">
                    {mw.id} <span className="text-slate-400">({mw.type})</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{mw.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleMiddleware(mw)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 ${
                    mw.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {mw.active ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dynamic YAML */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
        <div className="text-xs font-bold text-slate-900">
          Сгенерированная динамическая конфигурация Traefik (traefik-dynamic.yml)
        </div>
        <pre className="p-3 rounded-md bg-slate-900 text-sky-100 text-[11px] font-mono overflow-x-auto max-h-64">
          {yamlConfig}
        </pre>
      </div>
    </div>
  );
};
