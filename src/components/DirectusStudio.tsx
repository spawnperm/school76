import React, { useCallback, useEffect, useState } from 'react';
import { Database, Play, Plus, RefreshCw, Table2, Workflow } from 'lucide-react';
import type { AuthFetchFn } from '../providers/refineDataProvider.ts';

interface DirectusField {
  field: string;
  type: string;
  interface: string;
  required?: boolean;
  readOnly?: boolean;
  options?: string[];
}

interface DirectusCollection {
  collection: string;
  label: string;
  note: string;
  primaryKey: string;
  fields: DirectusField[];
}

interface DirectusFlow {
  id: string;
  name: string;
  trigger: string;
  collection: string;
  description: string;
  runCount: number;
  lastRunAt?: string;
}

interface DirectusStudioProps {
  authFetch: AuthFetchFn;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
}

export const DirectusStudio: React.FC<DirectusStudioProps> = ({
  authFetch,
  isAuthenticated,
  onRequireAuth,
}) => {
  const [collections, setCollections] = useState<DirectusCollection[]>([]);
  const [activeCollection, setActiveCollection] = useState<string>('crm_deals');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [flows, setFlows] = useState<DirectusFlow[]>([]);
  const [flowResult, setFlowResult] = useState<string | null>(null);
  const [serverVersion, setServerVersion] = useState<string>('Directus 11.4');
  const [newJsonDraft, setNewJsonDraft] = useState<string>(
    JSON.stringify(
      {
        title: 'Спонсорский комплект радиокомпонентов',
        organization: 'Радиоклуб school76',
        stage: 'lead',
        amountRub: 95000,
        subsystem: 'COMMS',
      },
      null,
      2
    )
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadMetadata = useCallback(async () => {
    const [infoRes, colRes, flowRes] = await Promise.all([
      fetch('/api/directus/server/info').then((r) => r.json()),
      fetch('/api/directus/collections').then((r) => r.json()),
      fetch('/api/directus/flows').then((r) => r.json()),
    ]);
    if (infoRes?.version) setServerVersion(infoRes.version);
    if (Array.isArray(colRes?.data)) setCollections(colRes.data);
    if (Array.isArray(flowRes?.data)) setFlows(flowRes.data);
  }, []);

  const loadItems = useCallback(async (collection: string) => {
    const res = await fetch(`/api/directus/items/${encodeURIComponent(collection)}`);
    if (!res.ok) return;
    const json = await res.json();
    setItems(Array.isArray(json.data) ? json.data : []);
  }, []);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    void loadItems(activeCollection);
  }, [activeCollection, loadItems]);

  const currentMeta = collections.find((c) => c.collection === activeCollection);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setStatusMsg(null);
    try {
      const payload = JSON.parse(newJsonDraft);
      const res = await authFetch(`/api/directus/items/${encodeURIComponent(activeCollection)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatusMsg(json.error || 'Ошибка создания записи');
        return;
      }
      setStatusMsg(`Запись добавлена в коллекцию ${activeCollection}`);
      await loadItems(activeCollection);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Некорректный JSON');
    }
  };

  const handleRunFlow = async (flowId: string) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const res = await authFetch(`/api/directus/flows/${encodeURIComponent(flowId)}/trigger`, {
      method: 'POST',
    });
    const json = await res.json();
    if (!res.ok) {
      setFlowResult(json.error || 'Ошибка запуска Flow');
      return;
    }
    setFlowResult(json.summary || 'Flow выполнен');
    await loadMetadata();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Sidebar Collections */}
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-600" />
              <span className="text-xs font-bold text-slate-900">Directus Collections</span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">{serverVersion}</span>
          </div>
          <div className="space-y-1">
            {collections.map((c) => (
              <button
                key={c.collection}
                type="button"
                onClick={() => setActiveCollection(c.collection)}
                className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between ${
                  activeCollection === c.collection
                    ? 'bg-sky-50 text-sky-900 font-semibold border border-sky-200'
                    : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <span className="truncate">{c.label}</span>
                <span className="font-mono text-[10px] text-slate-400">{c.collection}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Directus Flows */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Workflow className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-900">Directus Flows</span>
          </div>
          <div className="space-y-2">
            {flows.map((f) => (
              <div key={f.id} className="p-2.5 rounded-md border border-slate-200 bg-slate-50 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => void handleRunFlow(f.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 shrink-0"
                  >
                    <Play className="w-2.5 h-2.5" />
                    Запуск
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">{f.description}</p>
                <div className="text-[10px] font-mono text-slate-400">
                  Выполнений: {f.runCount} · Триггер: {f.trigger}
                </div>
              </div>
            ))}
          </div>
          {flowResult && (
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
              {flowResult}
            </div>
          )}
        </div>
      </div>

      {/* Main Data Studio */}
      <div className="lg:col-span-9 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900">
                {currentMeta?.label || activeCollection}
              </h3>
              <span className="font-mono text-xs text-slate-400">/{activeCollection}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{currentMeta?.note}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadItems(activeCollection)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Обновить ({items.length})
          </button>
        </div>

        {/* Fields Schema Strip */}
        {currentMeta && (
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Поля схемы Directus & Zod
            </div>
            <div className="flex flex-wrap gap-2">
              {currentMeta.fields.map((f) => (
                <div
                  key={f.field}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-slate-50 text-[11px] font-mono"
                >
                  <span className="font-semibold text-slate-800">{f.field}</span>
                  <span className="text-slate-400">: {f.type}</span>
                  {f.required && <span className="text-rose-600 ml-1">*</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  {(currentMeta?.fields || []).map((f) => (
                    <th key={f.field} className="py-2 px-3 whitespace-nowrap">
                      {f.field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row, idx) => (
                  <tr key={String(row.id || idx)} className="hover:bg-slate-50">
                    {(currentMeta?.fields || []).map((f) => (
                      <td
                        key={f.field}
                        className="py-2 px-3 font-mono text-[11px] text-slate-700 max-w-[220px] truncate"
                      >
                        {row[f.field] !== undefined && row[f.field] !== null
                          ? String(row[f.field])
                          : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Directus JSON Item Creator */}
        {(activeCollection === 'crm_deals' ||
          activeCollection === 'crm_contacts' ||
          activeCollection === 'cubesat_tasks') && (
          <form
            onSubmit={handleCreateItem}
            className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                Быстрое создание записи через REST POST /api/directus/items/{activeCollection}
              </span>
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Создать запись
              </button>
            </div>
            <textarea
              rows={4}
              value={newJsonDraft}
              onChange={(e) => setNewJsonDraft(e.target.value)}
              className="w-full font-mono text-xs p-2.5 border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:border-sky-500"
            />
            {statusMsg && <div className="text-xs text-sky-800 font-medium">{statusMsg}</div>}
          </form>
        )}
      </div>
    </div>
  );
};
