import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  FlaskConical,
  Moon,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  Square,
  StepForward,
  Sun,
  Zap,
} from 'lucide-react';
import type {
  CubeSatTelemetry,
  FaultInjectionState,
  PreflightReport,
  SimScenarioId,
} from '../mblock/simulator.ts';
import { ThermalPowerHeatmap } from './ThermalPowerHeatmap.tsx';
import { TelemetryLiveChartsWidget } from './TelemetryLiveChartsWidget.tsx';

interface OnboardSimulatorModuleProps {
  programName: string;
  telemetry: CubeSatTelemetry;
  isRunning: boolean;
  scenario: SimScenarioId;
  preflightReport: PreflightReport | null;
  runningPreflight: boolean;
  onChangeScenario: (scenario: SimScenarioId) => void;
  onStart: () => void;
  onStop: () => void;
  onStepTick: () => void;
  onSimulateThermalBurst: () => void;
  onReset: () => void;
  onToggleEclipse: () => void;
  onSpinImpulse: () => void;
  onBatteryOverride: (pct: number) => void;
  onToggleFault: (key: keyof FaultInjectionState) => void;
  onSendCommand: (cmd: string) => void;
  onClearLogs: () => void;
  onRunPreflight: () => void;
  onExportFirmware: () => void;
}

const SCENARIO_OPTIONS: { id: SimScenarioId; label: string }[] = [
  { id: 'leo_nominal', label: 'Номинальная орбита (LEO)' },
  { id: 'low_battery', label: 'Критический разряд АКБ (21%)' },
  { id: 'high_tumble', label: 'Сильное вращение (26 °/с)' },
  { id: 'ground_pass', label: 'Сеанс связи UHF' },
];

export const OnboardSimulatorModule: React.FC<OnboardSimulatorModuleProps> = ({
  programName,
  telemetry,
  isRunning,
  scenario,
  preflightReport,
  runningPreflight,
  onChangeScenario,
  onStart,
  onStop,
  onStepTick,
  onSimulateThermalBurst,
  onReset,
  onToggleEclipse,
  onSpinImpulse,
  onBatteryOverride,
  onToggleFault,
  onSendCommand,
  onClearLogs,
  onRunPreflight,
  onExportFirmware,
}) => {
  const [simSubTab, setSimSubTab] = useState<'bench' | 'thermal' | 'preflight' | 'faults'>('bench');

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Execution & Scenario Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {!isRunning ? (
              <button
                type="button"
                onClick={onStart}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Старт HIL
              </button>
            ) : (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Стоп
              </button>
            )}

            <button
              type="button"
              onClick={onStepTick}
              title="Выполнить 1 шаг цикла (+1с)"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              <StepForward className="w-3.5 h-3.5" />
              Шаг
            </button>

            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Сброс
            </button>
          </div>

          <span className="text-xs font-mono tabular-nums text-slate-600">
            {isRunning ? 'OBC активен' : 'Остановлен'} · T+{telemetry.simTimeSec.toFixed(0)}с
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={scenario}
            onChange={(e) => onChangeScenario(e.target.value as SimScenarioId)}
            aria-label="Сценарий испытаний"
            className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800"
          >
            {SCENARIO_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                Профиль: {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSimSubTab('preflight');
              onRunPreflight();
            }}
            disabled={runningPreflight}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50 shrink-0"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {runningPreflight ? 'Тест...' : 'Автотест перед прошивкой'}
          </button>
        </div>
      </div>

      {/* Simulator Sub-Tabs */}
      <div className="px-4 border-b border-slate-200 flex items-center gap-4 text-xs font-medium bg-white overflow-x-auto">
        <button
          type="button"
          onClick={() => setSimSubTab('bench')}
          className={`py-2.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
            simSubTab === 'bench'
              ? 'border-sky-600 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Телеметрия
        </button>
        <button
          type="button"
          onClick={() => setSimSubTab('thermal')}
          className={`py-2.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
            simSubTab === 'thermal'
              ? 'border-sky-600 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Тепловая карта
        </button>
        <button
          type="button"
          onClick={() => setSimSubTab('faults')}
          className={`py-2.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
            simSubTab === 'faults'
              ? 'border-sky-600 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Отказы
        </button>
        <button
          type="button"
          onClick={() => setSimSubTab('preflight')}
          className={`py-2.5 border-b-2 transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
            simSubTab === 'preflight'
              ? 'border-sky-600 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Перед деплоем
          {preflightReport && (
            <span
              className={`font-mono text-[11px] ${
                preflightReport.passed ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {preflightReport.scorePct}%
            </span>
          )}
        </button>
      </div>

      {simSubTab === 'bench' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {/* Orbital Controls */}
          <div className="px-4 py-3 border-b border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onToggleEclipse}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  telemetry.inEclipse
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {telemetry.inEclipse ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                {telemetry.inEclipse ? 'Тень Земли' : 'Освещение'}
              </button>

              <button
                type="button"
                onClick={onSpinImpulse}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                <Zap className="w-3.5 h-3.5" />
                Импульс ω
              </button>
            </div>

            <div className="flex items-center gap-3">
              <label htmlFor="hil-bat-slider" className="text-xs text-slate-600 whitespace-nowrap">
                Заряд АКБ
              </label>
              <input
                id="hil-bat-slider"
                type="range"
                min={5}
                max={100}
                step={1}
                value={Math.round(telemetry.batteryPct)}
                onChange={(e) => onBatteryOverride(Number(e.target.value))}
                className="flex-1 accent-sky-600"
              />
              <span className="text-xs font-mono tabular-nums text-slate-800 w-10 text-right">
                {telemetry.batteryPct.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Ground Telecommands */}
          <div className="px-4 py-2.5 border-b border-slate-200">
            <div className="text-[11px] font-medium text-slate-500 mb-1.5 flex items-center gap-1">
              <Radio className="w-3 h-3 text-sky-600" />
              Телекоманды наземной станции (UHF 435.800 МГц)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['PING', 'CAPTURE', 'NOMINAL', 'SAFE', 'DETUMBLE'].map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => onSendCommand(cmd)}
                  className="px-2.5 py-1 text-xs font-mono font-medium text-slate-700 bg-slate-100 hover:bg-sky-50 hover:text-sky-700 border border-slate-200 rounded transition-colors"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>

          {/* Real-Time Telemetry Line Charts Widget (Battery Voltage + CPU Load) */}
          <TelemetryLiveChartsWidget telemetry={telemetry} isRunning={isRunning} />

          {/* Telemetry Readout Matrix */}
          <div className="px-4 py-3 border-b border-slate-200 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <div className="text-slate-500">Режим OBC · ЦП</div>
              <div className="font-mono font-semibold text-sm text-slate-900 tabular-nums">
                {telemetry.mode} · {telemetry.cpuLoadPct.toFixed(0)}% · WDT {telemetry.watchdogAgeSec.toFixed(0)}с
              </div>
            </div>
            <div>
              <div className="text-slate-500">Батарея EPS</div>
              <div className="font-mono font-semibold text-sm text-slate-900 tabular-nums">
                {telemetry.batteryVolt.toFixed(2)} В · T {telemetry.temps.BAT.toFixed(1)}°C
              </div>
            </div>
            <div>
              <div className="text-slate-500">Катушки ADCS (%)</div>
              <div className="font-mono text-slate-800 tabular-nums">
                {telemetry.magnetorquer.X} / {telemetry.magnetorquer.Y} / {telemetry.magnetorquer.Z}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Связь и ДЗЗ</div>
              <div className="font-mono text-slate-800 tabular-nums">
                М:{telemetry.beaconsSent} · TLM:{telemetry.packetsSent} · ДЗЗ:{telemetry.imagesCaptured}
              </div>
            </div>
            <div className="col-span-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Шины 3.3V/5V</span>
              <span className="font-mono text-slate-800">
                COMMS:{telemetry.rails.COMMS_3V3 ? 'ON' : 'OFF'} · ADCS:{telemetry.rails.ADCS_5V ? 'ON' : 'OFF'} · PAY:{telemetry.rails.PAYLOAD_5V ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>

          {/* Live UART / AX.25 Console */}
          <div className="flex-1 flex flex-col min-h-[150px] bg-slate-950 text-slate-100">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 text-xs text-slate-400">
              <span>Бортовой журнал UART / AX.25</span>
              <button
                type="button"
                onClick={onClearLogs}
                className="text-slate-400 hover:text-white transition-colors"
              >
                Очистить
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed space-y-1">
              {telemetry.logs.length === 0 ? (
                <div className="text-slate-500">
                  Запустите HIL-симулятор для проверки блоков mBlock перед прошивкой STM32 / ESP32.
                </div>
              ) : (
                telemetry.logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-slate-500 shrink-0">{log.time}</span>
                    <span className="text-sky-400 shrink-0 w-14">[{log.source}]</span>
                    <span className="text-slate-200 break-words">{log.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {simSubTab === 'thermal' && (
        <ThermalPowerHeatmap
          programName={programName}
          telemetry={telemetry}
          onSimulateThermalBurst={onSimulateThermalBurst}
        />
      )}

      {simSubTab === 'faults' && (
        <div className="p-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-slate-600 leading-relaxed">
            Имитация аппаратных сбоев для стресс-тестирования программы «{programName}» до её загрузки на бортовой компьютер кубсата.
          </p>

          {(
            [
              {
                key: 'brownoutMode',
                title: 'Просадка солнечных панелей (0 Вт)',
                desc: 'Имитирует отказ MPPT или затенение всех панелей GaAs.',
              },
              {
                key: 'payloadRailShort',
                title: 'Короткое замыкание на шине PAYLOAD_5V',
                desc: 'Срабатывает аппаратная отсечка при попытке включить камеру ДЗЗ.',
              },
              {
                key: 'commsRfJamming',
                title: 'Помеха радиоканала UHF 435.800 МГц',
                desc: 'Трансивер активен, но квитанции наземной станции теряются.',
              },
              {
                key: 'gyroDisturbance',
                title: 'Внешний возмущающий момент по осям X/Y/Z',
                desc: 'Непрерывная раскрутка аппарата для проверки алгоритма ADCS B-dot.',
              },
            ] as const
          ).map((item) => {
            const active = telemetry.faults[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onToggleFault(item.key)}
                className={`w-full text-left p-3.5 rounded-lg border transition-colors flex items-start justify-between gap-3 ${
                  active
                    ? 'bg-rose-50 border-rose-300'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-900">{item.title}</div>
                  <div className="text-[11px] text-slate-600">{item.desc}</div>
                </div>
                <span
                  className={`font-mono text-[11px] font-semibold shrink-0 ${
                    active ? 'text-rose-700' : 'text-slate-400'
                  }`}
                >
                  {active ? 'АКТИВЕН' : 'ВЫКЛ'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {simSubTab === 'preflight' && (
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-sky-600" />
                Предполётная проверка (HIL)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Автоматический прогон программы по орбитальным и аварийным сценариям.
              </p>
            </div>
            <button
              type="button"
              onClick={onRunPreflight}
              disabled={runningPreflight}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
            >
              {runningPreflight ? 'Проверка...' : 'Запустить'}
            </button>
          </div>

          {!preflightReport ? (
            <div className="border border-slate-200 rounded-lg p-6 text-center text-xs text-slate-500 space-y-2">
              <Cpu className="w-7 h-7 mx-auto text-slate-400" />
              <div>Нажмите «Запустить» или «Автотест перед прошивкой», чтобы проверить готовность кода к деплою на железо кубсата.</div>
            </div>
          ) : (
            <>
              <div
                className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 ${
                  preflightReport.passed
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {preflightReport.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>
                    {preflightReport.passed
                      ? 'Допуск к деплою на STM32/ESP32 подтверждён'
                      : 'Обнаружены критичные замечания перед прошивкой'}
                  </span>
                </div>
                <span className="font-mono text-xs font-bold tabular-nums">
                  {preflightReport.scorePct}%
                </span>
              </div>

              <div className="space-y-2">
                {preflightReport.checks.map((chk) => (
                  <div
                    key={chk.id}
                    className="border border-slate-200 rounded-md p-3 space-y-1 bg-white"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        {chk.subsystem} · {chk.title}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-bold ${
                          chk.status === 'pass'
                            ? 'text-emerald-700'
                            : chk.status === 'warn'
                              ? 'text-amber-700'
                              : 'text-rose-700'
                        }`}
                      >
                        {chk.status === 'pass' ? 'PASS' : chk.status === 'warn' ? 'WARN' : 'FAIL'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">{chk.detail}</div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={onExportFirmware}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
              >
                <Download className="w-4 h-4" />
                Экспортировать прошивку для деплоя на железо
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
