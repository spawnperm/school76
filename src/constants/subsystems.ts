import type {
  ChatChannelId,
  CubeSatTask,
  OnboardProgram,
  Subsystem,
} from '../types/cubesat.ts';

export interface SubsystemMeta {
  id: Subsystem;
  shortTitle: string;
  ruName: string;
  fullName: string;
  role: string;
  hardware: string;
  bus: string;
  powerBudget: string;
  channel: ChatChannelId;
  defaultProgramId?: string;
  hex: string;
  barClass: string;
  badgeClass: string;
  borderHoverClass: string;
  schematicX: number;
  schematicY: number;
}

export const SUBSYSTEM_ORDER: Subsystem[] = [
  'OBC',
  'EPS',
  'ADCS',
  'COMMS',
  'PAYLOAD',
  'GROUND',
];

export const SUBSYSTEM_META: Record<Subsystem, SubsystemMeta> = {
  OBC: {
    id: 'OBC',
    shortTitle: 'Бортовой ПК',
    ruName: 'ОБС',
    fullName: 'Бортовой компьютер (OBC)',
    role: 'Центральный контроллер режимов, FreeRTOS/mBlock и Watchdog',
    hardware: 'STM32F405 / ESP32-S3 (mBlock MicroPython & C++)',
    bus: 'SPI · I2C · UART · CAN',
    powerBudget: '3.3 В · 180 мА номин.',
    channel: 'obc-firmware',
    defaultProgramId: 'prog-nominal-beacon',
    hex: '#0284c7',
    barClass: 'bg-sky-600',
    badgeClass: 'text-sky-700 bg-sky-50 border-sky-200',
    borderHoverClass: 'hover:border-sky-300',
    schematicX: 390,
    schematicY: 220,
  },
  EPS: {
    id: 'EPS',
    shortTitle: 'Энергопитание',
    ruName: 'ЭПС',
    fullName: 'Система энергопитания (EPS)',
    role: 'Генерация MPPT, АКБ 2S Li-Ion и коммутация шин 3.3В / 5В',
    hardware: '2S Li-Ion 5200 мАч · MPPT · 5× фотопанелей GaAs',
    bus: 'I2C INA219 · 3 управляемые шины',
    powerBudget: '7.4 В номин. · генерация до 2.6 Вт',
    channel: 'eps-power',
    defaultProgramId: 'prog-nominal-beacon',
    hex: '#d97706',
    barClass: 'bg-amber-500',
    badgeClass: 'text-amber-700 bg-amber-50 border-amber-200',
    borderHoverClass: 'hover:border-amber-300',
    schematicX: 140,
    schematicY: 220,
  },
  ADCS: {
    id: 'ADCS',
    shortTitle: 'ADCS B-dot',
    ruName: 'ADCS · Ориентация',
    fullName: 'Ориентация и стабилизация (ADCS)',
    role: 'Измерение угловой скорости IMU и демпфирование катушками',
    hardware: 'IMU 9-DOF · 6× датчиков Солнца · 3× магнитные катушки',
    bus: 'I2C + 3× H-Bridge ШИМ',
    powerBudget: '5.0 В · до 240 мА при B-dot',
    channel: 'adcs-attitude',
    defaultProgramId: 'prog-adcs-bdot',
    hex: '#7c3aed',
    barClass: 'bg-violet-600',
    badgeClass: 'text-violet-700 bg-violet-50 border-violet-200',
    borderHoverClass: 'hover:border-violet-300',
    schematicX: 390,
    schematicY: 82,
  },
  COMMS: {
    id: 'COMMS',
    shortTitle: 'Радио UHF',
    ruName: 'Командная радиолиния',
    fullName: 'Радиосвязь (COMMS)',
    role: 'Приём радиокоманд с Земли и передача маяков AX.25',
    hardware: 'UHF трансивер 435.800 МГц · AX.25 · дипольная антенна',
    bus: 'SPI · UART · 10/20/27 дБм',
    powerBudget: '3.3 В · пик 480 мА на передаче',
    channel: 'comms-rf',
    defaultProgramId: 'prog-nominal-beacon',
    hex: '#059669',
    barClass: 'bg-emerald-600',
    badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    borderHoverClass: 'hover:border-emerald-300',
    schematicX: 590,
    schematicY: 220,
  },
  PAYLOAD: {
    id: 'PAYLOAD',
    shortTitle: 'Камера ДЗЗ',
    ruName: 'Полезная нагрузка',
    fullName: 'Полезная нагрузка (Payload)',
    role: 'Съёмка Земли по команде и сцинтилляционный дозиметр',
    hardware: 'Камера ДЗЗ 1280×720 · Счётчик частиц · SD-буфер',
    bus: 'DCMI / SPI · Питание по порогу SoC > 45%',
    powerBudget: '5.0 В · 360 мА в цикле съёмки',
    channel: 'payload',
    defaultProgramId: 'prog-payload-science',
    hex: '#e11d48',
    barClass: 'bg-rose-500',
    badgeClass: 'text-rose-700 bg-rose-50 border-rose-200',
    borderHoverClass: 'hover:border-rose-300',
    schematicX: 390,
    schematicY: 358,
  },
  GROUND: {
    id: 'GROUND',
    shortTitle: 'Станция SDR',
    ruName: 'Наземный сегмент',
    fullName: 'Наземный сегмент (GROUND)',
    role: 'Приём телеметрии на Яги, декодер и отправка команд ТК',
    hardware: 'UHF-SDR приёмник · Поворотное устройство Яги',
    bus: 'UHF 435.800 МГц · TLE орбитальный трекинг',
    powerBudget: 'Наземное питание 220 В / 12 В',
    channel: 'general',
    hex: '#475569',
    barClass: 'bg-slate-600',
    badgeClass: 'text-slate-700 bg-slate-100 border-slate-200',
    borderHoverClass: 'hover:border-slate-300',
    schematicX: 735,
    schematicY: 220,
  },
};

export interface SubsystemProgressStat {
  subsystem: Subsystem;
  meta: SubsystemMeta;
  total: number;
  done: number;
  inProgress: number;
  review: number;
  backlog: number;
  active: number;
  pct: number;
  programsCount: number;
}

export function filterProjectTasks(tasks: CubeSatTask[], projectId: string): CubeSatTask[] {
  return tasks.filter((t) => (t.projectId || 'school76-1u') === projectId);
}

export function filterProjectPrograms(
  programs: OnboardProgram[],
  projectId: string
): OnboardProgram[] {
  return programs.filter((p) => !p.projectId || p.projectId === projectId);
}

export function computeSubsystemStats(
  tasks: CubeSatTask[],
  programs: OnboardProgram[] = []
): SubsystemProgressStat[] {
  return SUBSYSTEM_ORDER.map((subsystem) => {
    const subTasks = tasks.filter((t) => t.subsystem === subsystem);
    const total = subTasks.length;
    const done = subTasks.filter((t) => t.status === 'done').length;
    const inProgress = subTasks.filter((t) => t.status === 'in_progress').length;
    const review = subTasks.filter((t) => t.status === 'review').length;
    const backlog = subTasks.filter((t) => t.status === 'backlog').length;
    const active = total - done;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const programsCount = programs.filter((p) => p.subsystem === subsystem).length;
    return {
      subsystem,
      meta: SUBSYSTEM_META[subsystem],
      total,
      done,
      inProgress,
      review,
      backlog,
      active,
      pct,
      programsCount,
    };
  });
}
