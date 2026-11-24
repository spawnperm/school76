import React, { useMemo, useState } from 'react';
import {
  Blocks,
  Check,
  Cpu,
  Download,
  Lock,
  Power,
  Puzzle,
  RefreshCw,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  HarnessRuntimeSnapshot,
  MarketplaceCategory,
  MarketplaceEntry,
  MarketplaceSnapshot,
} from '../harness/types.ts';
import type { WorkspaceTab } from '../harness/frontendRegistry.ts';

interface MarketplaceViewProps {
  marketplace: MarketplaceSnapshot | null;
  snapshot: HarnessRuntimeSnapshot | null;
  loading: boolean;
  busyAction: string | null;
  error: string | null;
  onRefresh: () => void;
  onInstallModule: (moduleId: string) => Promise<MarketplaceSnapshot | null>;
  onUninstallModule: (moduleId: string) => Promise<MarketplaceSnapshot | null>;
  onActivateModule: (moduleId: string) => Promise<MarketplaceSnapshot | null>;
  onDeactivateModule: (moduleId: string) => Promise<MarketplaceSnapshot | null>;
  onOpenTab: (tab: WorkspaceTab) => void;
}

type FilterTab = 'all' | MarketplaceCategory | 'installed';

const CATEGORY_LABEL: Record<MarketplaceCategory, string> = {
  device: 'Оборудование',
  portal: 'Модуль портала',
  extension: 'Расширение mBlock',
};

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  marketplace,
  snapshot,
  loading,
  busyAction,
  error,
  onRefresh,
  onInstallModule,
  onUninstallModule,
  onActivateModule,
  onDeactivateModule,
  onOpenTab,
}) => {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const modules = useMemo(() => marketplace?.modules ?? [], [marketplace]);

  const activeDevice = useMemo(
    () => modules.find((m) => m.category === 'device' && m.active) || null,
    [modules]
  );

  const counts = useMemo(() => {
    const installed = modules.filter((m) => m.installed).length;
    const devices = modules.filter((m) => m.category === 'device').length;
    const portal = modules.filter((m) => m.category === 'portal').length;
    const extension = modules.filter((m) => m.category === 'extension').length;
    const activePortal = modules.filter((m) => m.category === 'portal' && m.active).length;
    const activeExtensions = modules.filter((m) => m.category === 'extension' && m.active).length;
    return { installed, devices, portal, extension, activePortal, activeExtensions };
  }, [modules]);

  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return modules.filter((m) => {
      if (filterTab === 'installed' && !m.installed) return false;
      if (
        filterTab !== 'all' &&
        filterTab !== 'installed' &&
        m.category !== filterTab
      ) {
        return false;
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.shortLabel.toLowerCase().includes(q) ||
        m.subsystem.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.author.toLowerCase().includes(q)
      );
    });
  }, [modules, filterTab, searchQuery]);

  const handleActivateWithDeps = async (mod: MarketplaceEntry) => {
    const updated = await onActivateModule(mod.id);
    if (
      updated &&
      mod.category === 'device' &&
      mod.recommendedExtensions?.length
    ) {
      // Auto-install and enable recommended extensions if not active yet (mBlock Device Center behavior)
      for (const extId of mod.recommendedExtensions) {
        const target = updated.modules.find((m) => m.id === extId);
        if (target && !target.active) {
          await onActivateModule(extId);
        }
      }
    }
  };

  if (loading && !marketplace) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-600">
          Загрузка каталога оборудования и программных модулей Маркетплейса…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
      {/* Header & Active Hardware Summary Strip */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2">
              <Puzzle className="w-4 h-4 text-sky-600 shrink-0" />
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Маркетплейс оборудования и программных модулей
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Подключение целевых контроллеров и установка программных модулей по модели mBlock 5 поверх ядра{' '}
              <span className="font-mono text-slate-800">DeepSeek-Harness (Cordis)</span>. Активация модулей
              на лету монтирует разделы портала и обновляет палитру блоков в студии mBlock ПО.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenTab('mblock')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors"
            >
              <Blocks className="w-3.5 h-3.5" />
              Открыть студию mBlock
            </button>
            <button
              type="button"
              onClick={() => onOpenTab('harness')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            >
              Ядро Harness
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Обновить
            </button>
          </div>
        </div>

        {/* Connected Hardware & Runtime Strip (tabular-nums, zero pills) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Активное оборудование
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-sm font-semibold text-slate-900 truncate">
                {activeDevice ? activeDevice.shortLabel : 'Не выбрано'}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums truncate">
              {activeDevice
                ? `${activeDevice.boardProfile} · ${activeDevice.baudRate ?? 115200} бод`
                : 'Подключите устройство ниже'}
            </div>
          </div>

          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Модули портала (Cordis)
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900 font-mono tabular-nums">
              {counts.activePortal} / {counts.portal}
            </div>
            <div className="text-[11px] text-slate-500">
              Активные разделы и швы ядра
            </div>
          </div>

          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Расширения mBlock (.mext)
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900 font-mono tabular-nums">
              {counts.activeExtensions} / {counts.extension}
            </div>
            <div className="text-[11px] text-slate-500">
              Категорий блоков в Blockly
            </div>
          </div>

          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Профиль DeepSeek-Harness
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 font-mono truncate">
              {snapshot?.activeProfileId || 'cubesat-full'}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
              {snapshot
                ? `${snapshot.metrics.activePlugins} плагинов · ${snapshot.metrics.registeredTools} tools`
                : 'Синхронизация…'}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all' as FilterTab, label: `Все (${modules.length})` },
            { id: 'device' as FilterTab, label: `Оборудование (${counts.devices})` },
            { id: 'portal' as FilterTab, label: `Модули портала (${counts.portal})` },
            { id: 'extension' as FilterTab, label: `Расширения mBlock (${counts.extension})` },
            { id: 'installed' as FilterTab, label: `Установленные (${counts.installed})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по модулю, плате или протоколу…"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Marketplace Catalog Grid */}
      {filteredModules.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          По выбранному фильтру модули не найдены.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredModules.map((mod) => {
            const isBusy = busyAction?.endsWith(`:${mod.id}`) ?? false;
            const CategoryIcon =
              mod.category === 'device'
                ? Cpu
                : mod.category === 'extension'
                  ? Blocks
                  : Zap;

            return (
              <article
                key={mod.id}
                className={`bg-white border rounded-lg p-4 flex flex-col justify-between gap-4 transition-colors ${
                  mod.active ? 'border-sky-300 bg-sky-50/15' : 'border-slate-200'
                }`}
              >
                <div className="space-y-2.5">
                  {/* Top row: Category + Version + Status dot */}
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <CategoryIcon className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>
                        {CATEGORY_LABEL[mod.category]} · {mod.subsystem}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 shrink-0 tabular-nums">
                      <span>v{mod.version}</span>
                      <span>·</span>
                      {mod.active ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {mod.category === 'device' ? 'Подключено' : 'Активен'}
                        </span>
                      ) : mod.installed ? (
                        <span className="inline-flex items-center gap-1 font-medium text-sky-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                          Установлен
                        </span>
                      ) : (
                        <span className="text-slate-400">Не установлен</span>
                      )}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 leading-snug flex items-center gap-1.5">
                      <span>{mod.name}</span>
                      {mod.locked && (
                        <Lock
                          className="w-3 h-3 text-slate-400 shrink-0"
                          aria-label="Базовый системный модуль"
                        />
                      )}
                    </h2>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {mod.description}
                    </p>
                  </div>

                  {/* Technical Metadata Row (zero-pill inline monospace) */}
                  <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] font-mono text-slate-500">
                    <div>
                      Автор: <span className="text-slate-700">{mod.author}</span>
                    </div>
                    {mod.protocol && (
                      <div className="truncate">
                        Протокол: <span className="text-slate-700">{mod.protocol}</span>
                      </div>
                    )}
                    {mod.cordisPlugins && mod.cordisPlugins.length > 0 && (
                      <div className="truncate">
                        Cordis: <span className="text-slate-700">{mod.cordisPlugins.join(', ')}</span>
                      </div>
                    )}
                    {mod.toolboxCategoryName && (
                      <div className="truncate">
                        Палитра Blockly: <span className="text-slate-700">{mod.toolboxCategoryName}</span>
                      </div>
                    )}
                    {mod.recommendedExtensions && mod.recommendedExtensions.length > 0 && (
                      <div className="truncate">
                        Реком. модули: <span className="text-slate-700">{mod.recommendedExtensions.length} шт.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Bar */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  {!mod.installed ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void onInstallModule(mod.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5 text-sky-600" />
                        Установить
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleActivateWithDeps(mod)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
                      >
                        <Power className="w-3.5 h-3.5" />
                        {mod.category === 'device' ? 'Подключить' : 'Установить и включить'}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        {mod.active ? (
                          mod.category === 'device' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <Check className="w-3.5 h-3.5" />
                              Активный контроллер
                            </span>
                          ) : mod.locked ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                              <Lock className="w-3 h-3" />
                              Обязательный
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void onDeactivateModule(mod.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
                            >
                              Отключить
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleActivateWithDeps(mod)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
                          >
                            <Power className="w-3.5 h-3.5" />
                            {mod.category === 'device' ? 'Подключить' : 'Активировать'}
                          </button>
                        )}
                      </div>

                      {!mod.locked && !mod.active && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void onUninstallModule(mod.id)}
                          title="Удалить модуль из установленных"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Удалить
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
