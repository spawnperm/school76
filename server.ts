import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import type {
  ChatChannelId,
  ChatMessage,
  CommunityProject,
  CubeSatTask,
  MissionSnapshot,
  OnboardProgram,
  ProgramVersion,
  SocialPost,
  Subsystem,
  TaskPriority,
  TaskStatus,
  TeamPresence,
  UserProfile,
  WsClientEvent,
  WsServerEvent,
} from './src/types/cubesat.ts';
import { PRESET_PROGRAMS } from './src/mblock/presets.ts';
import { hashPassword, signSessionToken, verifyPassword, verifySessionToken } from './server/auth.ts';
import {
  deleteForgejoFile,
  ensureForgejoRepo,
  getForgejoCommits,
  ingestSourceToWiki,
  lintForgejoWiki,
  listForgejoTree,
  readForgejoFile,
  writeForgejoFile,
} from './server/forgejoStore.ts';
import {
  deleteGarageObject,
  ensureGarageBucket,
  getGarageObject,
  listGarageObjects,
  putGarageObject,
} from './server/garageS3.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'school76.json');

interface StoredUser extends UserProfile {
  passwordHash: string;
}

interface PersistedState {
  tasks: CubeSatTask[];
  messages: ChatMessage[];
  programs: OnboardProgram[];
  users: StoredUser[];
  projects: CommunityProject[];
  posts: SocialPost[];
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

function stripUserSecrets(u: StoredUser): UserProfile {
  const { passwordHash: _ignored, ...pub } = u;
  return pub;
}

function createSeedUsers(): StoredUser[] {
  const now = '2026-11-24T07:30:00.000Z';
  const defaultHash = hashPassword('school76');
  return [
    {
      id: 'usr-artem',
      username: 'artem',
      displayName: 'Артём Соколов',
      role: 'Системный инженер OBC',
      subsystem: 'OBC',
      bio: 'Архитектор бортового ПО кубсата 1U, mBlock-транслятор MicroPython/STM32 и ведение llm-wiki.',
      skills: ['STM32F4', 'MicroPython', 'FreeRTOS', 'mBlock'],
      followers: ['usr-maria', 'usr-dmitry'],
      following: ['usr-maria'],
      joinedProjectIds: ['school76-1u', 'ground-sdr'],
      createdAt: now,
      passwordHash: defaultHash,
    },
    {
      id: 'usr-maria',
      username: 'maria',
      displayName: 'Мария Волкова',
      role: 'Инженер ADCS и баллистики',
      subsystem: 'ADCS',
      bio: 'Моделирование демпфирования B-dot, калибровка магнитометров и солнечных датчиков.',
      skills: ['ADCS', 'C++', 'IMU', 'Python'],
      followers: ['usr-artem'],
      following: ['usr-artem', 'usr-dmitry'],
      joinedProjectIds: ['school76-1u'],
      createdAt: now,
      passwordHash: defaultHash,
    },
    {
      id: 'usr-dmitry',
      username: 'dmitry',
      displayName: 'Дмитрий Лебедев',
      role: 'Инженер полезной нагрузки и SDR',
      subsystem: 'PAYLOAD',
      bio: 'Камера ДЗЗ, сцинтилляционный дозиметр и приём телеметрии AX.25 435.800 МГц.',
      skills: ['Payload', 'SDR', 'AX.25', 'Garage S3'],
      followers: ['usr-maria'],
      following: ['usr-artem'],
      joinedProjectIds: ['school76-1u', 'ground-sdr'],
      createdAt: now,
      passwordHash: defaultHash,
    },
  ];
}

function createSeedProjects(): CommunityProject[] {
  const now = '2026-11-24T07:30:00.000Z';
  return [
    {
      id: 'school76-1u',
      slug: 'school76-1u',
      name: 'Кубсат school76-1U',
      description:
        'Основная инженерная миссия образовательного наноспутника формата 1U: разработка бортового ПО в mBlock, энергобюджет EPS, стабилизация ADCS и UHF радиоканал.',
      category: 'Космический аппарат 1U',
      tags: ['1U CubeSat', 'STM32', 'mBlock', 'AX.25'],
      ownerId: 'usr-artem',
      memberIds: ['usr-artem', 'usr-maria', 'usr-dmitry'],
      forgejoRepo: 'school76-1u',
      s3Bucket: 'school76-media',
      createdAt: now,
    },
    {
      id: 'ground-sdr',
      slug: 'ground-sdr',
      name: 'Наземная станция UHF-SDR',
      description:
        'Сообщество разработки приёмного тракта 435.800 МГц, поворотного устройства антенны Яги и автоматического декодера телеметрии.',
      category: 'Наземный сегмент',
      tags: ['UHF 435 MHz', 'GNU Radio', 'Yagi', 'Telecommand'],
      ownerId: 'usr-dmitry',
      memberIds: ['usr-dmitry', 'usr-artem'],
      forgejoRepo: 'ground-sdr',
      s3Bucket: 'school76-media',
      createdAt: now,
    },
  ];
}

function createSeedPosts(): SocialPost[] {
  return [
    {
      id: 'post-1',
      projectId: 'school76-1u',
      authorId: 'usr-artem',
      authorName: 'Артём Соколов',
      authorHandle: '@artem',
      authorRole: 'Системный инженер OBC',
      text: 'Загрузил изометрическую схему компоновки плат 1U в бакет Garage S3 и обновил статью [[subsystems/obc]] в Forgejo llm-wiki. Проверьте разводку шин питания на макете.',
      mediaUrls: ['/api/s3/school76-media/cubesat-1u-cutaway.jpg'],
      likes: ['usr-maria', 'usr-dmitry'],
      comments: [
        {
          id: 'cmt-1',
          authorId: 'usr-maria',
          authorName: 'Мария Волкова',
          text: 'Отлично виден верхний модуль ADCS с катушкой! Добавила заметку по тесту B-dot в план Ганта.',
          createdAt: '2026-11-24T08:40:00.000Z',
        },
      ],
      createdAt: '2026-11-24T08:20:00.000Z',
    },
    {
      id: 'post-2',
      projectId: 'ground-sdr',
      authorId: 'usr-dmitry',
      authorName: 'Дмитрий Лебедев',
      authorHandle: '@dmitry',
      authorRole: 'Инженер полезной нагрузки и SDR',
      text: 'Ищем ещё двух участников в проект наземной станции UHF-SDR для сборки МШУ на 435.800 МГц и тестирования приёма маяков SCHOOL76-1U.',
      mediaUrls: [],
      likes: ['usr-artem'],
      comments: [],
      createdAt: '2026-11-24T09:05:00.000Z',
    },
  ];
}

function createSeedState(): PersistedState {
  const now = new Date('2026-11-24T08:00:00.000Z').toISOString();
  return {
    nextTaskSeq: 109,
    users: createSeedUsers(),
    projects: createSeedProjects(),
    posts: createSeedPosts(),
    tasks: [
      {
        id: 'SAT-101',
        projectId: 'school76-1u',
        title: 'Переход OBC в режим SAFE при падении АКБ ниже 25%',
        description:
          'Проверить логику отключения шины PAYLOAD_5V и включения термостата батареи в визуальной программе OBC. Убедиться, что WDT не сбрасывает контроллер при переключении.',
        subsystem: 'OBC',
        status: 'in_progress',
        priority: 'critical',
        assignee: 'Артём Соколов',
        linkedProgramId: 'prog-nominal-beacon',
        linkedChannel: 'obc-firmware',
        startDate: '2026-11-22',
        dueDate: '2026-11-28',
        progressPct: 65,
        checklist: [
          { id: 'chk-1', text: 'Проверить чтение напряжения 2S Li-Ion через ADC', done: true },
          { id: 'chk-2', text: 'Отключить шину PAYLOAD_5V при SoC < 25%', done: true },
          { id: 'chk-3', text: 'Прогнать цикл с включённой тенью Земли на стенде', done: false },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-102',
        projectId: 'school76-1u',
        title: 'Калибровка алгоритма B-dot по осям X/Y/Z в симуляторе',
        description:
          'Подобрать коэффициент усиления для магнитных катушек ADCS, чтобы демпфирование начального вращения 18 °/с занимало не более 25 секунд цикла.',
        subsystem: 'ADCS',
        status: 'review',
        priority: 'high',
        assignee: 'Мария Волкова',
        linkedProgramId: 'prog-adcs-bdot',
        linkedChannel: 'adcs-attitude',
        startDate: '2026-11-21',
        dueDate: '2026-11-27',
        progressPct: 90,
        dependsOn: ['SAT-101'],
        checklist: [
          { id: 'chk-4', text: 'Реализовать шаг B-dot в блоках mBlock', done: true },
          { id: 'chk-5', text: 'Зафиксировать порог выхода <= 2.0 °/с в llm-wiki', done: true },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-103',
        projectId: 'school76-1u',
        title: 'Проверка энергобюджета MPPT на теневом участке орбиты',
        description:
          'Измерить падение напряжения шины 3.3В при одновременном включении UHF-маяка 27 дБм и обогрева аккумулятора.',
        subsystem: 'EPS',
        status: 'backlog',
        priority: 'high',
        assignee: 'Егор Миронов',
        linkedChannel: 'eps-power',
        startDate: '2026-11-25',
        dueDate: '2026-11-30',
        progressPct: 15,
        checklist: [
          { id: 'chk-6', text: 'Подключить токовый шунт INA219 к шине 3.3В', done: false },
          { id: 'chk-7', text: 'Загрузить протокол замеров в raw/1u-power-budget.md', done: false },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-104',
        projectId: 'school76-1u',
        title: 'Скрипт захвата кадра 1280x720 и записи дозиметра',
        description:
          'Настроить обработчик радиокоманды CAPTURE в mBlock Studio: питание камеры подаётся только при заряде > 45%, после съёмки шина 5V отключается.',
        subsystem: 'PAYLOAD',
        status: 'in_progress',
        priority: 'medium',
        assignee: 'Дмитрий Лебедев',
        linkedProgramId: 'prog-payload-science',
        linkedChannel: 'payload',
        startDate: '2026-11-24',
        dueDate: '2026-12-02',
        progressPct: 50,
        dependsOn: ['SAT-103'],
        checklist: [
          { id: 'chk-8', text: 'Добавить защиту по порогу АКБ > 45%', done: true },
          { id: 'chk-9', text: 'Проверить сохранение кадра в Garage S3 телеметрии', done: false },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-105',
        projectId: 'school76-1u',
        title: 'Тестирование кадра AX.25 на частоте 435.800 МГц',
        description:
          'Согласовать формат строки маяка SCHOOL76-1U и проверить декодирование пакетов на наземном SDR-приёмнике.',
        subsystem: 'COMMS',
        status: 'done',
        priority: 'medium',
        assignee: 'Анна Орлова',
        linkedProgramId: 'prog-nominal-beacon',
        linkedChannel: 'comms-rf',
        startDate: '2026-11-19',
        dueDate: '2026-11-23',
        progressPct: 100,
        checklist: [
          { id: 'chk-10', text: 'Проверить позывной SCHOOL76-1U в UI-фрейме', done: true },
          { id: 'chk-11', text: 'Подтвердить приём на SDR-приёмнике', done: true },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-106',
        projectId: 'school76-1u',
        title: 'Чек-лист приёмки наземной станции school76',
        description:
          'Подготовить протокол прохождения команд PING, CAPTURE и SAFE перед тепловакуумными испытаниями корпуса 1U.',
        subsystem: 'GROUND',
        status: 'backlog',
        priority: 'low',
        assignee: 'Кирилл Титов',
        linkedChannel: 'general',
        startDate: '2026-11-29',
        dueDate: '2026-12-05',
        progressPct: 10,
        dependsOn: ['SAT-104'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-107',
        projectId: 'ground-sdr',
        title: 'Настройка МШУ 435.800 МГц и полосового фильтра',
        description: 'Снять АЧХ фильтра на векторном анализаторе и сохранить график в Garage S3.',
        subsystem: 'COMMS',
        status: 'in_progress',
        priority: 'high',
        assignee: 'Дмитрий Лебедев',
        linkedChannel: 'comms-rf',
        startDate: '2026-11-23',
        dueDate: '2026-11-29',
        progressPct: 55,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'SAT-108',
        projectId: 'ground-sdr',
        title: 'Автоматическое сопровождение антенны Яги по TLE',
        description: 'Синхронизация расчёта азимута и элевации с пролётами орбиты LEO.',
        subsystem: 'GROUND',
        status: 'backlog',
        priority: 'medium',
        assignee: 'Артём Соколов',
        linkedChannel: 'general',
        startDate: '2026-11-27',
        dueDate: '2026-12-04',
        progressPct: 0,
        dependsOn: ['SAT-107'],
        createdAt: now,
        updatedAt: now,
      },
    ],
    messages: [
      {
        id: 'msg-1',
        projectId: 'school76-1u',
        channel: 'general',
        author: 'Артём Соколов',
        authorRole: 'Системный инженер OBC',
        text: 'Коллеги, перенесли бортовые алгоритмы в единый визуальный конструктор на базе mBlock. Проверьте пресеты перед завтрашней сборкой стенда.',
        programRefId: 'prog-nominal-beacon',
        createdAt: '2026-11-24T08:05:00.000Z',
      },
      {
        id: 'msg-2',
        projectId: 'school76-1u',
        channel: 'general',
        author: 'Анна Орлова',
        authorRole: 'Радиоинженер COMMS',
        text: 'Декодер на 435.800 МГц стабильно принимает UI-фреймы с позывным SCHOOL76-1U. Задачу SAT-105 перевела в статус «Готово».',
        taskRefId: 'SAT-105',
        createdAt: '2026-11-24T08:12:00.000Z',
      },
      {
        id: 'msg-3',
        projectId: 'school76-1u',
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
        projectId: 'school76-1u',
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
        projectId: 'school76-1u',
        channel: 'eps-power',
        author: 'Егор Миронов',
        authorRole: 'Инженер EPS',
        text: 'При пике 27 дБм на передатчике просадка по шине 3.3В составляет около 70 мВ. Учтите это при одновременном запуске камеры.',
        taskRefId: 'SAT-103',
        createdAt: '2026-11-24T08:30:00.000Z',
      },
      {
        id: 'msg-6',
        projectId: 'school76-1u',
        channel: 'payload',
        author: 'Дмитрий Лебедев',
        authorRole: 'Инженер полезной нагрузки',
        text: 'Привязал обработчик команды CAPTURE к проверке батареи (> 45%). После снимка 1280x720 сразу снимаем показания дозиметра и гасим 5V.',
        taskRefId: 'SAT-104',
        programRefId: 'prog-payload-science',
        createdAt: '2026-11-24T08:34:00.000Z',
      },
    ],
    programs: PRESET_PROGRAMS.map((p) => ({
      ...p,
      projectId: 'school76-1u',
      versions: [
        {
          id: `ver-init-${p.id}`,
          author: p.author,
          note: 'Базовая версия программы',
          workspaceJson: p.workspaceJson,
          pythonCode: p.pythonCode,
          cppCode: p.cppCode,
          savedAt: p.updatedAt,
        },
      ],
    })),
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
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const seed = createSeedState();

    const tasks = (Array.isArray(parsed.tasks) ? parsed.tasks : seed.tasks).map((t) => ({
      ...t,
      projectId: t.projectId || 'school76-1u',
      startDate: t.startDate || t.createdAt.slice(0, 10),
      progressPct:
        typeof t.progressPct === 'number'
          ? t.progressPct
          : t.status === 'done'
            ? 100
            : t.status === 'review'
              ? 85
              : t.status === 'in_progress'
                ? 50
                : 0,
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
    }));

    const messages = (Array.isArray(parsed.messages) ? parsed.messages : seed.messages).map((m) => ({
      ...m,
      projectId: m.projectId || 'school76-1u',
    }));

    const programs = (Array.isArray(parsed.programs) ? parsed.programs : seed.programs).map((prog) => {
      const versions =
        Array.isArray(prog.versions) && prog.versions.length > 0
          ? prog.versions
          : [
              {
                id: `ver-init-${prog.id}`,
                author: prog.author,
                note: 'Базовая версия программы',
                workspaceJson: prog.workspaceJson,
                pythonCode: prog.pythonCode,
                cppCode: prog.cppCode,
                savedAt: prog.updatedAt,
              },
            ];
      return { ...prog, projectId: prog.projectId || 'school76-1u', versions };
    });

    const users = Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : seed.users;
    const projects =
      Array.isArray(parsed.projects) && parsed.projects.length > 0 ? parsed.projects : seed.projects;
    const posts = Array.isArray(parsed.posts) ? parsed.posts : seed.posts;

    return {
      tasks,
      messages,
      programs,
      users,
      projects,
      posts,
      nextTaskSeq: typeof parsed.nextTaskSeq === 'number' ? parsed.nextTaskSeq : seed.nextTaskSeq,
    };
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

function sanitizeMediaUrl(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed.startsWith('/api/s3/') || trimmed.startsWith('https://')) {
    return trimmed.slice(0, 400);
  }
  return null;
}

async function startServer() {
  const state = loadState();
  ensureGarageBucket('school76-media');
  for (const proj of state.projects) {
    ensureForgejoRepo(proj.forgejoRepo, proj.name);
    ensureGarageBucket(proj.s3Bucket);
  }

  const app = express();
  app.use(express.json({ limit: '12mb' }));

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

  function getAuthUser(req: express.Request): StoredUser | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    const uid = verifySessionToken(token);
    if (!uid) return null;
    return state.users.find((u) => u.id === uid) || null;
  }

  function requireAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в личный кабинет' });
      return;
    }
    (req as express.Request & { currentUser: StoredUser }).currentUser = user;
    next();
  }

  function broadcastSocialSync() {
    broadcast({
      type: 'social:sync',
      payload: {
        users: state.users.map(stripUserSecrets),
        projects: state.projects,
        posts: state.posts,
      },
    });
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      tasks: state.tasks.length,
      programs: state.programs.length,
      projects: state.projects.length,
      users: state.users.length,
    });
  });

  app.get('/api/state', (_req, res) => {
    const snapshot: MissionSnapshot = {
      tasks: state.tasks,
      messages: state.messages,
      programs: state.programs,
      users: state.users.map(stripUserSecrets),
      projects: state.projects,
      posts: state.posts,
      presence: getPresenceList(),
    };
    res.json(snapshot);
  });

  // ==========================
  // AUTH & PERSONAL CABINET
  // ==========================
  app.post('/api/auth/register', (req, res) => {
    const username = clampStr(req.body?.username, 24).toLowerCase();
    const displayName = clampStr(req.body?.displayName, 48);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = clampStr(req.body?.role, 64, 'Инженер-разработчик') || 'Инженер-разработчик';
    const subsystem = VALID_SUBSYSTEMS.has(req.body?.subsystem) ? (req.body.subsystem as Subsystem) : 'OBC';

    if (!/^[a-z0-9_-]{2,24}$/.test(username)) {
      res.status(400).json({ error: 'Логин должен содержать 2–24 латинских символа, цифры, _ или -' });
      return;
    }
    if (!displayName) {
      res.status(400).json({ error: 'Укажите отображаемое имя' });
      return;
    }
    if (password.length < 4 || password.length > 128) {
      res.status(400).json({ error: 'Пароль должен содержать от 4 до 128 символов' });
      return;
    }
    if (state.users.some((u) => u.username === username)) {
      res.status(409).json({ error: 'Пользователь с таким логином уже зарегистрирован' });
      return;
    }

    const id = `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const newUser: StoredUser = {
      id,
      username,
      displayName,
      role,
      subsystem,
      bio: clampStr(req.body?.bio, 300),
      skills: [],
      followers: [],
      following: [],
      joinedProjectIds: ['school76-1u'],
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(password),
    };

    const defaultProj = state.projects.find((p) => p.id === 'school76-1u');
    if (defaultProj && !defaultProj.memberIds.includes(id)) {
      defaultProj.memberIds.push(id);
    }

    state.users.push(newUser);
    saveState(state);
    broadcastSocialSync();

    const token = signSessionToken(id);
    res.status(201).json({ token, user: stripUserSecrets(newUser) });
  });

  app.post('/api/auth/login', (req, res) => {
    const username = clampStr(req.body?.username, 24).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = state.users.find((u) => u.username === username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Неверный логин или пароль' });
      return;
    }
    const token = signSessionToken(user.id);
    res.json({ token, user: stripUserSecrets(user) });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
    res.json({ user: stripUserSecrets(currentUser) });
  });

  app.patch('/api/users/me', requireAuth, (req, res) => {
    const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
    if (req.body?.displayName !== undefined) {
      currentUser.displayName = clampStr(req.body.displayName, 48, currentUser.displayName) || currentUser.displayName;
    }
    if (req.body?.role !== undefined) {
      currentUser.role = clampStr(req.body.role, 64, currentUser.role);
    }
    if (req.body?.subsystem && VALID_SUBSYSTEMS.has(req.body.subsystem)) {
      currentUser.subsystem = req.body.subsystem;
    }
    if (req.body?.bio !== undefined) {
      currentUser.bio = clampStr(req.body.bio, 400);
    }
    if (Array.isArray(req.body?.skills)) {
      currentUser.skills = req.body.skills
        .filter((s: unknown): s is string => typeof s === 'string')
        .map((s: string) => s.trim().slice(0, 32))
        .filter(Boolean)
        .slice(0, 12);
    }
    saveState(state);
    broadcastSocialSync();
    res.json({ user: stripUserSecrets(currentUser) });
  });

  app.post('/api/users/:id/follow', requireAuth, (req, res) => {
    const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
    const target = state.users.find((u) => u.id === req.params.id);
    if (!target || target.id === currentUser.id) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    const alreadyFollowing = currentUser.following.includes(target.id);
    if (alreadyFollowing) {
      currentUser.following = currentUser.following.filter((id) => id !== target.id);
      target.followers = target.followers.filter((id) => id !== currentUser.id);
    } else {
      currentUser.following.push(target.id);
      if (!target.followers.includes(currentUser.id)) {
        target.followers.push(currentUser.id);
      }
    }
    saveState(state);
    broadcastSocialSync();
    res.json({ following: !alreadyFollowing });
  });

  // ==========================
  // TEAM PROJECTS (COMMUNITIES) & SOCIAL WALL
  // ==========================
  app.post('/api/projects', requireAuth, (req, res) => {
    const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
    const name = clampStr(req.body?.name, 80);
    const rawSlug = clampStr(req.body?.slug, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const slug = rawSlug || `proj-${Date.now().toString(36)}`;
    if (!name) {
      res.status(400).json({ error: 'Укажите название проекта' });
      return;
    }
    if (state.projects.some((p) => p.id === slug || p.slug === slug)) {
      res.status(409).json({ error: 'Проект с таким идентификатором уже существует' });
      return;
    }

    const tags = Array.isArray(req.body?.tags)
      ? req.body.tags
          .filter((t: unknown): t is string => typeof t === 'string')
          .map((t: string) => t.trim().slice(0, 24))
          .filter(Boolean)
          .slice(0, 6)
      : [];

    const project: CommunityProject = {
      id: slug,
      slug,
      name,
      description: clampStr(req.body?.description, 600),
      category: clampStr(req.body?.category, 48, 'Инженерный проект') || 'Инженерный проект',
      tags,
      ownerId: currentUser.id,
      memberIds: [currentUser.id],
      forgejoRepo: slug,
      s3Bucket: 'school76-media',
      createdAt: new Date().toISOString(),
    };

    if (!currentUser.joinedProjectIds.includes(project.id)) {
      currentUser.joinedProjectIds.push(project.id);
    }

    ensureForgejoRepo(project.forgejoRepo, project.name);
    ensureGarageBucket(project.s3Bucket);

    state.projects.unshift(project);
    saveState(state);
    broadcastSocialSync();
    res.status(201).json({ project });
  });

  app.post('/api/projects/:id/join', requireAuth, (req, res) => {
    const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
    const project = state.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const isMember = project.memberIds.includes(currentUser.id);
    if (isMember) {
      if (project.ownerId === currentUser.id) {
        res.status(400).json({ error: 'Создатель проекта не может покинуть своё сообщество' });
        return;
      }
      project.memberIds = project.memberIds.filter((id) => id !== currentUser.id);
      currentUser.joinedProjectIds = currentUser.joinedProjectIds.filter((id) => id !== project.id);
    } else {
      project.memberIds.push(currentUser.id);
      if (!currentUser.joinedProjectIds.includes(project.id)) {
        currentUser.joinedProjectIds.push(project.id);
      }
    }
    saveState(state);
    broadcastSocialSync();
    res.json({ joined: !isMember, project });
  });

  app.post('/api/posts', requireAuth, (req, res) => {
    const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
    const text = clampStr(req.body?.text, 2000);
    const projectId = clampStr(req.body?.projectId, 64) || undefined;
    const mediaUrls = Array.isArray(req.body?.mediaUrls)
      ? req.body.mediaUrls
          .map(sanitizeMediaUrl)
          .filter((u: string | null): u is string => Boolean(u))
          .slice(0, 4)
      : [];

    if (!text && mediaUrls.length === 0) {
      res.status(400).json({ error: 'Введите текст записи или прикрепите медиа из Garage S3' });
      return;
    }

    const post: SocialPost = {
      id: `post-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      projectId,
      authorId: currentUser.id,
      authorName: currentUser.displayName,
      authorHandle: `@${currentUser.username}`,
      authorRole: currentUser.role,
      text,
      mediaUrls,
      likes: [],
      comments: [],
      createdAt: new Date().toISOString(),
    };
    state.posts.unshift(post);
    if (state.posts.length > 200) state.posts = state.posts.slice(0, 200);
    saveState(state);
    broadcastSocialSync();
    res.status(201).json({ post });
  });

  app.post('/api/posts/:id/like', requireAuth, (req, res) => {
    const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
    const post = state.posts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Запись не найдена' });
      return;
    }
    const liked = post.likes.includes(currentUser.id);
    post.likes = liked
      ? post.likes.filter((id) => id !== currentUser.id)
      : [...post.likes, currentUser.id];
    saveState(state);
    broadcastSocialSync();
    res.json({ liked: !liked, likes: post.likes });
  });

  app.post('/api/posts/:id/comment', requireAuth, (req, res) => {
    const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
    const post = state.posts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Запись не найдена' });
      return;
    }
    const text = clampStr(req.body?.text, 600);
    if (!text) {
      res.status(400).json({ error: 'Комментарий не может быть пустым' });
      return;
    }
    post.comments.push({
      id: `cmt-${Date.now().toString(36)}`,
      authorId: currentUser.id,
      authorName: currentUser.displayName,
      text,
      createdAt: new Date().toISOString(),
    });
    saveState(state);
    broadcastSocialSync();
    res.status(201).json({ post });
  });

  // ==========================
  // EMBEDDED FORGEJO V1 API + LLM-WIKI
  // ==========================
  app.get('/api/v1/repos/school76/:repo/git/trees/main', (req, res) => {
    try {
      const files = listForgejoTree(req.params.repo);
      res.json({ repo: req.params.repo, branch: 'main', tree: files });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Forgejo error' });
    }
  });

  app.get('/api/v1/repos/school76/:repo/contents/*', (req, res) => {
    try {
      const filepath = (req.params as Record<string, string>)[0] || '';
      const file = readForgejoFile(req.params.repo, filepath);
      res.json({
        name: path.basename(file.path),
        path: file.path,
        sha: file.sha,
        encoding: 'base64',
        content: Buffer.from(file.content, 'utf-8').toString('base64'),
        rawContent: file.content,
      });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
    }
  });

  app.put('/api/v1/repos/school76/:repo/contents/*', requireAuth, async (req, res) => {
    try {
      const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
      const filepath = (req.params as Record<string, string>)[0] || '';
      const rawContent =
        typeof req.body?.rawContent === 'string'
          ? req.body.rawContent
          : typeof req.body?.content === 'string'
            ? Buffer.from(req.body.content, 'base64').toString('utf-8')
            : '';
      const message = clampStr(req.body?.message, 160, `Update ${filepath}`);
      const result = await writeForgejoFile(
        req.params.repo,
        filepath,
        rawContent,
        message,
        currentUser.displayName
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Write failed' });
    }
  });

  app.delete('/api/v1/repos/school76/:repo/contents/*', requireAuth, (req, res) => {
    try {
      const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
      const filepath = (req.params as Record<string, string>)[0] || '';
      deleteForgejoFile(req.params.repo, filepath, currentUser.displayName);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Delete failed' });
    }
  });

  app.get('/api/v1/repos/school76/:repo/commits', (req, res) => {
    try {
      res.json({ commits: getForgejoCommits(req.params.repo) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Commits error' });
    }
  });

  app.post('/api/wiki/:repo/ingest', requireAuth, async (req, res) => {
    try {
      const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
      const title = clampStr(req.body?.title, 120);
      const rawContent = typeof req.body?.rawContent === 'string' ? req.body.rawContent.slice(0, 15000) : '';
      const cat =
        req.body?.category === 'subsystems' || req.body?.category === 'sources'
          ? req.body.category
          : 'concepts';
      if (!title || !rawContent.trim()) {
        res.status(400).json({ error: 'Укажите заголовок и исходный текст для индексации в llm-wiki' });
        return;
      }
      const result = await ingestSourceToWiki(
        req.params.repo,
        title,
        rawContent,
        cat,
        currentUser.displayName
      );
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Ingest failed' });
    }
  });

  app.post('/api/wiki/:repo/lint', requireAuth, async (req, res) => {
    try {
      const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
      const result = await lintForgejoWiki(req.params.repo, currentUser.displayName);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Lint failed' });
    }
  });

  // ==========================
  // GARAGE S3 OBJECT STORAGE ROUTES
  // ==========================
  app.get('/api/s3/:bucket', async (req, res) => {
    try {
      const objects = await listGarageObjects(req.params.bucket);
      res.json({ bucket: req.params.bucket, objects });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'S3 list error' });
    }
  });

  app.put('/api/s3/:bucket/:key', requireAuth, async (req, res) => {
    try {
      const currentUser = (req as express.Request & { currentUser: StoredUser }).currentUser;
      const base64Data = typeof req.body?.base64 === 'string' ? req.body.base64 : '';
      const contentType = clampStr(req.body?.contentType, 80, 'application/octet-stream');
      if (!base64Data) {
        res.status(400).json({ error: 'Файл пуст' });
        return;
      }
      const cleanB64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buf = Buffer.from(cleanB64, 'base64');
      if (buf.length > 8 * 1024 * 1024) {
        res.status(413).json({ error: 'Максимальный размер файла в Garage S3 — 8 МБ' });
        return;
      }
      const record = await putGarageObject(
        req.params.bucket,
        req.params.key,
        buf,
        contentType,
        currentUser.displayName
      );
      res.status(201).json({ object: record });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'S3 upload failed' });
    }
  });

  app.get('/api/s3/:bucket/:key', async (req, res) => {
    try {
      const obj = await getGarageObject(req.params.bucket, req.params.key);
      if (!obj) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      res.setHeader('Content-Type', obj.contentType);
      if (obj.etag) res.setHeader('ETag', obj.etag);
      res.send(obj.buffer);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'S3 get failed' });
    }
  });

  app.delete('/api/s3/:bucket/:key', requireAuth, async (req, res) => {
    try {
      const deleted = await deleteGarageObject(req.params.bucket, req.params.key);
      res.json({ ok: deleted });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'S3 delete failed' });
    }
  });

  // ==========================
  // WEBSOCKET REAL-TIME COLLABORATION
  // ==========================
  wss.on('connection', (ws) => {
    const clientId = `eng-${Math.random().toString(36).slice(2, 9)}`;
    const defaultPresence: TeamPresence = {
      clientId,
      name: 'Гость-инженер',
      role: 'Наблюдатель',
      subsystem: 'OBC',
      activeTab: 'projects',
      joinedAt: new Date().toISOString(),
    };
    clients.set(ws, defaultPresence);

    const initPayload: WsServerEvent = {
      type: 'init:state',
      payload: {
        tasks: state.tasks,
        messages: state.messages,
        programs: state.programs,
        users: state.users.map(stripUserSecrets),
        projects: state.projects,
        posts: state.posts,
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
              activeTab: clampStr(p.activeTab, 32, 'projects'),
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
              projectId: clampStr(p.projectId, 64, 'school76-1u') || 'school76-1u',
              title,
              description: clampStr(p.description, 2000),
              subsystem: VALID_SUBSYSTEMS.has(p.subsystem) ? p.subsystem : 'OBC',
              status: VALID_STATUSES.has(p.status) ? p.status : 'backlog',
              priority: VALID_PRIORITIES.has(p.priority) ? p.priority : 'medium',
              assignee: clampStr(p.assignee, 64, 'Не назначен') || 'Не назначен',
              linkedProgramId: clampStr(p.linkedProgramId, 80) || undefined,
              linkedChannel: p.linkedChannel && VALID_CHANNELS.has(p.linkedChannel) ? p.linkedChannel : undefined,
              startDate: clampStr(p.startDate, 20) || now.slice(0, 10),
              dueDate: clampStr(p.dueDate, 20) || undefined,
              progressPct:
                typeof p.progressPct === 'number' ? Math.max(0, Math.min(100, p.progressPct)) : 0,
              dependsOn: Array.isArray(p.dependsOn) ? p.dependsOn.slice(0, 5) : undefined,
              checklist: Array.isArray(p.checklist) ? p.checklist.slice(0, 20) : [],
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
            const nextStatus =
              patch.status && VALID_STATUSES.has(patch.status) ? patch.status : existing.status;
            const autoProgress =
              patch.progressPct !== undefined
                ? Math.max(0, Math.min(100, patch.progressPct))
                : patch.status === 'done'
                  ? 100
                  : existing.progressPct;
            const updated: CubeSatTask = {
              ...existing,
              title: patch.title !== undefined ? clampStr(patch.title, 140, existing.title) : existing.title,
              description:
                patch.description !== undefined
                  ? clampStr(patch.description, 2000, existing.description)
                  : existing.description,
              subsystem:
                patch.subsystem && VALID_SUBSYSTEMS.has(patch.subsystem) ? patch.subsystem : existing.subsystem,
              status: nextStatus,
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
              startDate:
                patch.startDate !== undefined ? clampStr(patch.startDate, 20) || undefined : existing.startDate,
              dueDate:
                patch.dueDate !== undefined ? clampStr(patch.dueDate, 20) || undefined : existing.dueDate,
              progressPct: autoProgress,
              checklist: Array.isArray(patch.checklist) ? patch.checklist.slice(0, 25) : existing.checklist,
              dependsOn: Array.isArray(patch.dependsOn) ? patch.dependsOn.slice(0, 5) : existing.dependsOn,
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
            const id =
              p.id && /^[a-zA-Z0-9_-]{4,64}$/.test(p.id)
                ? p.id
                : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            if (state.messages.some((m) => m.id === id)) return;
            const message: ChatMessage = {
              id,
              projectId: clampStr(p.projectId, 64, 'school76-1u') || 'school76-1u',
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
              projectId: clampStr(p.projectId, 64, 'school76-1u') || 'school76-1u',
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
