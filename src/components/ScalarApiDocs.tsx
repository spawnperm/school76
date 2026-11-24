import React, { useMemo } from 'react';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { ExternalLink, FileCode2 } from 'lucide-react';

export const ScalarApiDocs: React.FC = () => {
  const configuration = useMemo(
    () => ({
      url: '/api/openapi.json',
      theme: 'default' as const,
      darkMode: false,
      hideDarkModeToggle: true,
      showSidebar: true,
    }),
    []
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Scalar OpenAPI 3.1 Reference (сгенерировано из Zod v4)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Интерактивная документация и тестирование всех эндпоинтов PostgreSQL, Directus, Refine, AtomicCRM, TinaCMS, NATS, Dify и Traefik.
          </p>
        </div>
        <a
          href="/api/openapi.json"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          /api/openapi.json
        </a>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden min-h-[680px]">
        <ApiReferenceReact configuration={configuration} />
      </div>
    </div>
  );
};
