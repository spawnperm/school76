/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useMissionSync } from './hooks/useMissionSync.ts';
import { TaskBoard } from './components/TaskBoard.tsx';
import { MBlockStudio } from './components/MBlockStudio.tsx';
import { EngineeringChat } from './components/EngineeringChat.tsx';
import { HardwareBench } from './components/HardwareBench.tsx';
import type { ChatChannelId, CubeSatTask, Subsystem } from './types/cubesat.ts';
import { SUBSYSTEM_LABELS } from './types/cubesat.ts';

type WorkspaceTab = 'tasks' | 'mblock' | 'chat' | 'hardware';

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'tasks', label: 'Задачи' },
  { id: 'mblock', label: 'mBlock Борт ПО' },
  { id: 'chat', label: 'Техчат' },
  { id: 'hardware', label: 'Стенд 1U' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('tasks');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('prog-nominal-beacon');
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<ChatChannelId>('general');
  const [draftTaskRefId, setDraftTaskRefId] = useState<string | null>(null);
  const [draftProgramRefId, setDraftProgramRefId] = useState<string | null>(null);

  // Engineer profile modal
  const [showProfileModal, setShowProfileModal] = useState(false);

  const {
    profile,
    updateProfile,
    tasks,
    messages,
    programs,
    presence,
    connected,
    loading,
    createTask,
    updateTask,
    deleteTask,
    sendMessage,
    saveProgram,
    updateVersionNote,
    deleteProgram,
  } = useMissionSync(activeTab);

  const [editName, setEditName] = useState(profile.name);
  const [editRole, setEditRole] = useState(profile.role);
  const [editSubsystem, setEditSubsystem] = useState<Subsystem>(profile.subsystem);

  const openProgramInMBlock = (programId: string) => {
    setSelectedProgramId(programId);
    setActiveTab('mblock');
  };

  const openTaskInBoard = (taskId: string) => {
    setFocusedTaskId(taskId);
    setActiveTab('tasks');
  };

  const openTaskInChat = (task: CubeSatTask) => {
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

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    updateProfile({
      name: editName.trim(),
      role: editRole.trim() || 'Инженер подсистемы',
      subsystem: editSubsystem,
    });
    setShowProfileModal(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#tasks"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('tasks');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          school76
        </a>

        {/* Zone 2: 4 clean single-line navigation links */}
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

        {/* Zone 3: 1 primary action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              setEditName(profile.name);
              setEditRole(profile.role);
              setEditSubsystem(profile.subsystem);
              setShowProfileModal(true);
            }}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 max-w-[200px] truncate"
          >
            {profile.name}
          </button>
        </div>
      </header>

      {/* Active Workspace */}
      <div className="flex-1 min-h-0">
        {activeTab === 'tasks' && (
          <TaskBoard
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

        {activeTab === 'hardware' && (
          <HardwareBench
            tasks={tasks}
            programs={programs}
            onGoToTasks={() => setActiveTab('tasks')}
            onOpenProgram={openProgramInMBlock}
            onOpenChannel={(ch) => {
              setActiveChannel(ch);
              setActiveTab('chat');
            }}
          />
        )}
      </div>

      {/* Engineer Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSaveProfile}
            className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg p-6 space-y-4"
          >
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Профиль участника команды
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Имя и подсистема отображаются в списке онлайн-участников, задачах и техническом чате.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Имя и фамилия
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Инженерная роль
                </label>
                <input
                  type="text"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  placeholder="Например: Программист OBC"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Основная подсистема
                </label>
                <select
                  value={editSubsystem}
                  onChange={(e) => setEditSubsystem(e.target.value as Subsystem)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                >
                  {(Object.keys(SUBSYSTEM_LABELS) as Subsystem[]).map((sub) => (
                    <option key={sub} value={sub}>
                      {SUBSYSTEM_LABELS[sub]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700"
              >
                Сохранить профиль
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
