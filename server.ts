import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import type {
  ChatChannelId,
  ChatMessage,
  CubeSatTask,
  MissionSnapshot,
  OnboardProgram,
  ProgramVersion,
  Subsystem,
  TaskPriority,
  TaskStatus,
  TeamPresence,
  WsClientEvent,
  WsServerEvent,
} from './src/types/cubesat.ts';
import { PRESET_PROGRAMS } from './src/mblock/presets.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'school76.json');

interface PersistedState {
  tasks: CubeSatTask[];
  messages: ChatMessage[];
  programs: OnboardProgram[];
  nextTaskSeq: number;
}

const VALID_SUBSYSTEMS = new Set<Subsystem>(['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND']);
const VALID_STATUSES = new Set<TaskStatus>(['backlog', 'in_progress', 'review', 'done']);
const VALID_PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high', 'critical']);
const VALID_CHANNELS = new Set<ChatChannelId>([
  'general',
  'obc-firmware',
  'eps-power',
  'adcs-attitude',
  'comms-rf',
  'payload',
]);

function createSeedState(): PersistedState {
  const now = new Date('2026-11-24T08:00:00.000Z').toISOString();
  return {
    nextTaskSeq: 107,
    tasks: [
      {
        id: 'SAT-101',
        title: 'Переход OBC в режим SAFE при падении АКБ ниже 25%',
        description:
          'Проверить логику отключения шины PAYLOAD_5V и включения термостата батареи в визуальной программе OBC. Убедиться, что WDT не сбрасывает контроллер при переключении.',
        subsystem: 'OBC',
        status: 'in_progress',
        priority: 'critical',
        assignee: 'Артём Соколов',
        linkedProgramId: 'prog-nominal-beacon',
        linkedChannel: 'obc-firmware',
        dueDate: '2026-11-28',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-102',
        title: 'Калибровка алгоритма B-dot по осям X/Y/Z в симуляторе',
        description:
          'Подобрать коэффициент усиления для магнитных катушек ADCS, чтобы демпфирование начального вращения 18 °/с занимало не более 25 секунд цикла.',
        subsystem: 'ADCS',
        status: 'review',
        priority: 'high',
        assignee: 'Мария Волкова',
        linkedProgramId: 'prog-adcs-bdot',
        linkedChannel: 'adcs-attitude',
        dueDate: '2026-11-27',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-103',
        title: 'Проверка энергобюджета MPPT на теневом участке орбиты',
        description:
          'Измерить падение напряжения шины 3.3В при одновременном включении UHF-маяка 27 дБм и обогрева аккумулятора.',
        subsystem: 'EPS',
        status: 'backlog',
        priority: 'high',
        assignee: 'Егор Миронов',
        linkedChannel: 'eps-power',
        dueDate: '2026-11-30',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-104',
        title: 'Скрипт захвата кадра 1280x720 и записи дозиметра',
        description:
          'Настроить обработчик радиокоманды CAPTURE в mBlock Studio: питание камеры подаётся только при заряде > 45%, после съёмки шина 5V отключается.',
        subsystem: 'PAYLOAD',
        status: 'in_progress',
        priority: 'medium',
        assignee: 'Дмитрий Лебедев',
        linkedProgramId: 'prog-payload-science',
        linkedChannel: 'payload',
        dueDate: '2026-12-02',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-105',
        title: 'Тестирование кадра AX.25 на частоте 435.800 МГц',
        description:
          'Согласовать формат строки маяка SCHOOL76-1U и проверить декодирование пакетов на наземном SDR-приёмнике.',
        subsystem: 'COMMS',
        status: 'done',
        priority: 'medium',
        assignee: 'Анна Орлова',
        linkedProgramId: 'prog-nominal-beacon',
        linkedChannel: 'comms-rf',
        dueDate: '2026-11-23',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-106',
        title: 'Чек-лист приёмки наземной станции school76',
        description:
          'Подготовить протокол прохождения команд PING, CAPTURE и SAFE перед тепловакуумными испытаниями корпуса 1U.',
        subsystem: 'GROUND',
        status: 'backlog',
        priority: 'low',
        assignee: 'Кирилл Титов',
        linkedChannel: 'general',
        dueDate: '2026-12-05',
        createdAt: now,
        updatedAt: now,
      },
    ],
    messages: [
      {
        id: 'msg-1',
        channel: 'general',
        author: 'Артём Соколов',
        authorRole: 'Системный инженер OBC',
        text: 'Коллеги, перенесли бортовые алгоритмы в единый визуальный конструктор на базе mBlock. Проверьте пресеты перед завтрашней сборкой стенда.',
        programRefId: 'prog-nominal-beacon',
        createdAt: '2026-11-24T08:05:00.000Z',
      },
      {
        id: 'msg-2',
        channel: 'general',
        author: 'Анна Орлова',
        authorRole: 'Радиоинженер COMMS',
        text: 'Декодер на 435.800 МГц стабильно принимает UI-фреймы с позывным SCHOOL76-1U. Задачу SAT-105 перевела в статус «Готово».',
        taskRefId: 'SAT-105',
        createdAt: '2026-11-24T08:12:00.000Z',
      },
      {
        id: 'msg-3',
        channel: 'obc-firmware',
        author: 'Артём Соколов',
        authorRole: 'Системный инженер OBC',
        text: 'В тике телеметрии добавил сброс сторожевого таймера до ветвления по заряду АКБ. При разряде ниже 25% переходим в SAFE и включаем обогрев.',
        taskRefId: 'SAT-101',
        programRefId: 'prog-nominal-beacon',
        codeSnippet: {
          lang: 'python',
          code: `obc.reset_watchdog()\nif eps.battery_pct() < 25:\n    obc.set_mode('SAFE')\n    eps.set_rail('PAYLOAD_5V', False)`,
        },
        createdAt: '2026-11-24T08:18:00.000Z',
      },
      {
        id: 'msg-4',
        channel: 'adcs-attitude',
        author: 'Мария Волкова',
        authorRole: 'Инженер ADCS',
        text: 'Загрузила алгоритм демпфирования B-dot в mBlock Studio. Порог переключения в NOMINAL поставила на |gyro_x| <= 2 °/с, посмотрите на стенде с включённой тенью.',
        taskRefId: 'SAT-102',
        programRefId: 'prog-adcs-bdot',
        createdAt: '2026-11-24T08:25:00.000Z',
      },
      {
        id: 'msg-5',
        channel: 'eps-power',
        author: 'Егор Миронов',
        authorRole: 'Инженер EPS',
        text: 'При пике 27 дБм на передатчике просадка по шине 3.3В составляет около 70 мВ. Учтите это при одновременном запуске камеры.',
        taskRefId: 'SAT-103',
        createdAt: '2026-11-24T08:30:00.000Z',
      },
      {
        id: 'msg-6',
        channel: 'payload',
        author: 'Дмитрий Лебедев',
        authorRole: 'Инженер полезной нагрузки',
        text: 'Привязал обработчик команды CAPTURE к проверке батареи (> 45%). После снимка 1280x720 сразу снимаем показания дозиметра и гасим 5V.',
        taskRefId: 'SAT-104',
        programRefId: 'prog-payload-science',
        createdAt: '2026-11-24T08:34:00.000Z',
      },
    ],
    programs: PRESET_PROGRAMS,
  };
}

function loadState(): PersistedState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const seed = createSeedState();
      fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
      return seed;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.messages) || !Array.isArray(parsed.programs)) {
      const seed = createSeedState();
      fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
      return seed;
    }
    // Ensure every program has an initial versions array
    parsed.programs = parsed.programs.map((prog) => {
      if (Array.isArray(prog.versions) && prog.versions.length > 0) {
        return prog;
      }
      return {
        ...prog,
        versions: [
          {
            id: `ver-init-${prog.id}`,
            author: prog.author,
            note: 'Базовая версия программы',
            workspaceJson: prog.workspaceJson,
            pythonCode: prog.pythonCode,
            cppCode: prog.cppCode,
            savedAt: prog.updatedAt,
          },
        ],
      };
    });
    return parsed;
  } catch {
    return createSeedState();
  }
}

function saveState(state: PersistedState) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist school76 state:', err);
  }
}

function clampStr(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.trim().slice(0, maxLen);
}

async function startServer() {
  const state = loadState();
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map<WebSocket, TeamPresence>();

  function getPresenceList(): TeamPresence[] {
    return Array.from(clients.values());
  }

  function broadcast(event: WsServerEvent) {
    const encoded = JSON.stringify(event);
    for (const ws of clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoded);
      }
    }
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, tasks: state.tasks.length, programs: state.programs.length });
  });

  app.get('/api/state', (_req, res) => {
    const snapshot: MissionSnapshot = {
      tasks: state.tasks,
      messages: state.messages,
      programs: state.programs,
      presence: getPresenceList(),
    };
    res.json(snapshot);
  });

  wss.on('connection', (ws) => {
    const clientId = `eng-${Math.random().toString(36).slice(2, 9)}`;
    const defaultPresence: TeamPresence = {
      clientId,
      name: 'Гость-инженер',
      role: 'Разработчик',
      subsystem: 'OBC',
      activeTab: 'tasks',
      joinedAt: new Date().toISOString(),
    };
    clients.set(ws, defaultPresence);

    const initPayload: WsServerEvent = {
      type: 'init:state',
      payload: {
        tasks: state.tasks,
        messages: state.messages,
        programs: state.programs,
        presence: getPresenceList(),
      },
    };
    ws.send(JSON.stringify(initPayload));
    broadcast({ type: 'presence:update', payload: getPresenceList() });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsClientEvent;
        if (!msg || typeof msg.type !== 'string') return;

        switch (msg.type) {
          case 'presence:join': {
            const p = msg.payload;
            const current = clients.get(ws);
            if (!current) return;
            clients.set(ws, {
              ...current,
              name: clampStr(p.name, 48, current.name) || 'Инженер school76',
              role: clampStr(p.role, 64, current.role) || 'Инженер подсистемы',
              subsystem: VALID_SUBSYSTEMS.has(p.subsystem) ? p.subsystem : current.subsystem,
              activeTab: clampStr(p.activeTab, 32, 'tasks'),
            });
            broadcast({ type: 'presence:update', payload: getPresenceList() });
            break;
          }

          case 'task:create': {
            const p = msg.payload;
            const title = clampStr(p.title, 140);
            if (!title) return;
            const id = p.id && /^SAT-\d+$/.test(p.id) ? p.id : `SAT-${state.nextTaskSeq++}`;
            if (state.tasks.some((t) => t.id === id)) return;
            const now = new Date().toISOString();
            const task: CubeSatTask = {
              id,
              title,
              description: clampStr(p.description, 2000),
              subsystem: VALID_SUBSYSTEMS.has(p.subsystem) ? p.subsystem : 'OBC',
              status: VALID_STATUSES.has(p.status) ? p.status : 'backlog',
              priority: VALID_PRIORITIES.has(p.priority) ? p.priority : 'medium',
              assignee: clampStr(p.assignee, 64, 'Не назначен') || 'Не назначен',
              linkedProgramId: clampStr(p.linkedProgramId, 80) || undefined,
              linkedChannel: p.linkedChannel && VALID_CHANNELS.has(p.linkedChannel) ? p.linkedChannel : undefined,
              dueDate: clampStr(p.dueDate, 20) || undefined,
              createdAt: now,
              updatedAt: now,
            };
            state.tasks.unshift(task);
            saveState(state);
            broadcast({ type: 'task:created', payload: task });
            break;
          }

          case 'task:update': {
            const { id, patch } = msg.payload;
            const idx = state.tasks.findIndex((t) => t.id === id);
            if (idx === -1) return;
            const existing = state.tasks[idx];
            const updated: CubeSatTask = {
              ...existing,
              title: patch.title !== undefined ? clampStr(patch.title, 140, existing.title) : existing.title,
              description:
                patch.description !== undefined
                  ? clampStr(patch.description, 2000, existing.description)
                  : existing.description,
              subsystem:
                patch.subsystem && VALID_SUBSYSTEMS.has(patch.subsystem) ? patch.subsystem : existing.subsystem,
              status: patch.status && VALID_STATUSES.has(patch.status) ? patch.status : existing.status,
              priority:
                patch.priority && VALID_PRIORITIES.has(patch.priority) ? patch.priority : existing.priority,
              assignee:
                patch.assignee !== undefined ? clampStr(patch.assignee, 64, existing.assignee) : existing.assignee,
              linkedProgramId:
                patch.linkedProgramId !== undefined
                  ? clampStr(patch.linkedProgramId, 80) || undefined
                  : existing.linkedProgramId,
              linkedChannel:
                patch.linkedChannel !== undefined
                  ? VALID_CHANNELS.has(patch.linkedChannel)
                    ? patch.linkedChannel
                    : undefined
                  : existing.linkedChannel,
              dueDate:
                patch.dueDate !== undefined ? clampStr(patch.dueDate, 20) || undefined : existing.dueDate,
              updatedAt: new Date().toISOString(),
            };
            state.tasks[idx] = updated;
            saveState(state);
            broadcast({ type: 'task:updated', payload: updated });
            break;
          }

          case 'task:delete': {
            const { id } = msg.payload;
            const before = state.tasks.length;
            state.tasks = state.tasks.filter((t) => t.id !== id);
            if (state.tasks.length !== before) {
              saveState(state);
              broadcast({ type: 'task:deleted', payload: { id } });
            }
            break;
          }

          case 'chat:send': {
            const p = msg.payload;
            const text = clampStr(p.text, 2000);
            if (!text && !p.codeSnippet?.code) return;
            const id = p.id && /^[a-zA-Z0-9_-]{4,64}$/.test(p.id) ? p.id : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            if (state.messages.some((m) => m.id === id)) return;
            const message: ChatMessage = {
              id,
              channel: VALID_CHANNELS.has(p.channel) ? p.channel : 'general',
              author: clampStr(p.author, 48, 'Инженер school76') || 'Инженер school76',
              authorRole: clampStr(p.authorRole, 64, 'Инженер') || 'Инженер',
              text: text || 'Фрагмент кода бортовой программы',
              taskRefId: clampStr(p.taskRefId, 32) || undefined,
              programRefId: clampStr(p.programRefId, 80) || undefined,
              codeSnippet:
                p.codeSnippet && (p.codeSnippet.lang === 'python' || p.codeSnippet.lang === 'cpp')
                  ? {
                      lang: p.codeSnippet.lang,
                      code: clampStr(p.codeSnippet.code, 4000),
                    }
                  : undefined,
              createdAt: new Date().toISOString(),
            };
            state.messages.push(message);
            if (state.messages.length > 400) {
              state.messages = state.messages.slice(-400);
            }
            saveState(state);
            broadcast({ type: 'chat:message', payload: message });
            break;
          }

          case 'program:save': {
            const p = msg.payload;
            const name = clampStr(p.name, 100);
            const id = clampStr(p.id, 80);
            if (!name || !id || !/^[a-zA-Z0-9_-]+$/.test(id)) return;
            const now = new Date().toISOString();
            const existingIdx = state.programs.findIndex((item) => item.id === id);
            const prevVersions: ProgramVersion[] =
              existingIdx >= 0 && Array.isArray(state.programs[existingIdx].versions)
                ? state.programs[existingIdx].versions!
                : [];
            const workspaceJson =
              p.workspaceJson && typeof p.workspaceJson === 'object' ? p.workspaceJson : {};
            const pythonCode = typeof p.pythonCode === 'string' ? p.pythonCode.slice(0, 20000) : '';
            const cppCode = typeof p.cppCode === 'string' ? p.cppCode.slice(0, 20000) : '';
            const author = clampStr(p.author, 48, 'Команда school76') || 'Команда school76';
            const saveNote = clampStr(p.saveNote, 280);

            const newVersion: ProgramVersion = {
              id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
              author,
              note: saveNote || (existingIdx >= 0 ? 'Обновление блоков mBlock' : 'Начальная версия'),
              workspaceJson,
              pythonCode,
              cppCode,
              savedAt: now,
            };

            const saved: OnboardProgram = {
              id,
              name,
              subsystem: VALID_SUBSYSTEMS.has(p.subsystem) ? p.subsystem : 'OBC',
              targetBoard:
                p.targetBoard === 'STM32F4 OBC (Arduino C++)'
                  ? 'STM32F4 OBC (Arduino C++)'
                  : 'CyberPi / ESP32 (MicroPython)',
              author,
              description: clampStr(p.description, 500),
              workspaceJson,
              pythonCode,
              cppCode,
              versions: [newVersion, ...prevVersions].slice(0, 30),
              updatedAt: now,
            };
            if (existingIdx >= 0) {
              state.programs[existingIdx] = saved;
            } else {
              state.programs.unshift(saved);
            }
            saveState(state);
            broadcast({ type: 'program:saved', payload: saved });
            break;
          }

          case 'program:update_version_note': {
            const { programId, versionId, note } = msg.payload;
            const progIdx = state.programs.findIndex((item) => item.id === programId);
            if (progIdx === -1) return;
            const prog = state.programs[progIdx];
            const versions = Array.isArray(prog.versions) ? prog.versions : [];
            const verIdx = versions.findIndex((v) => v.id === versionId);
            if (verIdx === -1) return;

            const updatedVersions = versions.map((v, i) =>
              i === verIdx ? { ...v, note: clampStr(note, 280) } : v
            );
            const updatedProg: OnboardProgram = {
              ...prog,
              versions: updatedVersions,
            };
            state.programs[progIdx] = updatedProg;
            saveState(state);
            broadcast({ type: 'program:saved', payload: updatedProg });
            break;
          }

          case 'program:delete': {
            const { id } = msg.payload;
            if (state.programs.length <= 1) return;
            const before = state.programs.length;
            state.programs = state.programs.filter((item) => item.id !== id);
            if (state.programs.length !== before) {
              saveState(state);
              broadcast({ type: 'program:deleted', payload: { id } });
            }
            break;
          }
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Некорректное сообщение' } }));
        console.error('WS message parse error:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      broadcast({ type: 'presence:update', payload: getPresenceList() });
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`school76 server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
