import * as Blockly from 'blockly';

let registered = false;

export function registerCubeSatBlocks() {
  if (registered) return;
  registered = true;

  // 1. Events (mBlock Amber #FFAB19)
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'sat_event_boot',
      message0: 'когда бортовой компьютер OBC запущен',
      nextStatement: null,
      colour: '#FFAB19',
      tooltip: 'Выполняется один раз при подаче питания на бортовой компьютер кубсата',
    },
    {
      type: 'sat_event_loop_tick',
      message0: 'каждые %1 сек цикла телеметрии',
      args0: [
        {
          type: 'field_number',
          name: 'SEC',
          value: 2,
          min: 1,
          max: 60,
        },
      ],
      nextStatement: null,
      colour: '#FFAB19',
      tooltip: 'Периодический тик планировщика задач OBC',
    },
    {
      type: 'sat_event_telecommand',
      message0: 'при получении радиокоманды %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'CMD',
          options: [
            ['PING', 'PING'],
            ['CAPTURE', 'CAPTURE'],
            ['SAFE', 'SAFE'],
            ['NOMINAL', 'NOMINAL'],
            ['DETUMBLE', 'DETUMBLE'],
          ],
        },
      ],
      nextStatement: null,
      colour: '#FFAB19',
      tooltip: 'Срабатывает при приёме подтверждённой команды с наземной станции school76',
    },
    {
      type: 'sat_wait_seconds',
      message0: 'ждать %1 сек',
      args0: [
        {
          type: 'input_value',
          name: 'SEC',
          check: 'Number',
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#FFAB19',
      tooltip: 'Неблокирующая пауза выполнения в планировщике OBC',
    },

    // 2. OBC · Бортовой компьютер (Blue #4C97FF)
    {
      type: 'obc_set_mode',
      message0: 'режим OBC %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'MODE',
          options: [
            ['NOMINAL', 'NOMINAL'],
            ['SAFE', 'SAFE'],
            ['SCIENCE', 'SCIENCE'],
            ['DETUMBLE', 'DETUMBLE'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#4C97FF',
      tooltip: 'Переключает конечный автомат режимов полёта кубсата',
    },
    {
      type: 'obc_log_telemetry',
      message0: 'записать в журнал тег %1 значение %2',
      args0: [
        {
          type: 'field_input',
          name: 'TAG',
          text: 'TLM',
        },
        {
          type: 'input_value',
          name: 'VAL',
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#4C97FF',
      tooltip: 'Сохраняет запись в кольцевой буфер телеметрии FRAM',
    },
    {
      type: 'obc_reset_watchdog',
      message0: 'сбросить сторожевой таймер (WDT)',
      previousStatement: null,
      nextStatement: null,
      colour: '#4C97FF',
      tooltip: 'Подтверждает штатную работу прошивки для аппаратного watchdog',
    },
    {
      type: 'obc_get_mode',
      message0: 'текущий режим OBC',
      output: 'String',
      colour: '#4C97FF',
      tooltip: 'Возвращает строковое имя активного режима кубсата',
    },

    // 3. EPS · Система энергопитания (Orange #FF8C1A)
    {
      type: 'eps_read_battery_pct',
      message0: 'заряд АКБ (%)',
      output: 'Number',
      colour: '#FF8C1A',
      tooltip: 'Уровень заряда Li-Ion аккумуляторной сборки в процентах (0–100)',
    },
    {
      type: 'eps_read_battery_volt',
      message0: 'напряжение шины (В)',
      output: 'Number',
      colour: '#FF8C1A',
      tooltip: 'Напряжение основной шины питания EPS (В)',
    },
    {
      type: 'eps_read_solar_ma',
      message0: 'ток СБ %1 (мА)',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PANEL',
          options: [
            ['X+', 'X+'],
            ['X-', 'X-'],
            ['Y+', 'Y+'],
            ['Y-', 'Y-'],
            ['Z+', 'Z+'],
          ],
        },
      ],
      output: 'Number',
      colour: '#FF8C1A',
      tooltip: 'Ток генерации фотоэлектрической панели на выбранной грани 1U',
    },
    {
      type: 'eps_set_rail',
      message0: 'шина %1 питание %2',
      args0: [
        {
          type: 'field_dropdown',
          name: 'RAIL',
          options: [
            ['COMMS_3V3', 'COMMS_3V3'],
            ['ADCS_5V', 'ADCS_5V'],
            ['PAYLOAD_5V', 'PAYLOAD_5V'],
          ],
        },
        {
          type: 'field_dropdown',
          name: 'STATE',
          options: [
            ['ВКЛ', 'ON'],
            ['ВЫКЛ', 'OFF'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#FF8C1A',
      tooltip: 'Коммутирует силовой ключ подсистемы на плате EPS',
    },
    {
      type: 'eps_set_heater',
      message0: 'обогрев АКБ %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'STATE',
          options: [
            ['ВКЛ', 'ON'],
            ['ВЫКЛ', 'OFF'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#FF8C1A',
      tooltip: 'Включает термостатированный подогрев аккумулятора в тени Земли',
    },

    // 4. ADCS · Ориентация и стабилизация (Violet #9966FF)
    {
      type: 'adcs_read_gyro',
      message0: 'гироскоп ось %1 (°/с)',
      args0: [
        {
          type: 'field_dropdown',
          name: 'AXIS',
          options: [
            ['X', 'X'],
            ['Y', 'Y'],
            ['Z', 'Z'],
          ],
        },
      ],
      output: 'Number',
      colour: '#9966FF',
      tooltip: 'Угловая скорость вращения спутника по выбранной оси IMU',
    },
    {
      type: 'adcs_read_sun_sensor',
      message0: 'освещённость датчиком Солнца (%)',
      output: 'Number',
      colour: '#9966FF',
      tooltip: 'Интенсивность солнечного потока (0% в земной тени)',
    },
    {
      type: 'adcs_set_magnetorquer',
      message0: 'катушка %1 тяга %2 %',
      args0: [
        {
          type: 'field_dropdown',
          name: 'AXIS',
          options: [
            ['X', 'X'],
            ['Y', 'Y'],
            ['Z', 'Z'],
          ],
        },
        {
          type: 'input_value',
          name: 'PCT',
          check: 'Number',
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#9966FF',
      tooltip: 'Задаёт ШИМ-заполнение (-100..100%) магнитной катушки ADCS',
    },
    {
      type: 'adcs_run_bdot',
      message0: 'выполнить шаг B-dot демпфирования',
      previousStatement: null,
      nextStatement: null,
      colour: '#9966FF',
      tooltip: 'Вычисляет и подаёт токи на катушки для гашения угловой скорости',
    },

    // 5. COMMS · Радиосвязь (Teal #0FBD8C)
    {
      type: 'comms_send_beacon',
      message0: 'передать маяк AX.25 %1 МГц текст %2',
      args0: [
        {
          type: 'field_dropdown',
          name: 'FREQ',
          options: [
            ['435.800', '435.800'],
            ['436.250', '436.250'],
          ],
        },
        {
          type: 'input_value',
          name: 'MSG',
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#0FBD8C',
      tooltip: 'Формирует пакет AX.25 UI-frame и передаёт через UHF-трансивер',
    },
    {
      type: 'comms_send_telemetry',
      message0: 'отправить пакет телеметрии на Землю',
      previousStatement: null,
      nextStatement: null,
      colour: '#0FBD8C',
      tooltip: 'Передаёт бинарный кадр состояния EPS, OBC, ADCS и Payload',
    },
    {
      type: 'comms_set_tx_power',
      message0: 'мощность передатчика %1 дБм',
      args0: [
        {
          type: 'field_dropdown',
          name: 'DBM',
          options: [
            ['10', '10'],
            ['20', '20'],
            ['27', '27'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#0FBD8C',
      tooltip: 'Устанавливает выходную мощность UHF-усилителя',
    },

    // 6. PAYLOAD · Полезная нагрузка (Rose #FF6680)
    {
      type: 'payload_capture_image',
      message0: 'сделать снимок камеры %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'RES',
          options: [
            ['640x480', '640x480'],
            ['1280x720', '1280x720'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#FF6680',
      tooltip: 'Захватывает кадр с бортовой камеры ДЗЗ в память SD-карты',
    },
    {
      type: 'payload_read_radiation',
      message0: 'дозиметр радиации (мкЗв/ч)',
      output: 'Number',
      colour: '#FF6680',
      tooltip: 'Текущая мощность дозы ионизирующего излучения на орбите',
    },
    {
      type: 'payload_read_temp',
      message0: 'температура отсека %1 (°C)',
      args0: [
        {
          type: 'field_dropdown',
          name: 'ZONE',
          options: [
            ['OBC', 'OBC'],
            ['АКБ', 'BAT'],
            ['Камера', 'CAM'],
          ],
        },
      ],
      output: 'Number',
      colour: '#FF6680',
      tooltip: 'Считывает показания цифрового датчика TMP117 в выбранном отсеке',
    },
  ]);
}

export const CUBESAT_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'События',
      colour: '#FFAB19',
      contents: [
        { kind: 'block', type: 'sat_event_boot' },
        { kind: 'block', type: 'sat_event_loop_tick' },
        { kind: 'block', type: 'sat_event_telecommand' },
        {
          kind: 'block',
          type: 'sat_wait_seconds',
          inputs: {
            SEC: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
      ],
    },
    {
      kind: 'category',
      name: 'OBC · Процессор',
      colour: '#4C97FF',
      contents: [
        { kind: 'block', type: 'obc_set_mode' },
        {
          kind: 'block',
          type: 'obc_log_telemetry',
          inputs: {
            VAL: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
        { kind: 'block', type: 'obc_reset_watchdog' },
        { kind: 'block', type: 'obc_get_mode' },
      ],
    },
    {
      kind: 'category',
      name: 'EPS · Питание',
      colour: '#FF8C1A',
      contents: [
        { kind: 'block', type: 'eps_read_battery_pct' },
        { kind: 'block', type: 'eps_read_battery_volt' },
        { kind: 'block', type: 'eps_read_solar_ma' },
        { kind: 'block', type: 'eps_set_rail' },
        { kind: 'block', type: 'eps_set_heater' },
      ],
    },
    {
      kind: 'category',
      name: 'ADCS · Ориентация',
      colour: '#9966FF',
      contents: [
        { kind: 'block', type: 'adcs_read_gyro' },
        { kind: 'block', type: 'adcs_read_sun_sensor' },
        {
          kind: 'block',
          type: 'adcs_set_magnetorquer',
          inputs: {
            PCT: { shadow: { type: 'math_number', fields: { NUM: 40 } } },
          },
        },
        { kind: 'block', type: 'adcs_run_bdot' },
      ],
    },
    {
      kind: 'category',
      name: 'COMMS · Связь',
      colour: '#0FBD8C',
      contents: [
        {
          kind: 'block',
          type: 'comms_send_beacon',
          inputs: {
            MSG: { shadow: { type: 'text', fields: { TEXT: 'SCHOOL76-1U OK' } } },
          },
        },
        { kind: 'block', type: 'comms_send_telemetry' },
        { kind: 'block', type: 'comms_set_tx_power' },
      ],
    },
    {
      kind: 'category',
      name: 'Payload · Нагрузка',
      colour: '#FF6680',
      contents: [
        { kind: 'block', type: 'payload_capture_image' },
        { kind: 'block', type: 'payload_read_radiation' },
        { kind: 'block', type: 'payload_read_temp' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Управление',
      colour: '#FFAB19',
      contents: [
        { kind: 'block', type: 'controls_if' },
        {
          kind: 'block',
          type: 'controls_repeat_ext',
          inputs: {
            TIMES: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
          },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Логика и Математика',
      colour: '#59C059',
      contents: [
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
        { kind: 'block', type: 'text' },
      ],
    },
    {
      kind: 'category',
      name: 'Переменные',
      colour: '#FF8C1A',
      custom: 'VARIABLE',
    },
  ],
};
