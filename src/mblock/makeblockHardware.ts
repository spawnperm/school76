/**
 * Hardware protocols, Makeblock-Libraries C++ driver templates, mBlock .s2e descriptors,
 * Codey/CyberPi ESP32 MicroPython bindings, and 0xFF 0x55 binary telemetry framing
 * synthesized from Makeblock-official/mBlock, Makeblock-Libraries, e-Gizmo/mBlock, and codey-rocky.
 */

import type { CubeSatTelemetry } from './simulator.ts';

export type MakeblockBoardProfileId = 'codey_esp32' | 'auriga_stm32' | 'gizduino_avr';

export interface MakeblockBoardProfile {
  id: MakeblockBoardProfileId;
  label: string;
  mcu: string;
  protocol: string;
  baudRate: number;
  headerInclude: string;
  description: string;
}

export const MAKEBLOCK_BOARD_PROFILES: Record<MakeblockBoardProfileId, MakeblockBoardProfile> = {
  codey_esp32: {
    id: 'codey_esp32',
    label: 'Codey Rocky / CyberPi (ESP32)',
    mcu: 'ESP32-WROVER · MicroPython',
    protocol: 'Event decorators @event.* + Wi-Fi urequests',
    baudRate: 115200,
    headerInclude: 'import codey, event, time',
    description:
      'Исполнение на ESP32 (Codey/CyberPi): декораторы событий @event.start, RGB LED, динамик, 6-осевой IMU.',
  },
  auriga_stm32: {
    id: 'auriga_stm32',
    label: 'STM32F4 / Makeblock Auriga',
    mcu: 'STM32F405 / ATmega2560 · C++',
    protocol: 'MePort RJ25 + MeGyro (tau=0.5s) + MeHostParser 0xFF55',
    baudRate: 115200,
    headerInclude: '#include <MeAuriga.h>\n#include <School76CubeSat.h>',
    description:
      'Прошивка Makeblock Auriga/STM32 с комплементарным фильтром MeGyro, PID-регулятором и бинарным телеметрическим кадром.',
  },
  gizduino_avr: {
    id: 'gizduino_avr',
    label: 'MeOrion / e-Gizmo gizDuino (AVR)',
    mcu: 'ATmega328P / ATmega644 / ATmega1281 · C++',
    protocol: 'e-Gizmo RTC 10ms Hardware Tick + MeOrion RJ25',
    baudRate: 57600,
    headerInclude: '#include <MeOrion.h>\n#include <School76CubeSat.h>',
    description:
      'Совместимость с платами Makeblock Orion и e-Gizmo gizDuino (неблокирующий таймер RTC=millis()+10 для бортового цикла).',
  },
};

export interface MakeblockSerialFrame {
  id: string;
  time: string;
  deviceId: number;
  deviceLabel: string;
  valueLabel: string;
  bytes: number[];
  hex: string;
}

/**
 * Encodes a scalar telemetry float32 or string packet using Makeblock's mbot.js / MeHostParser
 * framing: [0xFF, 0x55, len, extIdx, action(2=write/stream), deviceId, type, payload..., 0x0D, 0x0A].
 * Data types per mbot.js: 1=byte, 2=float32 LE, 3=short16 LE, 4=len+ascii.
 */
export function encodeMakeblockFloatFrame(
  deviceId: number,
  extIdx: number,
  value: number
): number[] {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setFloat32(0, value, true);
  const fBytes = [
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  ];
  // Response/Telemetry stream format matching ext.processData in mbot.js:
  // FF 55 [extIdx] [type=2(float)] [4 bytes LE] 0D 0A
  return [0xff, 0x55, extIdx & 0xff, 0x02, ...fBytes, 0x0d, 0x0a];
}

export function encodeMakeblockCommandFrame(
  deviceId: number,
  port: number,
  slot: number,
  value: number
): number[] {
  const buf = new ArrayBuffer(2);
  const view = new DataView(buf);
  view.setInt16(0, Math.round(value), true);
  const payload = [
    0x00, // extIdx
    0x02, // action = runPackage
    deviceId & 0xff,
    port & 0xff,
    slot & 0xff,
    view.getUint8(0),
    view.getUint8(1),
  ];
  return [0xff, 0x55, payload.length, ...payload];
}

export function formatHexFrame(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

export function decodeMakeblockStreamFrame(bytes: number[]): {
  valid: boolean;
  extIdx?: number;
  typeName?: string;
  value?: number | string;
} {
  if (bytes.length < 6) return { valid: false };
  if (bytes[0] !== 0xff || bytes[1] !== 0x55) return { valid: false };
  const extIdx = bytes[2];
  const type = bytes[3];

  if (type === 2 && bytes.length >= 8) {
    const ab = new ArrayBuffer(4);
    const dv = new DataView(ab);
    dv.setUint8(0, bytes[4]);
    dv.setUint8(1, bytes[5]);
    dv.setUint8(2, bytes[6]);
    dv.setUint8(3, bytes[7]);
    return {
      valid: true,
      extIdx,
      typeName: 'float32',
      value: Number(dv.getFloat32(0, true).toFixed(3)),
    };
  }
  if (type === 3 && bytes.length >= 6) {
    const ab = new ArrayBuffer(2);
    const dv = new DataView(ab);
    dv.setUint8(0, bytes[4]);
    dv.setUint8(1, bytes[5]);
    return {
      valid: true,
      extIdx,
      typeName: 'int16',
      value: dv.getInt16(0, true),
    };
  }
  if (type === 1 && bytes.length >= 5) {
    return {
      valid: true,
      extIdx,
      typeName: 'uint8',
      value: bytes[4],
    };
  }
  return { valid: false };
}

export function buildCubeSatTelemetryFrames(state: CubeSatTelemetry): MakeblockSerialFrame[] {
  const stamp = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  const vBatBytes = encodeMakeblockFloatFrame(0x31, 1, state.batteryVolt);
  const gyroXBytes = encodeMakeblockFloatFrame(0x06, 2, state.gyro.X);
  const pitchBytes = encodeMakeblockFloatFrame(0x06, 3, state.angles.X);
  const tempBatBytes = encodeMakeblockFloatFrame(0x02, 4, state.temps.BAT);

  return [
    {
      id: `frm-vbat-${Date.now()}`,
      time: stamp,
      deviceId: 0x31,
      deviceLabel: 'EPS · V_BAT',
      valueLabel: `${state.batteryVolt.toFixed(2)} В (${state.batteryPct.toFixed(1)}%)`,
      bytes: vBatBytes,
      hex: formatHexFrame(vBatBytes),
    },
    {
      id: `frm-gyro-${Date.now() + 1}`,
      time: stamp,
      deviceId: 0x06,
      deviceLabel: 'MeGyro · ω_X',
      valueLabel: `${state.gyro.X.toFixed(2)} °/с`,
      bytes: gyroXBytes,
      hex: formatHexFrame(gyroXBytes),
    },
    {
      id: `frm-pitch-${Date.now() + 2}`,
      time: stamp,
      deviceId: 0x06,
      deviceLabel: 'MeGyro · Pitch',
      valueLabel: `${state.angles.X.toFixed(1)}°`,
      bytes: pitchBytes,
      hex: formatHexFrame(pitchBytes),
    },
    {
      id: `frm-tbat-${Date.now() + 3}`,
      time: stamp,
      deviceId: 0x02,
      deviceLabel: 'TMP117 · T_BAT',
      valueLabel: `${state.temps.BAT.toFixed(1)} °C`,
      bytes: tempBatBytes,
      hex: formatHexFrame(tempBatBytes),
    },
  ];
}

/**
 * Generates an authentic mBlock .s2e JSON extension descriptor for school76-1U CubeSat,
 * compatible with Makeblock-official/mBlock & e-Gizmo/mBlock extension loader.
 */
export function generateCubeSatS2eExtension(): string {
  const descriptor = {
    extensionName: 'School76_CubeSat_1U',
    sort: 2,
    firmware: '1.2.76',
    extensionPort: 0,
    javascriptURL: 'js/school76_cubesat.js',
    blockSpecs: [
      ['h', 'School76 CubeSat OBC Program', 'runArduino'],
      [
        'w',
        'OBC set mode %m.obcMode',
        'obcSetMode',
        'NOMINAL',
        {
          setup: 'CubeSat.begin();\n',
          inc: '#include <School76CubeSat.h>\n',
          def: '',
          work: 'obc.setMode({0});\n',
          loop: '',
        },
      ],
      [
        'w',
        'OBC reset watchdog (WDT)',
        'obcResetWdt',
        {
          setup: '',
          inc: '',
          def: '',
          work: 'obc.resetWatchdog();\n',
          loop: '',
        },
      ],
      [
        'w',
        'OBC RGB LED r:%n g:%n b:%n',
        'obcSetLed',
        0,
        180,
        255,
        {
          setup: 'rgbLed.setpin(44);\n',
          inc: '#include <MeRGBLed.h>\n',
          def: 'MeRGBLed rgbLed(0, 12);\n',
          work: 'rgbLed.setColor({0}, {1}, {2});\nrgbLed.show();\n',
          loop: '',
        },
      ],
      [
        'w',
        'OBC buzzer %n Hz for %n ms',
        'obcPlayBuzzer',
        880,
        150,
        {
          setup: '',
          inc: '#include <MeBuzzer.h>\n',
          def: 'MeBuzzer buzzer;\n',
          work: 'buzzer.tone({0}, {1});\n',
          loop: '',
        },
      ],
      [
        'R',
        'EPS battery %',
        'epsBatteryPct',
        { setup: '', inc: '', def: '', work: 'eps.batteryPct()', loop: '' },
      ],
      [
        'w',
        'EPS rail %m.epsRail %m.switchState',
        'epsSetRail',
        'PAYLOAD_5V',
        'ON',
        {
          setup: '',
          inc: '',
          def: '',
          work: 'eps.setRail({0}, {1});\n',
          loop: '',
        },
      ],
      [
        'R',
        'ADCS MeGyro rate %m.gyroAxis (°/s)',
        'adcsReadGyro',
        'X',
        {
          setup: 'gyro.begin();\n',
          inc: '#include <MeGyro.h>\n',
          def: 'MeGyro gyro;\n',
          work: 'adcs.gyro({0})',
          loop: 'gyro.update();\n',
        },
      ],
      [
        'R',
        'ADCS MeGyro angle %m.gyroAxis (°)',
        'adcsReadAngle',
        'X',
        {
          setup: 'gyro.begin();\n',
          inc: '#include <MeGyro.h>\n',
          def: 'MeGyro gyro;\n',
          work: 'adcs.angle({0})',
          loop: 'gyro.update();\n',
        },
      ],
      [
        'w',
        'ADCS calibrate MeGyro (500 samples)',
        'adcsCalibrateGyro',
        {
          setup: '',
          inc: '',
          def: '',
          work: 'adcs.calibrateGyro();\n',
          loop: '',
        },
      ],
      [
        'w',
        'ADCS PID stabilize axis %m.gyroAxis target %n° Kp %n Kd %n',
        'adcsPidStabilize',
        'X',
        0,
        2.5,
        0.6,
        {
          setup: '',
          inc: '',
          def: '',
          work: 'adcs.stabilizePid({0}, {1}, {2}, {3});\n',
          loop: '',
        },
      ],
      [
        'w',
        'ADCS run B-dot detumble step',
        'adcsRunBdot',
        { setup: '', inc: '', def: '', work: 'adcs.runBdot();\n', loop: '' },
      ],
      [
        'w',
        'COMMS send Makeblock 0xFF55 frame',
        'commsSendFrame',
        {
          setup: 'Serial.begin(115200);\n',
          inc: '#include <MeHostParser.h>\n',
          def: '',
          work: 'comms.sendMakeblockFrame();\n',
          loop: '',
        },
      ],
      [
        'w',
        'COMMS AX.25 beacon %m.uhfFreq MHz text %s',
        'commsSendBeacon',
        '435.800',
        'SCHOOL76-1U OK',
        {
          setup: '',
          inc: '',
          def: '',
          work: 'comms.sendBeacon({0}, {1});\n',
          loop: '',
        },
      ],
      [
        'w',
        'PAYLOAD capture image %m.camRes',
        'payloadCaptureImage',
        '1280x720',
        {
          setup: '',
          inc: '',
          def: '',
          work: 'payload.captureImage({0});\n',
          loop: '',
        },
      ],
    ],
    menus: {
      obcMode: ['NOMINAL', 'SAFE', 'SCIENCE', 'DETUMBLE'],
      epsRail: ['COMMS_3V3', 'ADCS_5V', 'PAYLOAD_5V'],
      switchState: ['ON', 'OFF'],
      gyroAxis: ['X', 'Y', 'Z'],
      uhfFreq: ['435.800', '436.250'],
      camRes: ['640x480', '1280x720'],
    },
    values: {
      NOMINAL: 'OBC_NOMINAL',
      SAFE: 'OBC_SAFE',
      SCIENCE: 'OBC_SCIENCE',
      DETUMBLE: 'OBC_DETUMBLE',
      COMMS_3V3: 'RAIL_COMMS_3V3',
      ADCS_5V: 'RAIL_ADCS_5V',
      PAYLOAD_5V: 'RAIL_PAYLOAD_5V',
      ON: 'true',
      OFF: 'false',
    },
  };

  return JSON.stringify(descriptor, null, 2);
}

/**
 * Generates the self-contained School76CubeSat.h C++ header integrating Makeblock-Libraries
 * MeGyro complementary filter (tau=0.5s), MeEncoderOnBoard-style PID deadband loop,
 * MeRGBLed beacon, MeBuzzer diagnostics, and 0xFF 0x55 binary telemetry framing.
 */
export function generateSchool76CubeSatHeader(profileId: MakeblockBoardProfileId): string {
  const boardHeader =
    profileId === 'gizduino_avr'
      ? '#include <MeOrion.h>\n#include <avr/wdt.h>'
      : '#include <MeAuriga.h>';

  return `/**
 * School76CubeSat.h — Бортовая библиотека кубсата 1U на базе Makeblock-Libraries
 * Профиль платы: ${MAKEBLOCK_BOARD_PROFILES[profileId].label}
 * Интеграция алгоритмов: MeGyro (фильтр tau=0.5s), PID стабилизация, 0xFF 0x55 MeHostParser
 */
#ifndef SCHOOL76_CUBESAT_H
#define SCHOOL76_CUBESAT_H

#include <Arduino.h>
#include <Wire.h>
#include <math.h>
${boardHeader}

enum ObcMode { OBC_NOMINAL, OBC_SAFE, OBC_SCIENCE, OBC_DETUMBLE };
enum EpsRail { RAIL_COMMS_3V3, RAIL_ADCS_5V, RAIL_PAYLOAD_5V };

struct School76PidState {
  float P = 2.5f;
  float I = 0.08f;
  float D = 0.60f;
  float integral = 0.0f;
  float prevError = 0.0f;
  float deadbandDeg = 0.5f;
};

class School76ObcDriver {
public:
  ObcMode mode = OBC_NOMINAL;
  void setMode(ObcMode m) { mode = m; }
  const char* getMode() const {
    switch (mode) {
      case OBC_SAFE: return "SAFE";
      case OBC_SCIENCE: return "SCIENCE";
      case OBC_DETUMBLE: return "DETUMBLE";
      default: return "NOMINAL";
    }
  }
  void setLed(uint8_t r, uint8_t g, uint8_t b) {
    rgbLed_.setColor(r, g, b);
    rgbLed_.show();
  }
  void beep(uint16_t freqHz, uint32_t durationMs) {
    buzzer_.tone(freqHz, durationMs);
  }
  void resetWatchdog() {
#ifdef WDTO_4S
    wdt_reset();
#endif
  }
  void logTelemetry(const char* tag, float val) {
    Serial.print("FRAM["); Serial.print(tag); Serial.print("]="); Serial.println(val, 2);
  }
private:
  MeRGBLed rgbLed_{0, 12};
  MeBuzzer buzzer_;
};

class School76EpsDriver {
public:
  float batteryPct() const { return constrain((analogRead(A0) / 1023.0f) * 100.0f, 0.0f, 100.0f); }
  float batteryVoltage() const { return 6.35f + (batteryPct() / 100.0f) * 1.95f; }
  float solarCurrent(const char* panel) const { (void)panel; return 380.0f; }
  void setRail(EpsRail rail, bool on) {
    uint8_t pin = (rail == RAIL_COMMS_3V3) ? 5 : (rail == RAIL_ADCS_5V ? 6 : 7);
    pinMode(pin, OUTPUT);
    digitalWrite(pin, on ? HIGH : LOW);
  }
  void setHeater(bool on) {
    pinMode(8, OUTPUT);
    digitalWrite(8, on ? HIGH : LOW);
  }
};

class School76AdcsDriver {
public:
  void begin() {
    imu_.begin();
    lastUpdateMs_ = millis();
  }
  void calibrateGyro() {
    imu_.deviceCalibration();
  }
  void update() {
    imu_.update(); // MeGyro complementary filter: alpha = 0.5 / (0.5 + dt)
  }
  float gyro(char axis) {
    update();
    if (axis == 'Y') return imu_.getGyroY();
    if (axis == 'Z') return imu_.getGyroZ();
    return imu_.getGyroX();
  }
  float angle(char axis) {
    update();
    if (axis == 'Y') return imu_.getAngleY();
    if (axis == 'Z') return imu_.getAngleZ();
    return imu_.getAngleX();
  }
  float sunFlux() const { return constrain((analogRead(A1) / 1023.0f) * 100.0f, 0.0f, 100.0f); }
  void setMagnetorquer(char axis, float pct) {
    int pwm = constrain((int)(pct * 2.55f), -255, 255);
    uint8_t pin = (axis == 'Y') ? 10 : (axis == 'Z' ? 11 : 9);
    analogWrite(pin, abs(pwm));
  }
  void stabilizePid(char axis, float targetDeg, float kp, float kd) {
    pid_.P = kp;
    pid_.D = kd;
    float current = angle(axis);
    float err = targetDeg - current;
    if (fabs(err) < pid_.deadbandDeg) {
      setMagnetorquer(axis, 0.0f);
      return;
    }
    pid_.integral = constrain(pid_.integral + err * 0.05f, -30.0f, 30.0f);
    float dErr = err - pid_.prevError;
    pid_.prevError = err;
    float outputPct = constrain(pid_.P * err + pid_.I * pid_.integral + pid_.D * dErr, -100.0f, 100.0f);
    setMagnetorquer(axis, outputPct);
  }
  void runBdot() {
    setMagnetorquer('X', constrain(-gyro('X') * 6.0f, -100.0f, 100.0f));
    setMagnetorquer('Y', constrain(-gyro('Y') * 6.0f, -100.0f, 100.0f));
    setMagnetorquer('Z', constrain(-gyro('Z') * 6.0f, -100.0f, 100.0f));
  }
private:
  MeGyro imu_;
  School76PidState pid_;
  unsigned long lastUpdateMs_ = 0;
};

class School76CommsDriver {
public:
  void sendBeacon(float freqMhz, const char* msg) {
    Serial.print("AX25 "); Serial.print(freqMhz, 3); Serial.print(" MHz: "); Serial.println(msg);
  }
  void sendTelemetry() { Serial.println("AX25_TLM_PACKET"); }
  void setTxPower(int dbm) { txDbm_ = dbm; }
  void sendMakeblockFloat(uint8_t extIdx, float val) {
    union { float f; uint8_t b[4]; } u;
    u.f = val;
    uint8_t frame[10] = { 0xFF, 0x55, extIdx, 0x02, u.b[0], u.b[1], u.b[2], u.b[3], 0x0D, 0x0A };
    Serial.write(frame, 10);
  }
  void sendMakeblockFrame(float vBat = 7.94f) { sendMakeblockFloat(1, vBat); }
private:
  int txDbm_ = 20;
};

class School76PayloadDriver {
public:
  void captureImage(const char* res) { Serial.print("CAM_CAPTURE "); Serial.println(res); }
  float readRadiation() const { return 0.48f; }
  float readTemp(const char* zone) const { (void)zone; return 21.4f; }
};

extern School76ObcDriver obc;
extern School76EpsDriver eps;
extern School76AdcsDriver adcs;
extern School76CommsDriver comms;
extern School76PayloadDriver payload;

namespace CubeSat {
  inline unsigned long rtcNextTickMs = 0;
  inline void begin() {
    Serial.begin(${MAKEBLOCK_BOARD_PROFILES[profileId].baudRate});
    adcs.begin();
    rtcNextTickMs = millis() + 10;
  }
  inline void runEvery(unsigned long intervalMs, void (*fn)()) {
    static unsigned long lastRun = 0;
    if (millis() - lastRun >= intervalMs) {
      lastRun = millis();
      fn();
    }
  }
}

#endif
`;
}

export interface MBlock5ExtensionSpec {
  id: string;
  name: string;
  version: string;
  author: string;
  category: 'Core' | 'Protocol' | 'Sensors' | 'Robotics';
  targets: string[];
  description: string;
  blocksCount: number;
  requiredByDefault?: boolean;
}

export const MBLOCK5_EXTENSIONS_CATALOG: MBlock5ExtensionSpec[] = [
  {
    id: 'school76_cubesat_core',
    name: 'School76 CubeSat 1U Core (OBC · EPS · COMMS)',
    version: '1.2.76',
    author: 'school76',
    category: 'Core',
    targets: ['cyberpi', 'auriga', 'arduino_mega2560', 'orion'],
    description: 'Управление режимами OBC, силовыми шинами EPS, телеметрией FRAM и маяком AX.25 435.8 МГц.',
    blocksCount: 16,
    requiredByDefault: true,
  },
  {
    id: 'upload_mode_broadcast',
    name: 'Upload Mode Broadcast (0x46)',
    version: '0.1.15',
    author: 'Makeblock / school76',
    category: 'Protocol',
    targets: ['auriga', 'orion', 'arduino_uno', 'arduino_mega2560', 'cyberpi'],
    description: 'Двусторонний обмен сообщениями между автономной прошивкой Upload Mode и сценой Stage по протоколу 0xFF 0x55.',
    blocksCount: 4,
    requiredByDefault: true,
  },
  {
    id: 'makeblock_megyro_pid',
    name: 'MeGyro + PID B-Dot ADCS',
    version: '3.2.0',
    author: 'Makeblock-Libraries',
    category: 'Sensors',
    targets: ['auriga', 'cyberpi', 'mcore'],
    description: 'Комплементарный фильтр MeGyro (tau=0.5s), калибровка смещения и ПИД-стабилизация с зоной нечувствительности.',
    blocksCount: 5,
    requiredByDefault: true,
  },
  {
    id: 'mdrawbot_azel_kinematics',
    name: 'mDrawBot Az-El & SCARA Tracker',
    version: '1.4.0',
    author: 'Makeblock mDrawBot',
    category: 'Robotics',
    targets: ['orion', 'auriga'],
    description: 'Кривые Безье и обратная кинематика SCARA/Az-El для наведения наземной антенны слежения.',
    blocksCount: 2,
    requiredByDefault: false,
  },
];

/**
 * Generates an mBlock 5 Extension Builder package manifest (manifest.json + arduinoc template)
 * following Makeblock-official/mBlock5 .mext schema conventions.
 */
export function generateMBlock5MextManifest(
  profileId: MakeblockBoardProfileId,
  enabledExtensionIds: string[]
): string {
  const pkg = {
    id: 'school76_cubesat_1u',
    version: '1.2.76',
    platform: ['mblockpc', 'mblockweb'],
    targets:
      profileId === 'codey_esp32'
        ? ['cyberpi', 'halocode']
        : profileId === 'gizduino_avr'
          ? ['orion', 'arduino_uno', 'arduino_mega2560']
          : ['auriga', 'mcore', 'arduino_mega2560'],
    codeTypes: profileId === 'codey_esp32' ? ['python'] : ['arduinoc', 'python'],
    extApiVersion: ['1.0.4', '1.0.5', '1.0.6'],
    name: {
      ru: 'Школьный Кубсат 1U (school76)',
      en: 'School76 CubeSat 1U',
    },
    description: {
      ru: 'Расширение mBlock 5 для бортового ПО кубсата 1U с поддержкой Upload Mode Broadcast (0x46) и MeGyro PID.',
      en: 'mBlock 5 extension for 1U CubeSat OBC with Upload Mode Broadcast and MeGyro PID.',
    },
    activeExtensions: enabledExtensionIds,
    transport: {
      mlinkSocketPort: 55278,
      webSerialBaudRate: MAKEBLOCK_BOARD_PROFILES[profileId].baudRate,
      binaryHeader: '0xFF 0x55',
      broadcastDeviceId: '0x46',
    },
    generatorTemplate: {
      lang: profileId === 'codey_esp32' ? 'python' : 'arduinoc',
      template:
        profileId === 'codey_esp32'
          ? "import codey, event, time\nfrom cubesat import obc, eps, adcs, comms, payload\n//( code //)"
          : "//( include //)\n//( declare //)\nvoid setup() {\n  //( setup //)\n  //( code //)\n}\nvoid loop() {\n  //( _loop //)\n  //( loop //)\n}",
      splitor: {
        frame: { left: '//(', right: '//)' },
        expression: { left: '/*{', right: '}*/' },
      },
    },
  };

  return JSON.stringify(pkg, null, 2);
}

