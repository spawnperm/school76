export type ObcMode = 'NOMINAL' | 'SAFE' | 'SCIENCE' | 'DETUMBLE';

export interface SimLogEntry {
  id: string;
  time: string;
  source: 'OBC' | 'EPS' | 'ADCS' | 'COMMS' | 'PAYLOAD';
  text: string;
}

export interface TelemetryPoint {
  t: number;
  batteryPct: number;
  batteryVolt: number;
  omegaMag: number;
  solarW: number;
  loadW: number;
}

export interface FaultInjectionState {
  brownoutMode: boolean;
  payloadRailShort: boolean;
  commsRfJamming: boolean;
  gyroDisturbance: boolean;
}

export interface CubeSatTelemetry {
  mode: ObcMode;
  batteryPct: number;
  batteryVolt: number;
  inEclipse: boolean;
  solarMa: Record<'X+' | 'X-' | 'Y+' | 'Y-' | 'Z+', number>;
  rails: {
    COMMS_3V3: boolean;
    ADCS_5V: boolean;
    PAYLOAD_5V: boolean;
  };
  heaterOn: boolean;
  gyro: { X: number; Y: number; Z: number };
  magnetorquer: { X: number; Y: number; Z: number };
  txPowerDbm: number;
  radiationUsv: number;
  temps: { OBC: number; BAT: number; CAM: number };
  watchdogAgeSec: number;
  watchdogResets: number;
  beaconsSent: number;
  packetsSent: number;
  imagesCaptured: number;
  lastBeaconText: string;
  simTimeSec: number;
  solarPowerW: number;
  loadPowerW: number;
  faults: FaultInjectionState;
  history: TelemetryPoint[];
  logs: SimLogEntry[];
}

export type SimScenarioId = 'leo_nominal' | 'low_battery' | 'high_tumble' | 'ground_pass';

export interface PreflightCheckItem {
  id: string;
  subsystem: 'OBC' | 'EPS' | 'ADCS' | 'COMMS' | 'PAYLOAD';
  title: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface PreflightReport {
  programName: string;
  executedAt: string;
  passed: boolean;
  scorePct: number;
  checks: PreflightCheckItem[];
}

export function createInitialTelemetry(scenario: SimScenarioId = 'leo_nominal'): CubeSatTelemetry {
  const base: CubeSatTelemetry = {
    mode: 'NOMINAL',
    batteryPct: 74.2,
    batteryVolt: 7.94,
    inEclipse: false,
    solarMa: {
      'X+': 420,
      'X-': 15,
      'Y+': 280,
      'Y-': 12,
      'Z+': 510,
    },
    rails: {
      COMMS_3V3: true,
      ADCS_5V: true,
      PAYLOAD_5V: false,
    },
    heaterOn: false,
    gyro: { X: 4.8, Y: -2.1, Z: 1.4 },
    magnetorquer: { X: 0, Y: 0, Z: 0 },
    txPowerDbm: 20,
    radiationUsv: 0.48,
    temps: { OBC: 22.4, BAT: 16.8, CAM: 14.2 },
    watchdogAgeSec: 0,
    watchdogResets: 0,
    beaconsSent: 0,
    packetsSent: 0,
    imagesCaptured: 0,
    lastBeaconText: 'SCHOOL76-1U READY',
    simTimeSec: 0,
    solarPowerW: 3.1,
    loadPowerW: 2.3,
    faults: {
      brownoutMode: false,
      payloadRailShort: false,
      commsRfJamming: false,
      gyroDisturbance: false,
    },
    history: [
      {
        t: 0,
        batteryPct: 74.2,
        batteryVolt: 7.94,
        omegaMag: 5.4,
        solarW: 3.1,
        loadW: 2.3,
      },
    ],
    logs: [],
  };

  if (scenario === 'low_battery') {
    base.batteryPct = 21.5;
    base.batteryVolt = 6.81;
    base.inEclipse = true;
    base.temps.BAT = 2.4;
    base.rails.PAYLOAD_5V = true;
    base.solarPowerW = 0;
  } else if (scenario === 'high_tumble') {
    base.mode = 'DETUMBLE';
    base.gyro = { X: 18.6, Y: -14.2, Z: 11.4 };
    base.history[0].omegaMag = 26.0;
  } else if (scenario === 'ground_pass') {
    base.batteryPct = 82.0;
    base.batteryVolt = 8.09;
    base.gyro = { X: 0.9, Y: -0.6, Z: 0.4 };
    base.history[0].omegaMag = 1.15;
  }

  return base;
}

export function stepCubeSatPhysics(prev: CubeSatTelemetry, dtSec: number): CubeSatTelemetry {
  const solarInputW =
    prev.inEclipse || prev.faults.brownoutMode
      ? 0
      : ((prev.solarMa['X+'] + prev.solarMa['Y+'] + prev.solarMa['Z+']) * 0.0048);

  const loadW =
    0.95 +
    (prev.rails.COMMS_3V3 ? 0.65 + (prev.txPowerDbm >= 27 ? 0.45 : 0) : 0) +
    (prev.rails.ADCS_5V ? 0.85 : 0) +
    (prev.rails.PAYLOAD_5V ? (prev.faults.payloadRailShort ? 4.8 : 2.1) : 0) +
    (prev.heaterOn ? 1.35 : 0);

  const netDeltaPct = (solarInputW - loadW) * 0.16 * (dtSec / 0.5);
  const nextBat = Math.max(0, Math.min(100, prev.batteryPct + netDeltaPct));
  const nextVolt = 6.35 + (nextBat / 100) * 1.95;

  const nextBatTemp = prev.inEclipse
    ? Math.max(-14, prev.temps.BAT + (prev.heaterOn ? 0.18 : -0.14) * (dtSec / 0.5))
    : Math.min(36, prev.temps.BAT + (prev.heaterOn ? 0.22 : 0.06) * (dtSec / 0.5));

  const nextGyro = prev.faults.gyroDisturbance
    ? {
        X: prev.gyro.X + 0.45,
        Y: prev.gyro.Y - 0.35,
        Z: prev.gyro.Z + 0.25,
      }
    : prev.gyro;

  const nextWatchdog = prev.watchdogAgeSec + dtSec;
  const omegaMag = Math.hypot(nextGyro.X, nextGyro.Y, nextGyro.Z);
  const nextTime = prev.simTimeSec + dtSec;

  const point: TelemetryPoint = {
    t: Number(nextTime.toFixed(1)),
    batteryPct: Number(nextBat.toFixed(1)),
    batteryVolt: Number(nextVolt.toFixed(2)),
    omegaMag: Number(omegaMag.toFixed(2)),
    solarW: Number(solarInputW.toFixed(2)),
    loadW: Number(loadW.toFixed(2)),
  };

  return {
    ...prev,
    simTimeSec: nextTime,
    batteryPct: nextBat,
    batteryVolt: nextVolt,
    solarPowerW: solarInputW,
    loadPowerW: loadW,
    gyro: nextGyro,
    watchdogAgeSec: nextWatchdog,
    temps: {
      ...prev.temps,
      BAT: nextBatTemp,
      OBC: prev.inEclipse
        ? Math.max(4, prev.temps.OBC - 0.05)
        : Math.min(38, prev.temps.OBC + 0.04),
      CAM: prev.rails.PAYLOAD_5V
        ? Math.min(41, prev.temps.CAM + 0.15)
        : Math.max(8, prev.temps.CAM - 0.04),
    },
    history: [...prev.history.slice(-59), point],
  };
}

export interface CompiledHandlers {
  onBoot: (() => Promise<void>) | null;
  ticks: { intervalSec: number; fn: () => Promise<void> }[];
  commands: Record<string, () => Promise<void>>;
}

export function createSimRuntime(
  getState: () => CubeSatTelemetry,
  updateState: (updater: (prev: CubeSatTelemetry) => CubeSatTelemetry) => void,
  isRunning: () => boolean,
  fastMode = false
) {
  function stamp() {
    return new Date().toLocaleTimeString('ru-RU', { hour12: false });
  }

  function appendLog(
    prev: CubeSatTelemetry,
    source: SimLogEntry['source'],
    text: string
  ): SimLogEntry[] {
    const entry: SimLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: stamp(),
      source,
      text,
    };
    return [entry, ...prev.logs].slice(0, 80);
  }

  const simApi = {
    wait: async (sec: unknown) => {
      if (fastMode) return;
      const ms = Math.max(50, Math.min(10000, Number(sec || 1) * 1000));
      const step = 100;
      let elapsed = 0;
      while (elapsed < ms && isRunning()) {
        await new Promise((r) => setTimeout(r, step));
        elapsed += step;
      }
    },
    setMode: (mode: ObcMode) => {
      updateState((prev) => ({
        ...prev,
        mode,
        logs: prev.mode !== mode ? appendLog(prev, 'OBC', `Режим переключён -> ${mode}`) : prev.logs,
      }));
    },
    getMode: () => getState().mode,
    logTelemetry: (tag: string, val: unknown) => {
      const formatted = typeof val === 'number' ? val.toFixed(2) : String(val);
      updateState((prev) => ({
        ...prev,
        logs: appendLog(prev, 'OBC', `FRAM[${tag}] = ${formatted}`),
      }));
    },
    resetWatchdog: () => {
      updateState((prev) => ({
        ...prev,
        watchdogAgeSec: 0,
        watchdogResets: prev.watchdogResets + 1,
      }));
    },
    batteryPct: () => Number(getState().batteryPct.toFixed(1)),
    batteryVolt: () => Number(getState().batteryVolt.toFixed(2)),
    solarCurrent: (panel: 'X+' | 'X-' | 'Y+' | 'Y-' | 'Z+') =>
      getState().inEclipse || getState().faults.brownoutMode ? 0 : getState().solarMa[panel] ?? 0,
    setRail: (rail: 'COMMS_3V3' | 'ADCS_5V' | 'PAYLOAD_5V', on: boolean) => {
      updateState((prev) => {
        if (rail === 'PAYLOAD_5V' && on && prev.faults.payloadRailShort) {
          return {
            ...prev,
            rails: { ...prev.rails, PAYLOAD_5V: false },
            logs: appendLog(prev, 'EPS', `Защита по току: КЗ на шине PAYLOAD_5V, питание отсечено`),
          };
        }
        if (prev.rails[rail] === on) return prev;
        return {
          ...prev,
          rails: { ...prev.rails, [rail]: on },
          logs: appendLog(prev, 'EPS', `Шина ${rail}: ${on ? 'ВКЛ' : 'ВЫКЛ'}`),
        };
      });
    },
    setHeater: (on: boolean) => {
      updateState((prev) => {
        if (prev.heaterOn === on) return prev;
        return {
          ...prev,
          heaterOn: on,
          logs: appendLog(prev, 'EPS', `Обогрев АКБ: ${on ? 'ВКЛ' : 'ВЫКЛ'}`),
        };
      });
    },
    gyro: (axis: 'X' | 'Y' | 'Z') => Number(getState().gyro[axis].toFixed(2)),
    sunFlux: () => (getState().inEclipse ? 0 : 94),
    setMagnetorquer: (axis: 'X' | 'Y' | 'Z', pct: unknown) => {
      const clamped = Math.max(-100, Math.min(100, Number(pct || 0)));
      updateState((prev) => ({
        ...prev,
        magnetorquer: { ...prev.magnetorquer, [axis]: clamped },
      }));
    },
    runBdot: () => {
      updateState((prev) => {
        if (!prev.rails.ADCS_5V) {
          return {
            ...prev,
            logs: appendLog(prev, 'ADCS', 'Ошибка B-dot: шина ADCS_5V отключена'),
          };
        }
        const nextGyro = {
          X: Math.abs(prev.gyro.X) < 0.2 ? 0 : prev.gyro.X * 0.72,
          Y: Math.abs(prev.gyro.Y) < 0.2 ? 0 : prev.gyro.Y * 0.72,
          Z: Math.abs(prev.gyro.Z) < 0.2 ? 0 : prev.gyro.Z * 0.72,
        };
        const mtq = {
          X: Math.round(-prev.gyro.X * 6),
          Y: Math.round(-prev.gyro.Y * 6),
          Z: Math.round(-prev.gyro.Z * 6),
        };
        return {
          ...prev,
          gyro: nextGyro,
          magnetorquer: mtq,
          logs: appendLog(
            prev,
            'ADCS',
            `B-dot шаг: ω=(${nextGyro.X.toFixed(1)}, ${nextGyro.Y.toFixed(1)}, ${nextGyro.Z.toFixed(1)}) °/с`
          ),
        };
      });
    },
    sendBeacon: (freq: string, msg: unknown) => {
      updateState((prev) => {
        if (!prev.rails.COMMS_3V3) {
          return {
            ...prev,
            logs: appendLog(prev, 'COMMS', `Отказ передачи: шина COMMS_3V3 отключена`),
          };
        }
        if (prev.faults.commsRfJamming) {
          return {
            ...prev,
            logs: appendLog(prev, 'COMMS', `Помеха UHF ${freq} МГц: потеря квитанции`),
          };
        }
        const text = String(msg ?? 'SCHOOL76-1U');
        return {
          ...prev,
          beaconsSent: prev.beaconsSent + 1,
          lastBeaconText: text,
          logs: appendLog(prev, 'COMMS', `AX.25 ${freq} МГц -> "${text}"`),
        };
      });
    },
    sendTelemetry: () => {
      updateState((prev) => {
        if (!prev.rails.COMMS_3V3) {
          return {
            ...prev,
            logs: appendLog(prev, 'COMMS', `Пакет не отправлен: COMMS_3V3 выключена`),
          };
        }
        return {
          ...prev,
          packetsSent: prev.packetsSent + 1,
          logs: appendLog(
            prev,
            'COMMS',
            `TLM #${prev.packetsSent + 1}: V=${prev.batteryVolt.toFixed(2)}V, SoC=${prev.batteryPct.toFixed(1)}%, T_bat=${prev.temps.BAT.toFixed(1)}°C`
          ),
        };
      });
    },
    setTxPower: (dbm: unknown) => {
      const val = Number(dbm || 20);
      updateState((prev) => ({
        ...prev,
        txPowerDbm: val,
        logs: appendLog(prev, 'COMMS', `Мощность передатчика: ${val} дБм`),
      }));
    },
    captureImage: (res: string) => {
      updateState((prev) => {
        if (!prev.rails.PAYLOAD_5V) {
          return {
            ...prev,
            logs: appendLog(prev, 'PAYLOAD', `Камера не отвечает: подайте PAYLOAD_5V`),
          };
        }
        return {
          ...prev,
          imagesCaptured: prev.imagesCaptured + 1,
          logs: appendLog(prev, 'PAYLOAD', `Снимок ДЗЗ сохранён (${res}), кадр #${prev.imagesCaptured + 1}`),
        };
      });
    },
    readRadiation: () => Number(getState().radiationUsv.toFixed(2)),
    readTemp: (zone: 'OBC' | 'BAT' | 'CAM') => Number((getState().temps[zone] ?? 20).toFixed(1)),
  };

  return { simApi, appendLog };
}

export function bindCompiledHandlers(
  jsCode: string,
  simApi: ReturnType<typeof createSimRuntime>['simApi']
): CompiledHandlers {
  const handlers: CompiledHandlers = {
    onBoot: null,
    ticks: [],
    commands: {},
  };
  const fn = new Function('sim', 'handlers', jsCode);
  fn(simApi, handlers);
  return handlers;
}

/**
 * Automated Pre-Deployment Hardware-in-the-Loop (HIL) Verification Suite.
 * Runs the compiled mBlock program across virtual scenarios (Boot, Low-Battery SAFE,
 * High-Tumble ADCS B-dot, and Telecommands) before flashing onto STM32/ESP32 hardware.
 */
export async function runPreflightVerification(
  jsCode: string,
  programName: string
): Promise<PreflightReport> {
  const checks: PreflightCheckItem[] = [];

  // 1. Nominal Boot & Watchdog check
  let state = createInitialTelemetry('leo_nominal');
  const { simApi } = createSimRuntime(
    () => state,
    (updater) => {
      state = updater(state);
    },
    () => true,
    true
  );

  let compiled: CompiledHandlers;
  try {
    compiled = bindCompiledHandlers(jsCode, simApi);
  } catch (err) {
    return {
      programName,
      executedAt: new Date().toISOString(),
      passed: false,
      scorePct: 0,
      checks: [
        {
          id: 'compile',
          subsystem: 'OBC',
          title: 'Синтаксис и трансляция блоков mBlock',
          status: 'fail',
          detail: err instanceof Error ? err.message : 'Ошибка компиляции логики',
        },
      ],
    };
  }

  if (compiled.onBoot) {
    await compiled.onBoot();
  }
  for (let cycle = 0; cycle < 4; cycle++) {
    state = stepCubeSatPhysics(state, 1);
    for (const tick of compiled.ticks) {
      await tick.fn();
    }
  }

  checks.push({
    id: 'wdt',
    subsystem: 'OBC',
    title: 'Сброс сторожевого таймера (Watchdog WDT)',
    status: state.watchdogResets > 0 ? 'pass' : 'warn',
    detail:
      state.watchdogResets > 0
        ? `Выполнено ${state.watchdogResets} сбросов WDT за 4 цикла`
        : 'Блок «Сбросить WDT» не вызван — на реальном STM32 возможен перезапуск по таймеру',
  });

  // 2. Low-Battery Safe Mode check
  let lowState = createInitialTelemetry('low_battery');
  const lowRuntime = createSimRuntime(
    () => lowState,
    (updater) => {
      lowState = updater(lowState);
    },
    () => true,
    true
  );
  const lowHandlers = bindCompiledHandlers(jsCode, lowRuntime.simApi);
  if (lowHandlers.onBoot) await lowHandlers.onBoot();
  for (let i = 0; i < 3; i++) {
    for (const tick of lowHandlers.ticks) {
      await tick.fn();
    }
  }

  const safeHandled = lowState.mode === 'SAFE' || !lowState.rails.PAYLOAD_5V;
  checks.push({
    id: 'eps-safe',
    subsystem: 'EPS',
    title: 'Защита АКБ при разряде < 25% (SAFE / отключение PAYLOAD_5V)',
    status: safeHandled ? 'pass' : 'fail',
    detail: safeHandled
      ? `Режим: ${lowState.mode}, PAYLOAD_5V: ${lowState.rails.PAYLOAD_5V ? 'ВКЛ' : 'ВЫКЛ'}`
      : 'При падении АКБ до 21.5% нагрузка PAYLOAD_5V осталась включённой без перехода в SAFE',
  });

  // 3. COMMS Beacon & Telemetry transmission check
  const hasComms = state.beaconsSent > 0 || state.packetsSent > 0;
  checks.push({
    id: 'comms-tlm',
    subsystem: 'COMMS',
    title: 'Передача маяка / телеметрии AX.25 435.800 МГц',
    status: hasComms ? 'pass' : 'warn',
    detail: hasComms
      ? `Отправлено маяков: ${state.beaconsSent}, пакетов TLM: ${state.packetsSent}`
      : 'В основном цикле нет передачи телеметрии или маяка COMMS',
  });

  // 4. ADCS Detumble check
  let adcsState = createInitialTelemetry('high_tumble');
  const initialOmega = Math.hypot(adcsState.gyro.X, adcsState.gyro.Y, adcsState.gyro.Z);
  const adcsRuntime = createSimRuntime(
    () => adcsState,
    (updater) => {
      adcsState = updater(adcsState);
    },
    () => true,
    true
  );
  const adcsHandlers = bindCompiledHandlers(jsCode, adcsRuntime.simApi);
  if (adcsHandlers.onBoot) await adcsHandlers.onBoot();
  for (let i = 0; i < 5; i++) {
    for (const tick of adcsHandlers.ticks) {
      await tick.fn();
    }
  }
  const finalOmega = Math.hypot(adcsState.gyro.X, adcsState.gyro.Y, adcsState.gyro.Z);
  const damped = finalOmega < initialOmega * 0.8;
  checks.push({
    id: 'adcs-bdot',
    subsystem: 'ADCS',
    title: 'Стабилизация угловой скорости B-dot',
    status: damped ? 'pass' : 'warn',
    detail: damped
      ? `|ω| снижена с ${initialOmega.toFixed(1)} до ${finalOmega.toFixed(1)} °/с`
      : 'Алгоритм B-dot не задействован в текущей программе (норм. для узкоспециализированных модулей)',
  });

  // 5. Telecommand handler check (PING / CAPTURE)
  const cmdCount = Object.keys(compiled.commands).length;
  if (compiled.commands['CAPTURE']) {
    await compiled.commands['CAPTURE']();
  }
  checks.push({
    id: 'payload-cmd',
    subsystem: 'PAYLOAD',
    title: 'Обработчики радиокоманд наземной станции',
    status: cmdCount > 0 ? 'pass' : 'warn',
    detail:
      cmdCount > 0
        ? `Зарегистрировано команд: ${Object.keys(compiled.commands).join(', ')}`
        : 'Нет обработчиков радиокоманд (PING / CAPTURE / SAFE)',
  });

  const failCount = checks.filter((c) => c.status === 'fail').length;
  const passCount = checks.filter((c) => c.status === 'pass').length;
  const scorePct = Math.round((passCount / checks.length) * 100);

  return {
    programName,
    executedAt: new Date().toISOString(),
    passed: failCount === 0,
    scorePct,
    checks,
  };
}
