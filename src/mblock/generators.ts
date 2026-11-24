import * as Blockly from 'blockly';
import { PythonGenerator, pythonGenerator, Order as PyOrder } from 'blockly/python';
import { javascriptGenerator, Order as JsOrder } from 'blockly/javascript';
import type { MakeblockBoardProfileId } from './makeblockHardware.ts';

let generatorsRegistered = false;

// Custom C++ Generator for STM32 / Makeblock Auriga / gizDuino AVR (mBlock Upload Mode pattern)
export const cppGenerator = new Blockly.Generator('CPP');
const CPP_ORDER = {
  ATOMIC: 0,
  UNARY_POSTFIX: 1,
  MULTIPLICATIVE: 3,
  ADDITIVE: 4,
  RELATIONAL: 6,
  EQUALITY: 7,
  LOGICAL_AND: 11,
  LOGICAL_OR: 12,
  NONE: 99,
} as const;

cppGenerator.scrub_ = function (block, code, thisOnly) {
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  if (nextBlock && !thisOnly) {
    return code + cppGenerator.blockToCode(nextBlock);
  }
  return code;
};

// Codey Rocky / CyberPi ESP32 MicroPython Generator (inherits PythonGenerator helpers: quote_, init, finish, scrub_)
export const codeyGenerator = new PythonGenerator('CODEY_PY');

export function registerCubeSatGenerators() {
  if (generatorsRegistered) return;
  generatorsRegistered = true;

  // ==========================
  // 1. MICROPYTHON GENERATORS
  // ==========================
  pythonGenerator.forBlock['sat_event_boot'] = function (block, generator) {
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '    pass\n';
    const indented = generator.prefixLines(typeof body === 'string' ? body : body[0], '    ');
    return `def on_boot():\n${indented || '    pass\n'}\n`;
  };

  pythonGenerator.forBlock['sat_event_loop_tick'] = function (block, generator) {
    const sec = block.getFieldValue('SEC') || 2;
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '    pass\n';
    const indented = generator.prefixLines(typeof body === 'string' ? body : body[0], '    ');
    return `def on_tick_${sec}s():\n${indented || '    pass\n'}\n`;
  };

  pythonGenerator.forBlock['sat_event_telecommand'] = function (block, generator) {
    const cmd = block.getFieldValue('CMD') || 'PING';
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '    pass\n';
    const indented = generator.prefixLines(typeof body === 'string' ? body : body[0], '    ');
    return `def on_command_${cmd}():\n${indented || '    pass\n'}\n`;
  };

  pythonGenerator.forBlock['sat_wait_seconds'] = function (block, generator) {
    const sec = generator.valueToCode(block, 'SEC', PyOrder.NONE) || '1';
    return `time.sleep(${sec})\n`;
  };

  pythonGenerator.forBlock['obc_set_mode'] = function (block) {
    const mode = block.getFieldValue('MODE');
    return `obc.set_mode('${mode}')\n`;
  };

  pythonGenerator.forBlock['obc_log_telemetry'] = function (block, generator) {
    const tag = block.getFieldValue('TAG') || 'TLM';
    const val = generator.valueToCode(block, 'VAL', PyOrder.NONE) || '0';
    return `obc.log_telemetry('${tag}', ${val})\n`;
  };

  pythonGenerator.forBlock['obc_reset_watchdog'] = function () {
    return `obc.reset_watchdog()\n`;
  };

  pythonGenerator.forBlock['obc_get_mode'] = function () {
    return [`obc.get_mode()`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['obc_set_status_led'] = function (block, generator) {
    const r = generator.valueToCode(block, 'R', PyOrder.NONE) || '0';
    const g = generator.valueToCode(block, 'G', PyOrder.NONE) || '180';
    const b = generator.valueToCode(block, 'B', PyOrder.NONE) || '255';
    return `obc.set_led(${r}, ${g}, ${b})\n`;
  };

  pythonGenerator.forBlock['obc_play_buzzer'] = function (block, generator) {
    const freq = generator.valueToCode(block, 'FREQ', PyOrder.NONE) || '880';
    const ms = generator.valueToCode(block, 'MS', PyOrder.NONE) || '150';
    return `obc.beep(${freq}, ${ms})\n`;
  };

  pythonGenerator.forBlock['obc_display_oled'] = function (block, generator) {
    const label = block.getFieldValue('LABEL') || 'MODE';
    const val = generator.valueToCode(block, 'VAL', PyOrder.NONE) || "''";
    return `obc.display_oled('${label}', ${val})\n`;
  };

  pythonGenerator.forBlock['eps_read_battery_pct'] = function () {
    return [`eps.battery_pct()`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['eps_read_battery_volt'] = function () {
    return [`eps.battery_voltage()`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['eps_read_solar_ma'] = function (block) {
    const panel = block.getFieldValue('PANEL');
    return [`eps.solar_current('${panel}')`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['eps_set_rail'] = function (block) {
    const rail = block.getFieldValue('RAIL');
    const state = block.getFieldValue('STATE') === 'ON' ? 'True' : 'False';
    return `eps.set_rail('${rail}', ${state})\n`;
  };

  pythonGenerator.forBlock['eps_set_heater'] = function (block) {
    const state = block.getFieldValue('STATE') === 'ON' ? 'True' : 'False';
    return `eps.set_heater(${state})\n`;
  };

  pythonGenerator.forBlock['adcs_read_gyro'] = function (block) {
    const axis = block.getFieldValue('AXIS');
    return [`adcs.gyro('${axis}')`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['adcs_read_angle'] = function (block) {
    const axis = block.getFieldValue('AXIS');
    return [`adcs.angle('${axis}')`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['adcs_calibrate_gyro'] = function () {
    return `adcs.calibrate_gyro()\n`;
  };

  pythonGenerator.forBlock['adcs_pid_stabilize'] = function (block, generator) {
    const axis = block.getFieldValue('AXIS');
    const target = generator.valueToCode(block, 'TARGET', PyOrder.NONE) || '0';
    const kp = generator.valueToCode(block, 'KP', PyOrder.NONE) || '2.5';
    const kd = generator.valueToCode(block, 'KD', PyOrder.NONE) || '0.6';
    return `adcs.stabilize_pid('${axis}', ${target}, kp=${kp}, kd=${kd})\n`;
  };

  pythonGenerator.forBlock['adcs_read_sun_sensor'] = function () {
    return [`adcs.sun_flux()`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['adcs_set_magnetorquer'] = function (block, generator) {
    const axis = block.getFieldValue('AXIS');
    const pct = generator.valueToCode(block, 'PCT', PyOrder.NONE) || '0';
    return `adcs.set_magnetorquer('${axis}', ${pct})\n`;
  };

  pythonGenerator.forBlock['adcs_run_bdot'] = function () {
    return `adcs.run_bdot()\n`;
  };

  pythonGenerator.forBlock['comms_send_beacon'] = function (block, generator) {
    const freq = block.getFieldValue('FREQ');
    const msg = generator.valueToCode(block, 'MSG', PyOrder.NONE) || `'SCHOOL76'`;
    return `comms.send_beacon('${freq}', ${msg})\n`;
  };

  pythonGenerator.forBlock['comms_send_telemetry'] = function () {
    return `comms.send_telemetry()\n`;
  };

  pythonGenerator.forBlock['comms_send_makeblock_frame'] = function () {
    return `comms.send_makeblock_frame()\n`;
  };

  pythonGenerator.forBlock['uplink_broadcast_msg'] = function (block) {
    const msg = block.getFieldValue('MSG') || 'telemetry_ok';
    return `comms.broadcast('${msg}')\n`;
  };

  pythonGenerator.forBlock['uplink_broadcast_msg_val'] = function (block, generator) {
    const msg = block.getFieldValue('MSG') || 'vbat';
    const val = generator.valueToCode(block, 'VAL', PyOrder.NONE) || '0';
    return `comms.broadcast('${msg}', ${val})\n`;
  };

  pythonGenerator.forBlock['uplink_on_broadcast'] = function (block, generator) {
    const msg = block.getFieldValue('MSG') || 'capture';
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '    pass\n';
    const indented = generator.prefixLines(typeof body === 'string' ? body : body[0], '    ');
    const fnSafe = msg.replace(/[^a-zA-Z0-9_]/g, '_') || 'msg';
    return `def on_broadcast_${fnSafe}():\n${indented || '    pass\n'}\n`;
  };

  pythonGenerator.forBlock['uplink_broadcast_value'] = function () {
    return [`comms.broadcast_value()`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['comms_set_tx_power'] = function (block) {
    const dbm = block.getFieldValue('DBM');
    return `comms.set_tx_power(${dbm})\n`;
  };

  pythonGenerator.forBlock['payload_capture_image'] = function (block) {
    const res = block.getFieldValue('RES');
    return `payload.capture_image('${res}')\n`;
  };

  pythonGenerator.forBlock['payload_read_radiation'] = function () {
    return [`payload.read_radiation()`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['payload_read_temp'] = function (block) {
    const zone = block.getFieldValue('ZONE');
    return [`payload.read_temp('${zone}')`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['azel_point_antenna'] = function (block, generator) {
    const az = generator.valueToCode(block, 'AZ', PyOrder.NONE) || '180';
    const el = generator.valueToCode(block, 'EL', PyOrder.NONE) || '45';
    return `ground.point_antenna(${az}, ${el})\n`;
  };

  pythonGenerator.forBlock['azel_track_pass'] = function (block) {
    const norad = String(block.getFieldValue('NORAD') || 'SCHOOL76-1U').replace(/'/g, "\\'");
    return `ground.track_pass('${norad}')\n`;
  };

  pythonGenerator.forBlock['azel_park_home'] = function () {
    return `ground.park_home()\n`;
  };

  pythonGenerator.forBlock['azel_get_elevation'] = function () {
    return [`ground.elevation()`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['orbit_is_eclipse'] = function () {
    return [`orbit.is_eclipse()`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['orbit_next_pass_min'] = function () {
    return [`orbit.next_pass_min()`, PyOrder.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['orbit_doppler_khz'] = function () {
    return [`orbit.doppler_khz()`, PyOrder.FUNCTION_CALL];
  };

  // Patch hat blocks so scrub_ doesn't duplicate their body outside the def
  const pyOriginalScrub = pythonGenerator.scrub_;
  pythonGenerator.scrub_ = function (block, code, thisOnly) {
    if (
      block.type === 'sat_event_boot' ||
      block.type === 'sat_event_loop_tick' ||
      block.type === 'sat_event_telecommand' ||
      block.type === 'uplink_on_broadcast'
    ) {
      return code;
    }
    return pyOriginalScrub.call(this, block, code, thisOnly);
  };

  // ==========================
  // 2. ARDUINO / STM32 C++ GENERATORS
  // ==========================
  cppGenerator.forBlock['sat_event_boot'] = function (block, generator) {
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '';
    const bodyStr = typeof body === 'string' ? body : body[0];
    return `void setup() {\n  CubeSat.begin();\n${generator.prefixLines(bodyStr, '  ')}}\n\n`;
  };

  cppGenerator.forBlock['sat_event_loop_tick'] = function (block, generator) {
    const sec = Number(block.getFieldValue('SEC') || 2) * 1000;
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '';
    const bodyStr = typeof body === 'string' ? body : body[0];
    return `void onTelemetryTick() {\n${generator.prefixLines(bodyStr, '  ')}}\n\nvoid loop() {\n  CubeSat.runEvery(${sec}, onTelemetryTick);\n}\n\n`;
  };

  cppGenerator.forBlock['sat_event_telecommand'] = function (block, generator) {
    const cmd = block.getFieldValue('CMD') || 'PING';
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '';
    const bodyStr = typeof body === 'string' ? body : body[0];
    return `void onCommand_${cmd}() {\n${generator.prefixLines(bodyStr, '  ')}}\n\n`;
  };

  cppGenerator.forBlock['sat_wait_seconds'] = function (block, generator) {
    const sec = generator.valueToCode(block, 'SEC', CPP_ORDER.NONE) || '1';
    return `delay((${sec}) * 1000);\n`;
  };

  cppGenerator.forBlock['obc_set_mode'] = function (block) {
    return `obc.setMode(OBC_${block.getFieldValue('MODE')});\n`;
  };

  cppGenerator.forBlock['obc_log_telemetry'] = function (block, generator) {
    const tag = block.getFieldValue('TAG') || 'TLM';
    const val = generator.valueToCode(block, 'VAL', CPP_ORDER.NONE) || '0';
    return `obc.logTelemetry("${tag}", ${val});\n`;
  };

  cppGenerator.forBlock['obc_reset_watchdog'] = function () {
    return `obc.resetWatchdog();\n`;
  };

  cppGenerator.forBlock['obc_get_mode'] = function () {
    return [`obc.getMode()`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['obc_set_status_led'] = function (block, generator) {
    const r = generator.valueToCode(block, 'R', CPP_ORDER.NONE) || '0';
    const g = generator.valueToCode(block, 'G', CPP_ORDER.NONE) || '180';
    const b = generator.valueToCode(block, 'B', CPP_ORDER.NONE) || '255';
    return `obc.setLed(${r}, ${g}, ${b});\n`;
  };

  cppGenerator.forBlock['obc_play_buzzer'] = function (block, generator) {
    const freq = generator.valueToCode(block, 'FREQ', CPP_ORDER.NONE) || '880';
    const ms = generator.valueToCode(block, 'MS', CPP_ORDER.NONE) || '150';
    return `obc.beep(${freq}, ${ms});\n`;
  };

  cppGenerator.forBlock['obc_display_oled'] = function (block, generator) {
    const label = String(block.getFieldValue('LABEL') || 'MODE').replace(/"/g, '\\"');
    const val = generator.valueToCode(block, 'VAL', CPP_ORDER.NONE) || '""';
    return `Serial.print("${label}: "); Serial.println(${val});\n`;
  };

  cppGenerator.forBlock['eps_read_battery_pct'] = function () {
    return [`eps.batteryPct()`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['eps_read_battery_volt'] = function () {
    return [`eps.batteryVoltage()`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['eps_read_solar_ma'] = function (block) {
    return [`eps.solarCurrent("${block.getFieldValue('PANEL')}")`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['eps_set_rail'] = function (block) {
    const rail = block.getFieldValue('RAIL');
    const state = block.getFieldValue('STATE') === 'ON' ? 'true' : 'false';
    return `eps.setRail(RAIL_${rail}, ${state});\n`;
  };

  cppGenerator.forBlock['eps_set_heater'] = function (block) {
    const state = block.getFieldValue('STATE') === 'ON' ? 'true' : 'false';
    return `eps.setHeater(${state});\n`;
  };

  cppGenerator.forBlock['adcs_read_gyro'] = function (block) {
    return [`adcs.gyro('${block.getFieldValue('AXIS')}')`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['adcs_read_angle'] = function (block) {
    return [`adcs.angle('${block.getFieldValue('AXIS')}')`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['adcs_calibrate_gyro'] = function () {
    return `adcs.calibrateGyro();\n`;
  };

  cppGenerator.forBlock['adcs_pid_stabilize'] = function (block, generator) {
    const axis = block.getFieldValue('AXIS');
    const target = generator.valueToCode(block, 'TARGET', CPP_ORDER.NONE) || '0';
    const kp = generator.valueToCode(block, 'KP', CPP_ORDER.NONE) || '2.5';
    const kd = generator.valueToCode(block, 'KD', CPP_ORDER.NONE) || '0.6';
    return `adcs.stabilizePid('${axis}', ${target}, ${kp}, ${kd});\n`;
  };

  cppGenerator.forBlock['adcs_read_sun_sensor'] = function () {
    return [`adcs.sunFlux()`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['adcs_set_magnetorquer'] = function (block, generator) {
    const axis = block.getFieldValue('AXIS');
    const pct = generator.valueToCode(block, 'PCT', CPP_ORDER.NONE) || '0';
    return `adcs.setMagnetorquer('${axis}', ${pct});\n`;
  };

  cppGenerator.forBlock['adcs_run_bdot'] = function () {
    return `adcs.runBdot();\n`;
  };

  cppGenerator.forBlock['comms_send_beacon'] = function (block, generator) {
    const freq = block.getFieldValue('FREQ');
    const msg = generator.valueToCode(block, 'MSG', CPP_ORDER.NONE) || `"SCHOOL76"`;
    return `comms.sendBeacon(${freq}, ${msg});\n`;
  };

  cppGenerator.forBlock['comms_send_telemetry'] = function () {
    return `comms.sendTelemetry();\n`;
  };

  cppGenerator.forBlock['comms_send_makeblock_frame'] = function () {
    return `comms.sendMakeblockFrame(eps.batteryVoltage());\n`;
  };

  cppGenerator.forBlock['uplink_broadcast_msg'] = function (block) {
    const msg = String(block.getFieldValue('MSG') || 'telemetry_ok').replace(/"/g, '\\"');
    return `broadcaster.broadcast(String("${msg}"));\n`;
  };

  cppGenerator.forBlock['uplink_broadcast_msg_val'] = function (block, generator) {
    const msg = String(block.getFieldValue('MSG') || 'vbat').replace(/"/g, '\\"');
    const val = generator.valueToCode(block, 'VAL', CPP_ORDER.NONE) || '0';
    return `broadcaster.broadcast(String("${msg}"), String(${val}));\n`;
  };

  cppGenerator.forBlock['uplink_on_broadcast'] = function (block, generator) {
    const msg = String(block.getFieldValue('MSG') || 'capture').replace(/"/g, '\\"');
    const fnSafe = msg.replace(/[^a-zA-Z0-9_]/g, '_') || 'msg';
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '';
    const bodyStr = typeof body === 'string' ? body : body[0];
    return `void onBroadcast_${fnSafe}() {\n${generator.prefixLines(bodyStr, '  ')}}\n// В setup(): broadcaster.on(String("${msg}"), onBroadcast_${fnSafe});\n\n`;
  };

  cppGenerator.forBlock['uplink_broadcast_value'] = function () {
    return [`broadcaster.broadcastValue`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['comms_set_tx_power'] = function (block) {
    return `comms.setTxPower(${block.getFieldValue('DBM')});\n`;
  };

  cppGenerator.forBlock['payload_capture_image'] = function (block) {
    return `payload.captureImage("${block.getFieldValue('RES')}");\n`;
  };

  cppGenerator.forBlock['payload_read_radiation'] = function () {
    return [`payload.readRadiation()`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['payload_read_temp'] = function (block) {
    return [`payload.readTemp("${block.getFieldValue('ZONE')}")`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['azel_point_antenna'] = function (block, generator) {
    const az = generator.valueToCode(block, 'AZ', CPP_ORDER.NONE) || '180';
    const el = generator.valueToCode(block, 'EL', CPP_ORDER.NONE) || '45';
    return `groundTracker.pointAzEl(${az}, ${el});\n`;
  };

  cppGenerator.forBlock['azel_track_pass'] = function (block) {
    const norad = String(block.getFieldValue('NORAD') || 'SCHOOL76-1U').replace(/"/g, '\\"');
    return `groundTracker.trackTle("${norad}");\n`;
  };

  cppGenerator.forBlock['azel_park_home'] = function () {
    return `groundTracker.parkZenith();\n`;
  };

  cppGenerator.forBlock['azel_get_elevation'] = function () {
    return [`groundTracker.elevationDeg()`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['orbit_is_eclipse'] = function () {
    return [`orbitModel.inEclipse()`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['orbit_next_pass_min'] = function () {
    return [`orbitModel.nextPassMinutes()`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['orbit_doppler_khz'] = function () {
    return [`orbitModel.dopplerShiftKhz()`, CPP_ORDER.ATOMIC];
  };

  // Standard Blockly blocks support in C++ generator
  cppGenerator.forBlock['controls_if'] = function (block, generator) {
    let n = 0;
    let code = '';
    do {
      const conditionCode = generator.valueToCode(block, 'IF' + n, CPP_ORDER.NONE) || 'false';
      const branchCode = generator.statementToCode(block, 'DO' + n);
      code += (n > 0 ? ' else ' : '') + `if (${conditionCode}) {\n${branchCode}}`;
      n++;
    } while (block.getInput('IF' + n));
    if (block.getInput('ELSE')) {
      const branchCode = generator.statementToCode(block, 'ELSE');
      code += ` else {\n${branchCode}}`;
    }
    return code + '\n';
  };

  cppGenerator.forBlock['controls_repeat_ext'] = function (block, generator) {
    const repeats = generator.valueToCode(block, 'TIMES', CPP_ORDER.NONE) || '0';
    const branch = generator.statementToCode(block, 'DO');
    return `for (int i = 0; i < ${repeats}; i++) {\n${branch}}\n`;
  };

  cppGenerator.forBlock['logic_compare'] = function (block, generator) {
    const ops: Record<string, string> = {
      EQ: '==',
      NEQ: '!=',
      LT: '<',
      LTE: '<=',
      GT: '>',
      GTE: '>=',
    };
    const op = ops[block.getFieldValue('OP')] || '==';
    const a = generator.valueToCode(block, 'A', CPP_ORDER.RELATIONAL) || '0';
    const b = generator.valueToCode(block, 'B', CPP_ORDER.RELATIONAL) || '0';
    return [`(${a} ${op} ${b})`, CPP_ORDER.RELATIONAL];
  };

  cppGenerator.forBlock['logic_operation'] = function (block, generator) {
    const op = block.getFieldValue('OP') === 'AND' ? '&&' : '||';
    const a = generator.valueToCode(block, 'A', CPP_ORDER.LOGICAL_AND) || 'false';
    const b = generator.valueToCode(block, 'B', CPP_ORDER.LOGICAL_AND) || 'false';
    return [`(${a} ${op} ${b})`, CPP_ORDER.LOGICAL_AND];
  };

  cppGenerator.forBlock['logic_negate'] = function (block, generator) {
    const val = generator.valueToCode(block, 'BOOL', CPP_ORDER.UNARY_POSTFIX) || 'false';
    return [`(!${val})`, CPP_ORDER.UNARY_POSTFIX];
  };

  cppGenerator.forBlock['logic_boolean'] = function (block) {
    return [block.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['math_number'] = function (block) {
    return [String(Number(block.getFieldValue('NUM'))), CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['math_arithmetic'] = function (block, generator) {
    const ops: Record<string, string> = {
      ADD: '+',
      MINUS: '-',
      MULTIPLY: '*',
      DIVIDE: '/',
    };
    const op = ops[block.getFieldValue('OP')] || '+';
    const a = generator.valueToCode(block, 'A', CPP_ORDER.ADDITIVE) || '0';
    const b = generator.valueToCode(block, 'B', CPP_ORDER.ADDITIVE) || '0';
    return [`(${a} ${op} ${b})`, CPP_ORDER.ADDITIVE];
  };

  cppGenerator.forBlock['text'] = function (block) {
    const txt = String(block.getFieldValue('TEXT') || '').replace(/"/g, '\\"');
    return [`"${txt}"`, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['variables_get'] = function (block) {
    const varName = block.getField('VAR')?.getText() || 'var';
    return [varName, CPP_ORDER.ATOMIC];
  };

  cppGenerator.forBlock['variables_set'] = function (block, generator) {
    const varName = block.getField('VAR')?.getText() || 'var';
    const val = generator.valueToCode(block, 'VALUE', CPP_ORDER.NONE) || '0';
    return `auto ${varName} = ${val};\n`;
  };

  const cppOriginalScrub = cppGenerator.scrub_;
  cppGenerator.scrub_ = function (block, code, thisOnly) {
    if (
      block.type === 'sat_event_boot' ||
      block.type === 'sat_event_loop_tick' ||
      block.type === 'sat_event_telecommand' ||
      block.type === 'uplink_on_broadcast'
    ) {
      return code;
    }
    return cppOriginalScrub.call(this, block, code, thisOnly);
  };

  // ==========================
  // 3. LIVE SIMULATOR ASYNC JS GENERATORS
  // ==========================
  javascriptGenerator.forBlock['sat_event_boot'] = function (block, generator) {
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '';
    const bodyStr = typeof body === 'string' ? body : body[0];
    return `handlers.onBoot = async () => {\n${bodyStr}};\n`;
  };

  javascriptGenerator.forBlock['sat_event_loop_tick'] = function (block, generator) {
    const sec = Number(block.getFieldValue('SEC') || 2);
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '';
    const bodyStr = typeof body === 'string' ? body : body[0];
    return `handlers.ticks.push({ intervalSec: ${sec}, fn: async () => {\n${bodyStr}} });\n`;
  };

  javascriptGenerator.forBlock['sat_event_telecommand'] = function (block, generator) {
    const cmd = block.getFieldValue('CMD') || 'PING';
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '';
    const bodyStr = typeof body === 'string' ? body : body[0];
    return `handlers.commands['${cmd}'] = async () => {\n${bodyStr}};\n`;
  };

  javascriptGenerator.forBlock['sat_wait_seconds'] = function (block, generator) {
    const sec = generator.valueToCode(block, 'SEC', JsOrder.NONE) || '1';
    return `await sim.wait(${sec});\n`;
  };

  javascriptGenerator.forBlock['obc_set_mode'] = function (block) {
    return `sim.setMode('${block.getFieldValue('MODE')}');\n`;
  };

  javascriptGenerator.forBlock['obc_log_telemetry'] = function (block, generator) {
    const tag = block.getFieldValue('TAG') || 'TLM';
    const val = generator.valueToCode(block, 'VAL', JsOrder.NONE) || '0';
    return `sim.logTelemetry('${tag}', ${val});\n`;
  };

  javascriptGenerator.forBlock['obc_reset_watchdog'] = function () {
    return `sim.resetWatchdog();\n`;
  };

  javascriptGenerator.forBlock['obc_get_mode'] = function () {
    return [`sim.getMode()`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['obc_set_status_led'] = function (block, generator) {
    const r = generator.valueToCode(block, 'R', JsOrder.NONE) || '0';
    const g = generator.valueToCode(block, 'G', JsOrder.NONE) || '180';
    const b = generator.valueToCode(block, 'B', JsOrder.NONE) || '255';
    return `sim.setLed(${r}, ${g}, ${b});\n`;
  };

  javascriptGenerator.forBlock['obc_play_buzzer'] = function (block, generator) {
    const freq = generator.valueToCode(block, 'FREQ', JsOrder.NONE) || '880';
    const ms = generator.valueToCode(block, 'MS', JsOrder.NONE) || '150';
    return `sim.playBuzzer(${freq}, ${ms});\n`;
  };

  javascriptGenerator.forBlock['obc_display_oled'] = function (block, generator) {
    const label = String(block.getFieldValue('LABEL') || 'MODE').replace(/'/g, "\\'");
    const val = generator.valueToCode(block, 'VAL', JsOrder.NONE) || "''";
    return `sim.displayOled('${label}', ${val});\n`;
  };

  javascriptGenerator.forBlock['eps_read_battery_pct'] = function () {
    return [`sim.batteryPct()`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['eps_read_battery_volt'] = function () {
    return [`sim.batteryVolt()`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['eps_read_solar_ma'] = function (block) {
    return [`sim.solarCurrent('${block.getFieldValue('PANEL')}')`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['eps_set_rail'] = function (block) {
    const rail = block.getFieldValue('RAIL');
    const on = block.getFieldValue('STATE') === 'ON';
    return `sim.setRail('${rail}', ${on});\n`;
  };

  javascriptGenerator.forBlock['eps_set_heater'] = function (block) {
    const on = block.getFieldValue('STATE') === 'ON';
    return `sim.setHeater(${on});\n`;
  };

  javascriptGenerator.forBlock['adcs_read_gyro'] = function (block) {
    return [`sim.gyro('${block.getFieldValue('AXIS')}')`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['adcs_read_angle'] = function (block) {
    return [`sim.angle('${block.getFieldValue('AXIS')}')`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['adcs_calibrate_gyro'] = function () {
    return `sim.calibrateGyro();\n`;
  };

  javascriptGenerator.forBlock['adcs_pid_stabilize'] = function (block, generator) {
    const axis = block.getFieldValue('AXIS');
    const target = generator.valueToCode(block, 'TARGET', JsOrder.NONE) || '0';
    const kp = generator.valueToCode(block, 'KP', JsOrder.NONE) || '2.5';
    const kd = generator.valueToCode(block, 'KD', JsOrder.NONE) || '0.6';
    return `sim.pidStabilize('${axis}', ${target}, ${kp}, ${kd});\n`;
  };

  javascriptGenerator.forBlock['adcs_read_sun_sensor'] = function () {
    return [`sim.sunFlux()`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['adcs_set_magnetorquer'] = function (block, generator) {
    const axis = block.getFieldValue('AXIS');
    const pct = generator.valueToCode(block, 'PCT', JsOrder.NONE) || '0';
    return `sim.setMagnetorquer('${axis}', ${pct});\n`;
  };

  javascriptGenerator.forBlock['adcs_run_bdot'] = function () {
    return `sim.runBdot();\n`;
  };

  javascriptGenerator.forBlock['comms_send_beacon'] = function (block, generator) {
    const freq = block.getFieldValue('FREQ');
    const msg = generator.valueToCode(block, 'MSG', JsOrder.NONE) || `'SCHOOL76'`;
    return `sim.sendBeacon('${freq}', ${msg});\n`;
  };

  javascriptGenerator.forBlock['comms_send_telemetry'] = function () {
    return `sim.sendTelemetry();\n`;
  };

  javascriptGenerator.forBlock['comms_send_makeblock_frame'] = function () {
    return `sim.sendMakeblockFrame();\n`;
  };

  javascriptGenerator.forBlock['uplink_broadcast_msg'] = function (block) {
    const msg = String(block.getFieldValue('MSG') || 'telemetry_ok').replace(/'/g, "\\'");
    return `sim.sendBroadcast('${msg}');\n`;
  };

  javascriptGenerator.forBlock['uplink_broadcast_msg_val'] = function (block, generator) {
    const msg = String(block.getFieldValue('MSG') || 'vbat').replace(/'/g, "\\'");
    const val = generator.valueToCode(block, 'VAL', JsOrder.NONE) || "''";
    return `sim.sendBroadcast('${msg}', ${val});\n`;
  };

  javascriptGenerator.forBlock['uplink_on_broadcast'] = function (block, generator) {
    const msg = String(block.getFieldValue('MSG') || 'capture').replace(/'/g, "\\'");
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '';
    const bodyStr = typeof body === 'string' ? body : body[0];
    return `handlers.broadcasts['${msg}'] = async () => {\n${bodyStr}};\n`;
  };

  javascriptGenerator.forBlock['uplink_broadcast_value'] = function () {
    return [`sim.getBroadcastValue()`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['comms_set_tx_power'] = function (block) {
    return `sim.setTxPower(${block.getFieldValue('DBM')});\n`;
  };

  javascriptGenerator.forBlock['payload_capture_image'] = function (block) {
    return `sim.captureImage('${block.getFieldValue('RES')}');\n`;
  };

  javascriptGenerator.forBlock['payload_read_radiation'] = function () {
    return [`sim.readRadiation()`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['payload_read_temp'] = function (block) {
    return [`sim.readTemp('${block.getFieldValue('ZONE')}')`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['azel_point_antenna'] = function (block, generator) {
    const az = generator.valueToCode(block, 'AZ', JsOrder.NONE) || '180';
    const el = generator.valueToCode(block, 'EL', JsOrder.NONE) || '45';
    return `sim.pointAntenna(${az}, ${el});\n`;
  };

  javascriptGenerator.forBlock['azel_track_pass'] = function (block) {
    const norad = String(block.getFieldValue('NORAD') || 'SCHOOL76-1U').replace(/'/g, "\\'");
    return `sim.trackPass('${norad}');\n`;
  };

  javascriptGenerator.forBlock['azel_park_home'] = function () {
    return `sim.parkAntenna();\n`;
  };

  javascriptGenerator.forBlock['azel_get_elevation'] = function () {
    return [`sim.getElevation()`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['orbit_is_eclipse'] = function () {
    return [`sim.isEclipse()`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['orbit_next_pass_min'] = function () {
    return [`sim.nextPassMin()`, JsOrder.FUNCTION_CALL];
  };

  javascriptGenerator.forBlock['orbit_doppler_khz'] = function () {
    return [`sim.dopplerShiftKhz()`, JsOrder.FUNCTION_CALL];
  };

  const jsOriginalScrub = javascriptGenerator.scrub_;
  javascriptGenerator.scrub_ = function (block, code, thisOnly) {
    if (
      block.type === 'sat_event_boot' ||
      block.type === 'sat_event_loop_tick' ||
      block.type === 'sat_event_telecommand' ||
      block.type === 'uplink_on_broadcast'
    ) {
      return code;
    }
    return jsOriginalScrub.call(this, block, code, thisOnly);
  };

  // ==========================
  // 4. CODEY ROCKY / CYBERPI MICROPYTHON GENERATOR
  // ==========================
  Object.assign(codeyGenerator.forBlock, pythonGenerator.forBlock);

  codeyGenerator.forBlock['sat_event_boot'] = function (block, generator) {
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '    pass\n';
    const indented = generator.prefixLines(typeof body === 'string' ? body : body[0], '    ');
    return `@event.start\ndef on_start():\n    codey.display.show('S76')\n${indented || '    pass\n'}\n`;
  };

  codeyGenerator.forBlock['sat_event_loop_tick'] = function (block, generator) {
    const sec = block.getFieldValue('SEC') || 2;
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '    pass\n';
    const indented = generator.prefixLines(typeof body === 'string' ? body : body[0], '    ');
    return `def telemetry_cycle():\n    while True:\n${generator.prefixLines(indented || '    pass\n', '    ')}        time.sleep(${sec})\n\n`;
  };

  codeyGenerator.forBlock['sat_event_telecommand'] = function (block, generator) {
    const cmd = block.getFieldValue('CMD') || 'PING';
    const btnMap: Record<string, string> = {
      PING: 'button_a_pressed',
      CAPTURE: 'button_b_pressed',
      SAFE: 'button_c_pressed',
      NOMINAL: 'shaked',
      DETUMBLE: 'tilted_left',
    };
    const dec = btnMap[cmd] || 'button_a_pressed';
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '    pass\n';
    const indented = generator.prefixLines(typeof body === 'string' ? body : body[0], '    ');
    return `@event.${dec}\ndef on_cmd_${cmd}():\n${indented || '    pass\n'}\n`;
  };

  codeyGenerator.forBlock['obc_set_mode'] = function (block) {
    const mode = block.getFieldValue('MODE');
    return `obc.set_mode('${mode}')\ncodey.display.show('${mode.slice(0, 4)}')\n`;
  };

  codeyGenerator.forBlock['obc_set_status_led'] = function (block, generator) {
    const r = generator.valueToCode(block, 'R', PyOrder.NONE) || '0';
    const g = generator.valueToCode(block, 'G', PyOrder.NONE) || '180';
    const b = generator.valueToCode(block, 'B', PyOrder.NONE) || '255';
    return `codey.led.show(${r}, ${g}, ${b})\n`;
  };

  codeyGenerator.forBlock['obc_play_buzzer'] = function (block, generator) {
    const freq = generator.valueToCode(block, 'FREQ', PyOrder.NONE) || '880';
    const ms = generator.valueToCode(block, 'MS', PyOrder.NONE) || '150';
    return `codey.speaker.play_tone(${freq}, (${ms}) / 1000.0)\n`;
  };

  codeyGenerator.forBlock['obc_display_oled'] = function (block, generator) {
    const label = block.getFieldValue('LABEL') || 'MODE';
    const val = generator.valueToCode(block, 'VAL', PyOrder.NONE) || "''";
    return `cyberpi.console.println('${label}: ' + str(${val}))\n`;
  };

  codeyGenerator.forBlock['uplink_broadcast_msg'] = function (block) {
    const msg = block.getFieldValue('MSG') || 'telemetry_ok';
    return `cyberpi.broadcast.set('${msg}', '')\n`;
  };

  codeyGenerator.forBlock['uplink_broadcast_msg_val'] = function (block, generator) {
    const msg = block.getFieldValue('MSG') || 'vbat';
    const val = generator.valueToCode(block, 'VAL', PyOrder.NONE) || '0';
    return `cyberpi.broadcast.set('${msg}', str(${val}))\n`;
  };

  codeyGenerator.forBlock['uplink_on_broadcast'] = function (block, generator) {
    const msg = block.getFieldValue('MSG') || 'capture';
    const fnSafe = msg.replace(/[^a-zA-Z0-9_]/g, '_') || 'msg';
    const next = block.getNextBlock();
    const body = next ? generator.blockToCode(next) : '    pass\n';
    const indented = generator.prefixLines(typeof body === 'string' ? body : body[0], '    ');
    return `@event.received('${msg}')\ndef on_bc_${fnSafe}():\n${indented || '    pass\n'}\n`;
  };

  codeyGenerator.forBlock['uplink_broadcast_value'] = function () {
    return [`cyberpi.broadcast.get_message()`, PyOrder.FUNCTION_CALL];
  };

  codeyGenerator.forBlock['adcs_read_gyro'] = function (block) {
    const axis = block.getFieldValue('AXIS').toLowerCase();
    return [`codey.motion_sensor.get_gyro(${axis === 'x' ? "'x'" : axis === 'y' ? "'y'" : "'z'"})`, PyOrder.FUNCTION_CALL];
  };

  codeyGenerator.forBlock['adcs_read_angle'] = function (block) {
    const axis = block.getFieldValue('AXIS');
    const method = axis === 'Y' ? 'get_roll' : axis === 'Z' ? 'get_yaw' : 'get_pitch';
    return [`codey.motion_sensor.${method}()`, PyOrder.FUNCTION_CALL];
  };

  const codeyOrigScrub = codeyGenerator.scrub_;
  codeyGenerator.scrub_ = function (block, code, thisOnly) {
    if (
      block.type === 'sat_event_boot' ||
      block.type === 'sat_event_loop_tick' ||
      block.type === 'sat_event_telecommand' ||
      block.type === 'uplink_on_broadcast'
    ) {
      return code;
    }
    return codeyOrigScrub.call(this, block, code, thisOnly);
  };
}

export function generateCubeSatCode(
  workspace: Blockly.Workspace,
  boardProfile: MakeblockBoardProfileId = 'auriga_stm32'
) {
  registerCubeSatGenerators();

  const pyBody = pythonGenerator.workspaceToCode(workspace).trim();
  const pythonCode = [
    'from cubesat import obc, eps, adcs, comms, payload',
    'import time',
    '',
    pyBody || '# Перетащите блоки событий и подсистем кубсата в рабочую область',
  ].join('\n');

  const codeyBody = codeyGenerator.workspaceToCode(workspace).trim();
  const codeyCode = [
    'import codey, event, time',
    'from cubesat import obc, eps, adcs, comms, payload',
    '',
    codeyBody || '# Программа Codey Rocky / CyberPi (ESP32 MicroPython)',
  ].join('\n');

  const cppBody = cppGenerator.workspaceToCode(workspace).trim();
  const usesBroadcast = /\bbroadcaster\./.test(cppBody);
  const broadcastHeaderLines = usesBroadcast
    ? ['#include <OfflineBroadcast.h>', 'OfflineBroadcast broadcaster;']
    : [];
  const cppHeader =
    boardProfile === 'gizduino_avr'
      ? [
          '#include <MeOrion.h>',
          '#include <School76CubeSat.h>',
          ...broadcastHeaderLines,
          '// Неблокирующий аппаратный планировщик e-Gizmo RTC (10 мс)',
          'unsigned long RTC = 0;',
        ].join('\n')
      : [
          '#include <MeAuriga.h>',
          '#include <School76CubeSat.h>',
          ...broadcastHeaderLines,
        ].join('\n');

  const cppCode = [
    cppHeader,
    '',
    cppBody || '// Перетащите блоки событий и подсистем кубсата в рабочую область',
  ].join('\n');

  const jsCode = javascriptGenerator.workspaceToCode(workspace);

  return { pythonCode, codeyCode, cppCode, jsCode };
}
