import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Crosshair,
  FlaskConical,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import type { Subsystem } from '../types/cubesat.ts';
import type { FaultInjectionState, ObcMode } from '../mblock/simulator.ts';
import type {
  AssertionOperator,
  UnitAssertionSpec,
  UnitTestCase,
  UnitTestRunResult,
  UnitTestSuiteReport,
  UnitTestTrigger,
  WorkspaceStaticAnalysis,
} from '../mblock/unitTests.ts';

interface MBlockUnitTestPanelProps {
  programName: string;
  testCases: UnitTestCase[];
  staticAnalysis: WorkspaceStaticAnalysis;
  report: UnitTestSuiteReport | null;
  running: boolean;
  onRunAll: () => void;
  onRunSingle: (testId: string) => void;
  onToggleTest: (testId: string) => void;
  onAddCustomTest: (testCase: UnitTestCase) => void;
  onUpdateTest: (testCase: UnitTestCase) => void;
  onDeleteTest: (testId: string) => void;
  onResetTests: () => void;
  onFocusBlock: (blockId: string) => void;
  onProceedToSimulator: () => void;
}

type TestFilter = 'all' | 'enabled' | 'failed' | 'custom';
type TraceTab = 'assertions' | 'diff' | 'logs' | 'trace';

const TRIGGER_LABELS: Record<UnitTestTrigger, string> = {
  onBoot: 'Событие Boot',
  tick: 'Цикл Tick',
  boot_then_tick: 'Boot + Tick',
  'command:PING': 'Команда PING',
  'command:CAPTURE': 'Команда CAPTURE',
  'command:SAFE': 'Команда SAFE',
  'command:NOMINAL': 'Команда NOMINAL',
  'command:DETUMBLE': 'Команда DETUMBLE',
};

const ASSERTION_OPTIONS: { op: AssertionOperator; label: string }[] = [
  { op: 'mode_eq', label: 'Режим OBC равен' },
  { op: 'mode_neq', label: 'Режим OBC НЕ равен' },
  { op: 'rail_eq', label: 'Шина питания равна' },
  { op: 'heater_eq', label: 'Обогрев АКБ равен' },
  { op: 'watchdog_reset', label: 'Вызван сброс WDT' },
  { op: 'beacons_gte', label: 'Отправлено маяков >=' },
  { op: 'telemetry_gte', label: 'Пакетов телеметрии >=' },
  { op: 'images_gte', label: 'Снимков камеры >=' },
  { op: 'omega_lt', label: 'Угловая скорость |ω| <' },
  { op: 'omega_decreased', label: 'Угловая скорость |ω| снизилась' },
  { op: 'mtq_x_eq', label: 'Ток катушки MTQ_X (%)' },
  { op: 'tx_power_eq', label: 'Мощность TX (дБм)' },
  { op: 'battery_gte', label: 'Заряд АКБ (%) >=' },
  { op: 'battery_lte', label: 'Заряд АКБ (%) <=' },
  { op: 'calibrated_eq', label: 'Калибровка MeGyro' },
  { op: 'angle_abs_lt', label: 'Угол |Pitch| < (°)' },
  { op: 'frames_gte', label: 'Кадров 0xFF 0x55 >=' },
  { op: 'method_called', label: 'Вызван метод sim.*' },
  { op: 'method_not_called', label: 'НЕ вызывался метод sim.*' },
  { op: 'log_contains', label: 'В логах есть текст' },
];

const SIM_METHODS = [
  'setMode',
  'resetWatchdog',
  'setLed',
  'playBuzzer',
  'setRail',
  'setHeater',
  'calibrateGyro',
  'pidStabilize',
  'runBdot',
  'setMagnetorquer',
  'sendBeacon',
  'sendTelemetry',
  'sendMakeblockFrame',
  'setTxPower',
  'captureImage',
  'logTelemetry',
];

interface DraftAssertion {
  id: string;
  op: AssertionOperator;
  expected: string;
  rail: 'COMMS_3V3' | 'ADCS_5V' | 'PAYLOAD_5V';
  label: string;
}

function defaultExpectedForOp(op: AssertionOperator): string {
  switch (op) {
    case 'mode_eq':
      return 'SAFE';
    case 'mode_neq':
      return 'SAFE';
    case 'rail_eq':
      return 'false';
    case 'heater_eq':
      return 'true';
    case 'watchdog_reset':
    case 'omega_decreased':
      return 'true';
    case 'beacons_gte':
    case 'telemetry_gte':
    case 'images_gte':
      return '1';
    case 'omega_lt':
      return '5';
    case 'mtq_x_eq':
      return '0';
    case 'tx_power_eq':
      return '20';
    case 'battery_gte':
    case 'battery_lte':
      return '50';
    case 'calibrated_eq':
      return 'true';
    case 'angle_abs_lt':
      return '3';
    case 'frames_gte':
      return '1';
    case 'method_called':
      return 'setMode';
    case 'method_not_called':
      return 'captureImage';
    case 'log_contains':
      return 'SAFE';
  }
}

function formatAssertionLabel(d: DraftAssertion): string {
  if (d.label.trim()) return d.label.trim();
  const opTitle = ASSERTION_OPTIONS.find((o) => o.op === d.op)?.label || d.op;
  if (d.op === 'rail_eq') {
    const on = d.expected === 'true' || d.expected.toUpperCase() === 'ON';
    return `Шина ${d.rail} = ${on ? 'ВКЛ' : 'ВЫКЛ'}`;
  }
  if (d.op === 'heater_eq') {
    const on = d.expected === 'true' || d.expected.toUpperCase() === 'ON';
    return `Обогрев АКБ = ${on ? 'ВКЛ' : 'ВЫКЛ'}`;
  }
  if (d.op === 'calibrated_eq') {
    const on = d.expected === 'true' || d.expected.toUpperCase() === 'ON';
    return `Калибровка MeGyro = ${on ? 'Да' : 'Нет'}`;
  }
  if (d.op === 'watchdog_reset' || d.op === 'omega_decreased') {
    return opTitle;
  }
  return `${opTitle}: ${d.expected}`;
}

function toDraftAssertion(spec: UnitAssertionSpec): DraftAssertion {
  return {
    id: spec.id,
    op: spec.op,
    expected: spec.expected === undefined ? defaultExpectedForOp(spec.op) : String(spec.expected),
    rail: spec.rail || 'PAYLOAD_5V',
    label: spec.label,
  };
}

function buildAssertionSpec(d: DraftAssertion): UnitAssertionSpec {
  const label = formatAssertionLabel(d);
  if (d.op === 'rail_eq') {
    const boolVal =
      d.expected.toLowerCase() === 'true' ||
      d.expected === '1' ||
      d.expected.toUpperCase() === 'ON';
    return { id: d.id, label, op: 'rail_eq', rail: d.rail, expected: boolVal };
  }
  if (d.op === 'heater_eq' || d.op === 'calibrated_eq') {
    const boolVal =
      d.expected.toLowerCase() === 'true' ||
      d.expected === '1' ||
      d.expected.toUpperCase() === 'ON';
    return { id: d.id, label, op: d.op, expected: boolVal };
  }
  if (
    d.op === 'beacons_gte' ||
    d.op === 'telemetry_gte' ||
    d.op === 'images_gte' ||
    d.op === 'omega_lt' ||
    d.op === 'mtq_x_eq' ||
    d.op === 'tx_power_eq' ||
    d.op === 'battery_gte' ||
    d.op === 'battery_lte' ||
    d.op === 'angle_abs_lt' ||
    d.op === 'frames_gte'
  ) {
    const num = Number(d.expected);
    return {
      id: d.id,
      label,
      op: d.op,
      expected: Number.isFinite(num) ? num : 0,
    };
  }
  if (d.op === 'watchdog_reset' || d.op === 'omega_decreased') {
    return { id: d.id, label, op: d.op, expected: true };
  }
  return {
    id: d.id,
    label,
    op: d.op,
    expected: d.expected.trim() || defaultExpectedForOp(d.op),
  };
}

export const MBlockUnitTestPanel: React.FC<MBlockUnitTestPanelProps> = ({
  programName,
  testCases,
  staticAnalysis,
  report,
  running,
  onRunAll,
  onRunSingle,
  onToggleTest,
  onAddCustomTest,
  onUpdateTest,
  onDeleteTest,
  onResetTests,
  onFocusBlock,
  onProceedToSimulator,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<Record<string, TraceTab>>({});
  const [filter, setFilter] = useState<TestFilter>('all');
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);

  // Behavioral test specification & virtual sandbox builder state
  const [draftName, setDraftName] = useState('');
  const [draftSub, setDraftSub] = useState<Exclude<Subsystem, 'GROUND'>>('OBC');
  const [draftBehavior, setDraftBehavior] = useState('');
  const [draftTrigger, setDraftTrigger] = useState<UnitTestTrigger>('boot_then_tick');
  const [draftTickCount, setDraftTickCount] = useState(1);
  const [draftSimPhysics, setDraftSimPhysics] = useState(false);

  const [mockMode, setMockMode] = useState<ObcMode>('NOMINAL');
  const [mockBattery, setMockBattery] = useState(50);
  const [mockBatTemp, setMockBatTemp] = useState(16);
  const [mockEclipse, setMockEclipse] = useState(false);
  const [mockHeaterOn, setMockHeaterOn] = useState(false);
  const [mockGyro, setMockGyro] = useState({ X: 2.5, Y: -0.6, Z: 0.3 });
  const [mockRails, setMockRails] = useState({
    COMMS_3V3: true,
    ADCS_5V: true,
    PAYLOAD_5V: false,
  });
  const [mockFaults, setMockFaults] = useState<FaultInjectionState>({
    brownoutMode: false,
    payloadRailShort: false,
    commsRfJamming: false,
    gyroDisturbance: false,
  });

  const [draftAssertions, setDraftAssertions] = useState<DraftAssertion[]>([
    {
      id: 'a-init-1',
      op: 'mode_eq',
      expected: 'SAFE',
      rail: 'PAYLOAD_5V',
      label: '',
    },
  ]);

  const resultMap = new Map<string, UnitTestRunResult>(
    (report?.results || []).map((r) => [r.testId, r])
  );

  const openNewBuilder = () => {
    setEditingTestId(null);
    setDraftName('');
    setDraftSub('EPS');
    setDraftBehavior('');
    setDraftTrigger('boot_then_tick');
    setDraftTickCount(1);
    setDraftSimPhysics(false);
    setMockMode('NOMINAL');
    setMockBattery(20);
    setMockBatTemp(12);
    setMockEclipse(true);
    setMockHeaterOn(false);
    setMockGyro({ X: 1.5, Y: -0.4, Z: 0.2 });
    setMockRails({ COMMS_3V3: true, ADCS_5V: true, PAYLOAD_5V: true });
    setMockFaults({
      brownoutMode: false,
      payloadRailShort: false,
      commsRfJamming: false,
      gyroDisturbance: false,
    });
    setDraftAssertions([
      {
        id: `a-${Date.now()}`,
        op: 'mode_eq',
        expected: 'SAFE',
        rail: 'PAYLOAD_5V',
        label: '',
      },
    ]);
    setShowBuilder(true);
  };

  const openEditOrCloneBuilder = (tc: UnitTestCase, clone: boolean) => {
    setEditingTestId(clone ? null : tc.id);
    setDraftName(clone ? `${tc.name} (копия)` : tc.name);
    setDraftSub(tc.subsystem);
    setDraftBehavior(tc.expectedBehavior || tc.description || '');
    setDraftTrigger(tc.trigger);
    setDraftTickCount(tc.tickCount);
    setDraftSimPhysics(Boolean(tc.simulatePhysics));
    setMockMode(tc.mockInput.mode);
    setMockBattery(tc.mockInput.batteryPct);
    setMockBatTemp(tc.mockInput.batTempC ?? (tc.mockInput.inEclipse ? 4 : 16.8));
    setMockEclipse(tc.mockInput.inEclipse);
    setMockHeaterOn(Boolean(tc.mockInput.heaterOn));
    setMockGyro({ ...tc.mockInput.gyro });
    setMockRails({ ...tc.mockInput.rails });
    setMockFaults({
      brownoutMode: Boolean(tc.mockInput.faults?.brownoutMode),
      payloadRailShort: Boolean(tc.mockInput.faults?.payloadRailShort),
      commsRfJamming: Boolean(tc.mockInput.faults?.commsRfJamming),
      gyroDisturbance: Boolean(tc.mockInput.faults?.gyroDisturbance),
    });
    setDraftAssertions(
      tc.assertions.length > 0
        ? tc.assertions.map(toDraftAssertion)
        : [
            {
              id: `a-${Date.now()}`,
              op: 'mode_eq',
              expected: 'NOMINAL',
              rail: 'PAYLOAD_5V',
              label: '',
            },
          ]
    );
    setShowBuilder(true);
  };

  const handleSaveSpec = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draftName.trim();
    if (!title || draftAssertions.length === 0) return;

    const existing = editingTestId
      ? testCases.find((t) => t.id === editingTestId)
      : undefined;
    const behaviorText =
      draftBehavior.trim() || `Проверка поведения алгоритма «${programName}» в виртуальной песочнице.`;

    const builtCase: UnitTestCase = {
      id: existing ? existing.id : `ut-custom-${Date.now().toString(36)}`,
      name: title,
      subsystem: draftSub,
      description: behaviorText,
      expectedBehavior: behaviorText,
      enabled: existing ? existing.enabled : true,
      isCustom: existing ? existing.isCustom : true,
      trigger: draftTrigger,
      tickCount: Math.max(1, Math.min(50, draftTickCount)),
      simulatePhysics: draftSimPhysics,
      mockInput: {
        mode: mockMode,
        batteryPct: Math.max(0, Math.min(100, mockBattery)),
        inEclipse: mockEclipse,
        batTempC: mockBatTemp,
        heaterOn: mockHeaterOn,
        gyro: { ...mockGyro },
        rails: { ...mockRails },
        faults: { ...mockFaults },
      },
      assertions: draftAssertions.map(buildAssertionSpec),
    };

    if (existing) {
      onUpdateTest(builtCase);
      setExpandedId(builtCase.id);
    } else {
      onAddCustomTest(builtCase);
      setExpandedId(builtCase.id);
    }
    setShowBuilder(false);
    setEditingTestId(null);
  };

  const updateAssertionDraft = (
    idx: number,
    patch: Partial<DraftAssertion>
  ) => {
    setDraftAssertions((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const next = { ...item, ...patch };
        if (patch.op && patch.op !== item.op) {
          next.expected = defaultExpectedForOp(patch.op);
          next.label = '';
        }
        return next;
      })
    );
  };

  const failedTestIds = new Set(
    (report?.results || []).filter((r) => !r.skipped && !r.passed).map((r) => r.testId)
  );

  const visibleTests = testCases.filter((tc) => {
    if (filter === 'enabled') return tc.enabled;
    if (filter === 'failed') return failedTestIds.has(tc.id);
    if (filter === 'custom') return Boolean(tc.isCustom);
    return true;
  });

  const renderAssertionInput = (item: DraftAssertion, idx: number) => {
    if (item.op === 'mode_eq' || item.op === 'mode_neq') {
      return (
        <select
          value={item.expected}
          onChange={(e) => updateAssertionDraft(idx, { expected: e.target.value })}
          className="px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono"
        >
          <option value="NOMINAL">NOMINAL</option>
          <option value="SAFE">SAFE</option>
          <option value="DETUMBLE">DETUMBLE</option>
          <option value="SCIENCE">SCIENCE</option>
        </select>
      );
    }
    if (item.op === 'rail_eq') {
      return (
        <div className="flex gap-1">
          <select
            value={item.rail}
            onChange={(e) =>
              updateAssertionDraft(idx, {
                rail: e.target.value as 'COMMS_3V3' | 'ADCS_5V' | 'PAYLOAD_5V',
              })
            }
            className="flex-1 px-1.5 py-1 text-[11px] bg-white border border-slate-200 rounded font-mono"
          >
            <option value="PAYLOAD_5V">PAYLOAD_5V</option>
            <option value="COMMS_3V3">COMMS_3V3</option>
            <option value="ADCS_5V">ADCS_5V</option>
          </select>
          <select
            value={item.expected}
            onChange={(e) => updateAssertionDraft(idx, { expected: e.target.value })}
            className="w-16 px-1.5 py-1 text-[11px] bg-white border border-slate-200 rounded"
          >
            <option value="false">ВЫКЛ</option>
            <option value="true">ВКЛ</option>
          </select>
        </div>
      );
    }
    if (item.op === 'heater_eq') {
      return (
        <select
          value={item.expected}
          onChange={(e) => updateAssertionDraft(idx, { expected: e.target.value })}
          className="px-2 py-1 text-xs bg-white border border-slate-200 rounded"
        >
          <option value="true">ВКЛ (ON)</option>
          <option value="false">ВЫКЛ (OFF)</option>
        </select>
      );
    }
    if (item.op === 'watchdog_reset' || item.op === 'omega_decreased') {
      return (
        <div className="px-2 py-1 text-[11px] text-slate-500 bg-slate-100 rounded border border-slate-200">
          Автоматическая проверка
        </div>
      );
    }
    if (item.op === 'method_called' || item.op === 'method_not_called') {
      return (
        <select
          value={item.expected}
          onChange={(e) => updateAssertionDraft(idx, { expected: e.target.value })}
          className="px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono"
        >
          {SIM_METHODS.map((m) => (
            <option key={m} value={m}>
              sim.{m}()
            </option>
          ))}
        </select>
      );
    }
    if (
      item.op === 'beacons_gte' ||
      item.op === 'telemetry_gte' ||
      item.op === 'images_gte' ||
      item.op === 'omega_lt' ||
      item.op === 'mtq_x_eq' ||
      item.op === 'tx_power_eq' ||
      item.op === 'battery_gte' ||
      item.op === 'battery_lte'
    ) {
      return (
        <input
          type="number"
          step="any"
          value={item.expected}
          onChange={(e) => updateAssertionDraft(idx, { expected: e.target.value })}
          className="px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono tabular-nums"
        />
      );
    }
    return (
      <input
        type="text"
        value={item.expected}
        onChange={(e) => updateAssertionDraft(idx, { expected: e.target.value })}
        placeholder="Подстрока в журнале"
        className="px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono"
      />
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header & Action Bar */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5 text-sky-600" />
              Модульные тесты · Виртуальная песочница
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              Опишите ожидаемое поведение алгоритма и проверьте логику на изолированных моках.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunAll}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Проверка...' : 'Запустить все'}
          </button>
        </div>

        {/* Summary Metrics Strip */}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          <div className="bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
            <div className="text-[10px] text-slate-500">Пройдено</div>
            <div className="text-xs font-mono font-bold tabular-nums text-slate-900">
              {report
                ? `${report.passedCount}/${report.totalActive}`
                : `—/${testCases.filter((t) => t.enabled).length}`}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
            <div className="text-[10px] text-slate-500">Покрытие API</div>
            <div className="text-xs font-mono font-bold tabular-nums text-slate-900">
              {report ? `${report.coveragePct}%` : '—'}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
            <div className="text-[10px] text-slate-500">Граф блоков</div>
            <div
              className={`text-xs font-mono font-bold tabular-nums ${
                staticAnalysis.hasBlockingErrors
                  ? 'text-rose-700'
                  : staticAnalysis.diagnostics.length > 0
                    ? 'text-amber-700'
                    : 'text-emerald-700'
              }`}
            >
              {staticAnalysis.hasBlockingErrors
                ? 'Ошибки'
                : staticAnalysis.diagnostics.length > 0
                  ? `${staticAnalysis.diagnostics.length} пред.`
                  : 'OK'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
        {/* Gate Banner (when report exists) */}
        {report && (
          <div
            className={`px-4 py-2.5 flex items-center justify-between gap-2 text-xs ${
              report.readyForSimulator
                ? 'bg-emerald-50 text-emerald-900'
                : 'bg-amber-50 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2 font-medium min-w-0">
              <ShieldCheck
                className={`w-4 h-4 shrink-0 ${
                  report.readyForSimulator ? 'text-emerald-600' : 'text-amber-600'
                }`}
              />
              <span className="truncate">
                {report.readyForSimulator
                  ? 'Поведение в песочнице подтверждено — можно запускать стенд'
                  : report.failedCount > 0
                    ? `Провалено сценариев: ${report.failedCount}. Проверьте логику блоков.`
                    : 'Включите хотя бы 1 тест без блокирующих ошибок графа'}
              </span>
            </div>
            <button
              type="button"
              onClick={onProceedToSimulator}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                report.readyForSimulator
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              В симулятор
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Section 1: Static Visual Block Graph Analysis */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
            <span>Статическая проверка графа блоков</span>
            <span className="font-mono font-normal text-slate-500 tabular-nums">
              блоков: {staticAnalysis.totalBlocks} · событий: {staticAnalysis.hatCount}
            </span>
          </div>

          {staticAnalysis.diagnostics.length === 0 ? (
            <div className="text-[11px] text-emerald-700 flex items-center gap-1.5 bg-emerald-50/70 border border-emerald-200 rounded-md px-2.5 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Все блоки подключены к событиям, критических разрывов графа не обнаружено.
            </div>
          ) : (
            <div className="space-y-1.5">
              {staticAnalysis.diagnostics.map((diag) => (
                <div
                  key={diag.id}
                  className={`text-[11px] rounded-md border px-2.5 py-2 flex items-start justify-between gap-2 ${
                    diag.severity === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-start gap-1.5 min-w-0">
                    {diag.severity === 'error' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-snug">{diag.message}</span>
                  </div>
                  {diag.blockId && (
                    <button
                      type="button"
                      onClick={() => onFocusBlock(diag.blockId!)}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold underline shrink-0 hover:opacity-80 whitespace-nowrap"
                    >
                      <Crosshair className="w-3 h-3" />
                      К блоку
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {report && report.uncoveredMethods.length > 0 && (
            <div className="text-[11px] text-slate-500 pt-0.5">
              Не охвачены тестами вызовы:{' '}
              <span className="font-mono text-slate-700">
                {report.uncoveredMethods.join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Section 2: Behavioral Specifications & Virtual Sandbox */}
        <div className="px-4 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-700">
              Сценарии поведения ({visibleTests.length}/{testCases.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResetTests}
                title="Восстановить базовый набор сценариев"
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                Сброс
              </button>
              <button
                type="button"
                onClick={openNewBuilder}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3 h-3" />
                Новый сценарий
              </button>
            </div>
          </div>

          {/* Filter Segmented Control */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 border border-slate-200 rounded-md">
            {(
              [
                ['all', `Все (${testCases.length})`],
                ['enabled', `Активные (${testCases.filter((t) => t.enabled).length})`],
                ['failed', `Ошибки (${failedTestIds.size})`],
                ['custom', `Свои (${testCases.filter((t) => t.isCustom).length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`flex-1 px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  filter === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Behavioral Test Constructor / Editor */}
          {showBuilder && (
            <form
              onSubmit={handleSaveSpec}
              className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-900">
                  {editingTestId
                    ? 'Редактирование сценария песочницы'
                    : 'Новый сценарий виртуальной песочницы'}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowBuilder(false);
                    setEditingTestId(null);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded"
                  aria-label="Закрыть конструктор"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 1. Behavior Specification */}
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] text-slate-500 mb-0.5">
                      Название проверки
                    </label>
                    <input
                      type="text"
                      required
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Напр.: Защита камеры при разряде < 25%"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Подсистема</label>
                    <select
                      value={draftSub}
                      onChange={(e) =>
                        setDraftSub(e.target.value as Exclude<Subsystem, 'GROUND'>)
                      }
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded"
                    >
                      {(['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD'] as const).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">
                    Ожидаемое поведение алгоритма (Дано · Когда · Ожидается)
                  </label>
                  <textarea
                    rows={2}
                    value={draftBehavior}
                    onChange={(e) => setDraftBehavior(e.target.value)}
                    placeholder="Напр.: Дано АКБ 18% в тени Земли. Когда срабатывает цикл телеметрии, OBC переходит в SAFE и выключает PAYLOAD_5V."
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded leading-snug"
                  />
                </div>
              </div>

              {/* 2. Virtual Sandbox Initial Conditions */}
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="text-[10px] font-semibold text-slate-600">
                  Дано · Параметры виртуальной песочницы
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Режим</label>
                    <select
                      value={mockMode}
                      onChange={(e) => setMockMode(e.target.value as ObcMode)}
                      className="w-full px-1.5 py-1 text-[11px] bg-white border border-slate-200 rounded font-mono"
                    >
                      <option value="NOMINAL">NOMINAL</option>
                      <option value="SAFE">SAFE</option>
                      <option value="DETUMBLE">DETUMBLE</option>
                      <option value="SCIENCE">SCIENCE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">АКБ (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={mockBattery}
                      onChange={(e) => setMockBattery(Number(e.target.value))}
                      className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">T_BAT (°C)</label>
                    <input
                      type="number"
                      step={0.5}
                      value={mockBatTemp}
                      onChange={(e) => setMockBatTemp(Number(e.target.value))}
                      className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Триггер</label>
                    <select
                      value={draftTrigger}
                      onChange={(e) => setDraftTrigger(e.target.value as UnitTestTrigger)}
                      className="w-full px-1.5 py-1 text-[11px] bg-white border border-slate-200 rounded"
                    >
                      {(Object.keys(TRIGGER_LABELS) as UnitTestTrigger[]).map((tr) => (
                        <option key={tr} value={tr}>
                          {TRIGGER_LABELS[tr]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Gyro X (°/с)</label>
                    <input
                      type="number"
                      step={0.5}
                      value={mockGyro.X}
                      onChange={(e) =>
                        setMockGyro((g) => ({ ...g, X: Number(e.target.value) }))
                      }
                      className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Gyro Y (°/с)</label>
                    <input
                      type="number"
                      step={0.5}
                      value={mockGyro.Y}
                      onChange={(e) =>
                        setMockGyro((g) => ({ ...g, Y: Number(e.target.value) }))
                      }
                      className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Gyro Z (°/с)</label>
                    <input
                      type="number"
                      step={0.5}
                      value={mockGyro.Z}
                      onChange={(e) =>
                        setMockGyro((g) => ({ ...g, Z: Number(e.target.value) }))
                      }
                      className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Тиков</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={draftTickCount}
                      onChange={(e) => setDraftTickCount(Number(e.target.value))}
                      className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded font-mono tabular-nums"
                    />
                  </div>
                </div>

                {/* Initial Rails & Fault Injections */}
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-slate-700 pt-0.5">
                  {(['COMMS_3V3', 'ADCS_5V', 'PAYLOAD_5V'] as const).map((rail) => (
                    <label key={rail} className="inline-flex items-center gap-1 font-mono text-[10px]">
                      <input
                        type="checkbox"
                        checked={mockRails[rail]}
                        onChange={(e) =>
                          setMockRails((r) => ({ ...r, [rail]: e.target.checked }))
                        }
                        className="accent-sky-600"
                      />
                      {rail}
                    </label>
                  ))}
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={mockEclipse}
                      onChange={(e) => setMockEclipse(e.target.checked)}
                      className="accent-sky-600"
                    />
                    Тень Земли
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={mockHeaterOn}
                      onChange={(e) => setMockHeaterOn(e.target.checked)}
                      className="accent-sky-600"
                    />
                    Обогрев АКБ
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={draftSimPhysics}
                      onChange={(e) => setDraftSimPhysics(e.target.checked)}
                      className="accent-sky-600"
                    />
                    Шаг физики за тик
                  </label>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-amber-800">
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={mockFaults.commsRfJamming}
                      onChange={(e) =>
                        setMockFaults((f) => ({ ...f, commsRfJamming: e.target.checked }))
                      }
                      className="accent-amber-600"
                    />
                    Сбой: помеха RF
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={mockFaults.payloadRailShort}
                      onChange={(e) =>
                        setMockFaults((f) => ({ ...f, payloadRailShort: e.target.checked }))
                      }
                      className="accent-amber-600"
                    />
                    Сбой: КЗ PAYLOAD_5V
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={mockFaults.brownoutMode}
                      onChange={(e) =>
                        setMockFaults((f) => ({ ...f, brownoutMode: e.target.checked }))
                      }
                      className="accent-amber-600"
                    />
                    Сбой: отказ MPPT
                  </label>
                </div>
              </div>

              {/* 3. Expected Assertions */}
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-600">
                    Ожидаемое поведение · Проверки ({draftAssertions.length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftAssertions((prev) => [
                        ...prev,
                        {
                          id: `a-${Date.now()}-${prev.length}`,
                          op: 'rail_eq',
                          rail: 'PAYLOAD_5V',
                          expected: 'false',
                          label: '',
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-sky-900"
                  >
                    <Plus className="w-3 h-3" />
                    Добавить проверку
                  </button>
                </div>

                <div className="space-y-2">
                  {draftAssertions.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-2 bg-white border border-slate-200 rounded space-y-1.5"
                    >
                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          value={item.op}
                          onChange={(e) =>
                            updateAssertionDraft(idx, {
                              op: e.target.value as AssertionOperator,
                            })
                          }
                          className="px-2 py-1 text-[11px] bg-white border border-slate-200 rounded"
                        >
                          {ASSERTION_OPTIONS.map((o) => (
                            <option key={o.op} value={o.op}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          <div className="flex-1 min-w-0">
                            {renderAssertionInput(item, idx)}
                          </div>
                          {draftAssertions.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraftAssertions((prev) =>
                                  prev.filter((_, i) => i !== idx)
                                )
                              }
                              title="Удалить проверку"
                              className="p-1 text-slate-400 hover:text-rose-600 shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) =>
                          updateAssertionDraft(idx, { label: e.target.value })
                        }
                        placeholder={`Описание: ${formatAssertionLabel({ ...item, label: '' })}`}
                        className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded text-slate-700"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowBuilder(false);
                    setEditingTestId(null);
                  }}
                  className="px-2.5 py-1 text-xs text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-xs font-semibold text-white bg-sky-600 rounded hover:bg-sky-700"
                >
                  {editingTestId ? 'Сохранить и запустить' : 'Создать и проверить'}
                </button>
              </div>
            </form>
          )}

          {/* Test Cases Accordion */}
          {visibleTests.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-md">
              Нет сценариев для выбранного фильтра.
            </div>
          ) : (
            <div className="space-y-2">
              {visibleTests.map((tc) => {
                const res = resultMap.get(tc.id);
                const isOpen = expandedId === tc.id;
                const currentTab: TraceTab = activeDetailTab[tc.id] || 'assertions';
                const initOmega = Math.hypot(
                  tc.mockInput.gyro.X,
                  tc.mockInput.gyro.Y,
                  tc.mockInput.gyro.Z
                );

                return (
                  <div
                    key={tc.id}
                    className={`border rounded-md overflow-hidden transition-colors ${
                      !tc.enabled
                        ? 'border-slate-200 bg-slate-50/50 opacity-75'
                        : res
                          ? res.skipped
                            ? 'border-slate-200 bg-white'
                            : res.passed
                              ? 'border-emerald-200 bg-white'
                              : 'border-rose-300 bg-rose-50/20'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="px-3 py-2 flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={tc.enabled}
                        onChange={() => onToggleTest(tc.id)}
                        title="Включить тест в прогон"
                        className="mt-1 accent-sky-600 shrink-0"
                      />

                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : tc.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isOpen ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <span className="font-mono text-[10px] font-semibold text-slate-500 shrink-0">
                              {tc.subsystem}
                            </span>
                            <span className="text-xs font-semibold text-slate-900 truncate">
                              {tc.name}
                            </span>
                          </div>

                          {res ? (
                            res.skipped ? (
                              <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold text-slate-500 shrink-0">
                                <SkipForward className="w-3 h-3" />
                                SKIP
                              </span>
                            ) : res.passed ? (
                              <span className="font-mono text-[10px] font-bold text-emerald-700 shrink-0 tabular-nums">
                                PASS · {res.durationMs.toFixed(1)}мс
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] font-bold text-rose-700 shrink-0 tabular-nums">
                                FAIL · {res.durationMs.toFixed(1)}мс
                              </span>
                            )
                          ) : (
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">
                              {TRIGGER_LABELS[tc.trigger]}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 pl-5 mt-0.5 line-clamp-1">
                          {tc.expectedBehavior || tc.description}
                        </div>
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedId(tc.id);
                            onRunSingle(tc.id);
                          }}
                          title="Запустить этот сценарий в песочнице"
                          className="p-1 text-slate-500 hover:text-sky-700 rounded hover:bg-slate-100"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditOrCloneBuilder(tc, false)}
                          title="Редактировать поведение и условия песочницы"
                          className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditOrCloneBuilder(tc, true)}
                          title="Дублировать сценарий"
                          className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {tc.isCustom && (
                          <button
                            type="button"
                            onClick={() => onDeleteTest(tc.id)}
                            title="Удалить тест"
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/70 space-y-2.5 text-[11px]">
                        {/* Behavioral Expectation & Sandbox Inputs */}
                        <div className="space-y-1">
                          <div className="text-slate-700 leading-relaxed">
                            {tc.expectedBehavior || tc.description}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500 flex flex-wrap gap-x-2.5 gap-y-0.5 tabular-nums">
                            <span>{TRIGGER_LABELS[tc.trigger]}</span>
                            <span aria-hidden="true">·</span>
                            <span>Тиков: {tc.tickCount}</span>
                            <span aria-hidden="true">·</span>
                            <span>АКБ: {tc.mockInput.batteryPct}%</span>
                            <span aria-hidden="true">·</span>
                            <span>T_BAT: {(tc.mockInput.batTempC ?? (tc.mockInput.inEclipse ? 4 : 16.8)).toFixed(1)}°C</span>
                            <span aria-hidden="true">·</span>
                            <span>|ω|: {initOmega.toFixed(1)}°/с</span>
                            <span aria-hidden="true">·</span>
                            <span>{tc.mockInput.inEclipse ? 'Тень' : 'Солнце'}</span>
                            {tc.simulatePhysics && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Физика ВКЛ</span>
                              </>
                            )}
                          </div>
                        </div>

                        {res?.skipped && (
                          <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                            Пропущен: {res.skipReason}
                          </div>
                        )}

                        {res?.error && (
                          <div className="text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1.5 font-mono">
                            Ошибка песочницы: {res.error}
                          </div>
                        )}

                        {/* Inspection Tabs (Assertions / Sandbox Diff / Logs / Trace) */}
                        {res ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
                              {(
                                [
                                  ['assertions', `Проверки (${res.assertionResults.length})`],
                                  ['diff', 'Было → Стало'],
                                  ['logs', `Логи (${res.finalState.logs.length})`],
                                  ['trace', `Вызовы (${res.spyTrace.length})`],
                                ] as const
                              ).map(([tabKey, tabLabel]) => (
                                <button
                                  key={tabKey}
                                  type="button"
                                  onClick={() =>
                                    setActiveDetailTab((prev) => ({
                                      ...prev,
                                      [tc.id]: tabKey,
                                    }))
                                  }
                                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors whitespace-nowrap ${
                                    currentTab === tabKey
                                      ? 'bg-slate-900 text-white'
                                      : 'text-slate-600 hover:bg-slate-200/70'
                                  }`}
                                >
                                  {tabLabel}
                                </button>
                              ))}
                            </div>

                            {currentTab === 'assertions' && (
                              <div className="space-y-1">
                                {res.assertionResults.length === 0 ? (
                                  <div className="text-slate-500">Нет активных проверок.</div>
                                ) : (
                                  res.assertionResults.map((ar) => (
                                    <div
                                      key={ar.id}
                                      className={`px-2 py-1.5 rounded border flex items-center justify-between gap-2 ${
                                        ar.passed
                                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                          : 'bg-rose-50 border-rose-200 text-rose-950'
                                      }`}
                                    >
                                      <span className="truncate">{ar.label}</span>
                                      <span className="font-mono text-[10px] shrink-0 tabular-nums">
                                        {ar.passed
                                          ? ar.actualText
                                          : `ожид. ${ar.expectedText} ≠ ${ar.actualText}`}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}

                            {currentTab === 'diff' && (
                              <div className="bg-white border border-slate-200 rounded p-2 font-mono text-[10px] tabular-nums space-y-1">
                                <div className="grid grid-cols-3 text-slate-400 border-b border-slate-100 pb-1">
                                  <span>Параметр</span>
                                  <span>Было (моки)</span>
                                  <span>Стало (после)</span>
                                </div>
                                <div className="grid grid-cols-3">
                                  <span className="text-slate-500">Режим OBC</span>
                                  <span>{res.initialState.mode}</span>
                                  <span className="font-semibold text-slate-900">
                                    {res.finalState.mode}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3">
                                  <span className="text-slate-500">Заряд АКБ</span>
                                  <span>{res.initialState.batteryPct.toFixed(1)}%</span>
                                  <span>{res.finalState.batteryPct.toFixed(1)}%</span>
                                </div>
                                <div className="grid grid-cols-3">
                                  <span className="text-slate-500">|ω| гиро</span>
                                  <span>
                                    {Math.hypot(
                                      res.initialState.gyro.X,
                                      res.initialState.gyro.Y,
                                      res.initialState.gyro.Z
                                    ).toFixed(2)}
                                    °/с
                                  </span>
                                  <span>
                                    {Math.hypot(
                                      res.finalState.gyro.X,
                                      res.finalState.gyro.Y,
                                      res.finalState.gyro.Z
                                    ).toFixed(2)}
                                    °/с
                                  </span>
                                </div>
                                <div className="grid grid-cols-3">
                                  <span className="text-slate-500">PAYLOAD_5V</span>
                                  <span>{res.initialState.rails.PAYLOAD_5V ? 'ON' : 'OFF'}</span>
                                  <span>{res.finalState.rails.PAYLOAD_5V ? 'ON' : 'OFF'}</span>
                                </div>
                                <div className="grid grid-cols-3">
                                  <span className="text-slate-500">Обогрев АКБ</span>
                                  <span>{res.initialState.heaterOn ? 'ON' : 'OFF'}</span>
                                  <span>{res.finalState.heaterOn ? 'ON' : 'OFF'}</span>
                                </div>
                                <div className="grid grid-cols-3">
                                  <span className="text-slate-500">Счётчики</span>
                                  <span>WDT 0 · TLM 0</span>
                                  <span>
                                    WDT {res.finalState.watchdogResets} · BCN{' '}
                                    {res.finalState.beaconsSent} · TLM{' '}
                                    {res.finalState.packetsSent} · IMG{' '}
                                    {res.finalState.imagesCaptured}
                                  </span>
                                </div>
                              </div>
                            )}

                            {currentTab === 'logs' && (
                              <div className="max-h-36 overflow-y-auto bg-slate-950 text-slate-200 rounded p-2 font-mono text-[10px] space-y-1">
                                {res.finalState.logs.length === 0 ? (
                                  <div className="text-slate-500">
                                    Журнал виртуальной песочницы пуст.
                                  </div>
                                ) : (
                                  [...res.finalState.logs].reverse().map((entry) => (
                                    <div key={entry.id} className="leading-snug">
                                      <span className="text-sky-400">[{entry.source}]</span>{' '}
                                      <span className="text-slate-200">{entry.text}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}

                            {currentTab === 'trace' && (
                              <div className="max-h-36 overflow-y-auto bg-slate-950 text-slate-200 rounded p-2 font-mono text-[10px] space-y-0.5">
                                {res.spyTrace.length === 0 ? (
                                  <div className="text-slate-500">
                                    Методы sim.* не вызывались.
                                  </div>
                                ) : (
                                  res.spyTrace.map((call) => (
                                    <div key={call.seq}>
                                      <span className="text-slate-500">{call.seq}. </span>
                                      <span className="text-sky-400">sim.{call.method}</span>
                                      <span className="text-slate-300">({call.args})</span>
                                      {call.result !== undefined && (
                                        <span className="text-emerald-400"> → {call.result}</span>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {tc.assertions.map((a) => (
                              <div key={a.id} className="text-slate-600">
                                • {a.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
