/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { GitBranch, Terminal } from 'lucide-react';
import { useMissionSync } from './hooks/useMissionSync.ts';
import { TaskBoard } from './components/TaskBoard.tsx';
import { MBlockStudio } from './components/MBlockStudio.tsx';
import { EngineeringChat } from './components/EngineeringChat.tsx';
import { WikiKnowledgeBase } from './components/WikiKnowledgeBase.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { CabinetView } from './components/CabinetView.tsx';
import { ProjectsWorkspace } from './components/ProjectsWorkspace.tsx';
import { CiActionsPanel } from './components/CiActionsPanel.tsx';
import { GitHubSyncModal } from './components/GitHubSyncModal.tsx';
import { MissionStatusBadge } from './components/MissionStatusBadge.tsx';
import { HarnessConsole } from './components/HarnessConsole.tsx';
import { MarketplaceView } from './components/MarketplaceView.tsx';
import { CrmCmsStudioView } from './components/CrmCmsStudioView.tsx';
import { PlatformStackView } from './components/PlatformStackView.tsx';
import { useHarnessRuntime } from './hooks/useHarnessRuntime.ts';
import type { WorkspaceTab } from './harness/frontendRegistry.ts';
import type { ChatChannelId, CommunityProject, CubeSatTask, Subsystem } from './types/cubesat.ts';

const FALLBACK_PROJECT: CommunityProject = {
  id: 'school76-1u',
  slug: 'school76-1u',
  name: 'Кубсат school76-1U',
  description: 'Образовательный кубсат 1U',
  category: 'Космический аппарат 1U',
  tags: ['1U CubeSat'],
  ownerId: 'usr-artem',
  memberIds: ['usr-artem'],
  forgejoRepo: 'school76-1u',
  s3Bucket: 'school76-media',
  createdAt: new Date().toISOString(),
};

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('harness');
  const [activeProjectId, setActiveProjectId] = useState<string>('school76-1u');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('prog-nominal-beacon');
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<ChatChannelId>('general');
  const [draftTaskRefId, setDraftTaskRefId] = useState<string | null>(null);
  const [draftProgramRefId, setDraftProgramRefId] = useState<string | null>(null);
  const [initialWikiDoc, setInitialWikiDoc] = useState<string | null>(null);
  const [initialWikiMode, setInitialWikiMode] = useState<'wiki' | 'office' | null>(null);
  const [initialTaskSubsystem, setInitialTaskSubsystem] = useState<Subsystem | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);

  const harness = useHarnessRuntime();

  const {
    authFetch,
    currentUser,
    profile,
    users,
    projects,
    posts,
    tasks,
    messages,
    programs,
    presence,
    connected,
    loading,
    login,
    register,
    logout,
    updateMyProfile,
    toggleFollow,
    createProject,
    updateProject,
    toggleJoinProject,
    generateProjectDescription,
    generateProjectReadme,
    uploadProjectReadme,
    createPost,
    toggleLikePost,
    commentPost,
    createTask,
    updateTask,
    reorderTask,
    deleteTask,
    sendMessage,
    saveProgram,
    updateVersionNote,
    deleteProgram,
  } = useMissionSync(activeTab);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0] || FALLBACK_PROJECT,
    [projects, activeProjectId]
  );

  const resolvedTab: WorkspaceTab = useMemo(() => {
    if (activeTab === 'cabinet' || activeTab === 'harness' || activeTab === 'marketplace') {
      return activeTab;
    }
    const mounted = harness.navSlots.some((s) => s.tab === activeTab);
    return mounted ? activeTab : 'harness';
  }, [activeTab, harness.navSlots]);

  const openProgramInMBlock = (programId: string) => {
    setSelectedProgramId(programId);
    setActiveTab('mblock');
  };

  const openTaskInBoard = (taskId: string) => {
    setFocusedTaskId(taskId);
    setActiveTab('tasks');
  };

  const openTaskInChat = (task: CubeSatTask) => {
    if (task.projectId) {
      setActiveProjectId(task.projectId);
    }
    if (task.linkedChannel) {
      setActiveChannel(task.linkedChannel);
    }
    setDraftTaskRefId(task.id);
    if (task.linkedProgramId) {
      setDraftProgramRefId(task.linkedProgramId);
    }
    setActiveTab('chat');
  };

  const openProgramInChat = (programId: string) => {
    setActiveChannel('obc-firmware');
    setDraftProgramRefId(programId);
    setActiveTab('chat');
  };

  const openWikiDocument = (docPath: string) => {
    setInitialWikiDoc(docPath);
    setInitialWikiMode('wiki');
    setActiveTab('wiki');
  };

  const handleDashboardNavigateTab = (
    tab: 'tasks' | 'wiki' | 'office' | 'mblock' | 'ci' | 'chat'
  ) => {
    if (tab === 'office') {
      setInitialWikiMode('office');
      setActiveTab('wiki');
    } else {
      if (tab === 'wiki') setInitialWikiMode('wiki');
      setActiveTab(tab);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-6">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#harness"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('harness');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          school76
        </a>

        {/* Zone 2: Clean single-line navigation links driven by mounted Cordis UI plugins */}
        <nav className="flex items-center gap-6 overflow-x-auto">
          {harness.navSlots.map((slot) => {
            const isActive = resolvedTab === slot.tab;
            return (
              <button
                key={slot.pluginId}
                type="button"
                onClick={() => setActiveTab(slot.tab)}
                className={`py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-sky-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {slot.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Mission Status + Primary Cabinet Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <MissionStatusBadge
            activeProject={activeProject}
            projects={projects}
            tasks={tasks}
            programs={programs}
            currentUser={currentUser}
            onSelectProject={setActiveProjectId}
            onUpdateLifecycleStage={async (projectId, stage) => {
              await updateProject(projectId, { lifecycleStage: stage });
            }}
            onRequireAuth={() => setShowAuthModal(true)}
            onOpenTasks={() => setActiveTab('tasks')}
          />

          <button
            type="button"
            onClick={() => {
              if (!currentUser && resolvedTab === 'cabinet') {
                setShowAuthModal(true);
              } else {
                setActiveTab('cabinet');
              }
            }}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 max-w-[190px] truncate ${
              resolvedTab === 'cabinet'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {currentUser ? currentUser.displayName : 'Кабинет / Войти'}
          </button>
        </div>
      </header>

      {/* Active Workspace */}
      <div className="flex-1 min-h-0">
        {resolvedTab === 'harness' && (
          <HarnessConsole
            snapshot={harness.snapshot}
            agentHistory={harness.agentHistory}
            activeProjectId={activeProject.id}
            activeProjectName={activeProject.name}
            loading={harness.loading}
            busyAction={harness.busyAction}
            error={harness.error}
            onRefresh={harness.refresh}
            onActivateProfile={harness.activateProfile}
            onTogglePlugin={harness.togglePlugin}
            onSwitchSeamProvider={harness.switchSeamProvider}
            onExecuteTool={harness.executeTool}
            onRunAgentGoal={harness.runAgentGoal}
            onOpenSlot={(tab) => setActiveTab(tab)}
          />
        )}

        {resolvedTab === 'marketplace' && (
          <MarketplaceView
            marketplace={harness.marketplace}
            snapshot={harness.snapshot}
            loading={harness.loading}
            busyAction={harness.busyAction}
            error={harness.error}
            onRefresh={harness.refresh}
            onInstallModule={harness.installMarketplaceModule}
            onUninstallModule={harness.uninstallMarketplaceModule}
            onActivateModule={harness.activateMarketplaceModule}
            onDeactivateModule={harness.deactivateMarketplaceModule}
            onPublishToVerdaccio={harness.publishToVerdaccio}
            onSyncVerdaccio={harness.syncVerdaccio}
            onOpenTab={(tab) => setActiveTab(tab)}
          />
        )}

        {resolvedTab === 'projects' && (
          <ProjectsWorkspace
            projects={projects}
            activeProjectId={activeProject.id}
            onSelectProject={setActiveProjectId}
            users={users}
            currentUser={currentUser}
            posts={posts}
            tasks={tasks}
            programs={programs}
            authFetch={authFetch}
            onCreateProject={createProject}
            onToggleJoinProject={toggleJoinProject}
            onToggleFollow={toggleFollow}
            onCreatePost={createPost}
            onToggleLikePost={toggleLikePost}
            onCommentPost={commentPost}
            onRequireAuth={() => setShowAuthModal(true)}
            onNavigateTab={handleDashboardNavigateTab}
            onOpenProgram={openProgramInMBlock}
            onOpenChannel={(ch) => {
              setActiveChannel(ch);
              setActiveTab('chat');
            }}
            onOpenWikiDoc={openWikiDocument}
            onOpenGitHubSync={() => setShowGitHubModal(true)}
            onOpenSubsystemTasks={(sub) => {
              setInitialTaskSubsystem(sub);
              setActiveTab('tasks');
            }}
            onOpenSubsystemMBlock={(sub) => {
              const matched =
                programs.find((p) => p.subsystem === sub) || programs[0];
              if (matched) setSelectedProgramId(matched.id);
              setActiveTab('mblock');
            }}
            onOpenTask={openTaskInBoard}
            onGenerateDescription={generateProjectDescription}
            onGenerateReadme={generateProjectReadme}
            onUploadReadme={uploadProjectReadme}
          />
        )}

        {resolvedTab === 'tasks' && (
          <TaskBoard
            projectId={activeProject.id}
            projectName={activeProject.name}
            tasks={tasks}
            programs={programs}
            loading={loading}
            engineerName={profile.name}
            focusedTaskId={focusedTaskId}
            onFocusTask={setFocusedTaskId}
            onCreateTask={createTask}
            onUpdateTask={updateTask}
            onReorderTask={reorderTask}
            onDeleteTask={deleteTask}
            onOpenProgram={openProgramInMBlock}
            onDiscussTask={openTaskInChat}
            initialSubsystemFilter={initialTaskSubsystem}
            onConsumeSubsystemFilter={() => setInitialTaskSubsystem(null)}
          />
        )}

        {resolvedTab === 'wiki' && (
          <WikiKnowledgeBase
            project={activeProject}
            tasks={tasks}
            isAuthenticated={Boolean(currentUser)}
            initialDocPath={initialWikiDoc}
            onConsumeInitialDocPath={() => setInitialWikiDoc(null)}
            initialWorkspaceMode={initialWikiMode}
            onConsumeInitialWorkspaceMode={() => setInitialWikiMode(null)}
            onRequireAuth={() => setShowAuthModal(true)}
            onOpenGitHubSync={() => setShowGitHubModal(true)}
            authFetch={authFetch}
          />
        )}

        {resolvedTab === 'mblock' && (
          <MBlockStudio
            projectId={activeProject.id}
            programs={programs}
            selectedProgramId={selectedProgramId}
            onSelectProgram={setSelectedProgramId}
            onSaveProgram={saveProgram}
            onUpdateVersionNote={updateVersionNote}
            onDeleteProgram={deleteProgram}
            onDiscussProgram={openProgramInChat}
            engineerName={profile.name}
            marketplace={harness.marketplace}
            onOpenMarketplace={() => setActiveTab('marketplace')}
            onActivateMarketplaceModule={harness.activateMarketplaceModule}
            onDeactivateMarketplaceModule={harness.deactivateMarketplaceModule}
          />
        )}

        {resolvedTab === 'ci' && (
          <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-sky-600 shrink-0" />
                  <h1 className="text-base font-bold text-slate-900">
                    Сборка, CI/CD и синхронизация
                  </h1>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Запуски GitHub Actions и Forgejo Actions для проекта «{activeProject.name}», диагностика логов и предпушевые проверки.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGitHubModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Открыть GitHub Sync и тесты
              </button>
            </div>

            <CiActionsPanel
              projects={projects}
              activeProject={activeProject}
              isAuthenticated={Boolean(currentUser)}
              onRequireAuth={() => setShowAuthModal(true)}
              authFetch={authFetch}
            />
          </div>
        )}

        {resolvedTab === 'chat' && (
          <EngineeringChat
            projectId={activeProject.id}
            projectName={activeProject.name}
            project={activeProject}
            messages={messages}
            tasks={tasks}
            programs={programs}
            presence={presence}
            connected={connected}
            profile={profile}
            activeChannel={activeChannel}
            onSelectChannel={setActiveChannel}
            draftTaskRefId={draftTaskRefId}
            draftProgramRefId={draftProgramRefId}
            onClearDraftRefs={() => {
              setDraftTaskRefId(null);
              setDraftProgramRefId(null);
            }}
            onSendMessage={sendMessage}
            onOpenTask={openTaskInBoard}
            onOpenProgram={openProgramInMBlock}
          />
        )}

        {resolvedTab === 'studio' && (
          <CrmCmsStudioView
            authFetch={authFetch}
            isAuthenticated={Boolean(currentUser)}
            onRequireAuth={() => setShowAuthModal(true)}
            activeProjectName={activeProject.name}
            projectRepo={activeProject.forgejoRepo || 'school76-1u'}
          />
        )}

        {resolvedTab === 'stack' && (
          <PlatformStackView
            authFetch={authFetch}
            isAuthenticated={Boolean(currentUser)}
            onRequireAuth={() => setShowAuthModal(true)}
            activeProject={activeProject}
            projects={projects}
            tasks={tasks}
            programs={programs}
          />
        )}

        {resolvedTab === 'cabinet' && (
          <CabinetView
            currentUser={currentUser}
            users={users}
            projects={projects}
            tasks={tasks}
            posts={posts}
            activeProjectId={activeProject.id}
            authFetch={authFetch}
            onLogout={logout}
            onUpdateProfile={updateMyProfile}
            onToggleFollow={toggleFollow}
            onToggleJoinProject={toggleJoinProject}
            onSelectProject={setActiveProjectId}
            onCreatePost={createPost}
            onToggleLikePost={toggleLikePost}
            onCommentPost={commentPost}
            onOpenAuthModal={() => setShowAuthModal(true)}
            onOpenProjectWorkspace={(projId, tab) => {
              setActiveProjectId(projId);
              setActiveTab(tab);
            }}
            onOpenWikiDoc={openWikiDocument}
          />
        )}
      </div>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={login}
        onRegister={register}
      />

      {/* GitHub Commit & Push Modal */}
      <GitHubSyncModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        isAuthenticated={Boolean(currentUser)}
        onRequireAuth={() => setShowAuthModal(true)}
        authFetch={authFetch}
        activeProject={activeProject}
      />
    </div>
  );
}
