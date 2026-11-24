import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crosshair,
  FlaskConical,
  Play,
  Plus,
  ShieldCheck,
  SkipForward,
  Trash2,
} from 'lucide-react';
import type { Subsystem } from '../types/cubesat.ts';
import type { ObcMode } from '../mblock/simulator.ts';
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
  onDeleteTest: (testId: string) => void;
  onResetTests: () => void;
  onFocusBlock: (blockId: string) => void;
  onProceedToSimulator: () => void;
}

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
  { op: 'watchdog_reset', label: 'Вызван сброс WDT' },
  { op: 'beacons_gte', label: 'Отправлено маяков >=' },
  { op: 'telemetry_gte', label: 'Пакетов телеметрии >=' },
  { op: 'images_gte', label: 'Снимков камеры >=' },
  { op: 'omega_decreased', label: 'Угловая скорость |ω| снизилась' },
  { op: 'method_called', label: 'Вызван метод sim.*' },
  { op: 'log_contains', label: 'В логах есть текст' },
];

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
  onDeleteTest,
  onResetTests,
  onFocusBlock,
  onProceedToSimulator,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  // Custom test builder state
  const [newName, setNewName] = useState('');
  const [newSub, setNewSub] = useState<Exclude<Subsystem, 'GROUND'>>('OBC');
  const [newTrigger, setNewTrigger] = useState<UnitTestTrigger>('boot_then_tick');
  const [newTickCount, setNewTickCount] = useState(1);
  const [mockMode, setMockMode] = useState<ObcMode>('NOMINAL');
  const [mockBattery, setMockBattery] = useState(50);
  const [mockEclipse, setMockEclipse] = useState(false);
  const [mockGyroX, setMockGyroX] = useState(2.5);
  const [assertOp, setAssertOp] = useState<AssertionOperator>('mode_eq');
  const [assertExpected, setAssertExpected] = useState('SAFE');
  const [assertRail, setAssertRail] = useState<'COMMS_3V3' | 'ADCS_5V' | 'PAYLOAD_5V'>('PAYLOAD_5V');

  const resultMap = new Map<string, UnitTestRunResult>(
    (report?.results || []).map((r) => [r.testId, r])
  );

  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newName.trim();
    if (!title) return;

    let assertion: UnitAssertionSpec;
    if (assertOp === 'rail_eq') {
      const boolVal = assertExpected.toLowerCase() === 'true' || assertExpected === '1' || assertExpected.toUpperCase() === 'ON';
      assertion = {
        id: `a-${Date.now()}`,
        label: `Шина ${assertRail} = ${boolVal ? 'ВКЛ' : 'ВЫКЛ'}`,
        op: 'rail_eq',
        rail: assertRail,
        expected: boolVal,
      };
    } else if (assertOp === 'beacons_gte' || assertOp === 'telemetry_gte' || assertOp === 'images_gte') {
      const num = Math.max(0, Number(assertExpected) || 1);
      assertion = {
        id: `a-${Date.now()}`,
        label: `${ASSERTION_OPTIONS.find((o) => o.op === assertOp)?.label} ${num}`,
        op: assertOp,
        expected: num,
      };
    } else if (assertOp === 'watchdog_reset' || assertOp === 'omega_decreased') {
      assertion = {
        id: `a-${Date.now()}`,
        label: ASSERTION_OPTIONS.find((o) => o.op === assertOp)?.label || assertOp,
        op: assertOp,
        expected: true,
      };
    } else {
      assertion = {
        id: `a-${Date.now()}`,
        label: `${ASSERTION_OPTIONS.find((o) => o.op === assertOp)?.label}: ${assertExpected}`,
        op: assertOp,
        expected: assertExpected.trim() || 'NOMINAL',
      };
    }

    const custom: UnitTestCase = {
      id: `ut-custom-${Date.now().toString(36)}`,
      name: title,
      subsystem: newSub,
      description: `Пользовательский тест для «${programName}»`,
      enabled: true,
      isCustom: true,
      trigger: newTrigger,
      tickCount: Math.max(1, newTickCount),
      mockInput: {
        mode: mockMode,
        batteryPct: mockBattery,
        inEclipse: mockEclipse,
        gyro: { X: mockGyroX, Y: 0.4, Z: -0.2 },
        rails: {
          COMMS_3V3: true,
          ADCS_5V: true,
          PAYLOAD_5V: assertRail === 'PAYLOAD_5V' && assertExpected === 'false',
        },
      },
      assertions: [assertion],
    };

    onAddCustomTest(custom);
    setNewName('');
    setShowBuilder(false);
    setExpandedId(custom.id);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header & Action Bar */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5 text-sky-600" />
              Юнит-тестирование блоков mBlock
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Проверка логики на моках датчиков до запуска симулятора и прошивки.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunAll}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50 shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Тесты...' : 'Запустить все'}
          </button>
        </div>

        {/* Summary Metrics Strip */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
            <div className="text-[10px] text-slate-500">Пройдено</div>
            <div className="text-xs font-mono font-bold tabular-nums text-slate-900">
              {report ? `${report.passedCount}/${report.totalActive}` : `—/${testCases.filter((t) => t.enabled).length}`}
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
                  ? 'Логика блоков подтверждена — можно запускать HIL'
                  : report.failedCount > 0
                    ? `Провалено тестов: ${report.failedCount}. Проверьте ветвления блоков.`
                    : 'Включите хотя бы 1 тест без блокирующих ошибок графа'}
              </span>
            </div>
            <button
              type="button"
              onClick={onProceedToSimulator}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded transition-colors shrink-0 ${
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
                      className="inline-flex items-center gap-1 text-[10px] font-semibold underline shrink-0 hover:opacity-80"
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

        {/* Section 2: Test Cases List + Builder */}
        <div className="px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-700">
              Сценарии модульных тестов ({testCases.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResetTests}
                className="text-[11px] text-slate-500 hover:text-slate-800"
              >
                Сброс набора
              </button>
              <button
                type="button"
                onClick={() => setShowBuilder((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100"
              >
                <Plus className="w-3 h-3" />
                Новый тест
              </button>
            </div>
          </div>

          {showBuilder && (
            <form
              onSubmit={handleCreateCustom}
              className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-xs"
            >
              <div className="font-semibold text-slate-900">Конструктор тест-кейса</div>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Название проверки (напр. Переход в SAFE при 15%)"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Подсистема</label>
                  <select
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value as Exclude<Subsystem, 'GROUND'>)}
                    className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                  >
                    {(['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD'] as const).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Точка входа</label>
                  <select
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value as UnitTestTrigger)}
                    className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                  >
                    {(Object.keys(TRIGGER_LABELS) as UnitTestTrigger[]).map((tr) => (
                      <option key={tr} value={tr}>
                        {TRIGGER_LABELS[tr]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Мок АКБ (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={mockBattery}
                    onChange={(e) => setMockBattery(Number(e.target.value))}
                    className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Мок Gyro X</label>
                  <input
                    type="number"
                    step={0.5}
                    value={mockGyroX}
                    onChange={(e) => setMockGyroX(Number(e.target.value))}
                    className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Старт. режим</label>
                  <select
                    value={mockMode}
                    onChange={(e) => setMockMode(e.target.value as ObcMode)}
                    className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                  >
                    <option value="NOMINAL">NOMINAL</option>
                    <option value="SAFE">SAFE</option>
                    <option value="DETUMBLE">DETUMBLE</option>
                    <option value="SCIENCE">SCIENCE</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px]">
                <label className="inline-flex items-center gap-1.5 text-slate-700">
                  <input
                    type="checkbox"
                    checked={mockEclipse}
                    onChange={(e) => setMockEclipse(e.target.checked)}
                    className="accent-sky-600"
                  />
                  Тень Земли (Eclipse)
                </label>
                <label className="inline-flex items-center gap-1.5 text-slate-700">
                  Тиков цикла:
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={newTickCount}
                    onChange={(e) => setNewTickCount(Number(e.target.value))}
                    className="w-12 px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono"
                  />
                </label>
              </div>

              <div className="pt-1 border-t border-slate-200 space-y-1.5">
                <label className="block text-[10px] font-semibold text-slate-600">
                  Утверждение (Assert)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={assertOp}
                    onChange={(e) => setAssertOp(e.target.value as AssertionOperator)}
                    className="px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                  >
                    {ASSERTION_OPTIONS.map((o) => (
                      <option key={o.op} value={o.op}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {assertOp === 'rail_eq' ? (
                    <div className="flex gap-1">
                      <select
                        value={assertRail}
                        onChange={(e) =>
                          setAssertRail(e.target.value as 'COMMS_3V3' | 'ADCS_5V' | 'PAYLOAD_5V')
                        }
                        className="flex-1 px-1.5 py-1 text-[11px] bg-white border border-slate-200 rounded"
                      >
                        <option value="PAYLOAD_5V">PAYLOAD_5V</option>
                        <option value="COMMS_3V3">COMMS_3V3</option>
                        <option value="ADCS_5V">ADCS_5V</option>
                      </select>
                      <select
                        value={assertExpected}
                        onChange={(e) => setAssertExpected(e.target.value)}
                        className="w-16 px-1.5 py-1 text-[11px] bg-white border border-slate-200 rounded"
                      >
                        <option value="false">ВЫКЛ</option>
                        <option value="true">ВКЛ</option>
                      </select>
                    </div>
                  ) : assertOp === 'watchdog_reset' || assertOp === 'omega_decreased' ? (
                    <div className="px-2 py-1 text-[11px] text-slate-500 bg-slate-100 rounded">
                      Автоматическая проверка
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={assertExpected}
                      onChange={(e) => setAssertExpected(e.target.value)}
                      placeholder="Ожидаемое значение"
                      className="px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowBuilder(false)}
                  className="px-2.5 py-1 text-xs text-slate-600 bg-white border border-slate-200 rounded"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-xs font-semibold text-white bg-sky-600 rounded hover:bg-sky-700"
                >
                  Добавить и проверить
                </button>
              </div>
            </form>
          )}

          {/* Test Cases Accordion */}
          <div className="space-y-2">
            {testCases.map((tc) => {
              const res = resultMap.get(tc.id);
              const isOpen = expandedId === tc.id;

              return (
                <div
                  key={tc.id}
                  className={`border rounded-md overflow-hidden transition-colors ${
                    !tc.enabled
                      ? 'border-slate-200 bg-slate-50/50 opacity-70'
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
                        {tc.description}
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedId(tc.id);
                          onRunSingle(tc.id);
                        }}
                        title="Запустить этот тест"
                        className="p-1 text-slate-500 hover:text-sky-700 rounded hover:bg-slate-100"
                      >
                        <Play className="w-3 h-3" />
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
                    <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/70 space-y-2 text-[11px]">
                      {/* Mock Setup */}
                      <div className="font-mono text-[10px] text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                        <span>Триггер: {TRIGGER_LABELS[tc.trigger]}</span>
                        <span>АКБ: {tc.mockInput.batteryPct}%</span>
                        <span>Режим: {tc.mockInput.mode}</span>
                        <span>ωX: {tc.mockInput.gyro.X}°/с</span>
                        <span>{tc.mockInput.inEclipse ? 'Тень' : 'Солнце'}</span>
                      </div>

                      {res?.skipped && (
                        <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                          Пропущен: {res.skipReason}
                        </div>
                      )}

                      {res?.error && (
                        <div className="text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1.5 font-mono">
                          Ошибка: {res.error}
                        </div>
                      )}

                      {/* Assertions */}
                      {res && res.assertionResults.length > 0 && (
                        <div className="space-y-1">
                          {res.assertionResults.map((ar) => (
                            <div
                              key={ar.id}
                              className={`px-2 py-1.5 rounded border flex items-center justify-between gap-2 ${
                                ar.passed
                                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                  : 'bg-rose-50 border-rose-200 text-rose-950'
                              }`}
                            >
                              <span className="truncate">{ar.label}</span>
                              <span className="font-mono text-[10px] shrink-0">
                                {ar.passed ? ar.actualText : `ожид. ${ar.expectedText} ≠ ${ar.actualText}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {!res && (
                        <div className="space-y-1">
                          {tc.assertions.map((a) => (
                            <div key={a.id} className="text-slate-600">
                              • {a.label}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Spy Trace */}
                      {res && res.spyTrace.length > 0 && (
                        <div className="pt-1">
                          <div className="text-[10px] font-semibold text-slate-500 mb-1">
                            Трассировка вызовов блоков ({res.spyTrace.length})
                          </div>
                          <div className="max-h-28 overflow-y-auto bg-slate-950 text-slate-200 rounded p-2 font-mono text-[10px] space-y-0.5">
                            {res.spyTrace.map((call) => (
                              <div key={call.seq}>
                                <span className="text-slate-500">{call.seq}. </span>
                                <span className="text-sky-400">sim.{call.method}</span>
                                <span className="text-slate-300">({call.args})</span>
                                {call.result !== undefined && (
                                  <span className="text-emerald-400"> → {call.result}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
