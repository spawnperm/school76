import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Network, RefreshCw } from 'lucide-react';

interface ArchifyNode {
  id: string;
  label: string;
  layer: 'edge' | 'frontend' | 'services' | 'data';
  tech: string;
  status: string;
  metric: string;
  x: number;
  y: number;
}

interface ArchifyEdge {
  from: string;
  to: string;
  protocol: string;
}

const LAYER_STYLES: Record<ArchifyNode['layer'], { badge: string; border: string; bg: string }> = {
  edge: { badge: 'bg-amber-50 text-amber-800', border: 'border-amber-300', bg: 'bg-amber-50/40' },
  frontend: { badge: 'bg-sky-50 text-sky-800', border: 'border-sky-300', bg: 'bg-sky-50/40' },
  services: { badge: 'bg-indigo-50 text-indigo-800', border: 'border-indigo-300', bg: 'bg-indigo-50/40' },
  data: { badge: 'bg-emerald-50 text-emerald-800', border: 'border-emerald-300', bg: 'bg-emerald-50/40' },
};

export const ArchifyStudio: React.FC = () => {
  const [nodes, setNodes] = useState<ArchifyNode[]>([]);
  const [edges, setEdges] = useState<ArchifyEdge[]>([]);
  const [mermaid, setMermaid] = useState('');
  const [selectedId, setSelectedId] = useState<string>('traefik');
  const [layerFilter, setLayerFilter] = useState<'all' | ArchifyNode['layer']>('all');
  const [copied, setCopied] = useState(false);

  const loadTopology = useCallback(async () => {
    const res = await fetch('/api/archify/topology');
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.nodes)) setNodes(data.nodes);
    if (Array.isArray(data.edges)) setEdges(data.edges);
    if (typeof data.mermaid === 'string') setMermaid(data.mermaid);
  }, []);

  useEffect(() => {
    void loadTopology();
  }, [loadTopology]);

  const visibleNodes = useMemo(
    () => (layerFilter === 'all' ? nodes : nodes.filter((n) => n.layer === layerFilter)),
    [nodes, layerFilter]
  );

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const selectedNode = nodeMap.get(selectedId) || visibleNodes[0] || null;

  const connectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return edges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id);
  }, [edges, selectedNode]);

  const handleCopyMermaid = async () => {
    try {
      await navigator.clipboard.writeText(mermaid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Canvas */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Archify — Живая топология архитектуры school76
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'edge', 'frontend', 'services', 'data'] as const).map((layer) => (
              <button
                key={layer}
                type="button"
                onClick={() => setLayerFilter(layer)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  layerFilter === layer
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {layer === 'all' ? 'Все слои' : layer.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void loadTopology()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* SVG Interactive Graph */}
        <div className="border border-slate-200 rounded-lg bg-slate-50/70 overflow-x-auto">
          <svg viewBox="0 0 880 530" className="w-full min-w-[720px] h-[460px]">
            <defs>
              <marker
                id="archify-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
              </marker>
            </defs>

            {/* Layer Labels */}
            <text x="16" y="65" className="fill-slate-400 text-[10px] font-mono font-semibold">EDGE</text>
            <text x="16" y="195" className="fill-slate-400 text-[10px] font-mono font-semibold">UI / SDK</text>
            <text x="16" y="335" className="fill-slate-400 text-[10px] font-mono font-semibold">SERVICES</text>
            <text x="16" y="475" className="fill-slate-400 text-[10px] font-mono font-semibold">DATA / BUS</text>

            {/* Edges */}
            {edges.map((edge, idx) => {
              if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return null;
              const src = nodeMap.get(edge.from);
              const dst = nodeMap.get(edge.to);
              if (!src || !dst) return null;
              const highlighted =
                selectedNode && (edge.from === selectedNode.id || edge.to === selectedNode.id);
              const x1 = src.x + 75;
              const y1 = src.y + 48;
              const x2 = dst.x + 75;
              const y2 = dst.y;
              return (
                <g key={`${edge.from}-${edge.to}-${idx}`}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={highlighted ? '#0284c7' : '#cbd5e1'}
                    strokeWidth={highlighted ? 2 : 1.25}
                    markerEnd="url(#archify-arrow)"
                  />
                  {highlighted && (
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 4}
                      textAnchor="middle"
                      className="fill-sky-700 text-[9px] font-mono font-semibold"
                    >
                      {edge.protocol}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {visibleNodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const strokeColor = isSelected ? '#0284c7' : '#cbd5e1';
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => setSelectedId(node.id)}
                  className="cursor-pointer"
                >
                  <rect
                    width="150"
                    height="52"
                    rx="8"
                    fill="#ffffff"
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 2.2 : 1.2}
                  />
                  <text x="10" y="20" className="fill-slate-900 text-[11px] font-bold">
                    {node.label}
                  </text>
                  <text x="10" y="34" className="fill-slate-500 text-[9px] font-mono">
                    {node.tech}
                  </text>
                  <text x="10" y="46" className="fill-sky-700 text-[9px] font-mono font-semibold">
                    {node.metric}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Node Inspector & Mermaid */}
      <div className="lg:col-span-4 space-y-4">
        {selectedNode && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                  LAYER_STYLES[selectedNode.layer].badge
                }`}
              >
                {selectedNode.layer}
              </span>
              <span className="text-[11px] font-mono text-emerald-700">● {selectedNode.status}</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">{selectedNode.label}</h4>
              <div className="text-xs font-mono text-slate-500 mt-0.5">
                {selectedNode.tech} · {selectedNode.metric}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-600">
                Связи узла ({connectedEdges.length})
              </div>
              {connectedEdges.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-[11px] font-mono bg-slate-50 px-2.5 py-1.5 rounded"
                >
                  <span className="text-slate-700">
                    {e.from} → {e.to}
                  </span>
                  <span className="text-sky-700">{e.protocol}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">Экспорт схемы Archify (Mermaid)</span>
            <button
              type="button"
              onClick={() => void handleCopyMermaid()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          <pre className="p-2.5 rounded bg-slate-900 text-sky-100 text-[11px] font-mono overflow-x-auto max-h-56">
            {mermaid}
          </pre>
        </div>
      </div>
    </div>
  );
};
