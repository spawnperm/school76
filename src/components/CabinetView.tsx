import React, { useEffect, useMemo, useState } from 'react';
import { LogOut, Pencil } from 'lucide-react';
import type {
  CommunityProject,
  CubeSatTask,
  SocialPost,
  Subsystem,
  UserProfile,
} from '../types/cubesat.ts';
import { SUBSYSTEM_LABELS } from '../types/cubesat.ts';
import { PostComposer } from './social/PostComposer.tsx';
import { SocialPostCard } from './social/SocialPostCard.tsx';
import { ProjectDirectory } from './social/ProjectDirectory.tsx';
import { MemberDirectory } from './social/MemberDirectory.tsx';

export interface CabinetViewProps {
  currentUser: UserProfile | null;
  users: UserProfile[];
  projects: CommunityProject[];
  tasks: CubeSatTask[];
  posts: SocialPost[];
  activeProjectId: string;
  authFetch: (url: string, options?: RequestInit) => Promise<any>;
  onLogout: () => void;
  onUpdateProfile: (
    patch: Partial<Pick<UserProfile, 'displayName' | 'role' | 'subsystem' | 'bio' | 'skills'>>
  ) => Promise<UserProfile>;
  onToggleFollow: (userId: string) => Promise<void>;
  onToggleJoinProject: (projectId: string) => Promise<void>;
  onSelectProject: (projectId: string) => void;
  onCreatePost: (payload: {
    text: string;
    projectId?: string;
    mediaUrls?: string[];
  }) => Promise<SocialPost>;
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
  tasks,
  posts,
  activeProjectId,
  authFetch,
  onLogout,
  onUpdateProfile,
  onToggleFollow,
  onToggleJoinProject,
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
                  <span className="text-[11px] text-slate-400">Сессия активна</span>
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
            <h1 className="text-lg font-bold text-slate-900">Личный кабинет инженера</h1>
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

      {/* Right Column: Social Wall, Projects, Engineer Network */}
      <main className="lg:col-span-8 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg px-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-xs font-medium">
            <button
              type="button"
              onClick={() => setCabinetTab('feed')}
              className={`py-3.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
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
              className={`py-3.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
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
              className={`py-3.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
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
          <ProjectDirectory
            projects={projects}
            activeProjectId={activeProjectId}
            tasks={tasks}
            currentUser={currentUser}
            columnsClassName="grid grid-cols-1 md:grid-cols-2 gap-4"
            onSelectProject={(projId) => onOpenProjectWorkspace(projId, 'projects')}
            onOpenWiki={(projId) => {
              onSelectProject(projId);
              onOpenProjectWorkspace(projId, 'wiki');
            }}
            onToggleJoinProject={onToggleJoinProject}
            onRequireAuth={onOpenAuthModal}
          />
        )}

        {cabinetTab === 'network' && (
          <MemberDirectory
            users={users}
            currentUser={currentUser}
            searchable
            showProjectCount
            columnsClassName="grid grid-cols-1 md:grid-cols-2 gap-4"
            onToggleFollow={onToggleFollow}
            onRequireAuth={onOpenAuthModal}
          />
        )}
      </main>
    </div>
  );
};
