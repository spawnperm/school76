import type { OnboardProgram } from '../types/cubesat.ts';

export const PRESET_PROGRAMS: OnboardProgram[] = [
  {
    id: 'prog-nominal-beacon',
    name: 'Номинальный цикл OBC и маяк AX.25',
    subsystem: 'OBC',
    targetBoard: 'CyberPi / ESP32 (MicroPython)',
    author: 'Артём Соколов',
    description:
      'Инициализация шины связи, проверка заряда АКБ и периодическая отправка телеметрического маяка 435.800 МГц.',
    updatedAt: '2026-11-24T08:15:00.000Z',
    pythonCode: `from cubesat import obc, eps, adcs, comms, payload
import time

def on_boot():
    obc.set_mode('NOMINAL')
    eps.set_rail('COMMS_3V3', True)
    obc.log_telemetry('BOOT_SEQ', 1)

def on_tick_2s():
    obc.reset_watchdog()
    if eps.battery_pct() < 25:
        obc.set_mode('SAFE')
        eps.set_rail('PAYLOAD_5V', False)
        eps.set_heater(True)
    else:
        obc.set_mode('NOMINAL')
        comms.send_telemetry()
        comms.send_beacon('435.800', 'SCHOOL76-1U OK')
`,
    cppCode: `#include <School76CubeSat.h>

void setup() {
  CubeSat.begin();
  obc.setMode(OBC_NOMINAL);
  eps.setRail(RAIL_COMMS_3V3, true);
  obc.logTelemetry("BOOT_SEQ", 1);
}

void onTelemetryTick() {
  obc.resetWatchdog();
  if (eps.batteryPct() < 25) {
    obc.setMode(OBC_SAFE);
    eps.setRail(RAIL_PAYLOAD_5V, false);
    eps.setHeater(true);
  } else {
    obc.setMode(OBC_NOMINAL);
    comms.sendTelemetry();
    comms.sendBeacon(435.800, "SCHOOL76-1U OK");
  }
}

void loop() {
  CubeSat.runEvery(2000, onTelemetryTick);
}
`,
    workspaceJson: {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'sat_event_boot',
            id: 'boot_main',
            x: 36,
            y: 32,
            next: {
              block: {
                type: 'obc_set_mode',
                id: 'set_nom',
                fields: { MODE: 'NOMINAL' },
                next: {
                  block: {
                    type: 'eps_set_rail',
                    id: 'rail_comms',
                    fields: { RAIL: 'COMMS_3V3', STATE: 'ON' },
                    next: {
                      block: {
                        type: 'obc_log_telemetry',
                        id: 'log_boot',
                        fields: { TAG: 'BOOT_SEQ' },
                        inputs: {
                          VAL: {
                            shadow: {
                              type: 'math_number',
                              id: 'num_boot',
                              fields: { NUM: 1 },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          {
            type: 'sat_event_loop_tick',
            id: 'tick_main',
            x: 36,
            y: 260,
            fields: { SEC: 2 },
            next: {
              block: {
                type: 'obc_reset_watchdog',
                id: 'wdt_1',
                next: {
                  block: {
                    type: 'controls_if',
                    id: 'if_low_bat',
                    extraState: { hasElse: true },
                    inputs: {
                      IF0: {
                        block: {
                          type: 'logic_compare',
                          id: 'cmp_bat',
                          fields: { OP: 'LT' },
                          inputs: {
                            A: {
                              block: { type: 'eps_read_battery_pct', id: 'bat_pct' },
                            },
                            B: {
                              shadow: {
                                type: 'math_number',
                                id: 'bat_thresh',
                                fields: { NUM: 25 },
                              },
                            },
                          },
                        },
                      },
                      DO0: {
                        block: {
                          type: 'obc_set_mode',
                          id: 'set_safe',
                          fields: { MODE: 'SAFE' },
                          next: {
                            block: {
                              type: 'eps_set_rail',
                              id: 'off_pay',
                              fields: { RAIL: 'PAYLOAD_5V', STATE: 'OFF' },
                              next: {
                                block: {
                                  type: 'eps_set_heater',
                                  id: 'heat_on',
                                  fields: { STATE: 'ON' },
                                },
                              },
                            },
                          },
                        },
                      },
                      ELSE: {
                        block: {
                          type: 'obc_set_mode',
                          id: 'set_nom_2',
                          fields: { MODE: 'NOMINAL' },
                          next: {
                            block: {
                              type: 'comms_send_telemetry',
                              id: 'tx_tlm',
                              next: {
                                block: {
                                  type: 'comms_send_beacon',
                                  id: 'tx_bcn',
                                  fields: { FREQ: '435.800' },
                                  inputs: {
                                    MSG: {
                                      shadow: {
                                        type: 'text',
                                        id: 'bcn_txt',
                                        fields: { TEXT: 'SCHOOL76-1U OK' },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
  {
    id: 'prog-adcs-bdot',
    name: 'Стабилизация B-dot (ADCS)',
    subsystem: 'ADCS',
    targetBoard: 'STM32F4 OBC (Arduino C++)',
    author: 'Мария Волкова',
    description:
      'Сброс углового вращения после отделения от ракеты-носителя с помощью магнитных катушек по алгоритму B-dot.',
    updatedAt: '2026-11-24T07:50:00.000Z',
    pythonCode: `from cubesat import obc, eps, adcs

def on_boot():
    obc.set_mode('DETUMBLE')
    eps.set_rail('ADCS_5V', True)

def on_tick_1s():
    if abs(adcs.gyro('X')) > 2.0:
        adcs.run_bdot()
        obc.log_telemetry('GYRO_X', adcs.gyro('X'))
    else:
        adcs.set_magnetorquer('X', 0)
        obc.set_mode('NOMINAL')
`,
    cppCode: `#include <School76CubeSat.h>

void setup() {
  CubeSat.begin();
  obc.setMode(OBC_DETUMBLE);
  eps.setRail(RAIL_ADCS_5V, true);
}

void onTelemetryTick() {
  if (adcs.gyro('X') > 2) {
    adcs.runBdot();
    obc.logTelemetry("GYRO_X", adcs.gyro('X'));
  } else {
    adcs.setMagnetorquer('X', 0);
    obc.setMode(OBC_NOMINAL);
  }
}

void loop() {
  CubeSat.runEvery(1000, onTelemetryTick);
}
`,
    workspaceJson: {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'sat_event_boot',
            id: 'adcs_boot',
            x: 36,
            y: 32,
            next: {
              block: {
                type: 'obc_set_mode',
                id: 'adcs_mode',
                fields: { MODE: 'DETUMBLE' },
                next: {
                  block: {
                    type: 'eps_set_rail',
                    id: 'adcs_rail',
                    fields: { RAIL: 'ADCS_5V', STATE: 'ON' },
                  },
                },
              },
            },
          },
          {
            type: 'sat_event_loop_tick',
            id: 'adcs_tick',
            x: 36,
            y: 220,
            fields: { SEC: 1 },
            next: {
              block: {
                type: 'controls_if',
                id: 'if_gyro',
                extraState: { hasElse: true },
                inputs: {
                  IF0: {
                    block: {
                      type: 'logic_compare',
                      id: 'cmp_gyro',
                      fields: { OP: 'GT' },
                      inputs: {
                        A: {
                          block: {
                            type: 'adcs_read_gyro',
                            id: 'gyro_x',
                            fields: { AXIS: 'X' },
                          },
                        },
                        B: {
                          shadow: {
                            type: 'math_number',
                            id: 'gyro_lim',
                            fields: { NUM: 2 },
                          },
                        },
                      },
                    },
                  },
                  DO0: {
                    block: {
                      type: 'adcs_run_bdot',
                      id: 'bdot_step',
                      next: {
                        block: {
                          type: 'obc_log_telemetry',
                          id: 'log_gyro',
                          fields: { TAG: 'GYRO_X' },
                          inputs: {
                            VAL: {
                              block: {
                                type: 'adcs_read_gyro',
                                id: 'gyro_x_2',
                                fields: { AXIS: 'X' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  ELSE: {
                    block: {
                      type: 'adcs_set_magnetorquer',
                      id: 'mtq_zero',
                      fields: { AXIS: 'X' },
                      inputs: {
                        PCT: {
                          shadow: {
                            type: 'math_number',
                            id: 'mtq_0',
                            fields: { NUM: 0 },
                          },
                        },
                      },
                      next: {
                        block: {
                          type: 'obc_set_mode',
                          id: 'mode_nom_adcs',
                          fields: { MODE: 'NOMINAL' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
  {
    id: 'prog-payload-science',
    name: 'Научная съёмка Земли и дозиметрия',
    subsystem: 'PAYLOAD',
    targetBoard: 'CyberPi / ESP32 (MicroPython)',
    author: 'Дмитрий Лебедев',
    description:
      'Обработчик наземной команды CAPTURE: проверка энергобаланса, включение камеры 1280x720 и замер радиационного фона.',
    updatedAt: '2026-11-24T06:40:00.000Z',
    pythonCode: `from cubesat import obc, eps, comms, payload

def on_command_CAPTURE():
    if eps.battery_pct() > 45:
        obc.set_mode('SCIENCE')
        eps.set_rail('PAYLOAD_5V', True)
        payload.capture_image('1280x720')
        obc.log_telemetry('RAD_USV', payload.read_radiation())
        comms.send_telemetry()
        eps.set_rail('PAYLOAD_5V', False)
        obc.set_mode('NOMINAL')
    else:
        comms.send_beacon('435.800', 'LOW_BAT_SKIP')
`,
    cppCode: `#include <School76CubeSat.h>

void onCommand_CAPTURE() {
  if (eps.batteryPct() > 45) {
    obc.setMode(OBC_SCIENCE);
    eps.setRail(RAIL_PAYLOAD_5V, true);
    payload.captureImage("1280x720");
    obc.logTelemetry("RAD_USV", payload.readRadiation());
    comms.sendTelemetry();
    eps.setRail(RAIL_PAYLOAD_5V, false);
    obc.setMode(OBC_NOMINAL);
  } else {
    comms.sendBeacon(435.800, "LOW_BAT_SKIP");
  }
}
`,
    workspaceJson: {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'sat_event_telecommand',
            id: 'cmd_cap',
            x: 36,
            y: 32,
            fields: { CMD: 'CAPTURE' },
            next: {
              block: {
                type: 'controls_if',
                id: 'if_sci_bat',
                extraState: { hasElse: true },
                inputs: {
                  IF0: {
                    block: {
                      type: 'logic_compare',
                      id: 'cmp_sci_bat',
                      fields: { OP: 'GT' },
                      inputs: {
                        A: {
                          block: { type: 'eps_read_battery_pct', id: 'sci_bat' },
                        },
                        B: {
                          shadow: {
                            type: 'math_number',
                            id: 'sci_lim',
                            fields: { NUM: 45 },
                          },
                        },
                      },
                    },
                  },
                  DO0: {
                    block: {
                      type: 'obc_set_mode',
                      id: 'sci_mode',
                      fields: { MODE: 'SCIENCE' },
                      next: {
                        block: {
                          type: 'eps_set_rail',
                          id: 'sci_rail_on',
                          fields: { RAIL: 'PAYLOAD_5V', STATE: 'ON' },
                          next: {
                            block: {
                              type: 'payload_capture_image',
                              id: 'cap_img',
                              fields: { RES: '1280x720' },
                              next: {
                                block: {
                                  type: 'obc_log_telemetry',
                                  id: 'log_rad',
                                  fields: { TAG: 'RAD_USV' },
                                  inputs: {
                                    VAL: {
                                      block: {
                                        type: 'payload_read_radiation',
                                        id: 'rad_val',
                                      },
                                    },
                                  },
                                  next: {
                                    block: {
                                      type: 'comms_send_telemetry',
                                      id: 'sci_tlm',
                                      next: {
                                        block: {
                                          type: 'eps_set_rail',
                                          id: 'sci_rail_off',
                                          fields: { RAIL: 'PAYLOAD_5V', STATE: 'OFF' },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  ELSE: {
                    block: {
                      type: 'comms_send_beacon',
                      id: 'sci_skip',
                      fields: { FREQ: '435.800' },
                      inputs: {
                        MSG: {
                          shadow: {
                            type: 'text',
                            id: 'sci_msg',
                            fields: { TEXT: 'LOW_BAT_SKIP' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
  {
    id: 'prog-codey-imu-pid',
    name: 'MeGyro Калибровка, ПИД и кадр 0xFF55',
    subsystem: 'ADCS',
    targetBoard: 'CyberPi / ESP32 (MicroPython)',
    author: 'Артём Соколов',
    description:
      'Калибровка IMU MeGyro при старте (500 отсчётов), ПИД-стабилизация оси Pitch с RGB LED индикацией и передача бинарного кадра Makeblock 0xFF 0x55.',
    updatedAt: '2026-11-24T10:30:00.000Z',
    pythonCode: `from cubesat import obc, eps, adcs, comms
import time

def on_boot():
    obc.set_mode('NOMINAL')
    eps.set_rail('ADCS_5V', True)
    adcs.calibrate_gyro()
    obc.set_led(0, 180, 255)
    obc.beep(880, 120)

def on_tick_1s():
    obc.reset_watchdog()
    adcs.stabilize_pid('X', 0, kp=2.5, kd=0.6)
    comms.send_makeblock_frame()
`,
    cppCode: `#include <MeAuriga.h>
#include <School76CubeSat.h>

void setup() {
  CubeSat.begin();
  obc.setMode(OBC_NOMINAL);
  eps.setRail(RAIL_ADCS_5V, true);
  adcs.calibrateGyro();
  obc.setLed(0, 180, 255);
  obc.beep(880, 120);
}

void onTelemetryTick() {
  obc.resetWatchdog();
  adcs.stabilizePid('X', 0, 2.5, 0.6);
  comms.sendMakeblockFrame(eps.batteryVoltage());
}

void loop() {
  CubeSat.runEvery(1000, onTelemetryTick);
}
`,
    workspaceJson: {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'sat_event_boot',
            id: 'mb_boot',
            x: 36,
            y: 32,
            next: {
              block: {
                type: 'obc_set_mode',
                id: 'mb_mode',
                fields: { MODE: 'NOMINAL' },
                next: {
                  block: {
                    type: 'eps_set_rail',
                    id: 'mb_rail',
                    fields: { RAIL: 'ADCS_5V', STATE: 'ON' },
                    next: {
                      block: {
                        type: 'adcs_calibrate_gyro',
                        id: 'mb_cal',
                        next: {
                          block: {
                            type: 'obc_set_status_led',
                            id: 'mb_led',
                            inputs: {
                              R: { shadow: { type: 'math_number', id: 'led_r', fields: { NUM: 0 } } },
                              G: { shadow: { type: 'math_number', id: 'led_g', fields: { NUM: 180 } } },
                              B: { shadow: { type: 'math_number', id: 'led_b', fields: { NUM: 255 } } },
                            },
                            next: {
                              block: {
                                type: 'obc_play_buzzer',
                                id: 'mb_buz',
                                inputs: {
                                  FREQ: { shadow: { type: 'math_number', id: 'buz_f', fields: { NUM: 880 } } },
                                  MS: { shadow: { type: 'math_number', id: 'buz_m', fields: { NUM: 120 } } },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          {
            type: 'sat_event_loop_tick',
            id: 'mb_tick',
            x: 36,
            y: 310,
            fields: { SEC: 1 },
            next: {
              block: {
                type: 'obc_reset_watchdog',
                id: 'mb_wdt',
                next: {
                  block: {
                    type: 'adcs_pid_stabilize',
                    id: 'mb_pid',
                    fields: { AXIS: 'X' },
                    inputs: {
                      TARGET: { shadow: { type: 'math_number', id: 'pid_t', fields: { NUM: 0 } } },
                      KP: { shadow: { type: 'math_number', id: 'pid_p', fields: { NUM: 2.5 } } },
                      KD: { shadow: { type: 'math_number', id: 'pid_d', fields: { NUM: 0.6 } } },
                    },
                    next: {
                      block: {
                        type: 'comms_send_makeblock_frame',
                        id: 'mb_frm',
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
  {
    id: 'prog-mblock5-broadcast',
    name: 'CyberPi OLED и Broadcast 0x46 (Stage ↔ OBC)',
    subsystem: 'COMMS',
    targetBoard: 'CyberPi / ESP32 (MicroPython)',
    author: 'Артём Соколов',
    description:
      'Вывод телеметрии на экран CyberPi/OLED и двусторонний обмен со сценой mBlock 5 по протоколу Upload Mode Broadcast (0x46).',
    updatedAt: '2026-11-24T11:45:00.000Z',
    pythonCode: `from cubesat import obc, eps, adcs, comms, payload

def on_boot():
    obc.set_mode('NOMINAL')
    eps.set_rail('COMMS_3V3', True)
    obc.display_oled('V_BAT', eps.battery_volt())
    comms.broadcast('stage_ready', eps.battery_pct())

def on_broadcast_capture_stage():
    eps.set_rail('PAYLOAD_5V', True)
    payload.capture_image(comms.broadcast_value or '1280x720')
    obc.display_oled('CAM_RES', comms.broadcast_value or '1280x720')
    comms.broadcast('capture_ok', 'OK')
`,
    cppCode: `#include <School76CubeSat.h>
#include <OfflineBroadcast.h>
OfflineBroadcast broadcaster;

void onBroadcast_capture_stage() {
  eps.setRail(RAIL_PAYLOAD_5V, true);
  payload.captureImage(broadcaster.broadcastValue.c_str());
  obc.logTelemetry("CAM_RES", 1);
  broadcaster.broadcast("capture_ok", "OK");
}

void setup() {
  CubeSat.begin();
  obc.setMode(OBC_NOMINAL);
  eps.setRail(RAIL_COMMS_3V3, true);
  broadcaster.on("capture_stage", onBroadcast_capture_stage);
  broadcaster.broadcast("stage_ready", String(eps.batteryPct()));
}

void loop() {
  broadcaster.loop();
}
`,
    workspaceJson: {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'sat_event_boot',
            id: 'bc_boot',
            x: 36,
            y: 32,
            next: {
              block: {
                type: 'obc_set_mode',
                id: 'bc_mode',
                fields: { MODE: 'NOMINAL' },
                next: {
                  block: {
                    type: 'eps_set_rail',
                    id: 'bc_rail',
                    fields: { RAIL: 'COMMS_3V3', STATE: 'ON' },
                    next: {
                      block: {
                        type: 'obc_display_oled',
                        id: 'bc_oled',
                        fields: { LABEL: 'V_BAT' },
                        inputs: {
                          VAL: {
                            block: { type: 'eps_read_battery_volt', id: 'bc_volt' },
                          },
                        },
                        next: {
                          block: {
                            type: 'uplink_broadcast_msg_val',
                            id: 'bc_tx_boot',
                            inputs: {
                              MSG: {
                                shadow: {
                                  type: 'text',
                                  id: 'bc_tx_msg',
                                  fields: { TEXT: 'stage_ready' },
                                },
                              },
                              VAL: {
                                block: { type: 'eps_read_battery_pct', id: 'bc_pct' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          {
            type: 'uplink_on_broadcast',
            id: 'bc_rx_hat',
            x: 36,
            y: 310,
            fields: { MSG: 'capture_stage' },
            next: {
              block: {
                type: 'eps_set_rail',
                id: 'bc_pay_on',
                fields: { RAIL: 'PAYLOAD_5V', STATE: 'ON' },
                next: {
                  block: {
                    type: 'payload_capture_image',
                    id: 'bc_cap',
                    fields: { RES: '1280x720' },
                    next: {
                      block: {
                        type: 'obc_display_oled',
                        id: 'bc_oled_rx',
                        fields: { LABEL: 'CAM_RES' },
                        inputs: {
                          VAL: {
                            block: { type: 'uplink_broadcast_value', id: 'bc_val_rep' },
                          },
                        },
                        next: {
                          block: {
                            type: 'uplink_broadcast_msg_val',
                            id: 'bc_ack',
                            inputs: {
                              MSG: {
                                shadow: {
                                  type: 'text',
                                  id: 'bc_ack_msg',
                                  fields: { TEXT: 'capture_ok' },
                                },
                              },
                              VAL: {
                                shadow: {
                                  type: 'text',
                                  id: 'bc_ack_val',
                                  fields: { TEXT: 'OK' },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
];

