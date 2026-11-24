import type { Subsystem } from '../types/cubesat.ts';
import {
  bindCompiledHandlers,
  createInitialTelemetry,
  createSimRuntime,
  type CubeSatTelemetry,
  type ObcMode,
} from './simulator.ts';

export type UnitTestTrigger =
  | 'onBoot'
  | 'tick'
  | 'boot_then_tick'
  | 'command:PING'
  | 'command:CAPTURE'
  | 'command:SAFE'
  | 'command:NOMINAL'
  | 'command:DETUMBLE';

export type AssertionOperator =
  | 'mode_eq'
  | 'mode_neq'
  | 'rail_eq'
  | 'heater_eq'
  | 'watchdog_reset'
  | 'beacons_gte'
  | 'telemetry_gte'
  | 'images_gte'
  | 'omega_lt'
  | 'omega_decreased'
  | 'mtq_x_eq'
  | 'method_called'
  | 'log_contains';

export interface UnitAssertionSpec {
  id: string;
  label: string;
  op: AssertionOperator;
  expected?: string | number | boolean;
  rail?: 'COMMS_3V3' | 'ADCS_5V' | 'PAYLOAD_5V';
}

export interface UnitTestCase {
  id: string;
  name: string;
  subsystem: Exclude<Subsystem, 'GROUND'>;
  description: string;
  enabled: boolean;
  isCustom?: boolean;
  trigger: UnitTestTrigger;
  tickCount: number;
  mockInput: {
    mode: ObcMode;
    batteryPct: number;
    inEclipse: boolean;
    gyro: { X: number; Y: number; Z: number };
    rails: {
      COMMS_3V3: boolean;
      ADCS_5V: boolean;
      PAYLOAD_5V: boolean;
    };
  };
  assertions: UnitAssertionSpec[];
}

export interface AssertionResult {
  id: string;
  label: string;
  passed: boolean;
  expectedText: string;
  actualText: string;
}

export interface SpyCallEntry {
  seq: number;
  method: string;
  args: string;
  result?: string;
}

export interface UnitTestRunResult {
  testId: string;
  name: string;
  subsystem: Exclude<Subsystem, 'GROUND'>;
  passed: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
  durationMs: number;
  assertionResults: AssertionResult[];
  spyTrace: SpyCallEntry[];
  finalState: CubeSatTelemetry;
}

export interface StaticBlockDiagnostic {
  id: string;
  blockId?: string;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
}

export interface WorkspaceStaticAnalysis {
  totalBlocks: number;
  hatCount: number;
  orphanBlockIds: string[];
  blockTypesUsed: string[];
  expectedSimMethods: string[];
  diagnostics: StaticBlockDiagnostic[];
  hasBlockingErrors: boolean;
}

export interface UnitTestSuiteReport {
  executedAt: string;
  staticAnalysis: WorkspaceStaticAnalysis;
  results: UnitTestRunResult[];
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  totalActive: number;
  coveragePct: number;
  coveredMethods: string[];
  uncoveredMethods: string[];
  readyForSimulator: boolean;
}

interface SerializedBlockNode {
  type?: string;
  id?: string;
  fields?: Record<string, unknown>;
  next?: { block?: SerializedBlockNode; shadow?: SerializedBlockNode };
  inputs?: Record<string, { block?: SerializedBlockNode; shadow?: SerializedBlockNode }>;
}

const HAT_TYPES = new Set([
  'sat_event_boot',
  'sat_event_loop_tick',
  'sat_event_telecommand',
]);

const BLOCK_TO_SIM_METHOD: Record<string, string> = {
  obc_set_mode: 'setMode',
  obc_log_telemetry: 'logTelemetry',
  obc_reset_watchdog: 'resetWatchdog',
  obc_get_mode: 'getMode',
  eps_read_battery_pct: 'batteryPct',
  eps_read_battery_volt: 'batteryVolt',
  eps_read_solar_ma: 'solarCurrent',
  eps_set_rail: 'setRail',
  eps_set_heater: 'setHeater',
  adcs_read_gyro: 'gyro',
  adcs_read_sun_sensor: 'sunFlux',
  adcs_set_magnetorquer: 'setMagnetorquer',
  adcs_run_bdot: 'runBdot',
  comms_send_beacon: 'sendBeacon',
  comms_send_telemetry: 'sendTelemetry',
  comms_set_tx_power: 'setTxPower',
  payload_capture_image: 'captureImage',
  payload_read_radiation: 'readRadiation',
  payload_read_temp: 'readTemp',
};

function collectSubtree(
  node: SerializedBlockNode | undefined,
  visit: (b: SerializedBlockNode) => void
) {
  let curr: SerializedBlockNode | undefined = node;
  while (curr) {
    visit(curr);
    if (curr.inputs) {
      for (const inp of Object.values(curr.inputs)) {
        if (inp.block) {
          collectSubtree(inp.block, visit);
        }
      }
    }
    curr = curr.next?.block;
  }
}

export function analyzeWorkspaceBlocks(
  workspaceJson: Record<string, unknown> | null | undefined
): WorkspaceStaticAnalysis {
  const diagnostics: StaticBlockDiagnostic[] = [];
  const blockTypes = new Set<string>();
  const orphanBlockIds: string[] = [];
  let totalBlocks = 0;
  let hatCount = 0;
  let hasLoopTick = false;
  let hasWatchdogReset = false;
  let hasCameraCapture = false;
  let hasPayloadRailOn = false;

  const root = workspaceJson as
    | { blocks?: { blocks?: SerializedBlockNode[] } }
    | null
    | undefined;
  const topBlocks = Array.isArray(root?.blocks?.blocks) ? root!.blocks!.blocks : [];

  for (const top of topBlocks) {
    const isHat = Boolean(top.type && HAT_TYPES.has(top.type));
    if (isHat) {
      hatCount++;
      if (!top.next?.block) {
        diagnostics.push({
          id: `empty-hat-${top.id || hatCount}`,
          blockId: top.id,
          severity: 'warning',
          rule: 'EMPTY_EVENT_HAT',
          message: `Событие «${top.type}» не содержит прикреплённых блоков и ничего не выполнит.`,
        });
      }
    } else if (top.id || top.type) {
      if (top.id) orphanBlockIds.push(top.id);
      diagnostics.push({
        id: `orphan-${top.id || totalBlocks}`,
        blockId: top.id,
        severity: 'warning',
        rule: 'ORPHAN_BLOCK',
        message: `Отсоединенный блок (${top.type || 'unknown'}) не привязан ни к одному событию запуска/цикла/команды и не попадёт в прошивку.`,
      });
    }

    collectSubtree(top, (b) => {
      totalBlocks++;
      if (!b.type) return;
      blockTypes.add(b.type);

      if (b.type === 'sat_event_loop_tick') hasLoopTick = true;
      if (b.type === 'obc_reset_watchdog') hasWatchdogReset = true;
      if (b.type === 'payload_capture_image') hasCameraCapture = true;
      if (
        b.type === 'eps_set_rail' &&
        b.fields?.RAIL === 'PAYLOAD_5V' &&
        b.fields?.STATE === 'ON'
      ) {
        hasPayloadRailOn = true;
      }

      if (b.type === 'controls_if') {
        const hasCond = Boolean(b.inputs?.IF0?.block);
        const hasDo = Boolean(b.inputs?.DO0?.block);
        if (!hasCond) {
          diagnostics.push({
            id: `if-cond-${b.id || totalBlocks}`,
            blockId: b.id,
            severity: 'error',
            rule: 'MISSING_CONDITION',
            message: 'Блок ветвления «Если» не имеет условия сравнения в слоте IF.',
          });
        }
        if (!hasDo) {
          diagnostics.push({
            id: `if-do-${b.id || totalBlocks}`,
            blockId: b.id,
            severity: 'warning',
            rule: 'EMPTY_BRANCH',
            message: 'Ветка «Тогда» в условии «Если» пуста.',
          });
        }
      }
    });
  }

  if (hatCount === 0) {
    diagnostics.unshift({
      id: 'no-entry',
      severity: 'error',
      rule: 'NO_ENTRY_POINT',
      message:
        'Нет ни одного стартового блока событий («когда OBC запущен», «каждые N сек» или «при радиокоманде»).',
    });
  }

  if (hasLoopTick && !hasWatchdogReset) {
    diagnostics.push({
      id: 'missing-wdt',
      severity: 'warning',
      rule: 'MISSING_WDT',
      message:
        'В периодическом цикле не вызывается «сбросить сторожевой таймер (WDT)» — реальный контроллер STM32 перезагрузится по таймауту.',
    });
  }

  if (hasCameraCapture && !hasPayloadRailOn) {
    diagnostics.push({
      id: 'unpowered-cam',
      severity: 'warning',
      rule: 'UNPOWERED_PAYLOAD',
      message:
        'Блок съёмки камеры используется без включения силовой шины PAYLOAD_5V в этой программе.',
    });
  }

  const expectedSimMethods = Array.from(blockTypes)
    .map((t) => BLOCK_TO_SIM_METHOD[t])
    .filter((m): m is string => Boolean(m));

  return {
    totalBlocks,
    hatCount,
    orphanBlockIds,
    blockTypesUsed: Array.from(blockTypes),
    expectedSimMethods: Array.from(new Set(expectedSimMethods)),
    diagnostics,
    hasBlockingErrors: diagnostics.some((d) => d.severity === 'error'),
  };
}

export function buildPresetUnitTests(
  workspaceJson: Record<string, unknown> | null | undefined
): UnitTestCase[] {
  const analysis = analyzeWorkspaceBlocks(workspaceJson);
  const used = new Set(analysis.blockTypesUsed);

  const hasBoot = used.has('sat_event_boot');
  const hasTick = used.has('sat_event_loop_tick');
  const hasBdot = used.has('adcs_run_bdot') || used.has('adcs_read_gyro');
  const hasBatCheck = used.has('eps_read_battery_pct');
  const hasComms = used.has('comms_send_beacon') || used.has('comms_send_telemetry');
  const hasCapture = used.has('sat_event_telecommand') && used.has('payload_capture_image');

  return [
    {
      id: 'ut-boot-nominal',
      name: 'Инициализация OBC при старте (Boot)',
      subsystem: 'OBC',
      description: 'Проверяет, что блок запуска устанавливает рабочий режим OBC и не вызывает сбоев.',
      enabled: hasBoot,
      trigger: 'onBoot',
      tickCount: 1,
      mockInput: {
        mode: 'SAFE',
        batteryPct: 78,
        inEclipse: false,
        gyro: { X: 1.2, Y: -0.5, Z: 0.3 },
        rails: { COMMS_3V3: false, ADCS_5V: false, PAYLOAD_5V: false },
      },
      assertions: [
        {
          id: 'a-boot-mode',
          label: 'Режим OBC изменён из SAFE после старта',
          op: 'mode_neq',
          expected: 'SAFE',
        },
        {
          id: 'a-boot-call',
          label: 'Вызван блок смены режима OBC (setMode)',
          op: 'method_called',
          expected: 'setMode',
        },
      ],
    },
    {
      id: 'ut-obc-wdt',
      name: 'Поддержание сторожевого таймера WDT',
      subsystem: 'OBC',
      description: 'Проверяет сброс аппаратного WDT в основном цикле телеметрии.',
      enabled: hasTick && used.has('obc_reset_watchdog'),
      trigger: 'tick',
      tickCount: 2,
      mockInput: {
        mode: 'NOMINAL',
        batteryPct: 72,
        inEclipse: false,
        gyro: { X: 1, Y: 0, Z: 0 },
        rails: { COMMS_3V3: true, ADCS_5V: true, PAYLOAD_5V: false },
      },
      assertions: [
        {
          id: 'a-wdt',
          label: 'Сторожевой таймер сброшен минимум 1 раз',
          op: 'watchdog_reset',
          expected: true,
        },
      ],
    },
    {
      id: 'ut-eps-low-bat',
      name: 'Защита EPS при критическом разряде АКБ (18%)',
      subsystem: 'EPS',
      description:
        'При падении заряда ниже 25% логика должна перейти в SAFE и отключить нагрузку PAYLOAD_5V.',
      enabled: hasTick && hasBatCheck,
      trigger: 'boot_then_tick',
      tickCount: 2,
      mockInput: {
        mode: 'NOMINAL',
        batteryPct: 18,
        inEclipse: true,
        gyro: { X: 1.1, Y: -0.4, Z: 0.2 },
        rails: { COMMS_3V3: true, ADCS_5V: true, PAYLOAD_5V: true },
      },
      assertions: [
        {
          id: 'a-safe-mode',
          label: 'OBC переведён в режим SAFE',
          op: 'mode_eq',
          expected: 'SAFE',
        },
        {
          id: 'a-pay-off',
          label: 'Шина PAYLOAD_5V обесточена',
          op: 'rail_eq',
          rail: 'PAYLOAD_5V',
          expected: false,
        },
      ],
    },
    {
      id: 'ut-comms-nominal-tx',
      name: 'Штатная передача телеметрии и маяка (82% АКБ)',
      subsystem: 'COMMS',
      description: 'На солнечном участке при 82% АКБ должен отправляться кадр телеметрии или маяк AX.25.',
      enabled: hasTick && hasComms,
      trigger: 'boot_then_tick',
      tickCount: 1,
      mockInput: {
        mode: 'NOMINAL',
        batteryPct: 82,
        inEclipse: false,
        gyro: { X: 0.8, Y: 0.3, Z: -0.2 },
        rails: { COMMS_3V3: true, ADCS_5V: true, PAYLOAD_5V: false },
      },
      assertions: [
        {
          id: 'a-tlm',
          label: 'Отправлена телеметрия (>= 1 пакета)',
          op: 'telemetry_gte',
          expected: 1,
        },
        {
          id: 'a-bcn',
          label: 'Передан маяк AX.25 (>= 1)',
          op: 'beacons_gte',
          expected: 1,
        },
      ],
    },
    {
      id: 'ut-adcs-detumble',
      name: 'Гашение закрутки алгоритмом B-dot (18 °/с)',
      subsystem: 'ADCS',
      description: 'При угловой скорости 18 °/с логика должна запускать B-dot и снижать |ω|.',
      enabled: hasTick && hasBdot,
      trigger: 'boot_then_tick',
      tickCount: 3,
      mockInput: {
        mode: 'DETUMBLE',
        batteryPct: 68,
        inEclipse: false,
        gyro: { X: 18, Y: -10, Z: 6 },
        rails: { COMMS_3V3: true, ADCS_5V: true, PAYLOAD_5V: false },
      },
      assertions: [
        {
          id: 'a-bdot-called',
          label: 'Вызван алгоритм B-dot (runBdot)',
          op: 'method_called',
          expected: 'runBdot',
        },
        {
          id: 'a-omega-drop',
          label: 'Угловая скорость |ω| уменьшилась',
          op: 'omega_decreased',
          expected: true,
        },
      ],
    },
    {
      id: 'ut-adcs-settled',
      name: 'Выход в NOMINAL после стабилизации (< 1 °/с)',
      subsystem: 'ADCS',
      description: 'Когда |ω| ниже порога, катушки выключаются и OBC переходит в NOMINAL.',
      enabled: hasTick && hasBdot,
      trigger: 'boot_then_tick',
      tickCount: 1,
      mockInput: {
        mode: 'DETUMBLE',
        batteryPct: 75,
        inEclipse: false,
        gyro: { X: 0.4, Y: 0.2, Z: 0.1 },
        rails: { COMMS_3V3: true, ADCS_5V: true, PAYLOAD_5V: false },
      },
      assertions: [
        {
          id: 'a-settled-mode',
          label: 'Режим переключён в NOMINAL',
          op: 'mode_eq',
          expected: 'NOMINAL',
        },
        {
          id: 'a-mtq-zero',
          label: 'Ток магнитной катушки X сброшен в 0%',
          op: 'mtq_x_eq',
          expected: 0,
        },
      ],
    },
    {
      id: 'ut-payload-capture-ok',
      name: 'Команда CAPTURE при полном заряде (80%)',
      subsystem: 'PAYLOAD',
      description: 'При 80% АКБ команда CAPTURE включает шину, делает снимок и отключает камеру.',
      enabled: hasCapture,
      trigger: 'command:CAPTURE',
      tickCount: 1,
      mockInput: {
        mode: 'NOMINAL',
        batteryPct: 80,
        inEclipse: false,
        gyro: { X: 0.5, Y: 0.2, Z: 0.1 },
        rails: { COMMS_3V3: true, ADCS_5V: true, PAYLOAD_5V: false },
      },
      assertions: [
        {
          id: 'a-img-1',
          label: 'Сохранён минимум 1 снимок ДЗЗ',
          op: 'images_gte',
          expected: 1,
        },
        {
          id: 'a-rail-off-after',
          label: 'Шина PAYLOAD_5V отключена после съёмки',
          op: 'rail_eq',
          rail: 'PAYLOAD_5V',
          expected: false,
        },
      ],
    },
    {
      id: 'ut-payload-capture-low',
      name: 'Отказ съёмки CAPTURE при низком заряде (28%)',
      subsystem: 'PAYLOAD',
      description: 'При заряде 28% камера не должна включаться; отправляется отказ на Землю.',
      enabled: hasCapture,
      trigger: 'command:CAPTURE',
      tickCount: 1,
      mockInput: {
        mode: 'NOMINAL',
        batteryPct: 28,
        inEclipse: false,
        gyro: { X: 0.5, Y: 0.2, Z: 0.1 },
        rails: { COMMS_3V3: true, ADCS_5V: true, PAYLOAD_5V: false },
      },
      assertions: [
        {
          id: 'a-img-0',
          label: 'Снимок не выполнен (0 кадров)',
          op: 'images_gte',
          expected: 0,
        },
        {
          id: 'a-no-capture-call',
          label: 'Питание PAYLOAD_5V осталось выключенным',
          op: 'rail_eq',
          rail: 'PAYLOAD_5V',
          expected: false,
        },
        {
          id: 'a-skip-bcn',
          label: 'Передан маяк уведомления о пропуске',
          op: 'beacons_gte',
          expected: 1,
        },
      ],
    },
  ];
}

function formatArg(val: unknown): string {
  if (typeof val === 'string') return `'${val}'`;
  return String(val);
}

function evaluateAssertion(
  spec: UnitAssertionSpec,
  finalState: CubeSatTelemetry,
  initialOmega: number,
  calledMethods: Set<string>,
  spyTrace: SpyCallEntry[]
): AssertionResult {
  const finalOmega = Math.hypot(finalState.gyro.X, finalState.gyro.Y, finalState.gyro.Z);

  switch (spec.op) {
    case 'mode_eq': {
      const exp = String(spec.expected || 'NOMINAL');
      return {
        id: spec.id,
        label: spec.label,
        passed: finalState.mode === exp,
        expectedText: `mode === ${exp}`,
        actualText: `mode = ${finalState.mode}`,
      };
    }
    case 'mode_neq': {
      const exp = String(spec.expected || 'SAFE');
      return {
        id: spec.id,
        label: spec.label,
        passed: finalState.mode !== exp,
        expectedText: `mode !== ${exp}`,
        actualText: `mode = ${finalState.mode}`,
      };
    }
    case 'rail_eq': {
      const rail = spec.rail || 'PAYLOAD_5V';
      const exp = Boolean(spec.expected);
      const act = finalState.rails[rail];
      return {
        id: spec.id,
        label: spec.label,
        passed: act === exp,
        expectedText: `${rail} = ${exp ? 'ON' : 'OFF'}`,
        actualText: `${rail} = ${act ? 'ON' : 'OFF'}`,
      };
    }
    case 'heater_eq': {
      const exp = Boolean(spec.expected);
      return {
        id: spec.id,
        label: spec.label,
        passed: finalState.heaterOn === exp,
        expectedText: `heater = ${exp ? 'ON' : 'OFF'}`,
        actualText: `heater = ${finalState.heaterOn ? 'ON' : 'OFF'}`,
      };
    }
    case 'watchdog_reset': {
      return {
        id: spec.id,
        label: spec.label,
        passed: finalState.watchdogResets > 0,
        expectedText: 'watchdogResets >= 1',
        actualText: `watchdogResets = ${finalState.watchdogResets}`,
      };
    }
    case 'beacons_gte': {
      const min = Number(spec.expected ?? 1);
      return {
        id: spec.id,
        label: spec.label,
        passed: finalState.beaconsSent >= min,
        expectedText: `beacons >= ${min}`,
        actualText: `beacons = ${finalState.beaconsSent}`,
      };
    }
    case 'telemetry_gte': {
      const min = Number(spec.expected ?? 1);
      return {
        id: spec.id,
        label: spec.label,
        passed: finalState.packetsSent >= min,
        expectedText: `packets >= ${min}`,
        actualText: `packets = ${finalState.packetsSent}`,
      };
    }
    case 'images_gte': {
      const min = Number(spec.expected ?? 1);
      const passed = min === 0 ? finalState.imagesCaptured === 0 : finalState.imagesCaptured >= min;
      return {
        id: spec.id,
        label: spec.label,
        passed,
        expectedText: min === 0 ? 'images === 0' : `images >= ${min}`,
        actualText: `images = ${finalState.imagesCaptured}`,
      };
    }
    case 'omega_lt': {
      const lim = Number(spec.expected ?? 5);
      return {
        id: spec.id,
        label: spec.label,
        passed: finalOmega < lim,
        expectedText: `|ω| < ${lim} °/с`,
        actualText: `|ω| = ${finalOmega.toFixed(2)} °/с`,
      };
    }
    case 'omega_decreased': {
      return {
        id: spec.id,
        label: spec.label,
        passed: finalOmega < initialOmega,
        expectedText: `|ω| < ${initialOmega.toFixed(1)} °/с`,
        actualText: `|ω| = ${finalOmega.toFixed(2)} °/с`,
      };
    }
    case 'mtq_x_eq': {
      const exp = Number(spec.expected ?? 0);
      return {
        id: spec.id,
        label: spec.label,
        passed: finalState.magnetorquer.X === exp,
        expectedText: `MTQ_X = ${exp}%`,
        actualText: `MTQ_X = ${finalState.magnetorquer.X}%`,
      };
    }
    case 'method_called': {
      const m = String(spec.expected || '');
      return {
        id: spec.id,
        label: spec.label,
        passed: calledMethods.has(m),
        expectedText: `${m}() вызван`,
        actualText: calledMethods.has(m) ? `${m}() выполнен` : `${m}() не вызывался`,
      };
    }
    case 'log_contains': {
      const needle = String(spec.expected || '').toLowerCase();
      const matched =
        finalState.logs.some((l) => l.text.toLowerCase().includes(needle)) ||
        spyTrace.some((t) => t.args.toLowerCase().includes(needle));
      return {
        id: spec.id,
        label: spec.label,
        passed: matched,
        expectedText: `лог содержит «${spec.expected}»`,
        actualText: matched ? 'совпадение найдено' : 'запись не найдена',
      };
    }
  }
}

export async function runSingleUnitTest(
  jsCode: string,
  testCase: UnitTestCase
): Promise<{ result: UnitTestRunResult; calledMethods: Set<string> }> {
  const t0 = performance.now();
  let state = createInitialTelemetry('leo_nominal');
  state = {
    ...state,
    mode: testCase.mockInput.mode,
    batteryPct: testCase.mockInput.batteryPct,
    batteryVolt: 6.35 + (testCase.mockInput.batteryPct / 100) * 1.95,
    inEclipse: testCase.mockInput.inEclipse,
    gyro: { ...testCase.mockInput.gyro },
    rails: { ...testCase.mockInput.rails },
    watchdogAgeSec: 4,
    watchdogResets: 0,
    beaconsSent: 0,
    packetsSent: 0,
    imagesCaptured: 0,
    logs: [],
  };
  const initialOmega = Math.hypot(state.gyro.X, state.gyro.Y, state.gyro.Z);

  const { simApi } = createSimRuntime(
    () => state,
    (updater) => {
      state = updater(state);
    },
    () => true,
    true
  );

  const spyTrace: SpyCallEntry[] = [];
  const calledMethods = new Set<string>();
  let seq = 0;

  const proxiedSim = new Proxy(simApi, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== 'function') return orig;
      const name = String(prop);
      return (...args: unknown[]) => {
        calledMethods.add(name);
        const res = (orig as (...a: unknown[]) => unknown)(...args);
        if (spyTrace.length < 60) {
          const isPromise = res && typeof (res as Promise<unknown>).then === 'function';
          spyTrace.push({
            seq: ++seq,
            method: name,
            args: args.map(formatArg).join(', '),
            result: isPromise || res === undefined ? undefined : String(res),
          });
        }
        return res;
      };
    },
  });

  try {
    const handlers = bindCompiledHandlers(jsCode, proxiedSim as typeof simApi);

    if (testCase.trigger === 'onBoot') {
      if (!handlers.onBoot) {
        return {
          result: {
            testId: testCase.id,
            name: testCase.name,
            subsystem: testCase.subsystem,
            passed: false,
            skipped: true,
            skipReason: 'Отсутствует блок события «когда бортовой компьютер OBC запущен»',
            durationMs: performance.now() - t0,
            assertionResults: [],
            spyTrace,
            finalState: state,
          },
          calledMethods,
        };
      }
      await handlers.onBoot();
    } else if (testCase.trigger === 'tick') {
      if (handlers.ticks.length === 0) {
        return {
          result: {
            testId: testCase.id,
            name: testCase.name,
            subsystem: testCase.subsystem,
            passed: false,
            skipped: true,
            skipReason: 'Отсутствует блок «каждые N сек цикла телеметрии»',
            durationMs: performance.now() - t0,
            assertionResults: [],
            spyTrace,
            finalState: state,
          },
          calledMethods,
        };
      }
      for (let i = 0; i < Math.max(1, testCase.tickCount); i++) {
        for (const t of handlers.ticks) {
          await t.fn();
        }
      }
    } else if (testCase.trigger === 'boot_then_tick') {
      if (handlers.ticks.length === 0 && !handlers.onBoot) {
        return {
          result: {
            testId: testCase.id,
            name: testCase.name,
            subsystem: testCase.subsystem,
            passed: false,
            skipped: true,
            skipReason: 'Нет обработчиков запуска или периодического цикла',
            durationMs: performance.now() - t0,
            assertionResults: [],
            spyTrace,
            finalState: state,
          },
          calledMethods,
        };
      }
      if (handlers.onBoot) await handlers.onBoot();
      for (let i = 0; i < Math.max(1, testCase.tickCount); i++) {
        for (const t of handlers.ticks) {
          await t.fn();
        }
      }
    } else if (testCase.trigger.startsWith('command:')) {
      const cmd = testCase.trigger.slice('command:'.length);
      const fn = handlers.commands[cmd];
      if (!fn) {
        return {
          result: {
            testId: testCase.id,
            name: testCase.name,
            subsystem: testCase.subsystem,
            passed: false,
            skipped: true,
            skipReason: `В программе не определён обработчик радиокоманды ${cmd}`,
            durationMs: performance.now() - t0,
            assertionResults: [],
            spyTrace,
            finalState: state,
          },
          calledMethods,
        };
      }
      await fn();
    }

    const assertionResults = testCase.assertions.map((a) =>
      evaluateAssertion(a, state, initialOmega, calledMethods, spyTrace)
    );
    const allPassed = assertionResults.every((r) => r.passed);

    return {
      result: {
        testId: testCase.id,
        name: testCase.name,
        subsystem: testCase.subsystem,
        passed: allPassed,
        durationMs: performance.now() - t0,
        assertionResults,
        spyTrace,
        finalState: state,
      },
      calledMethods,
    };
  } catch (err) {
    return {
      result: {
        testId: testCase.id,
        name: testCase.name,
        subsystem: testCase.subsystem,
        passed: false,
        error: err instanceof Error ? err.message : 'Ошибка выполнения тестовой среды',
        durationMs: performance.now() - t0,
        assertionResults: [],
        spyTrace,
        finalState: state,
      },
      calledMethods,
    };
  }
}

export async function runUnitTestSuite(
  jsCode: string,
  workspaceJson: Record<string, unknown> | null | undefined,
  cases: UnitTestCase[]
): Promise<UnitTestSuiteReport> {
  const staticAnalysis = analyzeWorkspaceBlocks(workspaceJson);
  const activeCases = cases.filter((c) => c.enabled);
  const results: UnitTestRunResult[] = [];
  const coveredSet = new Set<string>();

  for (const tc of activeCases) {
    const { result, calledMethods } = await runSingleUnitTest(jsCode, tc);
    results.push(result);
    if (!result.skipped) {
      for (const m of calledMethods) coveredSet.add(m);
    }
  }

  const expected = staticAnalysis.expectedSimMethods;
  const coveredMethods = expected.filter((m) => coveredSet.has(m));
  const uncoveredMethods = expected.filter((m) => !coveredSet.has(m));
  const coveragePct =
    expected.length === 0 ? 100 : Math.round((coveredMethods.length / expected.length) * 100);

  const skippedCount = results.filter((r) => r.skipped).length;
  const passedCount = results.filter((r) => !r.skipped && r.passed).length;
  const failedCount = results.filter((r) => !r.skipped && !r.passed).length;

  return {
    executedAt: new Date().toISOString(),
    staticAnalysis,
    results,
    passedCount,
    failedCount,
    skippedCount,
    totalActive: activeCases.length,
    coveragePct,
    coveredMethods,
    uncoveredMethods,
    readyForSimulator: !staticAnalysis.hasBlockingErrors && failedCount === 0 && passedCount > 0,
  };
}
