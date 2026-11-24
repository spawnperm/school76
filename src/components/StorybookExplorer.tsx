import React, { useMemo, useState } from 'react';
import { BookOpen, Monitor, Smartphone, Tablet } from 'lucide-react';
import { MissionStatusBadge } from './MissionStatusBadge.tsx';
import { ThermalPowerHeatmap } from './ThermalPowerHeatmap.tsx';
import { createInitialTelemetry } from '../mblock/simulator.ts';
import type { CommunityProject, CubeSatTask, MissionLifecycleStage, OnboardProgram } from '../types/cubesat.ts';

type StoryId = 'mission-badge' | 'thermal-heatmap' | 'crm-deal-card' | 'traefik-route-card' | 'design-tokens';
type ViewportMode = 'desktop' | 'tablet' | 'mobile';

interface StorybookExplorerProps {
  activeProject: CommunityProject;
  projects: CommunityProject[];
  tasks: CubeSatTask[];
  programs: OnboardProgram[];
}

export const StorybookExplorer: React.FC<StorybookExplorerProps> = ({
  activeProject,
  projects,
  tasks,
  programs,
}) => {
  const [selectedStory, setSelectedStory] = useState<StoryId>('mission-badge');
  const [viewport, setViewport] = useState<ViewportMode>('desktop');

  // Interactive Story Controls
  const [lifecycleStage, setLifecycleStage] = useState<MissionLifecycleStage>('testing');
  const [simScenario, setSimScenario] = useState<'leo_nominal' | 'low_battery' | 'high_tumble' | 'ground_pass'>('leo_nominal');
  const [dealAmount, setDealAmount] = useState<number>(1850000);
  const [dealStage, setDealStage] = useState<'contract' | 'flight_ready' | 'completed'>('contract');
  const [traefikEnabled, setTraefikEnabled] = useState<boolean>(true);
  const [traefikLatency, setTraefikLatency] = useState<number>(6);

  const telemetry = useMemo(() => createInitialTelemetry(simScenario), [simScenario]);

  const previewProject = useMemo(
    () => ({ ...activeProject, lifecycleStage }),
    [activeProject, lifecycleStage]
  );

  const stories: Array<{ id: StoryId; group: string; title: string; file: string }> = [
    {
      id: 'mission-badge',
      group: 'CubeSat UI',
      title: 'MissionStatusBadge / Lifecycle',
      file: 'src/components/MissionStatusBadge.tsx',
    },
    {
      id: 'thermal-heatmap',
      group: 'Telemetry',
      title: 'ThermalPowerHeatmap / 1U Nodes',
      file: 'src/components/ThermalPowerHeatmap.tsx',
    },
    {
      id: 'crm-deal-card',
      group: 'AtomicCRM',
      title: 'DealPipelineCard / Grant',
      file: 'src/components/AtomicCrmWorkspace.tsx',
    },
    {
      id: 'traefik-route-card',
      group: 'Gateway',
      title: 'TraefikRouterRow / Metrics',
      file: 'src/components/TraefikGatewayStudio.tsx',
    },
    {
      id: 'design-tokens',
      group: 'Foundation',
      title: 'Tokens / Typography & Colors',
      file: 'src/index.css',
    },
  ];

  const viewportWidthClass =
    viewport === 'mobile' ? 'max-w-[375px]' : viewport === 'tablet' ? 'max-w-[768px]' : 'w-full';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Sidebar Stories */}
      <div className="lg:col-span-3 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-rose-600" />
          <div>
            <div className="text-xs font-bold text-slate-900">Storybook Explorer</div>
            <div className="text-[11px] font-mono text-slate-500">CSF · React 19 + Tailwind</div>
          </div>
        </div>

        <div className="space-y-1.5">
          {stories.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setSelectedStory(st.id)}
              className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-colors ${
                selectedStory === st.id
                  ? 'bg-rose-50 border-rose-200 text-slate-900 font-semibold'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
              }`}
            >
              <div className="text-[10px] font-mono text-rose-600 uppercase">{st.group}</div>
              <div>{st.title}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Canvas + Controls */}
      <div className="lg:col-span-9 space-y-4">
        {/* Toolbar */}
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-mono text-slate-600">
            {stories.find((s) => s.id === selectedStory)?.file}
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md">
            {(
              [
                { id: 'desktop', icon: Monitor, label: 'Desktop' },
                { id: 'tablet', icon: Tablet, label: 'Tablet' },
                { id: 'mobile', icon: Smartphone, label: 'Mobile' },
              ] as const
            ).map((vp) => {
              const Icon = vp.icon;
              return (
                <button
                  key={vp.id}
                  type="button"
                  onClick={() => setViewport(vp.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded ${
                    viewport === vp.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {vp.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Canvas */}
        <div className="bg-slate-100 border border-slate-200 rounded-lg p-6 flex justify-center overflow-x-auto">
          <div className={`${viewportWidthClass} mx-auto bg-white border border-slate-200 rounded-lg p-5 shadow-sm transition-all`}>
            {selectedStory === 'mission-badge' && (
              <div className="flex flex-col items-start gap-4">
                <div className="text-xs text-slate-500">
                  Интерактивный превью-индикатор жизненного цикла и готовности кубсата 1U:
                </div>
                <MissionStatusBadge
                  activeProject={previewProject}
                  projects={projects}
                  tasks={tasks}
                  programs={programs}
                  currentUser={null}
                  onSelectProject={() => {}}
                  onUpdateLifecycleStage={async (_id, st) => {
                    if (st) setLifecycleStage(st);
                  }}
                  onRequireAuth={() => {}}
                  onOpenTasks={() => {}}
                />
              </div>
            )}

            {selectedStory === 'thermal-heatmap' && (
              <ThermalPowerHeatmap
                programName="Storybook: Beacon + Thermal Profile"
                telemetry={telemetry}
                onSimulateThermalBurst={() => setSimScenario('high_tumble')}
              />
            )}

            {selectedStory === 'crm-deal-card' && (
              <div className="max-w-xs border border-slate-200 rounded-md p-3 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700">
                    {dealStage}
                  </span>
                  <span className="text-[11px] font-mono text-sky-700">PAYLOAD</span>
                </div>
                <div className="text-xs font-bold text-slate-900">
                  Грант на лётную интеграцию 1U в ТПК
                </div>
                <div className="text-[11px] text-slate-600">Аэрокосмический центр «СтратоСфера»</div>
                <div className="text-xs font-mono font-bold text-slate-900">
                  {dealAmount.toLocaleString('ru-RU')} ₽
                </div>
              </div>
            )}

            {selectedStory === 'traefik-route-card' && (
              <div className="border border-slate-200 rounded-md p-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono font-bold text-slate-900">directus-cms</div>
                  <div className="text-[11px] font-mono text-slate-500">
                    PathPrefix(`/api/directus`, `/api/refine`) → :8055
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-600">{traefikLatency} ms</span>
                  <span
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                      traefikEnabled
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {traefikEnabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
              </div>
            )}

            {selectedStory === 'design-tokens' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { name: 'Slate 900', hex: '#0f172a', cls: 'bg-slate-900' },
                    { name: 'Sky 600', hex: '#0284c7', cls: 'bg-sky-600' },
                    { name: 'Emerald 600', hex: '#059669', cls: 'bg-emerald-600' },
                    { name: 'Amber 600', hex: '#d97706', cls: 'bg-amber-600' },
                  ].map((c) => (
                    <div key={c.name} className="border border-slate-200 rounded-md p-2.5">
                      <div className={`h-8 rounded ${c.cls}`} />
                      <div className="mt-1.5 text-xs font-semibold text-slate-900">{c.name}</div>
                      <div className="text-[11px] font-mono text-slate-500">{c.hex}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 border-t border-slate-100 pt-3">
                  <div className="font-display text-lg font-bold">Plus Jakarta Sans · Display</div>
                  <div className="font-sans text-sm">IBM Plex Sans · Interface Body Copy</div>
                  <div className="font-mono text-xs text-sky-700">JetBrains Mono · Telemetry & SQL 0xFF 0x55</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Controls */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="text-xs font-bold text-slate-900">Controls / Props</div>
          {selectedStory === 'mission-badge' && (
            <div className="flex flex-wrap gap-2">
              {(['design', 'assembly', 'testing', 'launch'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setLifecycleStage(st)}
                  className={`px-3 py-1 text-xs font-mono rounded ${
                    lifecycleStage === st ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  lifecycleStage="{st}"
                </button>
              ))}
            </div>
          )}
          {selectedStory === 'thermal-heatmap' && (
            <div className="flex flex-wrap gap-2">
              {(['leo_nominal', 'low_battery', 'high_tumble', 'ground_pass'] as const).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setSimScenario(sc)}
                  className={`px-3 py-1 text-xs font-mono rounded ${
                    simScenario === sc ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  scenario="{sc}"
                </button>
              ))}
            </div>
          )}
          {selectedStory === 'crm-deal-card' && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-2">
                <span className="font-mono text-slate-600">amountRub:</span>
                <input
                  type="number"
                  value={dealAmount}
                  onChange={(e) => setDealAmount(Number(e.target.value) || 0)}
                  className="px-2 py-1 border border-slate-200 rounded font-mono w-28"
                />
              </label>
              <select
                value={dealStage}
                onChange={(e) => setDealStage(e.target.value as typeof dealStage)}
                className="px-2 py-1 border border-slate-200 rounded font-mono bg-white"
              >
                <option value="contract">contract</option>
                <option value="flight_ready">flight_ready</option>
                <option value="completed">completed</option>
              </select>
            </div>
          )}
          {selectedStory === 'traefik-route-card' && (
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2 font-mono">
                <input
                  type="checkbox"
                  checked={traefikEnabled}
                  onChange={(e) => setTraefikEnabled(e.target.checked)}
                />
                enabled={String(traefikEnabled)}
              </label>
              <label className="flex items-center gap-2 font-mono">
                avgLatencyMs:
                <input
                  type="range"
                  min={1}
                  max={120}
                  value={traefikLatency}
                  onChange={(e) => setTraefikLatency(Number(e.target.value))}
                />
                {traefikLatency}ms
              </label>
            </div>
          )}
          {selectedStory === 'design-tokens' && (
            <div className="text-xs text-slate-500">
              Токены определены в <code>src/index.css</code> и применяются ко всем модулям DeepSeek-Harness.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
