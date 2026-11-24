import React, { useMemo, useState } from 'react';
import { Activity, BatteryCharging, Cpu } from 'lucide-react';
import type { CubeSatTelemetry, TelemetryPoint } from '../mblock/simulator.ts';

interface TelemetryLiveChartsWidgetProps {
  telemetry: CubeSatTelemetry;
  isRunning: boolean;
}

const CHART_W = 360;
const CHART_H = 68;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 6;
const PAD_B = 8;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function buildSeriesGeometry(
  points: TelemetryPoint[],
  accessor: (p: TelemetryPoint) => number,
  minVal: number,
  maxVal: number
) {
  if (points.length === 0) {
    return { linePath: '', areaPath: '', coords: [] as { x: number; y: number; val: number }[] };
  }

  const coords = points.map((p, idx) => {
    const val = accessor(p);
    const x =
      points.length === 1
        ? PAD_L + PLOT_W * 0.5
        : PAD_L + (idx / (points.length - 1)) * PLOT_W;
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    const norm = (clamped - minVal) / Math.max(0.0001, maxVal - minVal);
    const y = PAD_T + (1 - norm) * PLOT_H;
    return { x, y, val };
  });

  if (coords.length === 1) {
    return { linePath: '', areaPath: '', coords };
  }

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
  const bottomY = (PAD_T + PLOT_H).toFixed(1);
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${bottomY} L${coords[0].x.toFixed(1)},${bottomY} Z`;

  return { linePath, areaPath, coords };
}

export const TelemetryLiveChartsWidget: React.FC<TelemetryLiveChartsWidgetProps> = ({
  telemetry,
  isRunning,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const pts = telemetry.history;

  const voltGeom = useMemo(
    () => buildSeriesGeometry(pts, (p) => p.batteryVolt, 6.2, 8.5),
    [pts]
  );

  const cpuGeom = useMemo(
    () => buildSeriesGeometry(pts, (p) => p.cpuLoadPct, 0, 100),
    [pts]
  );

  const powerDelta = telemetry.solarPowerW - telemetry.loadPowerW;
  const activeIdx =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < pts.length ? hoverIdx : null;
  const inspectedPoint = activeIdx !== null ? pts[activeIdx] : null;

  const minVolt = pts.length ? Math.min(...pts.map((p) => p.batteryVolt)) : telemetry.batteryVolt;
  const peakCpu = pts.length ? Math.max(...pts.map((p) => p.cpuLoadPct)) : telemetry.cpuLoadPct;

  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (pts.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const norm = Math.max(0, Math.min(1, (relX - PAD_L) / PLOT_W));
    const idx = Math.round(norm * (pts.length - 1));
    setHoverIdx(idx);
  };

  const voltWarnY = PAD_T + (1 - (6.8 - 6.2) / (8.5 - 6.2)) * PLOT_H;
  const cpuWarnY = PAD_T + (1 - 0.8) * PLOT_H;

  const currentCpuColor =
    telemetry.cpuLoadPct >= 80
      ? '#f43f5e'
      : telemetry.cpuLoadPct >= 55
        ? '#f59e0b'
        : '#38bdf8';

  const currentVoltColor = telemetry.batteryVolt < 6.8 ? '#f43f5e' : '#10b981';

  return (
    <div className="px-4 py-3 border-b border-slate-200 space-y-2.5 bg-white">
      {/* Widget Header */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
          <Activity className="w-3.5 h-3.5 text-sky-600" />
          Телеметрия реального времени
        </span>
        <span className="font-mono tabular-nums text-slate-500">
          {inspectedPoint
            ? `T+${inspectedPoint.t.toFixed(1)}с · ${inspectedPoint.batteryVolt.toFixed(2)}В · CPU ${inspectedPoint.cpuLoadPct.toFixed(0)}%`
            : `СБ ${telemetry.solarPowerW.toFixed(1)}Вт · Потр. ${telemetry.loadPowerW.toFixed(1)}Вт (${powerDelta >= 0 ? '+' : ''}${powerDelta.toFixed(1)})`}
        </span>
      </div>

      {/* Dual Real-Time Line Charts Container */}
      <div className="bg-slate-950 rounded-lg border border-slate-800 p-2.5 space-y-2.5">
        {/* Chart 1: Battery Voltage (V) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
              <BatteryCharging className="w-3 h-3" />
              Напряжение АКБ (В)
            </span>
            <span className="text-slate-300 tabular-nums">
              тек:{' '}
              <strong style={{ color: currentVoltColor }}>
                {(inspectedPoint ? inspectedPoint.batteryVolt : telemetry.batteryVolt).toFixed(2)} В
              </strong>{' '}
              · мин {minVolt.toFixed(2)} В
            </span>
          </div>

          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            onMouseMove={handlePointerMove}
            onMouseLeave={() => setHoverIdx(null)}
            className="w-full h-[68px] overflow-visible cursor-crosshair"
            role="img"
            aria-label="Линейный график напряжения батареи в реальном времени"
          >
            <defs>
              <linearGradient id="volt-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={currentVoltColor} stopOpacity="0.32" />
                <stop offset="100%" stopColor={currentVoltColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Y Axis Grid & Labels */}
            {[8.5, 7.4, 6.2].map((tick) => {
              const y = PAD_T + (1 - (tick - 6.2) / (8.5 - 6.2)) * PLOT_H;
              return (
                <g key={tick}>
                  <line
                    x1={PAD_L}
                    y1={y}
                    x2={CHART_W - PAD_R}
                    y2={y}
                    stroke="#1e293b"
                    strokeWidth="1"
                  />
                  <text
                    x={PAD_L - 4}
                    y={y + 3}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="8"
                    fontFamily="ui-monospace, monospace"
                  >
                    {tick.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* 6.8V Safe Cutoff Threshold */}
            <line
              x1={PAD_L}
              y1={voltWarnY}
              x2={CHART_W - PAD_R}
              y2={voltWarnY}
              stroke="#ef4444"
              strokeOpacity="0.45"
              strokeDasharray="3 3"
              strokeWidth="1"
            />

            {voltGeom.areaPath && (
              <path d={voltGeom.areaPath} fill="url(#volt-area-grad)" />
            )}
            {voltGeom.linePath && (
              <path
                d={voltGeom.linePath}
                fill="none"
                stroke={currentVoltColor}
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            )}

            {/* Single-point or Active Last/Hovered Dot */}
            {voltGeom.coords.length > 0 && (() => {
              const target =
                activeIdx !== null
                  ? voltGeom.coords[activeIdx]
                  : voltGeom.coords[voltGeom.coords.length - 1];
              return (
                <>
                  {activeIdx !== null && (
                    <line
                      x1={target.x}
                      y1={PAD_T}
                      x2={target.x}
                      y2={PAD_T + PLOT_H}
                      stroke="#94a3b8"
                      strokeDasharray="2 2"
                      strokeWidth="1"
                    />
                  )}
                  <circle
                    cx={target.x}
                    cy={target.y}
                    r="3"
                    fill={currentVoltColor}
                    stroke="#020617"
                    strokeWidth="1.2"
                  />
                </>
              );
            })()}
          </svg>
        </div>

        {/* Chart 2: OBC CPU Load (%) */}
        <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="inline-flex items-center gap-1 text-sky-400 font-semibold">
              <Cpu className="w-3 h-3" />
              Загрузка ЦП OBC (%)
            </span>
            <span className="text-slate-300 tabular-nums">
              тек:{' '}
              <strong style={{ color: currentCpuColor }}>
                {(inspectedPoint ? inspectedPoint.cpuLoadPct : telemetry.cpuLoadPct).toFixed(1)}%
              </strong>{' '}
              · пик {peakCpu.toFixed(0)}%
            </span>
          </div>

          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            onMouseMove={handlePointerMove}
            onMouseLeave={() => setHoverIdx(null)}
            className="w-full h-[68px] overflow-visible cursor-crosshair"
            role="img"
            aria-label="Линейный график загрузки ЦП бортового компьютера в реальном времени"
          >
            <defs>
              <linearGradient id="cpu-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={currentCpuColor} stopOpacity="0.32" />
                <stop offset="100%" stopColor={currentCpuColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Y Axis Grid & Labels */}
            {[100, 50, 0].map((tick) => {
              const y = PAD_T + (1 - tick / 100) * PLOT_H;
              return (
                <g key={tick}>
                  <line
                    x1={PAD_L}
                    y1={y}
                    x2={CHART_W - PAD_R}
                    y2={y}
                    stroke="#1e293b"
                    strokeWidth="1"
                  />
                  <text
                    x={PAD_L - 4}
                    y={y + 3}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="8"
                    fontFamily="ui-monospace, monospace"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* 80% Overload Warning Threshold */}
            <line
              x1={PAD_L}
              y1={cpuWarnY}
              x2={CHART_W - PAD_R}
              y2={cpuWarnY}
              stroke="#f59e0b"
              strokeOpacity="0.45"
              strokeDasharray="3 3"
              strokeWidth="1"
            />

            {cpuGeom.areaPath && (
              <path d={cpuGeom.areaPath} fill="url(#cpu-area-grad)" />
            )}
            {cpuGeom.linePath && (
              <path
                d={cpuGeom.linePath}
                fill="none"
                stroke={currentCpuColor}
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            )}

            {cpuGeom.coords.length > 0 && (() => {
              const target =
                activeIdx !== null
                  ? cpuGeom.coords[activeIdx]
                  : cpuGeom.coords[cpuGeom.coords.length - 1];
              return (
                <>
                  {activeIdx !== null && (
                    <line
                      x1={target.x}
                      y1={PAD_T}
                      x2={target.x}
                      y2={PAD_T + PLOT_H}
                      stroke="#94a3b8"
                      strokeDasharray="2 2"
                      strokeWidth="1"
                    />
                  )}
                  <circle
                    cx={target.x}
                    cy={target.y}
                    r="3"
                    fill={currentCpuColor}
                    stroke="#020617"
                    strokeWidth="1.2"
                  />
                </>
              );
            })()}
          </svg>
        </div>

        {/* Footer Time Range Bar */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-0.5">
          <span>Окно: {pts.length} отсч. (T+{pts[0]?.t.toFixed(0) ?? 0}с .. T+{pts[pts.length - 1]?.t.toFixed(0) ?? 0}с)</span>
          <span>{isRunning ? 'Поток: 2 Гц' : 'Наведите на график для отсчёта'}</span>
        </div>
      </div>
    </div>
  );
};
