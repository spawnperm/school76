/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useMissionSync } from './hooks/useMissionSync.ts';
import { TaskBoard } from './components/TaskBoard.tsx';
import { MBlockStudio } from './components/MBlockStudio.tsx';
import { EngineeringChat } from './components/EngineeringChat.tsx';
import { WikiKnowledgeBase } from './components/WikiKnowledgeBase.tsx';
import {
  AuthModal,
  CabinetView,
  ProjectsView,
} from './components/CommunitiesAndCabinet.tsx';
import { GitHubSyncModal } from './components/GitHubSyncModal.tsx';
import type { ChatChannelId, CommunityProject, CubeSatTask } from './types/cubesat.ts';

type WorkspaceTab = 'projects' | 'tasks' | 'wiki' | 'mblock' | 'chat' | 'cabinet';

const NAV_ITEMS: { id: Exclude<WorkspaceTab, 'cabinet'>; label: string }[] = [
  { id: 'projects', label: 'Проекты' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'wiki', label: 'База знаний' },
  { id: 'mblock', label: 'mBlock ПО' },
  { id: 'chat', label: 'Техчат' },
];

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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('projects');
  const [activeProjectId, setActiveProjectId] = useState<string>('school76-1u');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('prog-nominal-beacon');
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<ChatChannelId>('general');
  const [draftTaskRefId, setDraftTaskRefId] = useState<string | null>(null);
  const [draftProgramRefId, setDraftProgramRefId] = useState<string | null>(null);
  const [initialWikiDoc, setInitialWikiDoc] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);

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
    toggleJoinProject,
    createPost,
    toggleLikePost,
    commentPost,
    createTask,
    updateTask,
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
    setActiveTab('wiki');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-6">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#projects"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('projects');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          school76
        </a>

        {/* Zone 2: 5 clean single-line navigation links */}
        <nav className="flex items-center gap-6 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-sky-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action (Personal Cabinet / Sign In) */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!currentUser && activeTab === 'cabinet') {
                setShowAuthModal(true);
              } else {
                setActiveTab('cabinet');
              }
            }}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 max-w-[200px] truncate ${
              activeTab === 'cabinet'
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
        {activeTab === 'projects' && (
          <ProjectsView
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
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenProgram={openProgramInMBlock}
            onOpenChannel={(ch) => {
              setActiveChannel(ch);
              setActiveTab('chat');
            }}
            onOpenWikiDoc={openWikiDocument}
            onOpenGitHubSync={() => setShowGitHubModal(true)}
          />
        )}

        {activeTab === 'tasks' && (
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
            onDeleteTask={deleteTask}
            onOpenProgram={openProgramInMBlock}
            onDiscussTask={openTaskInChat}
          />
        )}

        {activeTab === 'wiki' && (
          <WikiKnowledgeBase
            project={activeProject}
            isAuthenticated={Boolean(currentUser)}
            initialDocPath={initialWikiDoc}
            onConsumeInitialDocPath={() => setInitialWikiDoc(null)}
            onRequireAuth={() => setShowAuthModal(true)}
            onOpenGitHubSync={() => setShowGitHubModal(true)}
            authFetch={authFetch}
          />
        )}

        {activeTab === 'mblock' && (
          <MBlockStudio
            programs={programs}
            selectedProgramId={selectedProgramId}
            onSelectProgram={setSelectedProgramId}
            onSaveProgram={saveProgram}
            onUpdateVersionNote={updateVersionNote}
            onDeleteProgram={deleteProgram}
            onDiscussProgram={openProgramInChat}
            engineerName={profile.name}
          />
        )}

        {activeTab === 'chat' && (
          <EngineeringChat
            projectId={activeProject.id}
            projectName={activeProject.name}
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

        {activeTab === 'cabinet' && (
          <CabinetView
            currentUser={currentUser}
            users={users}
            projects={projects}
            posts={posts}
            activeProjectId={activeProject.id}
            authFetch={authFetch}
            onLogin={login}
            onRegister={register}
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
      />
    </div>
  );
}
