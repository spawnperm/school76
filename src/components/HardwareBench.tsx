import React, { useState } from 'react';
import { Cpu, ListChecks, MessageSquare } from 'lucide-react';
import type {
  ChatChannelId,
  CubeSatTask,
  OnboardProgram,
  Subsystem,
} from '../types/cubesat.ts';

interface HardwareBenchProps {
  tasks: CubeSatTask[];
  programs: OnboardProgram[];
  onGoToTasks: () => void;
  onOpenProgram: (programId: string) => void;
  onOpenChannel: (channel: ChatChannelId) => void;
}

interface SubsystemSpec {
  id: Subsystem;
  name: string;
  hardware: string;
  bus: string;
  powerBudget: string;
  channel: ChatChannelId;
  defaultProgramId?: string;
}

const SUBSYSTEM_SPECS: SubsystemSpec[] = [
  {
    id: 'OBC',
    name: 'Бортовой компьютер (OBC)',
    hardware: 'STM32F405 / ESP32-S3 (mBlock MicroPython & C++)',
    bus: 'SPI · I2C · UART · CAN',
    powerBudget: '3.3 В · 180 мА номин.',
    channel: 'obc-firmware',
    defaultProgramId: 'prog-nominal-beacon',
  },
  {
    id: 'EPS',
    name: 'Система энергопитания (EPS)',
    hardware: '2S Li-Ion 5200 мАч · MPPT · 5× фотопанелей GaAs',
    bus: 'I2C INA219 · 3 управляемые шины',
    powerBudget: '7.4 В номин. · генерация до 2.6 Вт',
    channel: 'eps-power',
    defaultProgramId: 'prog-nominal-beacon',
  },
  {
    id: 'ADCS',
    name: 'Ориентация и стабилизация (ADCS)',
    hardware: 'IMU 9-DOF · 6× датчиков Солнца · 3× магнитные катушки',
    bus: 'I2C + 3× H-Bridge ШИМ',
    powerBudget: '5.0 В · до 240 мА при B-dot',
    channel: 'adcs-attitude',
    defaultProgramId: 'prog-adcs-bdot',
  },
  {
    id: 'COMMS',
    name: 'Радиосвязь (COMMS)',
    hardware: 'UHF трансивер 435.800 МГц · AX.25 · дипольная антенна',
    bus: 'SPI · UART · 10/20/27 дБм',
    powerBudget: '3.3 В · пик 480 мА на передаче',
    channel: 'comms-rf',
    defaultProgramId: 'prog-nominal-beacon',
  },
  {
    id: 'PAYLOAD',
    name: 'Полезная нагрузка (Payload)',
    hardware: 'Камера ДЗЗ 1280×720 · Сцинтилляционный дозиметр',
    bus: 'DCMI / SPI · SD-буфер',
    powerBudget: '5.0 В · 360 мА в цикле съёмки',
    channel: 'payload',
    defaultProgramId: 'prog-payload-science',
  },
];

export const HardwareBench: React.FC<HardwareBenchProps> = ({
  tasks,
  programs,
  onGoToTasks,
  onOpenProgram,
  onOpenChannel,
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-10">
      {/* Split Hero: Mission Overview + 1U CubeSat Cutaway */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-between bg-white border border-slate-200 rounded-lg p-8 space-y-6">
          <div className="space-y-3">
            <div className="text-xs font-mono text-slate-500">
              МИССИЯ SCHOOL76-1U · СТАНДАРТ 100×100×113.5 ММ
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight text-balance">
              Инженерный стенд образовательного кубсата 1U
            </h1>
            <p className="text-base text-slate-600 leading-relaxed">
              Единая среда совместной разработки: распределение инженерных задач по подсистемам, технический чат с привязкой к тикетам и визуальное программирование бортовых алгоритмов на базе Makeblock mBlock с трансляцией в MicroPython и Arduino/STM32 C++.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200">
            <div>
              <div className="text-xs text-slate-500">Готовность задач</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                {doneTasks}/{totalTasks}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Программ mBlock</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                {programs.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Несущая UHF</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                435.8 МГц
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenProgram(programs[0]?.id || 'prog-nominal-beacon')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors"
            >
              <Cpu className="w-4 h-4" />
              Открыть mBlock Борт ПО
            </button>
            <button
              type="button"
              onClick={onGoToTasks}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            >
              <ListChecks className="w-4 h-4" />
              Перейти к задачам
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center min-h-[320px]">
          {!imageFailed ? (
            <img
              src="/src/assets/images/cubesat_1u_isometric_1795541227873.jpg"
              alt="Изометрический чертёж 1U кубсата school76 с расположением плат OBC, EPS, ADCS и COMMS"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="p-8 text-center space-y-2 text-slate-500">
              <Cpu className="w-10 h-10 mx-auto text-slate-400" />
              <div className="text-sm font-medium text-slate-700">
                Сборка кубсата school76 (1U CubeSat)
              </div>
              <div className="text-xs">
                100 × 100 × 113.5 мм · Алюминиевый каркас · Солнечные панели GaAs
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Subsystem Architecture Matrix */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            Архитектура бортовых подсистем
          </h2>
          <span className="text-xs text-slate-500">
            Нажмите на канал или модуль mBlock для перехода к работе
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Подсистема</th>
                <th className="py-3 px-4">Аппаратная база</th>
                <th className="py-3 px-4">Интерфейсы</th>
                <th className="py-3 px-4">Энергобюджет</th>
                <th className="py-3 px-4 text-right">Задачи</th>
                <th className="py-3 px-4 text-right">Инструменты</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {SUBSYSTEM_SPECS.map((spec) => {
                const subTasks = tasks.filter((t) => t.subsystem === spec.id);
                const subDone = subTasks.filter((t) => t.status === 'done').length;
                return (
                  <tr key={spec.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      {spec.name}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {spec.hardware}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {spec.bus}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {spec.powerBudget}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs tabular-nums text-right text-slate-700 whitespace-nowrap">
                      {subDone}/{subTasks.length}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-3">
                      <button
                        type="button"
                        onClick={() => onOpenChannel(spec.channel)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-sky-700"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        #{spec.channel}
                      </button>
                      {spec.defaultProgramId && (
                        <button
                          type="button"
                          onClick={() => onOpenProgram(spec.defaultProgramId!)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
                        >
                          <Cpu className="w-3.5 h-3.5" />
                          mBlock
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
