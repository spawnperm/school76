import React from 'react';
import type { CommunityProject, CubeSatTask, UserProfile } from '../../types/cubesat.ts';
import { filterProjectTasks } from '../../constants/subsystems.ts';

interface ProjectDirectoryProps {
  projects: CommunityProject[];
  activeProjectId: string;
  tasks?: CubeSatTask[];
  currentUser: UserProfile | null;
  columnsClassName?: string;
  onSelectProject: (projectId: string) => void;
  onToggleJoinProject?: (projectId: string) => Promise<void>;
  onOpenWiki?: (projectId: string) => void;
  onRequireAuth: () => void;
}

export const ProjectDirectory: React.FC<ProjectDirectoryProps> = ({
  projects,
  activeProjectId,
  tasks = [],
  currentUser,
  columnsClassName = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
  onSelectProject,
  onToggleJoinProject,
  onOpenWiki,
  onRequireAuth,
}) => {
  return (
    <div className={columnsClassName}>
      {projects.map((proj) => {
        const isSelected = proj.id === activeProjectId;
        const projTasks = filterProjectTasks(tasks, proj.id);
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
                {projTasks.length > 0 && (
                  <span className="font-mono text-xs tabular-nums text-slate-500 shrink-0">
                    {pct}%
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                {proj.description}
              </p>

              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                <span className="font-mono tabular-nums">
                  Участников: {proj.memberIds.length}
                </span>
                {projTasks.length > 0 && (
                  <>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono tabular-nums">
                      Задач: {doneCount}/{projTasks.length}
                    </span>
                  </>
                )}
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
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                {isSelected ? 'Активный проект' : 'Открыть'}
              </button>

              <div className="flex items-center gap-2">
                {onOpenWiki && (
                  <button
                    type="button"
                    onClick={() => onOpenWiki(proj.id)}
                    className="text-xs font-medium text-sky-700 hover:underline whitespace-nowrap shrink-0"
                  >
                    Wiki
                  </button>
                )}

                {onToggleJoinProject &&
                  (owner ? (
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
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                        joined
                          ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                          : 'text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100'
                      }`}
                    >
                      {joined ? 'Покинуть' : 'Вступить'}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
