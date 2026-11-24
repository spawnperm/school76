import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Cpu,
  GitBranch,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  ChatChannelId,
  CommunityProject,
  CubeSatTask,
  ForgejoCommit,
  OnboardProgram,
  SocialPost,
  Subsystem,
  UserProfile,
} from '../types/cubesat.ts';
import { filterProjectTasks } from '../constants/subsystems.ts';
import { HardwareBench } from './HardwareBench.tsx';
import { CubeSat3DViewer } from './CubeSat3DViewer.tsx';
import { ProjectsDashboard } from './ProjectsDashboard.tsx';
import { SubsystemArchitectureGraph } from './SubsystemArchitectureGraph.tsx';
import { PostComposer } from './social/PostComposer.tsx';
import { SocialPostCard } from './social/SocialPostCard.tsx';
import { ProjectDirectory } from './social/ProjectDirectory.tsx';
import { MemberDirectory } from './social/MemberDirectory.tsx';

type ProjectSectionTab = 'overview' | 'architecture' | 'bench' | 'community';

export interface ProjectsWorkspaceProps {
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
    githubRepo?: string;
  }) => Promise<CommunityProject>;
  onToggleJoinProject: (projectId: string) => Promise<void>;
  onToggleFollow: (userId: string) => Promise<void>;
  onCreatePost: (payload: {
    text: string;
    projectId?: string;
    mediaUrls?: string[];
  }) => Promise<SocialPost>;
  onToggleLikePost: (postId: string) => Promise<void>;
  onCommentPost: (postId: string, text: string) => Promise<void>;
  onRequireAuth: () => void;
  onNavigateTab: (tab: 'tasks' | 'wiki' | 'office' | 'mblock' | 'ci' | 'chat') => void;
  onOpenProgram: (programId: string) => void;
  onOpenChannel: (channel: ChatChannelId) => void;
  onOpenWikiDoc: (docPath: string) => void;
  onOpenGitHubSync: () => void;
  onOpenSubsystemTasks: (subsystem: Subsystem) => void;
  onOpenSubsystemMBlock: (subsystem: Subsystem) => void;
  onOpenTask: (taskId: string) => void;
  onGenerateDescription: (projectId: string) => Promise<string>;
  onGenerateReadme: (projectId: string) => Promise<{
    readme: string;
    filename: string;
    repo: string;
    generatedAt: string;
  }>;
  onUploadReadme: (
    projectId: string,
    content: string,
    commitMessage?: string
  ) => Promise<{
    ok: boolean;
    path: string;
    repo: string;
    commit: ForgejoCommit;
  }>;
}

const SECTION_TABS: { id: ProjectSectionTab; label: string }[] = [
  { id: 'overview', label: 'Сводка и проекты' },
  { id: 'architecture', label: '3D и архитектура' },
  { id: 'bench', label: 'Стенд 1U' },
  { id: 'community', label: 'Лента и команда' },
];

export const ProjectsWorkspace: React.FC<ProjectsWorkspaceProps> = ({
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
  onOpenTask,
  onGenerateDescription,
  onGenerateReadme,
  onUploadReadme,
}) => {
  const [sectionTab, setSectionTab] = useState<ProjectSectionTab>('overview');
  const [communityView, setCommunityView] = useState<'wall' | 'members'>('wall');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newGithubRepo, setNewGithubRepo] = useState('');
  const [newCategory, setNewCategory] = useState('Космический аппарат');
  const [newDescription, setNewDescription] = useState('');
  const [newTags, setNewTags] = useState('CubeSat, mBlock, Telemetry');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  const projectTasks = useMemo(
    () =>
      activeProject
        ? filterProjectTasks(tasks, activeProject.id)
        : [],
    [tasks, activeProject]
  );

  const projectPosts = useMemo(
    () => (activeProject ? posts.filter((p) => p.projectId === activeProject.id) : []),
    [posts, activeProject]
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
        ...(newGithubRepo.trim() ? { githubRepo: newGithubRepo.trim() } : {}),
      });
      onSelectProject(created.id);
      setShowCreateModal(false);
      setNewName('');
      setNewSlug('');
      setNewGithubRepo('');
      setNewDescription('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Ошибка создания проекта');
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!activeProject) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setGeneratingDescription(true);
    setDescriptionError(null);
    try {
      await onGenerateDescription(activeProject.id);
    } catch (err) {
      setDescriptionError(
        err instanceof Error ? err.message : 'Не удалось сгенерировать описание проекта'
      );
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleGenerateReadme = async () => {
    if (!activeProject) return null;
    if (!currentUser) {
      onRequireAuth();
      return null;
    }
    return onGenerateReadme(activeProject.id);
  };

  const handleUploadReadme = async (content: string, commitMessage?: string) => {
    if (!activeProject) throw new Error('Проект не выбран');
    if (!currentUser) {
      onRequireAuth();
      throw new Error('Требуется вход в личный кабинет');
    }
    return onUploadReadme(activeProject.id, content, commitMessage);
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
    <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-5">
      {/* Header + Sub-navigation + Primary Actions */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">
              {activeProject.name}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Управление проектом · <span className="font-mono">school76/{activeProject.forgejoRepo}</span> · <span className="font-mono">s3://{activeProject.s3Bucket}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenGitHubSync}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
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
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Создать проект
            </button>
          </div>
        </div>

        {/* Clean Horizontal Sub-Tabs inside Projects */}
        <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
          {SECTION_TABS.map((tab) => {
            const active = sectionTab === tab.id;
            const badge =
              tab.id === 'overview'
                ? projects.length
                : tab.id === 'community'
                  ? projectPosts.length
                  : null;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSectionTab(tab.id)}
                className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  active
                    ? 'border-sky-600 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <span>{tab.label}</span>
                {badge !== null && (
                  <span className="font-mono text-[11px] tabular-nums text-slate-400">
                    ({badge})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tab 1: Overview & Project Directory */}
      {sectionTab === 'overview' && (
        <div className="space-y-6">
          <ProjectsDashboard
            project={activeProject}
            tasks={projectTasks}
            programs={programs}
            membersCount={projectMembers.length}
            onOpenSubsystemTasks={onOpenSubsystemTasks}
            onNavigateTab={onNavigateTab}
            onOpenGitHubSync={onOpenGitHubSync}
            onOpenTask={onOpenTask}
            onOpenWikiDoc={onOpenWikiDoc}
            onGenerateDescription={handleGenerateDescription}
            generatingDescription={generatingDescription}
            descriptionError={descriptionError}
            onGenerateReadme={handleGenerateReadme}
            onUploadReadme={handleUploadReadme}
          />

          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Каталог командных проектов ({projects.length})
              </h2>
              <span className="text-xs text-slate-500">
                Выберите активный проект для работы с задачами, ПО и базой знаний
              </span>
            </div>

            <ProjectDirectory
              projects={projects}
              activeProjectId={activeProject.id}
              tasks={tasks}
              currentUser={currentUser}
              onSelectProject={onSelectProject}
              onToggleJoinProject={onToggleJoinProject}
              onRequireAuth={onRequireAuth}
            />
          </section>
        </div>
      )}

      {/* Sub-tab 2: 3D Twin & Subsystem Architecture Graph (lazy-mounted) */}
      {sectionTab === 'architecture' && (
        <div className="space-y-6">
          <CubeSat3DViewer
            projectName={activeProject.name}
            tasks={projectTasks}
            onOpenSubsystemTasks={onOpenSubsystemTasks}
            onOpenSubsystemMBlock={onOpenSubsystemMBlock}
          />

          <SubsystemArchitectureGraph
            projectName={activeProject.name}
            tasks={projectTasks}
            programs={programs}
            onOpenSubsystemTasks={onOpenSubsystemTasks}
            onOpenSubsystemMBlock={onOpenSubsystemMBlock}
          />
        </div>
      )}

      {/* Sub-tab 3: 1U Hardware Bench */}
      {sectionTab === 'bench' && (
        <HardwareBench
          tasks={projectTasks}
          programs={programs}
          onGoToTasks={() => onNavigateTab('tasks')}
          onOpenProgram={onOpenProgram}
          onOpenChannel={onOpenChannel}
        />
      )}

      {/* Sub-tab 4: Community Wall & Team */}
      {sectionTab === 'community' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{activeProject.category}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">school76/{activeProject.forgejoRepo}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 truncate">
                Сообщество «{activeProject.name}»
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab('tasks')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <ListChecks className="w-3.5 h-3.5 text-sky-600" />
                Задачи ({projectTasks.length})
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('wiki')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                База знаний
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('mblock')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Cpu className="w-3.5 h-3.5 text-sky-600" />
                mBlock ПО
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('chat')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap shrink-0"
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
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
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

          <div className="px-6 border-b border-slate-200 bg-slate-50 flex items-center gap-6 text-xs font-medium">
            <button
              type="button"
              onClick={() => setCommunityView('wall')}
              className={`py-3 border-b-2 transition-colors ${
                communityView === 'wall'
                  ? 'border-sky-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Стена сообщества ({projectPosts.length})
            </button>
            <button
              type="button"
              onClick={() => setCommunityView('members')}
              className={`py-3 border-b-2 transition-colors ${
                communityView === 'members'
                  ? 'border-sky-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Участники команды ({projectMembers.length})
            </button>
          </div>

          {communityView === 'wall' ? (
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
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">О проекте</h3>
                    <button
                      type="button"
                      onClick={handleGenerateDescription}
                      disabled={generatingDescription}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded hover:bg-violet-100 disabled:opacity-50"
                    >
                      {generatingDescription ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {generatingDescription ? 'Генерация...' : 'Сгенерировать с ИИ'}
                    </button>
                  </div>
                  {descriptionError && (
                    <div className="px-2.5 py-1.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded">
                      {descriptionError}
                    </div>
                  )}
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
                      onClick={() => setCommunityView('members')}
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
          ) : (
            <div className="p-6 bg-slate-50/40">
              <MemberDirectory
                users={projectMembers}
                currentUser={currentUser}
                onToggleFollow={onToggleFollow}
                onRequireAuth={onRequireAuth}
              />
            </div>
          )}
        </section>
      )}

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

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  GitHub-репозиторий команды (необязательно)
                </label>
                <input
                  type="text"
                  value={newGithubRepo}
                  onChange={(e) => setNewGithubRepo(e.target.value)}
                  placeholder="owner/repo (для мониторинга GitHub Actions)"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
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
