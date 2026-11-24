export type ObcMode = 'NOMINAL' | 'SAFE' | 'SCIENCE' | 'DETUMBLE';

export interface SimLogEntry {
  id: string;
  time: string;
  source: 'OBC' | 'EPS' | 'ADCS' | 'COMMS' | 'PAYLOAD';
  text: string;
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
  beaconsSent: number;
  packetsSent: number;
  imagesCaptured: number;
  lastBeaconText: string;
  logs: SimLogEntry[];
}

export function createInitialTelemetry(): CubeSatTelemetry {
  return {
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
    beaconsSent: 0,
    packetsSent: 0,
    imagesCaptured: 0,
    lastBeaconText: 'SCHOOL76-1U READY',
    logs: [],
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
  isRunning: () => boolean
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
    return [entry, ...prev.logs].slice(0, 60);
  }

  const simApi = {
    wait: async (sec: unknown) => {
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
      updateState((prev) => ({ ...prev, watchdogAgeSec: 0 }));
    },
    batteryPct: () => Number(getState().batteryPct.toFixed(1)),
    batteryVolt: () => Number(getState().batteryVolt.toFixed(2)),
    solarCurrent: (panel: 'X+' | 'X-' | 'Y+' | 'Y-' | 'Z+') =>
      getState().inEclipse ? 0 : getState().solarMa[panel] ?? 0,
    setRail: (rail: 'COMMS_3V3' | 'ADCS_5V' | 'PAYLOAD_5V', on: boolean) => {
      updateState((prev) => {
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

export function compileJsHandlers(jsCode: string): CompiledHandlers {
  const handlers: CompiledHandlers = {
    onBoot: null,
    ticks: [],
    commands: {},
  };

  return handlers;
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
