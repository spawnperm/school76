import React, { useState } from 'react';
import { Flame, FastForward, Thermometer, AlertTriangle, CheckCircle2, Snowflake } from 'lucide-react';
import {
  getThermalNodesSnapshot,
  type CubeSatTelemetry,
  type ThermalNodeInfo,
} from '../mblock/simulator.ts';

interface ThermalPowerHeatmapProps {
  programName: string;
  telemetry: CubeSatTelemetry;
  onSimulateThermalBurst: () => void;
}

function tempToThermalColor(node: ThermalNodeInfo): {
  stroke: string;
  glow: string;
  badgeText: string;
  badgeClass: string;
  statusLabel: string;
} {
  if (node.status === 'overheat') {
    return {
      stroke: '#ef4444',
      glow: '#dc2626',
      badgeText: 'Перегрев',
      badgeClass: 'text-rose-700 bg-rose-50 border-rose-200',
      statusLabel: 'КРИТИЧЕСКИЙ НАГРЕВ',
    };
  }
  if (node.status === 'warm') {
    return {
      stroke: '#f59e0b',
      glow: '#ea580c',
      badgeText: 'Нагрев',
      badgeClass: 'text-amber-800 bg-amber-50 border-amber-200',
      statusLabel: 'ПОВЫШЕННАЯ T°',
    };
  }
  if (node.status === 'cold') {
    return {
      stroke: '#38bdf8',
      glow: '#0284c7',
      badgeText: 'Охлаждение',
      badgeClass: 'text-sky-700 bg-sky-50 border-sky-200',
      statusLabel: 'НИЖЕ НОРМЫ',
    };
  }
  return {
    stroke: '#10b981',
    glow: '#059669',
    badgeText: 'Норма',
    badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    statusLabel: 'ШТАТНО',
  };
}

export const ThermalPowerHeatmap: React.FC<ThermalPowerHeatmapProps> = ({
  programName,
  telemetry,
  onSimulateThermalBurst,
}) => {
  const nodes = getThermalNodesSnapshot(telemetry);
  const [selectedNodeId, setSelectedNodeId] = useState<ThermalNodeInfo['id']>('PAYLOAD');

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const hottestNode = [...nodes].sort((a, b) => b.tempC - a.tempC)[0];
  const totalWatts = nodes.reduce((acc, n) => acc + n.watts, 0);
  const overheatCount = nodes.filter((n) => n.status === 'overheat').length;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-3.5 bg-white">
      {/* Top Header + 30s Thermal Projection CTA */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-600" />
            Тепловая карта и баланс мощности 1U
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Рассеиваемая мощность (Вт) и нагрев плат при выполнении «{programName}».
          </p>
        </div>

        <button
          type="button"
          onClick={onSimulateThermalBurst}
          title="Промотать 30 секунд выполнения программы с расчётом тепловой инерции"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors shrink-0"
        >
          <FastForward className="w-3.5 h-3.5 text-amber-400" />
          Прогон +30с
        </button>
      </div>

      {/* Thermal Risk Alert Banner */}
      <div
        className={`px-3 py-2 rounded-md border flex items-center justify-between gap-2 text-xs ${
          overheatCount > 0
            ? 'bg-rose-50 border-rose-200 text-rose-900'
            : hottestNode.status === 'warm'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 font-medium">
          {overheatCount > 0 ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : hottestNode.status === 'warm' ? (
            <Thermometer className="w-4 h-4 text-amber-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span className="truncate">
            {overheatCount > 0
              ? `Точка перегрева: ${hottestNode.id} (${hottestNode.tempC.toFixed(1)}°C / ${hottestNode.watts.toFixed(2)} Вт)`
              : hottestNode.status === 'warm'
                ? `Горячая зона: ${hottestNode.id} (${hottestNode.tempC.toFixed(1)}°C · ${hottestNode.watts.toFixed(2)} Вт)`
                : `Тепловой режим в норме · макс. ${hottestNode.id} ${hottestNode.tempC.toFixed(1)}°C`}
          </span>
        </div>
        <span className="font-mono text-[11px] font-bold tabular-nums shrink-0">
          Σ {totalWatts.toFixed(2)} Вт
        </span>
      </div>

      {/* IR Cutaway 1U CubeSat Stack Thermal Map */}
      <div className="bg-slate-950 rounded-lg border border-slate-800 p-3 space-y-2.5">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span>ИК-СРЕЗ СТЕКА PC/104 (1U CHASSIS)</span>
          <span>
            {telemetry.inEclipse ? 'СРЕДА: ТЕНЬ (-8°C)' : 'СРЕДА: СОЛНЦЕ (+20°C)'} · T+{telemetry.simTimeSec.toFixed(0)}с
          </span>
        </div>

        <svg
          viewBox="0 0 380 236"
          className="w-full h-56 select-none"
          role="img"
          aria-label="Тепловая карта стека плат 1U кубсата"
        >
          <defs>
            {nodes.map((node) => {
              const palette = tempToThermalColor(node);
              const heatIntensity = Math.min(1, Math.max(0.18, node.watts / 4.2));
              return (
                <radialGradient key={`grad-${node.id}`} id={`heat-${node.id}`} cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor={palette.glow} stopOpacity={0.35 + heatIntensity * 0.5} />
                  <stop offset="55%" stopColor={palette.stroke} stopOpacity={0.14 + heatIntensity * 0.2} />
                  <stop offset="100%" stopColor="#020617" stopOpacity="0" />
                </radialGradient>
              );
            })}
          </defs>

          {/* Outer 1U Chassis Frame Rails */}
          <rect
            x="16"
            y="8"
            width="348"
            height="220"
            rx="6"
            fill="none"
            stroke="#334155"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          {/* Left & Right Standoff Threaded Rods */}
          <line x1="34" y1="14" x2="34" y2="222" stroke="#475569" strokeWidth="3" />
          <line x1="346" y1="14" x2="346" y2="222" stroke="#475569" strokeWidth="3" />

          {/* 5 Subsystem PCB Layers */}
          {nodes.map((node, index) => {
            const y = 18 + index * 41;
            const isSelected = node.id === selectedNode.id;
            const palette = tempToThermalColor(node);
            const barWidth = Math.min(110, Math.max(4, (node.watts / 4.8) * 110));
            const hotspotRadius = 18 + Math.min(34, node.watts * 8);

            return (
              <g
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                className="cursor-pointer"
              >
                {/* Thermal IR Plume Background */}
                <ellipse
                  cx="190"
                  cy={y + 17}
                  rx={hotspotRadius * 2.2}
                  ry={hotspotRadius * 0.65}
                  fill={`url(#heat-${node.id})`}
                />

                {/* PCB Plate */}
                <rect
                  x="28"
                  y={y}
                  width="324"
                  height="33"
                  rx="4"
                  fill={isSelected ? '#0f172a' : '#090d16'}
                  stroke={isSelected ? '#f8fafc' : palette.stroke}
                  strokeWidth={isSelected ? 1.8 : 1.1}
                />

                {/* Thermal Accent Strip */}
                <rect
                  x="28"
                  y={y}
                  width="5"
                  height="33"
                  rx="2"
                  fill={palette.stroke}
                />

                {/* Subsystem Title & Board */}
                <text
                  x="42"
                  y={y + 14}
                  fill="#f8fafc"
                  fontSize="10.5"
                  fontWeight="700"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  {node.id}
                </text>
                <text
                  x="42"
                  y={y + 26}
                  fill="#94a3b8"
                  fontSize="8.8"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {node.boardName}
                </text>

                {/* Power Dissipation Mini-Bar */}
                <rect x="172" y={y + 12} width="110" height="7" rx="3.5" fill="#1e293b" />
                <rect
                  x="172"
                  y={y + 12}
                  width={barWidth}
                  height="7"
                  rx="3.5"
                  fill={palette.stroke}
                />

                {/* Live Temp & Watts Readout */}
                <text
                  x="342"
                  y={y + 14}
                  textAnchor="end"
                  fill={palette.stroke}
                  fontSize="10.5"
                  fontWeight="700"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  {node.tempC.toFixed(1)}°C
                </text>
                <text
                  x="342"
                  y={y + 26}
                  textAnchor="end"
                  fill="#cbd5e1"
                  fontSize="9"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  {node.watts.toFixed(2)} Вт ({node.sharePct}%)
                </text>
              </g>
            );
          })}
        </svg>

        {/* Continuous IR Scale Legend */}
        <div className="space-y-1">
          <div
            className="h-2 rounded-full w-full"
            style={{
              background:
                'linear-gradient(90deg, #0284c7 0%, #10b981 35%, #f59e0b 70%, #ef4444 100%)',
            }}
          />
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>-10°C Холод</span>
            <span>20°C Норма</span>
            <span>45°C Нагрев</span>
            <span>65°C+ Перегрев</span>
          </div>
        </div>
      </div>

      {/* Selected PCB Node Detailed Inspector */}
      {(() => {
        const pal = tempToThermalColor(selectedNode);
        return (
          <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/70">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {selectedNode.label}
                </div>
                <div className="text-[11px] text-slate-500">{selectedNode.note}</div>
              </div>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-semibold border rounded shrink-0 ${pal.badgeClass}`}
              >
                {pal.badgeText}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-200">
              <div>
                <div className="text-[10px] text-slate-500">Мощность</div>
                <div className="font-mono font-bold text-slate-900 tabular-nums">
                  {selectedNode.watts.toFixed(2)} Вт
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Температура</div>
                <div className="font-mono font-bold text-slate-900 tabular-nums inline-flex items-center gap-1">
                  {selectedNode.status === 'cold' && (
                    <Snowflake className="w-3 h-3 text-sky-600" />
                  )}
                  {selectedNode.tempC.toFixed(1)} °C
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Допуск платы</div>
                <div className="font-mono text-slate-700 tabular-nums">
                  {selectedNode.limitMinC}..+{selectedNode.limitMaxC}°C
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
