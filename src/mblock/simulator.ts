import {
  buildCubeSatTelemetryFrames,
  formatHexFrame,
  type MakeblockSerialFrame,
} from './makeblockHardware.ts';
import { encodeOfflineBroadcastFrame } from './hardwareTransport.ts';

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
  cpuLoadPct: number;
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
  angles: { X: number; Y: number; Z: number };
  gyroCalibrated: boolean;
  magnetorquer: { X: number; Y: number; Z: number };
  ledRgb: { r: number; g: number; b: number };
  lastBuzzerHz: number;
  txPowerDbm: number;
  radiationUsv: number;
  temps: { OBC: number; BAT: number; CAM: number; EPS: number; ADCS: number; COMMS: number };
  subsystemWatts: {
    OBC: number;
    EPS: number;
    ADCS: number;
    COMMS: number;
    PAYLOAD: number;
  };
  watchdogAgeSec: number;
  watchdogResets: number;
  beaconsSent: number;
  packetsSent: number;
  makeblockFramesCount: number;
  imagesCaptured: number;
  lastBeaconText: string;
  oledLines: string[];
  lastBroadcastMsg: string;
  lastBroadcastVal: string;
  broadcastHistory: {
    id: string;
    time: string;
    direction: 'TX' | 'RX';
    msg: string;
    value: string;
    hex: string;
  }[];
  simTimeSec: number;
  solarPowerW: number;
  loadPowerW: number;
  cpuLoadPct: number;
  faults: FaultInjectionState;
  history: TelemetryPoint[];
  makeblockFrames: MakeblockSerialFrame[];
  logs: SimLogEntry[];
  groundAntenna: {
    azDeg: number;
    elDeg: number;
    trackingTarget: string;
  };
}

export interface ThermalNodeInfo {
  id: 'OBC' | 'EPS' | 'ADCS' | 'COMMS' | 'PAYLOAD';
  label: string;
  boardName: string;
  watts: number;
  sharePct: number;
  tempC: number;
  limitMinC: number;
  limitMaxC: number;
  status: 'cold' | 'nominal' | 'warm' | 'overheat';
  note: string;
}

export function computeSubsystemPowerWatts(state: Pick<
  CubeSatTelemetry,
  'mode' | 'rails' | 'heaterOn' | 'txPowerDbm' | 'magnetorquer' | 'solarPowerW' | 'faults'
>): CubeSatTelemetry['subsystemWatts'] {
  const obcW =
    state.mode === 'SAFE' ? 0.55 : state.mode === 'SCIENCE' || state.mode === 'DETUMBLE' ? 1.15 : 0.92;

  const mpptLossW = state.faults.brownoutMode ? 0 : state.solarPowerW * 0.12;
  const heaterW = state.heaterOn ? 1.35 : 0;
  const epsShortHeatW = state.faults.payloadRailShort && state.rails.PAYLOAD_5V ? 1.85 : 0;
  const epsW = Number((0.35 + mpptLossW + heaterW + epsShortHeatW).toFixed(2));

  const mtqEffort =
    (Math.abs(state.magnetorquer.X) +
      Math.abs(state.magnetorquer.Y) +
      Math.abs(state.magnetorquer.Z)) /
    300;
  const adcsW = state.rails.ADCS_5V ? Number((0.45 + mtqEffort * 1.65).toFixed(2)) : 0;

  const paW =
    state.txPowerDbm >= 27 ? 1.85 : state.txPowerDbm >= 20 ? 0.85 : 0.35;
  const jamExtraW = state.faults.commsRfJamming ? 0.75 : 0;
  const commsW = state.rails.COMMS_3V3 ? Number((0.4 + paW + jamExtraW).toFixed(2)) : 0;

  const payloadW = state.rails.PAYLOAD_5V
    ? state.faults.payloadRailShort
      ? 4.8
      : 2.1
    : 0;

  return {
    OBC: obcW,
    EPS: epsW,
    ADCS: adcsW,
    COMMS: commsW,
    PAYLOAD: payloadW,
  };
}

export function computeCpuLoadPct(
  state: Pick<
    CubeSatTelemetry,
    'mode' | 'rails' | 'txPowerDbm' | 'magnetorquer' | 'faults'
  >,
  timeSec = 0
): number {
  const modeBase =
    state.mode === 'SAFE'
      ? 14
      : state.mode === 'SCIENCE'
        ? 52
        : state.mode === 'DETUMBLE'
          ? 44
          : 27;

  const mtqActive =
    (Math.abs(state.magnetorquer.X) +
      Math.abs(state.magnetorquer.Y) +
      Math.abs(state.magnetorquer.Z)) /
    300;
  const adcsTask = state.rails.ADCS_5V ? 7 + mtqActive * 15 : 0;
  const commsTask = state.rails.COMMS_3V3
    ? 6 + (state.txPowerDbm >= 27 ? 6 : 2) + (state.faults.commsRfJamming ? 7 : 0)
    : 0;
  const payloadTask = state.rails.PAYLOAD_5V
    ? state.faults.payloadRailShort
      ? 24
      : 18
    : 0;

  const rtosJitter = timeSec > 0 ? Math.sin(timeSec * 1.9) * 2.4 + Math.cos(timeSec * 0.7) * 1.3 : 0;
  const total = modeBase + adcsTask + commsTask + payloadTask + rtosJitter;
  return Number(Math.max(6, Math.min(99, total)).toFixed(1));
}

export function getThermalNodesSnapshot(state: CubeSatTelemetry): ThermalNodeInfo[] {
  const watts = computeSubsystemPowerWatts(state);
  const totalW = Math.max(
    0.1,
    watts.OBC + watts.EPS + watts.ADCS + watts.COMMS + watts.PAYLOAD
  );

  const classify = (temp: number, minC: number, maxC: number): ThermalNodeInfo['status'] => {
    if (temp < minC) return 'cold';
    if (temp >= maxC) return 'overheat';
    if (temp >= maxC - 10) return 'warm';
    return 'nominal';
  };

  return [
    {
      id: 'COMMS',
      label: 'COMMS · UHF 435.8 МГц',
      boardName: 'Трансивер AX.25 и УМ RF',
      watts: watts.COMMS,
      sharePct: Math.round((watts.COMMS / totalW) * 100),
      tempC: state.temps.COMMS,
      limitMinC: -20,
      limitMaxC: 60,
      status: classify(state.temps.COMMS, -15, 58),
      note: !state.rails.COMMS_3V3
        ? 'Шина COMMS_3V3 отключена'
        : state.faults.commsRfJamming
          ? 'Рост КСВ / нагрев усилителя при помехе'
          : `Усиление ${state.txPowerDbm} дБм`,
    },
    {
      id: 'PAYLOAD',
      label: 'PAYLOAD · Камера ДЗЗ',
      boardName: 'Матрица 1280×720 и дозиметр',
      watts: watts.PAYLOAD,
      sharePct: Math.round((watts.PAYLOAD / totalW) * 100),
      tempC: state.temps.CAM,
      limitMinC: -10,
      limitMaxC: 50,
      status: classify(state.temps.CAM, -5, 48),
      note: !state.rails.PAYLOAD_5V
        ? 'Дежурный режим (0 Вт)'
        : state.faults.payloadRailShort
          ? 'Критический тепловой пик: КЗ шины PAYLOAD_5V'
          : 'Активный захват кадров ДЗЗ',
    },
    {
      id: 'OBC',
      label: 'OBC · STM32F4 / ESP32',
      boardName: 'Бортовой процессор и FRAM',
      watts: watts.OBC,
      sharePct: Math.round((watts.OBC / totalW) * 100),
      tempC: state.temps.OBC,
      limitMinC: -20,
      limitMaxC: 65,
      status: classify(state.temps.OBC, -15, 60),
      note: `Режим ${state.mode} · WDT ${state.watchdogAgeSec.toFixed(1)}с`,
    },
    {
      id: 'ADCS',
      label: 'ADCS · IMU и катушки',
      boardName: 'Магнитные торкеры X/Y/Z',
      watts: watts.ADCS,
      sharePct: Math.round((watts.ADCS / totalW) * 100),
      tempC: state.temps.ADCS,
      limitMinC: -15,
      limitMaxC: 55,
      status: classify(state.temps.ADCS, -10, 52),
      note: !state.rails.ADCS_5V
        ? 'Драйверы обесточены'
        : `Катушки: ${state.magnetorquer.X}/${state.magnetorquer.Y}/${state.magnetorquer.Z}%`,
    },
    {
      id: 'EPS',
      label: 'EPS · MPPT и АКБ Li-Ion',
      boardName: 'Контроллер питания и 2S сборка',
      watts: watts.EPS,
      sharePct: Math.round((watts.EPS / totalW) * 100),
      tempC: Math.max(state.temps.EPS, state.temps.BAT),
      limitMinC: 0,
      limitMaxC: 48,
      status: classify(Math.max(state.temps.EPS, state.temps.BAT), 0, 45),
      note: state.heaterOn
        ? 'Включён термоподогрев АКБ (+1.35 Вт)'
        : state.faults.payloadRailShort
          ? 'Перегрев ключа стабилизатора EPS'
          : `АКБ ${state.temps.BAT.toFixed(1)}°C · MPPT ${state.solarPowerW.toFixed(1)} Вт`,
    },
  ];
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
    angles: { X: 6.2, Y: -3.4, Z: 12.0 },
    gyroCalibrated: false,
    magnetorquer: { X: 0, Y: 0, Z: 0 },
    ledRgb: { r: 0, g: 180, b: 255 },
    lastBuzzerHz: 0,
    txPowerDbm: 20,
    radiationUsv: 0.48,
    temps: { OBC: 24.4, BAT: 16.8, CAM: 18.2, EPS: 23.1, ADCS: 21.5, COMMS: 27.6 },
    subsystemWatts: { OBC: 0.92, EPS: 0.72, ADCS: 0.45, COMMS: 1.25, PAYLOAD: 0 },
    watchdogAgeSec: 0,
    watchdogResets: 0,
    beaconsSent: 0,
    packetsSent: 0,
    makeblockFramesCount: 0,
    imagesCaptured: 0,
    lastBeaconText: 'SCHOOL76-1U READY',
    oledLines: ['SCHOOL76-1U · READY', 'EPS: 7.94V (74.2%)'],
    lastBroadcastMsg: '',
    lastBroadcastVal: '',
    broadcastHistory: [],
    simTimeSec: 0,
    solarPowerW: 3.1,
    loadPowerW: 3.34,
    cpuLoadPct: 36,
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
        cpuLoadPct: 36,
        omegaMag: 5.4,
        solarW: 3.1,
        loadW: 3.34,
      },
    ],
    makeblockFrames: [],
    logs: [],
    groundAntenna: {
      azDeg: 0,
      elDeg: 90,
      trackingTarget: 'ZENITH-PARK',
    },
  };

  if (scenario === 'low_battery') {
    base.batteryPct = 21.5;
    base.batteryVolt = 6.81;
    base.inEclipse = true;
    base.temps = { OBC: 14.0, BAT: 1.8, CAM: 11.2, EPS: 12.5, ADCS: 13.0, COMMS: 16.4 };
    base.rails.PAYLOAD_5V = true;
    base.solarPowerW = 0;
  } else if (scenario === 'high_tumble') {
    base.mode = 'DETUMBLE';
    base.gyro = { X: 18.6, Y: -14.2, Z: 11.4 };
    base.magnetorquer = { X: -95, Y: 82, Z: -68 };
    base.temps.ADCS = 34.8;
    base.history[0].omegaMag = 26.0;
  } else if (scenario === 'ground_pass') {
    base.batteryPct = 82.0;
    base.batteryVolt = 8.09;
    base.txPowerDbm = 27;
    base.temps.COMMS = 39.2;
    base.gyro = { X: 0.9, Y: -0.6, Z: 0.4 };
    base.history[0].omegaMag = 1.15;
  }

  base.subsystemWatts = computeSubsystemPowerWatts(base);
  base.loadPowerW = Number(
    (
      base.subsystemWatts.OBC +
      base.subsystemWatts.EPS +
      base.subsystemWatts.ADCS +
      base.subsystemWatts.COMMS +
      base.subsystemWatts.PAYLOAD
    ).toFixed(2)
  );
  base.cpuLoadPct = computeCpuLoadPct(base, 0);
  base.history[0].batteryVolt = base.batteryVolt;
  base.history[0].batteryPct = base.batteryPct;
  base.history[0].cpuLoadPct = base.cpuLoadPct;
  base.history[0].loadW = base.loadPowerW;

  return base;
}

export function stepCubeSatPhysics(prev: CubeSatTelemetry, dtSec: number): CubeSatTelemetry {
  const solarInputW =
    prev.inEclipse || prev.faults.brownoutMode
      ? 0
      : (prev.solarMa['X+'] + prev.solarMa['Y+'] + prev.solarMa['Z+']) * 0.0048;

  const watts = computeSubsystemPowerWatts({
    ...prev,
    solarPowerW: solarInputW,
  });
  const loadW =
    watts.OBC + watts.EPS + watts.ADCS + watts.COMMS + watts.PAYLOAD;

  const netDeltaPct = (solarInputW - loadW) * 0.16 * (dtSec / 0.5);
  const nextBat = Math.max(0, Math.min(100, prev.batteryPct + netDeltaPct));
  const nextVolt = 6.35 + (nextBat / 100) * 1.95;

  const ambientC = prev.inEclipse ? -8 : 20;
  const stepThermal = (currT: number, pWatts: number, kGain: number, kCool: number, minT: number, maxT: number) => {
    const next = currT + (pWatts * kGain - (currT - ambientC) * kCool) * dtSec;
    return Number(Math.max(minT, Math.min(maxT, next)).toFixed(2));
  };

  const nextBatTemp = prev.inEclipse
    ? Math.max(-14, prev.temps.BAT + (prev.heaterOn ? 0.24 : -0.14) * (dtSec / 0.5))
    : Math.min(42, prev.temps.BAT + (prev.heaterOn ? 0.32 : 0.06) * (dtSec / 0.5));

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
  const nextCpu = computeCpuLoadPct(prev, nextTime);

  // Makeblock MeGyro complementary filter (tau = 0.5s -> alpha = 0.5 / (0.5 + dt))
  const filterAlpha = 0.5 / (0.5 + dtSec);
  const wrapAngle = (deg: number) => {
    let a = ((deg + 180) % 360 + 360) % 360 - 180;
    if (a === -180) a = 180;
    return Number(a.toFixed(2));
  };
  const driftBias = prev.gyroCalibrated ? 0 : 0.35;
  const nextAngles = {
    X: wrapAngle((prev.angles.X + (nextGyro.X + driftBias) * dtSec) * filterAlpha),
    Y: wrapAngle((prev.angles.Y + (nextGyro.Y - driftBias * 0.6) * dtSec) * filterAlpha),
    Z: wrapAngle(prev.angles.Z + nextGyro.Z * dtSec),
  };

  const point: TelemetryPoint = {
    t: Number(nextTime.toFixed(1)),
    batteryPct: Number(nextBat.toFixed(1)),
    batteryVolt: Number(nextVolt.toFixed(2)),
    cpuLoadPct: nextCpu,
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
    cpuLoadPct: nextCpu,
    subsystemWatts: watts,
    gyro: nextGyro,
    angles: nextAngles,
    watchdogAgeSec: nextWatchdog,
    temps: {
      OBC: stepThermal(prev.temps.OBC, watts.OBC, 0.85, 0.045, -18, 72),
      BAT: Number(nextBatTemp.toFixed(2)),
      CAM: stepThermal(prev.temps.CAM, watts.PAYLOAD, 0.95, 0.055, -14, 78),
      EPS: stepThermal(prev.temps.EPS, watts.EPS, 0.92, 0.045, -14, 74),
      ADCS: stepThermal(prev.temps.ADCS, watts.ADCS, 0.98, 0.05, -16, 70),
      COMMS: stepThermal(prev.temps.COMMS, watts.COMMS, 1.05, 0.05, -18, 80),
    },
    history: [...prev.history.slice(-59), point],
  };
}

export interface CompiledHandlers {
  onBoot: (() => Promise<void>) | null;
  ticks: { intervalSec: number; fn: () => Promise<void> }[];
  commands: Record<string, () => Promise<void>>;
  broadcasts: Record<string, () => Promise<void>>;
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
    setLed: (r: unknown, g: unknown, b: unknown) => {
      const clamp255 = (v: unknown) => Math.max(0, Math.min(255, Math.round(Number(v || 0))));
      const next = { r: clamp255(r), g: clamp255(g), b: clamp255(b) };
      updateState((prev) => ({
        ...prev,
        ledRgb: next,
        logs:
          prev.ledRgb.r === next.r && prev.ledRgb.g === next.g && prev.ledRgb.b === next.b
            ? prev.logs
            : appendLog(prev, 'OBC', `RGB LED -> (${next.r}, ${next.g}, ${next.b})`),
      }));
    },
    playBuzzer: (freq: unknown, ms: unknown) => {
      const f = Math.max(80, Math.min(8000, Math.round(Number(freq || 880))));
      const dur = Math.max(20, Math.min(3000, Math.round(Number(ms || 150))));
      updateState((prev) => ({
        ...prev,
        lastBuzzerHz: f,
        logs: appendLog(prev, 'OBC', `MeBuzzer: ${f} Гц (${dur} мс)`),
      }));
    },
    displayOled: (label: unknown, val: unknown) => {
      const lbl = String(label ?? 'TLM').slice(0, 14);
      const valStr = typeof val === 'number' ? val.toFixed(2) : String(val ?? '');
      const line = `${lbl}: ${valStr}`.slice(0, 28);
      updateState((prev) => {
        const filtered = prev.oledLines.filter((l) => !l.startsWith(`${lbl}: `));
        return {
          ...prev,
          oledLines: [...filtered, line].slice(-4),
          logs: appendLog(prev, 'OBC', `OLED[${lbl}] = ${valStr}`),
        };
      });
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
    angle: (axis: 'X' | 'Y' | 'Z') => Number(getState().angles[axis].toFixed(2)),
    calibrateGyro: () => {
      updateState((prev) => ({
        ...prev,
        gyroCalibrated: true,
        angles: { X: 0, Y: 0, Z: prev.angles.Z },
        logs: appendLog(prev, 'ADCS', 'MeGyro: калибровка нуля (500 отсчётов) завершена'),
      }));
    },
    pidStabilize: (axis: 'X' | 'Y' | 'Z', target: unknown, kp: unknown, kd: unknown) => {
      const targetDeg = Number(target || 0);
      const kpVal = Math.max(0.1, Number(kp || 2.5));
      const kdVal = Math.max(0, Number(kd || 0.6));
      updateState((prev) => {
        if (!prev.rails.ADCS_5V) {
          return {
            ...prev,
            logs: appendLog(prev, 'ADCS', 'Ошибка PID: шина ADCS_5V отключена'),
          };
        }
        const currAngle = prev.angles[axis];
        const currRate = prev.gyro[axis];
        const err = targetDeg - currAngle;
        if (Math.abs(err) < 0.5 && Math.abs(currRate) < 0.3) {
          return {
            ...prev,
            magnetorquer: { ...prev.magnetorquer, [axis]: 0 },
          };
        }
        const effortPct = Math.max(
          -100,
          Math.min(100, Math.round(kpVal * err - kdVal * currRate))
        );
        const nextAngle = Number((currAngle + err * 0.42).toFixed(2));
        const nextRate = Number((currRate * 0.65).toFixed(2));
        return {
          ...prev,
          angles: { ...prev.angles, [axis]: nextAngle },
          gyro: { ...prev.gyro, [axis]: nextRate },
          magnetorquer: { ...prev.magnetorquer, [axis]: effortPct },
          logs: appendLog(
            prev,
            'ADCS',
            `PID ${axis}: θ=${nextAngle}° (цель ${targetDeg}°), MTQ=${effortPct}%`
          ),
        };
      });
    },
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
    sendMakeblockFrame: () => {
      updateState((prev) => {
        const frames = buildCubeSatTelemetryFrames(prev);
        return {
          ...prev,
          makeblockFramesCount: prev.makeblockFramesCount + 1,
          makeblockFrames: [...frames, ...prev.makeblockFrames].slice(0, 24),
          logs: appendLog(
            prev,
            'COMMS',
            `0xFF 0x55 кадр #${prev.makeblockFramesCount + 1}: ${frames[0].hex}`
          ),
        };
      });
    },
    sendBroadcast: (msg: unknown, val?: unknown) => {
      const msgStr = String(msg ?? 'event').trim() || 'event';
      const valStr = val !== undefined && val !== null ? String(val) : '';
      const bytes = encodeOfflineBroadcastFrame(msgStr, valStr || undefined);
      const hex = formatHexFrame(bytes);
      updateState((prev) => ({
        ...prev,
        makeblockFramesCount: prev.makeblockFramesCount + 1,
        lastBroadcastMsg: msgStr,
        lastBroadcastVal: valStr,
        broadcastHistory: [
          {
            id: `bc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            time: stamp(),
            direction: 'TX' as const,
            msg: msgStr,
            value: valStr,
            hex,
          },
          ...prev.broadcastHistory,
        ].slice(0, 20),
        logs: appendLog(
          prev,
          'COMMS',
          `Broadcast 0x46 -> "${msgStr}"${valStr ? ` (${valStr})` : ''}`
        ),
      }));
    },
    getBroadcastValue: () => getState().lastBroadcastVal,
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
    pointAntenna: (az: unknown, el: unknown) => {
      const azDeg = Math.max(0, Math.min(360, Number(az ?? 180)));
      const elDeg = Math.max(0, Math.min(90, Number(el ?? 45)));
      updateState((prev) => ({
        ...prev,
        groundAntenna: {
          azDeg: Number(azDeg.toFixed(1)),
          elDeg: Number(elDeg.toFixed(1)),
          trackingTarget: 'MANUAL-AZEL',
        },
        logs: appendLog(prev, 'COMMS', `mDrawBot Az-El -> Az ${azDeg.toFixed(1)}°, El ${elDeg.toFixed(1)}°`),
      }));
    },
    trackPass: (norad: string) => {
      updateState((prev) => {
        const t = prev.simTimeSec;
        const azDeg = Number((((t * 4.5 + 115) % 360 + 360) % 360).toFixed(1));
        const elDeg = Number((18 + Math.abs(Math.sin(t * 0.08)) * 64).toFixed(1));
        return {
          ...prev,
          groundAntenna: { azDeg, elDeg, trackingTarget: norad || 'SCHOOL76-1U' },
          logs: appendLog(prev, 'COMMS', `TLE-трекинг ${norad || 'SCHOOL76-1U'}: Az ${azDeg}° / El ${elDeg}°`),
        };
      });
    },
    parkAntenna: () => {
      updateState((prev) => ({
        ...prev,
        groundAntenna: { azDeg: 0, elDeg: 90, trackingTarget: 'ZENITH-PARK' },
        logs: appendLog(prev, 'COMMS', 'Антенна mDrawBot припаркована в зенит (0° / 90°)'),
      }));
    },
    getElevation: () => getState().groundAntenna.elDeg,
    isEclipse: () => getState().inEclipse,
    nextPassMin: () => Number((14.5 - (getState().simTimeSec % 600) / 60).toFixed(1)),
    dopplerShiftKhz: () => Number((Math.cos(getState().simTimeSec * 0.12) * 8.4).toFixed(2)),
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
    broadcasts: {},
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
