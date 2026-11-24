import React, { useState } from 'react';
import { BookOpen, Bot, FileCode2, Globe, Network, Radio } from 'lucide-react';
import type { AuthFetchFn } from '../providers/refineDataProvider.ts';
import type { CommunityProject, CubeSatTask, OnboardProgram } from '../types/cubesat.ts';
import { ArchifyStudio } from './ArchifyStudio.tsx';
import { NatsBusStudio } from './NatsBusStudio.tsx';
import { DifyWorkflowStudio } from './DifyWorkflowStudio.tsx';
import { TraefikGatewayStudio } from './TraefikGatewayStudio.tsx';
import { ScalarApiDocs } from './ScalarApiDocs.tsx';
import { StorybookExplorer } from './StorybookExplorer.tsx';

type StackSubTab = 'archify' | 'nats' | 'dify' | 'traefik' | 'scalar' | 'storybook';

interface PlatformStackViewProps {
  authFetch: AuthFetchFn;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  activeProject: CommunityProject;
  projects: CommunityProject[];
  tasks: CubeSatTask[];
  programs: OnboardProgram[];
}

export const PlatformStackView: React.FC<PlatformStackViewProps> = ({
  authFetch,
  isAuthenticated,
  onRequireAuth,
  activeProject,
  projects,
  tasks,
  programs,
}) => {
  const [subTab, setSubTab] = useState<StackSubTab>('archify');

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-800">
              Archify · NATS · Dify · Traefik · Scalar · Storybook
            </span>
            <span aria-hidden="true">·</span>
            <span>Проект: {activeProject.name}</span>
          </div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            Архитектура, шина событий, LLMOps, шлюз и документация API
          </h1>
          <p className="text-xs text-slate-600">
            Интерактивный граф Archify, брокер NATS JetStream, пайплайны Dify, шлюз Traefik, спецификация Scalar OpenAPI 3.1 и Storybook UI.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          {(
            [
              { id: 'archify', label: 'Archify', icon: Network },
              { id: 'nats', label: 'NATS', icon: Radio },
              { id: 'dify', label: 'Dify', icon: Bot },
              { id: 'traefik', label: 'Traefik', icon: Globe },
              { id: 'scalar', label: 'Scalar API', icon: FileCode2 },
              { id: 'storybook', label: 'Storybook', icon: BookOpen },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  subTab === item.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {subTab === 'archify' && <ArchifyStudio />}
      {subTab === 'nats' && (
        <NatsBusStudio
          authFetch={authFetch}
          isAuthenticated={isAuthenticated}
          onRequireAuth={onRequireAuth}
        />
      )}
      {subTab === 'dify' && (
        <DifyWorkflowStudio
          authFetch={authFetch}
          isAuthenticated={isAuthenticated}
          onRequireAuth={onRequireAuth}
          activeProjectId={activeProject.id}
        />
      )}
      {subTab === 'traefik' && (
        <TraefikGatewayStudio
          authFetch={authFetch}
          isAuthenticated={isAuthenticated}
          onRequireAuth={onRequireAuth}
        />
      )}
      {subTab === 'scalar' && <ScalarApiDocs />}
      {subTab === 'storybook' && (
        <StorybookExplorer
          activeProject={activeProject}
          projects={projects}
          tasks={tasks}
          programs={programs}
        />
      )}
    </div>
  );
};
