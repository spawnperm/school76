import React, { useState } from 'react';
import { Monitor, Radio, Send, Tv } from 'lucide-react';
import type { CubeSatTelemetry } from '../mblock/simulator.ts';

interface CubeSatStageViewProps {
  telemetry: CubeSatTelemetry;
  isRunning: boolean;
  webSerialConnected: boolean;
  onStageBroadcast: (msg: string, value: string) => void;
}

export const CubeSatStageView: React.FC<CubeSatStageViewProps> = ({
  telemetry,
  isRunning,
  webSerialConnected,
  onStageBroadcast,
}) => {
  const [broadcastMsg, setBroadcastMsg] = useState('capture_stage');
  const [broadcastVal, setBroadcastVal] = useState('1280x720');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = broadcastMsg.trim();
    if (!trimmed) return;
    onStageBroadcast(trimmed, broadcastVal.trim());
  };

  const bubbleText = telemetry.lastBroadcastMsg
    ? `0x46: ${telemetry.lastBroadcastMsg}${telemetry.lastBroadcastVal ? ` = ${telemetry.lastBroadcastVal}` : ''}`
    : telemetry.lastBeaconText || 'SCHOOL76-1U READY';

  const pitchDeg = Math.max(-45, Math.min(45, telemetry.angles.X));
  const ledColor = `rgb(${telemetry.ledRgb.r}, ${telemetry.ledRgb.g}, ${telemetry.ledRgb.b})`;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-3 bg-white">
      {/* mBlock 5 Orbital Stage Viewport */}
      <div className="rounded-lg border border-slate-800 bg-[#0B0E17] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/90 text-[11px] font-mono text-slate-300">
          <span className="inline-flex items-center gap-1.5 font-semibold text-sky-300">
            <Tv className="w-3.5 h-3.5" />
            Сцена mBlock 5 · Орбита LEO 520 км
          </span>
          <span className="tabular-nums text-slate-400">
            {webSerialConnected ? 'WebSerial 0xFF55' : isRunning ? 'LIVE HIL' : 'STANDBY'} ·{' '}
            {telemetry.inEclipse ? 'Тень Земли' : 'Освещён'}
          </span>
        </div>

        <div className="relative">
          <svg
            viewBox="0 0 420 200"
            className="w-full h-48 block select-none"
            aria-label="Сцена кубсата 1U на орбите"
          >
            <defs>
              <radialGradient id="earthGlow" cx="50%" cy="115%" r="85%">
                <stop
                  offset="0%"
                  stopColor={telemetry.inEclipse ? '#1e293b' : '#0284c7'}
                  stopOpacity="0.45"
                />
                <stop offset="100%" stopColor="#0B0E17" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Space background & Earth limb */}
            <rect x="0" y="0" width="420" height="200" fill="#0B0E17" />
            <rect x="0" y="0" width="420" height="200" fill="url(#earthGlow)" />

            {/* Subtle telemetry stars */}
            {[
              [34, 28],
              [78, 52],
              [124, 22],
              [188, 38],
              [265, 24],
              [332, 46],
              [386, 30],
              [52, 118],
              [370, 126],
            ].map(([sx, sy], idx) => (
              <circle key={idx} cx={sx} cy={sy} r={idx % 2 === 0 ? 1 : 0.7} fill="#64748b" />
            ))}

            {/* Orbital horizon arc */}
            <path
              d="M -20 198 Q 210 132 440 198"
              fill={telemetry.inEclipse ? '#0f172a' : '#082f49'}
              stroke={telemetry.inEclipse ? '#334155' : '#38bdf8'}
              strokeWidth="1.2"
              strokeOpacity="0.6"
            />

            {/* Broadcast / AX.25 Speech Bubble (Stage Sprite callout) */}
            <g transform="translate(214, 18)">
              <rect
                x="0"
                y="0"
                width="192"
                height="28"
                rx="5"
                fill="#111827"
                stroke="#334155"
                strokeWidth="1"
              />
              <text
                x="10"
                y="18"
                fill="#e2e8f0"
                fontSize="10"
                fontFamily="monospace"
              >
                {bubbleText.slice(0, 27)}
              </text>
            </g>

            {/* Rotating 1U CubeSat Sprite driven by MeGyro Pitch angle */}
            <g transform={`translate(148, 88) rotate(${pitchDeg.toFixed(1)})`}>
              {/* Left & Right Deployable Solar Wings */}
              <rect
                x="-76"
                y="-14"
                width="48"
                height="28"
                rx="2"
                fill={telemetry.inEclipse ? '#1e293b' : '#0c4a6e'}
                stroke="#38bdf8"
                strokeWidth="1"
              />
              <line x1="-60" y1="-14" x2="-60" y2="14" stroke="#1e293b" strokeWidth="1" />
              <line x1="-44" y1="-14" x2="-44" y2="14" stroke="#1e293b" strokeWidth="1" />

              <rect
                x="28"
                y="-14"
                width="48"
                height="28"
                rx="2"
                fill={telemetry.inEclipse ? '#1e293b' : '#0c4a6e'}
                stroke="#38bdf8"
                strokeWidth="1"
              />
              <line x1="44" y1="-14" x2="44" y2="14" stroke="#1e293b" strokeWidth="1" />
              <line x1="60" y1="-14" x2="60" y2="14" stroke="#1e293b" strokeWidth="1" />

              {/* 1U Aluminum Chassis */}
              <rect
                x="-28"
                y="-28"
                width="56"
                height="56"
                rx="3"
                fill="#1e293b"
                stroke="#94a3b8"
                strokeWidth="1.5"
              />
              {/* Payload Camera Aperture */}
              <circle
                cx="0"
                cy="4"
                r="10"
                fill={telemetry.rails.PAYLOAD_5V ? '#0284c7' : '#0f172a'}
                stroke="#64748b"
                strokeWidth="1.2"
              />
              <circle cx="0" cy="4" r="4" fill="#38bdf8" fillOpacity={telemetry.rails.PAYLOAD_5V ? 0.9 : 0.25} />

              {/* MeRGBLed Beacon */}
              <circle cx="17" cy="-17" r="4" fill={ledColor} stroke="#e2e8f0" strokeWidth="0.8" />

              {/* UHF Dipole Antennas */}
              <line x1="-10" y1="-28" x2="-22" y2="-52" stroke="#cbd5e1" strokeWidth="1.2" />
              <line x1="10" y1="-28" x2="22" y2="-52" stroke="#cbd5e1" strokeWidth="1.2" />
            </g>

            {/* Stage Coordinate Axis Overlay */}
            <text x="12" y="188" fill="#64748b" fontSize="9" fontFamily="monospace">
              PITCH {telemetry.angles.X.toFixed(1)}° · ROLL {telemetry.angles.Y.toFixed(1)}° · YAW {telemetry.angles.Z.toFixed(0)}°
            </text>
          </svg>
        </div>

        {/* CyberPi / OLED 4-Line Console Screen */}
        <div className="border-t border-slate-800 px-3 py-2.5 bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5 flex-1 min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Monitor className="w-3 h-3 text-sky-400" />
              Экран CyberPi / OLED 128×64
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px] text-emerald-300">
              {telemetry.oledLines.slice(-4).map((line, i) => (
                <div key={i} className="truncate">
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-slate-300">
            <span
              className="w-3 h-3 rounded-sm border border-slate-600"
              style={{ backgroundColor: ledColor }}
              title={`MeRGBLed: (${telemetry.ledRgb.r}, ${telemetry.ledRgb.g}, ${telemetry.ledRgb.b})`}
            />
            <span>LED ({telemetry.ledRgb.r},{telemetry.ledRgb.g},{telemetry.ledRgb.b})</span>
          </div>
        </div>
      </div>

      {/* Stage Live Variable Watchers (mBlock Stage Monitors) */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-md">
          <div className="text-[10px] text-slate-500">OBC Режим</div>
          <div className="font-mono font-semibold text-slate-900 tabular-nums">{telemetry.mode}</div>
        </div>
        <div className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-md">
          <div className="text-[10px] text-slate-500">Батарея EPS</div>
          <div className="font-mono font-semibold text-slate-900 tabular-nums">
            {telemetry.batteryVolt.toFixed(2)}V · {telemetry.batteryPct.toFixed(0)}%
          </div>
        </div>
        <div className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-md">
          <div className="text-[10px] text-slate-500">ДЗЗ · 0xFF55</div>
          <div className="font-mono font-semibold text-slate-900 tabular-nums">
            {telemetry.imagesCaptured} кадр · {telemetry.makeblockFramesCount} пак
          </div>
        </div>
      </div>

      {/* Upload Mode Broadcast (0x46) Ground -> Board Sender */}
      <div className="border border-slate-200 rounded-lg p-3 space-y-2.5 bg-slate-50/70">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-sky-600" />
            Upload Mode Broadcast (0x46 · Сцена ↔ Плата)
          </div>
          <span className="text-[10px] font-mono text-slate-500">0xFF 0x55 ... 0x46</span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-1.5">
          <input
            type="text"
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
            placeholder="сообщение"
            maxLength={24}
            aria-label="Сообщение Broadcast"
            className="flex-1 min-w-[110px] px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <input
            type="text"
            value={broadcastVal}
            onChange={(e) => setBroadcastVal(e.target.value)}
            placeholder="значение (опц.)"
            maxLength={24}
            aria-label="Значение Broadcast"
            className="w-28 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded hover:bg-sky-700 transition-colors shrink-0"
          >
            <Send className="w-3 h-3" />
            Послать
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { msg: 'capture_stage', val: '1280x720' },
            { msg: 'ping_stage', val: '1' },
            { msg: 'safe_mode', val: 'LOW_PWR' },
          ].map((preset) => (
            <button
              key={preset.msg}
              type="button"
              onClick={() => {
                setBroadcastMsg(preset.msg);
                setBroadcastVal(preset.val);
                onStageBroadcast(preset.msg, preset.val);
              }}
              className="px-2 py-0.5 text-[11px] font-mono text-slate-700 bg-white border border-slate-200 rounded hover:bg-sky-50 hover:text-sky-700 transition-colors"
            >
              {preset.msg}({preset.val})
            </button>
          ))}
        </div>

        {telemetry.broadcastHistory.length > 0 && (
          <div className="max-h-28 overflow-y-auto space-y-1 pt-1 border-t border-slate-200">
            {telemetry.broadcastHistory.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="px-2 py-1 bg-slate-950 text-slate-200 rounded font-mono text-[10px] flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  <span className={item.direction === 'RX' ? 'text-amber-400' : 'text-emerald-400'}>
                    [{item.direction}]
                  </span>{' '}
                  {item.msg}
                  {item.value ? `=${item.value}` : ''}
                </span>
                <span className="text-slate-500 shrink-0 hidden sm:inline">{item.hex.slice(0, 26)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
