import React, { useState } from 'react';
import { Briefcase, Database, FileEdit, Layers } from 'lucide-react';
import type { AuthFetchFn } from '../providers/refineDataProvider.ts';
import { AtomicCrmWorkspace } from './AtomicCrmWorkspace.tsx';
import { DirectusStudio } from './DirectusStudio.tsx';
import { TinaCmsStudio } from './TinaCmsStudio.tsx';
import { PostgresConsole } from './PostgresConsole.tsx';

type StudioSubTab = 'atomic-crm' | 'directus' | 'tinacms' | 'postgresql';

interface CrmCmsStudioViewProps {
  authFetch: AuthFetchFn;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  activeProjectName: string;
  projectRepo: string;
}

export const CrmCmsStudioView: React.FC<CrmCmsStudioViewProps> = ({
  authFetch,
  isAuthenticated,
  onRequireAuth,
  activeProjectName,
  projectRepo,
}) => {
  const [subTab, setSubTab] = useState<StudioSubTab>('atomic-crm');

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-800">CRM · CMS · PostgreSQL</span>
            <span aria-hidden="true">·</span>
            <span>Проект: {activeProjectName}</span>
            <span aria-hidden="true">·</span>
            <span>Контракты: Zod v4</span>
          </div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            Управление данными, партнёрами и контентом миссии
          </h1>
          <p className="text-xs text-slate-600">
            AtomicCRM на базе Refine, Headless-коллекции Directus, Git-редактор TinaCMS и реляционная SQL-консоль PostgreSQL.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          {(
            [
              { id: 'atomic-crm', label: 'AtomicCRM (Refine)', icon: Briefcase },
              { id: 'directus', label: 'Directus Studio', icon: Layers },
              { id: 'tinacms', label: 'TinaCMS Git', icon: FileEdit },
              { id: 'postgresql', label: 'PostgreSQL SQL', icon: Database },
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

      {subTab === 'atomic-crm' && (
        <AtomicCrmWorkspace
          authFetch={authFetch}
          isAuthenticated={isAuthenticated}
          onRequireAuth={onRequireAuth}
        />
      )}
      {subTab === 'directus' && (
        <DirectusStudio
          authFetch={authFetch}
          isAuthenticated={isAuthenticated}
          onRequireAuth={onRequireAuth}
        />
      )}
      {subTab === 'tinacms' && (
        <TinaCmsStudio
          authFetch={authFetch}
          isAuthenticated={isAuthenticated}
          onRequireAuth={onRequireAuth}
          projectRepo={projectRepo}
        />
      )}
      {subTab === 'postgresql' && <PostgresConsole />}
    </div>
  );
};
