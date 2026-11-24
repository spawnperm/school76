export type Subsystem = 'OBC' | 'EPS' | 'ADCS' | 'COMMS' | 'PAYLOAD' | 'GROUND';

export type TaskStatus = 'backlog' | 'in_progress' | 'review' | 'done';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type ChatChannelId =
  | 'general'
  | 'obc-firmware'
  | 'eps-power'
  | 'adcs-attitude'
  | 'comms-rf'
  | 'payload';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface CubeSatTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  subsystem: Subsystem;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  linkedProgramId?: string;
  linkedChannel?: ChatChannelId;
  startDate?: string;
  dueDate?: string;
  progressPct?: number;
  dependsOn?: string[];
  checklist?: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatCodeSnippet {
  lang: 'python' | 'cpp';
  code: string;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  channel: ChatChannelId;
  author: string;
  authorRole: string;
  text: string;
  taskRefId?: string;
  programRefId?: string;
  codeSnippet?: ChatCodeSnippet;
  createdAt: string;
}

export type TargetBoard =
  | 'CyberPi / ESP32 (MicroPython)'
  | 'STM32F4 OBC (Arduino C++)';

export interface ProgramVersion {
  id: string;
  author: string;
  note: string;
  workspaceJson: Record<string, unknown>;
  pythonCode: string;
  cppCode: string;
  savedAt: string;
}

export interface OnboardProgram {
  id: string;
  projectId?: string;
  name: string;
  subsystem: Subsystem;
  targetBoard: TargetBoard;
  author: string;
  description: string;
  workspaceJson: Record<string, unknown>;
  pythonCode: string;
  cppCode: string;
  versions?: ProgramVersion[];
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  role: string;
  subsystem: Subsystem;
  bio: string;
  skills: string[];
  followers: string[];
  following: string[];
  joinedProjectIds: string[];
  createdAt: string;
}

export interface CommunityProject {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  ownerId: string;
  memberIds: string[];
  forgejoRepo: string;
  s3Bucket: string;
  createdAt: string;
}

export interface SocialComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface SocialPost {
  id: string;
  projectId?: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorRole: string;
  text: string;
  mediaUrls: string[];
  likes: string[];
  comments: SocialComment[];
  createdAt: string;
}

export interface ForgejoFileEntry {
  path: string;
  name: string;
  sha: string;
  size: number;
  updatedAt: string;
}

export interface ForgejoCommit {
  sha: string;
  message: string;
  author: string;
  path: string;
  timestamp: string;
}

export interface GarageObjectMeta {
  key: string;
  bucket: string;
  size: number;
  contentType: string;
  etag: string;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
}

export interface TeamPresence {
  clientId: string;
  name: string;
  role: string;
  subsystem: Subsystem;
  activeTab: string;
  joinedAt: string;
}

export interface MissionSnapshot {
  tasks: CubeSatTask[];
  messages: ChatMessage[];
  programs: OnboardProgram[];
  users: UserProfile[];
  projects: CommunityProject[];
  posts: SocialPost[];
  presence: TeamPresence[];
}

export type WsClientEvent =
  | { type: 'presence:join'; payload: { name: string; role: string; subsystem: Subsystem; activeTab: string } }
  | { type: 'task:create'; payload: Omit<CubeSatTask, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } }
  | { type: 'task:update'; payload: { id: string; patch: Partial<Omit<CubeSatTask, 'id' | 'createdAt'>> } }
  | { type: 'task:delete'; payload: { id: string } }
  | { type: 'chat:send'; payload: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string } }
  | { type: 'program:save'; payload: Omit<OnboardProgram, 'updatedAt' | 'versions'> & { saveNote?: string } }
  | { type: 'program:update_version_note'; payload: { programId: string; versionId: string; note: string } }
  | { type: 'program:delete'; payload: { id: string } };

export type WsServerEvent =
  | { type: 'init:state'; payload: MissionSnapshot }
  | { type: 'presence:update'; payload: TeamPresence[] }
  | { type: 'task:created'; payload: CubeSatTask }
  | { type: 'task:updated'; payload: CubeSatTask }
  | { type: 'task:deleted'; payload: { id: string } }
  | { type: 'chat:message'; payload: ChatMessage }
  | { type: 'program:saved'; payload: OnboardProgram }
  | { type: 'program:deleted'; payload: { id: string } }
  | { type: 'social:sync'; payload: { users: UserProfile[]; projects: CommunityProject[]; posts: SocialPost[] } }
  | { type: 'error'; payload: { message: string } };

export const SUBSYSTEM_LABELS: Record<Subsystem, string> = {
  OBC: 'OBC · Бортовой компьютер',
  EPS: 'EPS · Энергопитание',
  ADCS: 'ADCS · Ориентация',
  COMMS: 'COMMS · Радиосвязь',
  PAYLOAD: 'PAYLOAD · Нагрузка',
  GROUND: 'GROUND · Наземный сегмент',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Бэклог',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Готово',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критичный',
};

export const CHAT_CHANNELS: { id: ChatChannelId; title: string; topic: string }[] = [
  { id: 'general', title: 'general', topic: 'Общая координация миссии и сообщества' },
  { id: 'obc-firmware', title: 'obc-firmware', topic: 'Прошивка OBC, FreeRTOS и mBlock-логика' },
  { id: 'eps-power', title: 'eps-power', topic: 'Энергобюджет, MPPT, АКБ Li-Ion и шины питания' },
  { id: 'adcs-attitude', title: 'adcs-attitude', topic: 'IMU, датчики Солнца и демпфирование B-dot' },
  { id: 'comms-rf', title: 'comms-rf', topic: 'UHF 435.800 МГц, AX.25 маяк и антенны' },
  { id: 'payload', title: 'payload', topic: 'Камера ДЗЗ и дозиметрический модуль' },
];
