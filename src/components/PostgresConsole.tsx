import React, { useCallback, useEffect, useState } from 'react';
import { Database, Play, Table } from 'lucide-react';

interface PostgresColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  references?: string;
}

interface PostgresTable {
  name: string;
  description: string;
  rowCount: number;
  columns: PostgresColumn[];
}

interface QueryResult {
  ok: boolean;
  engine: string;
  sql: string;
  durationMs: number;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  error?: string;
}

const PRESET_QUERIES = [
  'SHOW TABLES',
  'SELECT id, title, subsystem, status, progress_pct FROM tasks ORDER BY progress_pct DESC LIMIT 10',
  'SELECT id, title, organization, stage, amount_rub FROM crm_deals ORDER BY amount_rub DESC LIMIT 10',
  'SELECT id, first_name, last_name, organization, segment FROM crm_contacts LIMIT 10',
  'SELECT id, name, subsystem, board_profile FROM programs LIMIT 10',
];

export const PostgresConsole: React.FC = () => {
  const [connection, setConnection] = useState<{
    driver: string;
    database: string;
    dialect: string;
  } | null>(null);
  const [tables, setTables] = useState<PostgresTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('crm_deals');
  const [sql, setSql] = useState<string>(PRESET_QUERIES[2]);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);

  const loadSchema = useCallback(async () => {
    const res = await fetch('/api/postgres/schema');
    if (!res.ok) return;
    const data = await res.json();
    setConnection(data.connection || null);
    setTables(Array.isArray(data.tables) ? data.tables : []);
  }, []);

  const runSql = useCallback(async (queryText: string) => {
    setRunning(true);
    try {
      const res = await fetch('/api/postgres/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: queryText }),
      });
      const json = (await res.json()) as QueryResult;
      setResult(json);
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void loadSchema();
    void runSql(PRESET_QUERIES[2]);
  }, [loadSchema, runSql]);

  const activeTableMeta = tables.find((t) => t.name === selectedTable);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Tables & Columns */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-sky-700" />
            <div>
              <div className="text-xs font-bold text-slate-900">PostgreSQL 17 Schema</div>
              <div className="text-[11px] font-mono text-slate-500">
                {connection?.driver || 'pg-compat'} · {connection?.database || 'school76_mission'}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            {tables.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => {
                  setSelectedTable(t.name);
                  const nextSql = `SELECT * FROM ${t.name} LIMIT 15`;
                  setSql(nextSql);
                  void runSql(nextSql);
                }}
                className={`w-full text-left px-3 py-2 rounded-md border text-xs flex items-center justify-between ${
                  selectedTable === t.name
                    ? 'bg-sky-50 border-sky-200 text-sky-900 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <Table className="w-3.5 h-3.5 text-slate-400" />
                  {t.name}
                </span>
                <span className="font-mono text-[11px] text-slate-500">{t.rowCount} rows</span>
              </button>
            ))}
          </div>

          {activeTableMeta && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-600">
                Колонки таблицы `{activeTableMeta.name}`
              </div>
              <div className="space-y-1">
                {activeTableMeta.columns.map((col) => (
                  <div
                    key={col.name}
                    className="flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded bg-slate-50"
                  >
                    <span className="text-slate-800">
                      {col.primaryKey ? 'PK ' : col.references ? 'FK ' : ''}
                      {col.name}
                    </span>
                    <span className="text-slate-500">{col.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SQL Query Runner */}
      <div className="lg:col-span-8 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-900">
              SQL Консоль PostgreSQL (Read-Only SELECT / SHOW)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_QUERIES.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSql(q);
                    void runSql(q);
                  }}
                  className="px-2 py-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
                >
                  {q.split(' ')[0]} {q.includes('FROM') ? q.split('FROM ')[1].split(' ')[0] : 'TABLES'}
                </button>
              ))}
            </div>
          </div>

          <textarea
            rows={3}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            className="w-full p-3 text-xs font-mono border border-slate-200 rounded-md bg-slate-900 text-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">
              {result
                ? `Движок: ${result.engine} · ${result.rowCount} строк · ${result.durationMs} мс`
                : 'Готов к выполнению запроса'}
            </span>
            <button
              type="button"
              disabled={running}
              onClick={() => void runSql(sql)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              Выполнить SQL
            </button>
          </div>
        </div>

        {result && !result.ok && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800">
            {result.error}
          </div>
        )}

        {result && result.ok && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono">
                    {result.columns.map((c) => (
                      <th key={c} className="py-2 px-3 whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {result.columns.map((c) => (
                        <td
                          key={c}
                          className="py-2 px-3 font-mono text-[11px] text-slate-700 max-w-[260px] truncate"
                        >
                          {row[c] !== null && row[c] !== undefined ? String(row[c]) : 'NULL'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
