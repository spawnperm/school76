import React, { useMemo, useState } from 'react';
import { Refine, useCreate, useDelete, useList, useUpdate } from '@refinedev/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  Mail,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  CrmContactSchema,
  CrmDealSchema,
  type CrmContact,
  type CrmDeal,
  type CrmDealStage,
} from '../schemas/missionSchemas.ts';
import { createSchool76RefineDataProvider, type AuthFetchFn } from '../providers/refineDataProvider.ts';
import type { Subsystem } from '../types/cubesat.ts';

interface AtomicCrmWorkspaceProps {
  authFetch: AuthFetchFn;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
}

const STAGE_META: Array<{ id: CrmDealStage; label: string; cls: string }> = [
  { id: 'lead', label: 'Лид / Заявка', cls: 'bg-slate-100 text-slate-700' },
  { id: 'review', label: 'Тех. экспертиза', cls: 'bg-sky-50 text-sky-700' },
  { id: 'contract', label: 'Договор / Грант', cls: 'bg-amber-50 text-amber-700' },
  { id: 'flight_ready', label: 'Готов к запуску', cls: 'bg-indigo-50 text-indigo-700' },
  { id: 'completed', label: 'Завершено', cls: 'bg-emerald-50 text-emerald-700' },
];

const SEGMENT_LABELS: Record<CrmContact['segment'], string> = {
  school: 'Школа / Кружок',
  university: 'Университет / Лаб',
  launch_provider: 'Пусковой оператор',
  ground_station: 'Станция UHF',
  sponsor: 'Спонсор / Фонд',
  vendor: 'Поставщик',
};

const SUBSYSTEMS: Subsystem[] = ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'];

const queryClient = new QueryClient();

const AtomicCrmInner: React.FC<AtomicCrmWorkspaceProps> = ({
  isAuthenticated,
  onRequireAuth,
}) => {
  const [view, setView] = useState<'deals' | 'contacts'>('deals');
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);

  // New contact draft
  const [cFirstName, setCFirstName] = useState('');
  const [cLastName, setCLastName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cOrg, setCOrg] = useState('');
  const [cRole, setCRole] = useState('');
  const [cSegment, setCSegment] = useState<CrmContact['segment']>('school');
  const [cSub, setCSub] = useState<Subsystem>('OBC');

  // New deal draft
  const [dTitle, setDTitle] = useState('');
  const [dOrg, setDOrg] = useState('');
  const [dAmount, setDAmount] = useState('250000');
  const [dStage, setDStage] = useState<CrmDealStage>('lead');
  const [dSub, setDSub] = useState<Subsystem>('PAYLOAD');

  const contactsQuery = useList<CrmContact>({
    resource: 'crm_contacts',
    filters: search ? [{ field: 'q', operator: 'contains', value: search }] : [],
  });

  const dealsQuery = useList<CrmDeal>({
    resource: 'crm_deals',
    filters: search ? [{ field: 'q', operator: 'contains', value: search }] : [],
  });

  const { mutateAsync: createRecord } = useCreate();
  const { mutateAsync: updateRecord } = useUpdate();
  const { mutateAsync: deleteRecord } = useDelete();

  const contacts = contactsQuery.result?.data ?? [];
  const deals = dealsQuery.result?.data ?? [];

  const pipelineStats = useMemo(() => {
    const totalRub = deals.reduce((s, d) => s + (Number(d.amountRub) || 0), 0);
    const weightedRub = deals.reduce(
      (s, d) => s + ((Number(d.amountRub) || 0) * (Number(d.probabilityPct) || 50)) / 100,
      0
    );
    return {
      totalRub,
      weightedRub: Math.round(weightedRub),
      dealsCount: deals.length,
      contactsCount: contacts.length,
    };
  }, [deals, contacts]);

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setErrorMsg(null);
    const parsed = CrmContactSchema.safeParse({
      firstName: cFirstName.trim(),
      lastName: cLastName.trim(),
      email: cEmail.trim(),
      organization: cOrg.trim(),
      role: cRole.trim() || 'Координатор',
      segment: cSegment,
      subsystemFocus: cSub,
    });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Проверьте поля контакта (Zod)');
      return;
    }
    try {
      await createRecord({ resource: 'crm_contacts', values: parsed.data });
      setCFirstName('');
      setCLastName('');
      setCEmail('');
      setCOrg('');
      setCRole('');
      setShowContactForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка создания контакта');
    }
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setErrorMsg(null);
    const parsed = CrmDealSchema.safeParse({
      title: dTitle.trim(),
      organization: dOrg.trim(),
      stage: dStage,
      amountRub: Number(dAmount) || 0,
      subsystem: dSub,
      probabilityPct: dStage === 'completed' ? 100 : dStage === 'flight_ready' ? 90 : 50,
    });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Проверьте поля сделки (Zod)');
      return;
    }
    try {
      await createRecord({ resource: 'crm_deals', values: parsed.data });
      setDTitle('');
      setDOrg('');
      setDAmount('250000');
      setShowDealForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка создания сделки');
    }
  };

  const handleMoveDealStage = async (deal: CrmDeal, nextStage: CrmDealStage) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setErrorMsg(null);
    try {
      await updateRecord({
        resource: 'crm_deals',
        id: deal.id,
        values: {
          stage: nextStage,
          probabilityPct:
            nextStage === 'completed'
              ? 100
              : nextStage === 'flight_ready'
                ? 95
                : nextStage === 'contract'
                  ? 80
                  : nextStage === 'review'
                    ? 65
                    : 40,
        },
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось обновить этап');
    }
  };

  const handleDelete = async (resource: 'crm_contacts' | 'crm_deals', id: string) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    try {
      await deleteRecord({ resource, id });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Воронка грантов и контрактов</div>
          <div className="mt-1 text-xl font-bold font-mono text-slate-900">
            {pipelineStats.totalRub.toLocaleString('ru-RU')} ₽
          </div>
          <div className="mt-1 text-[11px] text-emerald-700 font-medium">
            Взвешенный прогноз: {pipelineStats.weightedRub.toLocaleString('ru-RU')} ₽
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Активные сделки AtomicCRM</div>
          <div className="mt-1 text-xl font-bold font-mono text-slate-900">
            {pipelineStats.dealsCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Движок: @refinedev/core + Directus</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Контакты партнёров и станций</div>
          <div className="mt-1 text-xl font-bold font-mono text-slate-900">
            {pipelineStats.contactsCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Валидация: Zod v4 Schema</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Синхронизация</div>
          <div className="mt-1 text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            PostgreSQL + NATS CRM_PIPELINE
          </div>
          <div className="mt-1 text-[11px] text-slate-500">События публикуются в реальном времени</div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('deals')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              view === 'deals'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Воронка сделок ({deals.length})
          </button>
          <button
            type="button"
            onClick={() => setView('contacts')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              view === 'contacts'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Контакты и организации ({contacts.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по CRM..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:border-sky-500 w-52"
            />
          </div>
          {view === 'deals' ? (
            <button
              type="button"
              onClick={() => setShowDealForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Новая сделка
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowContactForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Новый контакт
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2.5 rounded-lg text-xs">
          {errorMsg}
        </div>
      )}

      {/* Create Deal Form */}
      {showDealForm && view === 'deals' && (
        <form
          onSubmit={handleCreateDeal}
          className="bg-white border border-sky-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Название сделки / гранта
            </label>
            <input
              value={dTitle}
              onChange={(e) => setDTitle(e.target.value)}
              placeholder="Например: Поставка антенны UHF 435 МГц"
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Организация
            </label>
            <input
              value={dOrg}
              onChange={(e) => setDOrg(e.target.value)}
              placeholder="НИИ / Школа / Фонд"
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Бюджет (₽) и подсистема
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                min={0}
                value={dAmount}
                onChange={(e) => setDAmount(e.target.value)}
                className="w-28 px-2 py-1.5 text-xs border border-slate-200 rounded-md font-mono"
              />
              <select
                value={dSub}
                onChange={(e) => setDSub(e.target.value as Subsystem)}
                className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              >
                {SUBSYSTEMS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <select
              value={dStage}
              onChange={(e) => setDStage(e.target.value as CrmDealStage)}
              className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
            >
              {STAGE_META.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800"
            >
              Сохранить
            </button>
          </div>
        </form>
      )}

      {/* Create Contact Form */}
      {showContactForm && view === 'contacts' && (
        <form
          onSubmit={handleCreateContact}
          className="bg-white border border-sky-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        >
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Имя</label>
            <input
              value={cFirstName}
              onChange={(e) => setCFirstName(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Фамилия</label>
            <input
              value={cLastName}
              onChange={(e) => setCLastName(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={cEmail}
              onChange={(e) => setCEmail(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Организация
            </label>
            <input
              value={cOrg}
              onChange={(e) => setCOrg(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Сегмент / Подсистема
            </label>
            <div className="flex gap-1">
              <select
                value={cSegment}
                onChange={(e) => setCSegment(e.target.value as CrmContact['segment'])}
                className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              >
                {Object.entries(SEGMENT_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
              <select
                value={cSub}
                onChange={(e) => setCSub(e.target.value as Subsystem)}
                className="w-20 px-1.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              >
                {SUBSYSTEMS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={cRole}
              onChange={(e) => setCRole(e.target.value)}
              placeholder="Должность"
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800"
            >
              Добавить
            </button>
          </div>
        </form>
      )}

      {/* Deals Kanban */}
      {view === 'deals' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {STAGE_META.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage === stage.id);
            const stageSum = stageDeals.reduce((s, d) => s + (Number(d.amountRub) || 0), 0);
            return (
              <div
                key={stage.id}
                className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-2.5 min-h-[300px]"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${stage.cls}`}>
                    {stage.label}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">{stageDeals.length}</span>
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {stageSum.toLocaleString('ru-RU')} ₽
                </div>
                <div className="space-y-2 flex-1">
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="border border-slate-200 rounded-md p-2.5 bg-slate-50/70 hover:bg-white transition-colors space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-semibold text-slate-900 leading-snug">
                          {deal.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDelete('crm_deals', deal.id)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 shrink-0"
                          title="Удалить сделку"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-600 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{deal.organization}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="font-semibold text-slate-800">
                          {Number(deal.amountRub).toLocaleString('ru-RU')} ₽
                        </span>
                        <span className="text-sky-700">{deal.subsystem}</span>
                      </div>
                      <select
                        value={deal.stage}
                        onChange={(e) =>
                          void handleMoveDealStage(deal, e.target.value as CrmDealStage)
                        }
                        className="w-full mt-1 px-2 py-1 text-[11px] border border-slate-200 rounded bg-white text-slate-700"
                      >
                        {STAGE_META.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            Этап: {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="text-[11px] text-slate-400 text-center py-6">Нет сделок</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Contacts Table */}
      {view === 'contacts' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2.5 px-4">Контакт</th>
                  <th className="py-2.5 px-4">Организация и роль</th>
                  <th className="py-2.5 px-4">Сегмент</th>
                  <th className="py-2.5 px-4">Подсистема</th>
                  <th className="py-2.5 px-4">Email</th>
                  <th className="py-2.5 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      <div>{c.organization}</div>
                      <div className="text-[11px] text-slate-500">{c.role}</div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {SEGMENT_LABELS[c.segment] || c.segment}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-sky-700">{c.subsystemFocus}</td>
                    <td className="py-2.5 px-4 text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" />
                        {c.email}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDelete('crm_contacts', c.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Удалить контакт"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export const AtomicCrmWorkspace: React.FC<AtomicCrmWorkspaceProps> = (props) => {
  const dataProvider = useMemo(
    () => createSchool76RefineDataProvider(props.authFetch),
    [props.authFetch]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Refine
        dataProvider={dataProvider}
        resources={[
          { name: 'crm_deals' },
          { name: 'crm_contacts' },
          { name: 'cubesat_tasks' },
        ]}
        options={{ disableTelemetry: true }}
      >
        <AtomicCrmInner {...props} />
      </Refine>
    </QueryClientProvider>
  );
};
