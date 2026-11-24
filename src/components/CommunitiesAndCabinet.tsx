import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Cpu,
  GitBranch,
  Heart,
  Image as ImageIcon,
  ListChecks,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  ChatChannelId,
  CommunityProject,
  CubeSatTask,
  GarageObjectMeta,
  OnboardProgram,
  SocialPost,
  Subsystem,
  UserProfile,
} from '../types/cubesat.ts';
import { SUBSYSTEM_LABELS } from '../types/cubesat.ts';
import { HardwareBench } from './HardwareBench.tsx';
import { CubeSat3DViewer } from './CubeSat3DViewer.tsx';

function isSafeImageSrc(src: string): boolean {
  return src.startsWith('/api/s3/') || src.startsWith('https://');
}

function renderSafePostText(
  text: string,
  onOpenWikiLink?: (target: string) => void
): React.ReactNode[] {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return parts.map((part, idx) => {
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const inner = part.slice(2, -2);
      const [target, alias] = inner.split('|');
      const cleanTarget = target.trim().replace(/\.md$/, '');
      if (onOpenWikiLink) {
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onOpenWikiLink(`${cleanTarget}.md`)}
            className="font-mono text-xs text-sky-700 bg-sky-50 hover:bg-sky-100 px-1.5 py-0.5 rounded transition-colors"
          >
            {alias || cleanTarget}
          </button>
        );
      }
      return (
        <span key={idx} className="font-mono text-xs text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
          {alias || cleanTarget}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

// ==========================================
// AUTH MODAL (SIGN IN & REGISTER)
// ==========================================
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<UserProfile>;
  onRegister: (payload: {
    username: string;
    displayName: string;
    password: string;
    role: string;
    subsystem: Subsystem;
    bio?: string;
  }) => Promise<UserProfile>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onRegister,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('Инженер-разработчик');
  const [subsystem, setSubsystem] = useState<Subsystem>('OBC');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await onLogin(username.trim(), password);
      } else {
        await onRegister({
          username: username.trim(),
          displayName: displayName.trim(),
          password,
          role: role.trim() || 'Инженер-разработчик',
          subsystem,
          bio: bio.trim(),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка авторизации');
    } finally {
      setSubmitting(false);
    }
  };

  const quickFillDemo = (demoUser: string) => {
    setMode('login');
    setUsername(demoUser);
    setPassword('school76');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            Личный кабинет инженера school76
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4 flex gap-4 border-b border-slate-200 text-sm">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`pb-2.5 font-medium border-b-2 transition-colors ${
              mode === 'login'
                ? 'border-sky-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Вход в аккаунт
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`pb-2.5 font-medium border-b-2 transition-colors ${
              mode === 'register'
                ? 'border-sky-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Логин (латиница, цифры, _ или -)
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="artem"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Имя и фамилия
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Артём Соколов"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Инженерная роль
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Подсистема
                  </label>
                  <select
                    value={subsystem}
                    onChange={(e) => setSubsystem(e.target.value as Subsystem)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    {(Object.keys(SUBSYSTEM_LABELS) as Subsystem[]).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  О себе и специализация
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="STM32, MicroPython, энергобюджет 1U..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Пароль
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {mode === 'login' && (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
              <div className="text-[11px] text-slate-500">
                Быстрый вход для проверки (пароль <span className="font-mono text-slate-700">school76</span>):
              </div>
              <div className="flex flex-wrap gap-2">
                {['artem', 'maria', 'dmitry'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => quickFillDemo(u)}
                    className="px-2.5 py-1 text-xs font-mono text-sky-700 bg-white border border-slate-200 rounded hover:border-sky-400 transition-colors"
                  >
                    @{u}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
            >
              {submitting
                ? 'Выполняется...'
                : mode === 'login'
                  ? 'Войти'
                  : 'Создать аккаунт'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// SHARED POST CARD & COMPOSER
// ==========================================
interface SocialPostCardProps {
  post: SocialPost;
  projectName?: string;
  currentUserId: string | null;
  onToggleLike: (postId: string) => Promise<void>;
  onComment: (postId: string, text: string) => Promise<void>;
  onRequireAuth: () => void;
  onOpenWikiLink?: (target: string) => void;
}

const SocialPostCard: React.FC<SocialPostCardProps> = ({
  post,
  projectName,
  currentUserId,
  onToggleLike,
  onComment,
  onRequireAuth,
  onOpenWikiLink,
}) => {
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const isLiked = currentUserId ? post.likes.includes(currentUserId) : false;
  const dateStr = new Date(post.createdAt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      onRequireAuth();
      return;
    }
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      await onComment(post.id, commentText.trim());
      setCommentText('');
    } finally {
      setSendingComment(false);
    }
  };

  return (
    <article className="bg-white border border-slate-200 rounded-lg p-5 space-y-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-900">{post.authorName}</span>
          <span className="text-xs font-mono text-slate-500">{post.authorHandle}</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="text-xs text-slate-500">{post.authorRole}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {projectName && <span className="text-sky-700 font-medium">{projectName}</span>}
          <span className="font-mono tabular-nums">{dateStr}</span>
        </div>
      </div>

      {post.text && (
        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
          {renderSafePostText(post.text, onOpenWikiLink)}
        </p>
      )}

      {post.mediaUrls.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {post.mediaUrls.filter(isSafeImageSrc).map((url, idx) => (
            <div
              key={`${post.id}-media-${idx}`}
              className="border border-slate-200 rounded-md overflow-hidden bg-slate-50"
            >
              <img
                src={url}
                alt={`Вложение сообщества от ${post.authorName}`}
                className="w-full max-h-72 object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-5 pt-2 border-t border-slate-100 text-xs text-slate-600">
        <button
          type="button"
          onClick={() => {
            if (!currentUserId) {
              onRequireAuth();
              return;
            }
            onToggleLike(post.id);
          }}
          className={`inline-flex items-center gap-1.5 font-medium transition-colors ${
            isLiked ? 'text-rose-600' : 'text-slate-600 hover:text-rose-600'
          }`}
        >
          <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-600' : ''}`} />
          <span className="font-mono tabular-nums">{post.likes.length}</span>
        </button>

        <span className="inline-flex items-center gap-1.5 text-slate-500">
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="font-mono tabular-nums">{post.comments.length}</span>
        </span>
      </div>

      {post.comments.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          {post.comments.map((c) => (
            <div key={c.id} className="text-xs bg-slate-50 rounded-md px-3 py-2 space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-slate-800">{c.authorName}</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {new Date(c.createdAt).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-slate-700">{c.text}</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={
            currentUserId
              ? 'Добавить комментарий...'
              : 'Войдите, чтобы оставить комментарий...'
          }
          className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button
          type="submit"
          disabled={sendingComment}
          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
        >
          Ответить
        </button>
      </form>
    </article>
  );
};

interface PostComposerProps {
  projectId?: string;
  s3Bucket: string;
  isAuthenticated: boolean;
  authFetch: (url: string, options?: RequestInit) => Promise<any>;
  onCreatePost: (payload: { text: string; projectId?: string; mediaUrls?: string[] }) => Promise<SocialPost>;
  onRequireAuth: () => void;
  placeholder?: string;
}

const PostComposer: React.FC<PostComposerProps> = ({
  projectId,
  s3Bucket,
  isAuthenticated,
  authFetch,
  onCreatePost,
  onRequireAuth,
  placeholder = 'Поделитесь ходом работ, схемой или заметкой [[subsystems/obc]]...',
}) => {
  const [text, setText] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [showS3Picker, setShowS3Picker] = useState(false);
  const [s3Objects, setS3Objects] = useState<GarageObjectMeta[]>([]);
  const [loadingS3, setLoadingS3] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadS3 = async () => {
    setLoadingS3(true);
    try {
      const res = await fetch(`/api/s3/${encodeURIComponent(s3Bucket)}`);
      if (res.ok) {
        const data = await res.json();
        setS3Objects(
          (data.objects || []).filter((o: GarageObjectMeta) =>
            o.contentType.startsWith('image/')
          )
        );
      }
    } finally {
      setLoadingS3(false);
    }
  };

  const handleTogglePicker = () => {
    const next = !showS3Picker;
    setShowS3Picker(next);
    if (next) loadS3();
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.readAsDataURL(file);
      });
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const res = await authFetch(
        `/api/s3/${encodeURIComponent(s3Bucket)}/${encodeURIComponent(safeName)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            base64Data,
            contentType: file.type || 'image/png',
          }),
        }
      );
      if (res.object?.url) {
        setSelectedMedia((prev) =>
          prev.includes(res.object.url) ? prev : [...prev, res.object.url].slice(0, 4)
        );
        loadS3();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки в Garage S3');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    if (!text.trim() && selectedMedia.length === 0) return;
    setPublishing(true);
    setError(null);
    try {
      await onCreatePost({
        text: text.trim(),
        projectId,
        mediaUrls: selectedMedia,
      });
      setText('');
      setSelectedMedia([]);
      setShowS3Picker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось опубликовать запись');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
    >
      {error && (
        <div className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded">
          {error}
        </div>
      )}

      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
      />

      {selectedMedia.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedMedia.map((url) => (
            <div
              key={url}
              className="relative w-20 h-20 border border-slate-200 rounded overflow-hidden bg-slate-50"
            >
              <img src={url} alt="Превью медиа" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setSelectedMedia((prev) => prev.filter((u) => u !== url))}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/75 text-white flex items-center justify-center"
                aria-label="Удалить вложение"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showS3Picker && (
        <div className="border border-slate-200 rounded-md p-3 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Выберите изображение из Garage S3 ({s3Bucket})</span>
            <label className="inline-flex items-center gap-1 text-sky-700 font-medium cursor-pointer hover:underline">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Загрузка...' : 'Загрузить файл'}
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadImage}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
          {loadingS3 ? (
            <div className="text-xs text-slate-500 py-2">Чтение бакета Garage S3...</div>
          ) : s3Objects.length === 0 ? (
            <div className="text-xs text-slate-500 py-2">В бакете пока нет изображений.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {s3Objects.map((obj) => {
                const chosen = selectedMedia.includes(obj.url);
                return (
                  <button
                    key={obj.key}
                    type="button"
                    onClick={() =>
                      setSelectedMedia((prev) =>
                        chosen
                          ? prev.filter((u) => u !== obj.url)
                          : [...prev, obj.url].slice(0, 4)
                      )
                    }
                    className={`w-16 h-16 rounded border overflow-hidden transition-all ${
                      chosen ? 'border-sky-600 ring-2 ring-sky-200' : 'border-slate-200'
                    }`}
                    title={obj.key}
                  >
                    <img src={obj.url} alt={obj.key} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleTogglePicker}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100"
        >
          <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
          Медиа из Garage S3
        </button>

        <button
          type="submit"
          disabled={publishing}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          {publishing ? 'Публикация...' : 'Опубликовать'}
        </button>
      </div>
    </form>
  );
};

// ==========================================
// TEAM PROJECTS (SOCIAL COMMUNITIES) VIEW
// ==========================================
interface ProjectsViewProps {
  projects: CommunityProject[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  users: UserProfile[];
  currentUser: UserProfile | null;
  posts: SocialPost[];
  tasks: CubeSatTask[];
  programs: OnboardProgram[];
  authFetch: (url: string, options?: RequestInit) => Promise<any>;
  onCreateProject: (payload: {
    name: string;
    slug: string;
    description: string;
    category: string;
    tags: string[];
  }) => Promise<CommunityProject>;
  onToggleJoinProject: (projectId: string) => Promise<void>;
  onToggleFollow: (userId: string) => Promise<void>;
  onCreatePost: (payload: { text: string; projectId?: string; mediaUrls?: string[] }) => Promise<SocialPost>;
  onToggleLikePost: (postId: string) => Promise<void>;
  onCommentPost: (postId: string, text: string) => Promise<void>;
  onRequireAuth: () => void;
  onNavigateTab: (tab: 'tasks' | 'wiki' | 'mblock' | 'chat') => void;
  onOpenProgram: (programId: string) => void;
  onOpenChannel: (channel: ChatChannelId) => void;
  onOpenWikiDoc: (docPath: string) => void;
  onOpenGitHubSync: () => void;
  onOpenSubsystemTasks: (subsystem: Subsystem) => void;
  onOpenSubsystemMBlock: (subsystem: Subsystem) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  users,
  currentUser,
  posts,
  tasks,
  programs,
  authFetch,
  onCreateProject,
  onToggleJoinProject,
  onToggleFollow,
  onCreatePost,
  onToggleLikePost,
  onCommentPost,
  onRequireAuth,
  onNavigateTab,
  onOpenProgram,
  onOpenChannel,
  onOpenWikiDoc,
  onOpenGitHubSync,
  onOpenSubsystemTasks,
  onOpenSubsystemMBlock,
}) => {
  const [communityTab, setCommunityTab] = useState<'wall' | 'members' | 'bench'>('wall');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newCategory, setNewCategory] = useState('Космический аппарат');
  const [newDescription, setNewDescription] = useState('');
  const [newTags, setNewTags] = useState('CubeSat, mBlock, Telemetry');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  const projectTasks = useMemo(
    () =>
      tasks.filter(
        (t) => (t.projectId || 'school76-1u') === (activeProject?.id || 'school76-1u')
      ),
    [tasks, activeProject?.id]
  );

  const projectPosts = useMemo(
    () => posts.filter((p) => p.projectId === activeProject?.id),
    [posts, activeProject?.id]
  );

  const projectMembers = useMemo(
    () =>
      activeProject
        ? users.filter((u) => activeProject.memberIds.includes(u.id))
        : [],
    [users, activeProject]
  );

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await onCreateProject({
        name: newName.trim(),
        slug:
          newSlug.trim() ||
          newName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
        description: newDescription.trim(),
        category: newCategory.trim() || 'Инженерный проект',
        tags: newTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onSelectProject(created.id);
      setShowCreateModal(false);
      setNewName('');
      setNewSlug('');
      setNewDescription('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Ошибка создания проекта');
    } finally {
      setCreating(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-10 text-sm text-slate-500">
        Загрузка командных проектов...
      </div>
    );
  }

  const isMember = currentUser ? activeProject.memberIds.includes(currentUser.id) : false;
  const isOwner = currentUser ? activeProject.ownerId === currentUser.id : false;

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">
      {/* Header + Create Community Project */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Командные проекты и сообщества
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Создавайте инженерные проекты, вступайте в команды и переходите к задачам, базе знаний Forgejo llm-wiki и стенду 1U.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenGitHubSync}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            <GitBranch className="w-4 h-4 text-slate-600" />
            Зафиксировать на GitHub
          </button>
          <button
            type="button"
            onClick={() => {
              if (!currentUser) {
                onRequireAuth();
                return;
              }
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Создать проект
          </button>
        </div>
      </div>

      {/* Interactive 3D CubeSat Twin colored by subsystem task readiness */}
      <CubeSat3DViewer
        projectName={activeProject.name}
        tasks={projectTasks}
        onOpenSubsystemTasks={onOpenSubsystemTasks}
        onOpenSubsystemMBlock={onOpenSubsystemMBlock}
      />

      {/* Directory Grid of Team Projects */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((proj) => {
          const isSelected = proj.id === activeProject.id;
          const projTasks = tasks.filter((t) => (t.projectId || 'school76-1u') === proj.id);
          const doneCount = projTasks.filter((t) => t.status === 'done').length;
          const pct = projTasks.length > 0 ? Math.round((doneCount / projTasks.length) * 100) : 0;
          const joined = currentUser ? proj.memberIds.includes(currentUser.id) : false;
          const owner = proj.ownerId === currentUser?.id;

          return (
            <div
              key={proj.id}
              className={`bg-white border rounded-lg p-5 flex flex-col justify-between gap-4 transition-colors ${
                isSelected ? 'border-sky-600 ring-1 ring-sky-600/20' : 'border-slate-200'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-sky-700">{proj.category}</div>
                    <h2 className="text-base font-bold text-slate-900 truncate">{proj.name}</h2>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-slate-500 shrink-0">
                    {pct}%
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                  {proj.description}
                </p>

                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                  <span className="font-mono tabular-nums">
                    Участников: {proj.memberIds.length}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="font-mono tabular-nums">
                    Задач: {doneCount}/{projTasks.length}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="font-mono truncate">Forgejo: {proj.forgejoRepo}</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => onSelectProject(proj.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    isSelected
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  {isSelected ? 'Активный проект' : 'Открыть'}
                </button>

                {owner ? (
                  <span className="text-xs text-slate-400">Вы создатель</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser) {
                        onRequireAuth();
                        return;
                      }
                      onToggleJoinProject(proj.id);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      joined
                        ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                        : 'text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100'
                    }`}
                  >
                    {joined ? 'Покинуть' : 'Вступить'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Community Workspace */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{activeProject.category}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">school76/{activeProject.forgejoRepo}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">s3://{activeProject.s3Bucket}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 truncate">
              Сообщество «{activeProject.name}»
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab('tasks')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100"
            >
              <ListChecks className="w-3.5 h-3.5 text-sky-600" />
              Задачи ({projectTasks.length})
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('wiki')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100"
            >
              <BookOpen className="w-3.5 h-3.5 text-sky-600" />
              База знаний
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('mblock')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100"
            >
              <Cpu className="w-3.5 h-3.5 text-sky-600" />
              mBlock ПО
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('chat')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100"
            >
              <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
              Техчат
            </button>

            {!isOwner && (
              <button
                type="button"
                onClick={() => {
                  if (!currentUser) {
                    onRequireAuth();
                    return;
                  }
                  onToggleJoinProject(activeProject.id);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  isMember
                    ? 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                    : 'text-white bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {isMember ? 'Вы в команде' : 'Присоединиться'}
              </button>
            )}
          </div>
        </div>

        {/* Sub-tabs inside Selected Community */}
        <div className="px-6 border-b border-slate-200 bg-slate-50 flex items-center gap-6 text-xs font-medium">
          <button
            type="button"
            onClick={() => setCommunityTab('wall')}
            className={`py-3 border-b-2 transition-colors ${
              communityTab === 'wall'
                ? 'border-sky-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Стена сообщества ({projectPosts.length})
          </button>
          <button
            type="button"
            onClick={() => setCommunityTab('members')}
            className={`py-3 border-b-2 transition-colors ${
              communityTab === 'members'
                ? 'border-sky-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Участники ({projectMembers.length})
          </button>
          <button
            type="button"
            onClick={() => setCommunityTab('bench')}
            className={`py-3 border-b-2 transition-colors ${
              communityTab === 'bench'
                ? 'border-sky-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Стенд 1U и подсистемы
          </button>
        </div>

        {communityTab === 'wall' && (
          <div className="p-6 bg-slate-50/60 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-4">
              <PostComposer
                projectId={activeProject.id}
                s3Bucket={activeProject.s3Bucket}
                isAuthenticated={Boolean(currentUser)}
                authFetch={authFetch}
                onCreatePost={onCreatePost}
                onRequireAuth={onRequireAuth}
                placeholder={`Написать на стену проекта «${activeProject.name}»... Поддерживаются ссылки [[subsystems/obc]]`}
              />

              {projectPosts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
                  На стене сообщества пока нет записей. Опубликуйте первую новость или схему из Garage S3.
                </div>
              ) : (
                projectPosts.map((post) => (
                  <SocialPostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUser?.id || null}
                    onToggleLike={onToggleLikePost}
                    onComment={onCommentPost}
                    onRequireAuth={onRequireAuth}
                    onOpenWikiLink={onOpenWikiDoc}
                  />
                ))
              )}
            </div>

            <aside className="lg:col-span-4 space-y-4">
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">О проекте</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {activeProject.description}
                </p>
                {activeProject.tags.length > 0 && (
                  <div className="text-xs font-mono text-slate-500 pt-1">
                    {activeProject.tags.join(' · ')}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Команда</h3>
                  <button
                    type="button"
                    onClick={() => setCommunityTab('members')}
                    className="text-xs text-sky-700 hover:underline"
                  >
                    Все ({projectMembers.length})
                  </button>
                </div>
                <div className="space-y-2.5">
                  {projectMembers.slice(0, 5).map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">
                          {member.displayName}
                        </div>
                        <div className="text-slate-500 truncate">
                          {member.subsystem} · {member.role}
                        </div>
                      </div>
                      <span className="font-mono text-slate-400 shrink-0">@{member.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}

        {communityTab === 'members' && (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectMembers.map((member) => {
              const isSelf = currentUser?.id === member.id;
              const isFollowing = currentUser ? currentUser.following.includes(member.id) : false;
              return (
                <div
                  key={member.id}
                  className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {member.displayName}
                      </span>
                      <span className="font-mono text-xs text-slate-400">@{member.username}</span>
                    </div>
                    <div className="text-xs text-sky-700 font-medium">
                      {member.subsystem} · {member.role}
                    </div>
                    {member.bio && (
                      <p className="text-xs text-slate-600 leading-relaxed">{member.bio}</p>
                    )}
                    {member.skills.length > 0 && (
                      <div className="text-[11px] font-mono text-slate-500 pt-1">
                        {member.skills.join(' · ')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500 font-mono tabular-nums">
                      Подписчиков: {member.followers.length}
                    </span>
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!currentUser) {
                            onRequireAuth();
                            return;
                          }
                          onToggleFollow(member.id);
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-medium transition-colors ${
                          isFollowing
                            ? 'text-slate-700 border-slate-200 bg-slate-50'
                            : 'text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100'
                        }`}
                      >
                        {isFollowing ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            Вы подписаны
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3.5 h-3.5" />
                            Подписаться
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {communityTab === 'bench' && (
          <HardwareBench
            tasks={projectTasks}
            programs={programs}
            onGoToTasks={() => onNavigateTab('tasks')}
            onOpenProgram={onOpenProgram}
            onOpenChannel={onOpenChannel}
          />
        )}
      </section>

      {/* Create Community Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Новый командный проект</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded">
                {createError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Название проекта / сообщества
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Например: Стратосферный зонд School76-B2"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Slug репозитория Forgejo
                  </label>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="strato-b2"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Категория
                  </label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Описание миссии и целей
                </label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Кратко опишите задачи команды и используемые подсистемы..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Теги (через запятую)
                </label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
              >
                {creating ? 'Создание...' : 'Создать проект и llm-wiki'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// ==========================================
// PERSONAL USER CABINET & SOCIAL NETWORK
// ==========================================
interface CabinetViewProps {
  currentUser: UserProfile | null;
  users: UserProfile[];
  projects: CommunityProject[];
  posts: SocialPost[];
  activeProjectId: string;
  authFetch: (url: string, options?: RequestInit) => Promise<any>;
  onLogin: (username: string, password: string) => Promise<UserProfile>;
  onRegister: (payload: {
    username: string;
    displayName: string;
    password: string;
    role: string;
    subsystem: Subsystem;
    bio?: string;
  }) => Promise<UserProfile>;
  onLogout: () => void;
  onUpdateProfile: (
    patch: Partial<Pick<UserProfile, 'displayName' | 'role' | 'subsystem' | 'bio' | 'skills'>>
  ) => Promise<UserProfile>;
  onToggleFollow: (userId: string) => Promise<void>;
  onToggleJoinProject: (projectId: string) => Promise<void>;
  onSelectProject: (projectId: string) => void;
  onCreatePost: (payload: { text: string; projectId?: string; mediaUrls?: string[] }) => Promise<SocialPost>;
  onToggleLikePost: (postId: string) => Promise<void>;
  onCommentPost: (postId: string, text: string) => Promise<void>;
  onOpenAuthModal: () => void;
  onOpenProjectWorkspace: (projectId: string, tab: 'projects' | 'tasks' | 'wiki') => void;
  onOpenWikiDoc: (docPath: string) => void;
}

export const CabinetView: React.FC<CabinetViewProps> = ({
  currentUser,
  users,
  projects,
  posts,
  activeProjectId,
  authFetch,
  onLogout,
  onUpdateProfile,
  onToggleFollow,
  onSelectProject,
  onCreatePost,
  onToggleLikePost,
  onCommentPost,
  onOpenAuthModal,
  onOpenProjectWorkspace,
  onOpenWikiDoc,
}) => {
  const [cabinetTab, setCabinetTab] = useState<'feed' | 'projects' | 'network'>('feed');
  const [feedFilter, setFeedFilter] = useState<'all' | 'following' | 'mine'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);

  const [editDisplayName, setEditDisplayName] = useState(currentUser?.displayName || '');
  const [editRole, setEditRole] = useState(currentUser?.role || '');
  const [editSubsystem, setEditSubsystem] = useState<Subsystem>(currentUser?.subsystem || 'OBC');
  const [editBio, setEditBio] = useState(currentUser?.bio || '');
  const [editSkills, setEditSkills] = useState((currentUser?.skills || []).join(', '));
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setEditDisplayName(currentUser.displayName);
      setEditRole(currentUser.role);
      setEditSubsystem(currentUser.subsystem);
      setEditBio(currentUser.bio);
      setEditSkills(currentUser.skills.join(', '));
    }
  }, [currentUser]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await onUpdateProfile({
        displayName: editDisplayName.trim(),
        role: editRole.trim(),
        subsystem: editSubsystem,
        bio: editBio.trim(),
        skills: editSkills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  };

  const filteredPosts = useMemo(() => {
    if (!currentUser || feedFilter === 'all') return posts;
    if (feedFilter === 'mine') return posts.filter((p) => p.authorId === currentUser.id);
    return posts.filter(
      (p) => p.authorId === currentUser.id || currentUser.following.includes(p.authorId)
    );
  }, [posts, currentUser, feedFilter]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.subsystem.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const myProjects = useMemo(
    () =>
      currentUser
        ? projects.filter((p) => currentUser.joinedProjectIds.includes(p.id))
        : [],
    [projects, currentUser]
  );

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: User Profile or Sign-In Callout */}
      <aside className="lg:col-span-4 space-y-4">
        {currentUser ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            {!editingProfile ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">
                      {currentUser.displayName}
                    </h1>
                    <div className="text-xs font-mono text-slate-500">
                      @{currentUser.username} · {currentUser.subsystem}
                    </div>
                    <div className="text-xs text-sky-700 font-medium mt-1">
                      {currentUser.role}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Изменить
                  </button>
                </div>

                {currentUser.bio && (
                  <p className="text-xs text-slate-600 leading-relaxed">{currentUser.bio}</p>
                )}

                {currentUser.skills.length > 0 && (
                  <div className="text-xs font-mono text-slate-500">
                    {currentUser.skills.join(' · ')}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-center">
                  <div>
                    <div className="text-lg font-mono font-bold tabular-nums text-slate-900">
                      {currentUser.followers.length}
                    </div>
                    <div className="text-[11px] text-slate-500">Подписчики</div>
                  </div>
                  <div>
                    <div className="text-lg font-mono font-bold tabular-nums text-slate-900">
                      {currentUser.following.length}
                    </div>
                    <div className="text-[11px] text-slate-500">Подписки</div>
                  </div>
                  <div>
                    <div className="text-lg font-mono font-bold tabular-nums text-slate-900">
                      {myProjects.length}
                    </div>
                    <div className="text-[11px] text-slate-500">Проекты</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">
                    Сессия активна
                  </span>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Выйти
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Редактирование профиля</h2>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(false)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Отмена
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Имя</label>
                  <input
                    type="text"
                    required
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Роль</label>
                    <input
                      type="text"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Подсистема
                    </label>
                    <select
                      value={editSubsystem}
                      onChange={(e) => setEditSubsystem(e.target.value as Subsystem)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md bg-white"
                    >
                      {(Object.keys(SUBSYSTEM_LABELS) as Subsystem[]).map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">О себе</label>
                  <textarea
                    rows={3}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Навыки (через запятую)
                  </label>
                  <input
                    type="text"
                    value={editSkills}
                    onChange={(e) => setEditSkills(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700"
                >
                  {savingProfile ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h1 className="text-lg font-bold text-slate-900">
              Личный кабинет инженера
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Войдите или зарегистрируйтесь, чтобы публиковать отчёты со схемами из Garage S3, подписываться на участников, создавать командные проекты и редактировать базу знаний Forgejo llm-wiki.
            </p>
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="w-full py-2.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors"
            >
              Войти или создать аккаунт
            </button>
          </div>
        )}

        {/* Quick list of joined projects */}
        {currentUser && (
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Мои сообщества</h2>
            {myProjects.length === 0 ? (
              <p className="text-xs text-slate-500">Вы ещё не вступили ни в один проект.</p>
            ) : (
              <div className="space-y-2">
                {myProjects.map((proj) => (
                  <div
                    key={proj.id}
                    className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-slate-100 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenProjectWorkspace(proj.id, 'projects')}
                      className="font-medium text-slate-800 hover:text-sky-700 text-left truncate"
                    >
                      {proj.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenProjectWorkspace(proj.id, 'tasks')}
                      className="text-sky-700 hover:underline shrink-0"
                    >
                      Задачи
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Right Column: Social Wall, Joined Projects, Engineer Network */}
      <main className="lg:col-span-8 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg px-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-xs font-medium">
            <button
              type="button"
              onClick={() => setCabinetTab('feed')}
              className={`py-3.5 border-b-2 transition-colors ${
                cabinetTab === 'feed'
                  ? 'border-sky-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Социальная лента
            </button>
            <button
              type="button"
              onClick={() => setCabinetTab('projects')}
              className={`py-3.5 border-b-2 transition-colors ${
                cabinetTab === 'projects'
                  ? 'border-sky-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Проекты ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setCabinetTab('network')}
              className={`py-3.5 border-b-2 transition-colors ${
                cabinetTab === 'network'
                  ? 'border-sky-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Участники ({users.length})
            </button>
          </div>

          {cabinetTab === 'feed' && currentUser && (
            <div className="flex items-center gap-2 text-xs">
              {(
                [
                  { id: 'all', label: 'Все' },
                  { id: 'following', label: 'Подписки' },
                  { id: 'mine', label: 'Мои' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFeedFilter(f.id)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    feedFilter === f.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {cabinetTab === 'feed' && (
          <div className="space-y-4">
            <PostComposer
              projectId={activeProjectId}
              s3Bucket="school76-media"
              isAuthenticated={Boolean(currentUser)}
              authFetch={authFetch}
              onCreatePost={onCreatePost}
              onRequireAuth={onOpenAuthModal}
            />

            {filteredPosts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
                По выбранному фильтру записей пока нет.
              </div>
            ) : (
              filteredPosts.map((post) => {
                const proj = post.projectId
                  ? projects.find((p) => p.id === post.projectId)
                  : undefined;
                return (
                  <SocialPostCard
                    key={post.id}
                    post={post}
                    projectName={proj?.name}
                    currentUserId={currentUser?.id || null}
                    onToggleLike={onToggleLikePost}
                    onComment={onCommentPost}
                    onRequireAuth={onOpenAuthModal}
                    onOpenWikiLink={onOpenWikiDoc}
                  />
                );
              })
            )}
          </div>
        )}

        {cabinetTab === 'projects' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((proj) => {
              const joined = currentUser ? proj.memberIds.includes(currentUser.id) : false;
              return (
                <div
                  key={proj.id}
                  className="bg-white border border-slate-200 rounded-lg p-5 space-y-3"
                >
                  <div>
                    <div className="text-[11px] font-medium text-sky-700">{proj.category}</div>
                    <h3 className="text-base font-bold text-slate-900">{proj.name}</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{proj.description}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="font-mono text-slate-500">
                      <Users className="w-3.5 h-3.5 inline mr-1" />
                      {proj.memberIds.length} · {joined ? 'Вы участник' : 'Открыто'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProject(proj.id);
                          onOpenProjectWorkspace(proj.id, 'wiki');
                        }}
                        className="text-sky-700 hover:underline"
                      >
                        Wiki
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenProjectWorkspace(proj.id, 'projects')}
                        className="px-2.5 py-1 bg-slate-900 text-white rounded"
                      >
                        Открыть
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {cabinetTab === 'network' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Поиск инженера по имени, логину, роли или подсистеме..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredUsers.map((user) => {
                const isSelf = currentUser?.id === user.id;
                const isFollowing = currentUser ? currentUser.following.includes(user.id) : false;
                return (
                  <div
                    key={user.id}
                    className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {user.displayName}
                        </span>
                        <span className="font-mono text-xs text-slate-400">@{user.username}</span>
                      </div>
                      <div className="text-xs text-sky-700 font-medium">
                        {user.subsystem} · {user.role}
                      </div>
                      {user.bio && (
                        <p className="text-xs text-slate-600 leading-relaxed">{user.bio}</p>
                      )}
                      {user.skills.length > 0 && (
                        <div className="text-[11px] font-mono text-slate-500 pt-1">
                          {user.skills.join(' · ')}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="font-mono tabular-nums text-slate-500">
                        Подписчиков: {user.followers.length} · Проектов: {user.joinedProjectIds.length}
                      </span>
                      {isSelf ? (
                        <span className="text-slate-400">Это вы</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (!currentUser) {
                              onOpenAuthModal();
                              return;
                            }
                            onToggleFollow(user.id);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-medium transition-colors ${
                            isFollowing
                              ? 'text-slate-700 border-slate-200 bg-slate-50'
                              : 'text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100'
                          }`}
                        >
                          {isFollowing ? (
                            <>
                              <UserCheck className="w-3.5 h-3.5" />
                              Подписаны
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-3.5 h-3.5" />
                              Подписаться
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
