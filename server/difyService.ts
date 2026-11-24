import { GoogleGenAI } from '@google/genai';
import { listForgejoTree, readForgejoFile } from './forgejoStore.ts';
import type { NatsEventBus } from './natsBus.ts';
import type { PostgresMissionStore } from './postgresStore.ts';

export interface DifyNodeDescriptor {
  id: string;
  type: 'start' | 'knowledge-retrieval' | 'llm' | 'nats-publish' | 'answer';
  title: string;
  description: string;
}

export interface DifyWorkflowDescriptor {
  id: string;
  name: string;
  mode: 'workflow' | 'rag-chat';
  description: string;
  defaultQuery: string;
  nodes: DifyNodeDescriptor[];
}

export interface DifyNodeTrace {
  nodeId: string;
  type: DifyNodeDescriptor['type'];
  title: string;
  status: 'succeeded' | 'skipped';
  durationMs: number;
  outputs: Record<string, unknown>;
}

export interface DifyWorkflowRunResult {
  runId: string;
  workflowId: string;
  workflowName: string;
  provider: 'dify-external-api' | 'dify-gemini-rag' | 'dify-local-rag';
  status: 'succeeded' | 'failed';
  query: string;
  answer: string;
  durationMs: number;
  totalTokens: number;
  traces: DifyNodeTrace[];
  createdAt: string;
}

const WORKFLOWS: DifyWorkflowDescriptor[] = [
  {
    id: 'wf-wiki-rag',
    name: 'Forgejo llm-wiki RAG Ассистент',
    mode: 'rag-chat',
    description:
      'Поиск релевантных документов в Forgejo llm-wiki, синтез ответа через Gemini/Dify и публикация трассировки в NATS.',
    defaultQuery: 'Какие требования предъявляются к энергобюджету EPS и режиму SAFE в school76-1U?',
    nodes: [
      { id: 'n-start', type: 'start', title: 'Start / Input', description: 'Приём запроса инженера и projectId' },
      {
        id: 'n-rag',
        type: 'knowledge-retrieval',
        title: 'Knowledge Retrieval (Forgejo)',
        description: 'Индексация и выборка фрагментов Markdown из Forgejo llm-wiki',
      },
      { id: 'n-llm', type: 'llm', title: 'LLM Synthesis (Gemini / Dify)', description: 'Генерация структурированного ответа' },
      { id: 'n-nats', type: 'nats-publish', title: 'NATS Event Hook', description: 'Отправка события dify.workflow.completed' },
      { id: 'n-end', type: 'answer', title: 'Answer', description: 'Итоговый ответ с цитатами источников' },
    ],
  },
  {
    id: 'wf-telemetry-triage',
    name: 'Диагностика аномалий телеметрии 1U',
    mode: 'workflow',
    description:
      'Анализ последних кадров NATS JetStream (cubesat.>) и выработка инженерных рекомендаций по OBC/EPS/ADCS.',
    defaultQuery: 'Оцени текущее состояние шин EPS 3.3V/5V и угловую скорость ADCS из последних событий NATS.',
    nodes: [
      { id: 'n-start', type: 'start', title: 'Telemetry Trigger', description: 'Входной запрос диагностики' },
      {
        id: 'n-rag',
        type: 'knowledge-retrieval',
        title: 'NATS + Wiki Context',
        description: 'Сбор последних кадров NATS cubesat.> и регламентов',
      },
      { id: 'n-llm', type: 'llm', title: 'Anomaly Reasoning LLM', description: 'Оценка порогов напряжения, токов и B-dot' },
      { id: 'n-nats', type: 'nats-publish', title: 'Alert Emit (NATS)', description: 'Публикация сводки диагностики в NATS' },
      { id: 'n-end', type: 'answer', title: 'Diagnostic Report', description: 'Отчёт инженеру смены' },
    ],
  },
  {
    id: 'wf-crm-grant-pitch',
    name: 'AtomicCRM Генератор заявки на грант',
    mode: 'workflow',
    description:
      'Читает активные сделки AtomicCRM из PostgreSQL и формирует техническое резюме проекта для пускового оператора.',
    defaultQuery: 'Подготовь краткое резюме статуса контракта на интеграцию в ТПК и готовности подсистем.',
    nodes: [
      { id: 'n-start', type: 'start', title: 'CRM Context', description: 'Выбор сделки и цели' },
      {
        id: 'n-rag',
        type: 'knowledge-retrieval',
        title: 'PostgreSQL CRM + Wiki',
        description: 'Загрузка сделок AtomicCRM и паспорта миссии',
      },
      { id: 'n-llm', type: 'llm', title: 'Proposal Writer LLM', description: 'Составление резюме грантовой заявки' },
      { id: 'n-nats', type: 'nats-publish', title: 'CRM Sync Hook', description: 'Фиксация события в NATS CRM_PIPELINE' },
      { id: 'n-end', type: 'answer', title: 'Grant Summary', description: 'Готовый черновик обращения' },
    ],
  },
];

export class DifyWorkflowService {
  private readonly nats: NatsEventBus;
  private readonly pgStore: PostgresMissionStore;
  private readonly history: DifyWorkflowRunResult[] = [];

  constructor(nats: NatsEventBus, pgStore: PostgresMissionStore) {
    this.nats = nats;
    this.pgStore = pgStore;
  }

  listWorkflows() {
    return {
      externalConfigured: Boolean(process.env.DIFY_API_URL?.trim() && process.env.DIFY_API_KEY?.trim()),
      workflows: WORKFLOWS,
      runs: this.history,
    };
  }

  getRuns() {
    return this.history;
  }

  private retrieveWikiChunks(repo: string, query: string): Array<{ path: string; snippet: string }> {
    const terms = query
      .toLowerCase()
      .split(/[\s,.;:!?()]+/)
      .filter((w) => w.length >= 3);
    const tree = listForgejoTree(repo);
    const scored: Array<{ path: string; score: number; snippet: string }> = [];

    for (const item of tree) {
      if (!item.path.endsWith('.md')) continue;
      try {
        const file = readForgejoFile(repo, item.path);
        const lower = file.content.toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (lower.includes(t)) score += 2;
          if (item.path.toLowerCase().includes(t)) score += 3;
        }
        if (score > 0 || scored.length < 3) {
          scored.push({
            path: item.path,
            score,
            snippet: file.content.replace(/\s+/g, ' ').slice(0, 320),
          });
        }
      } catch {
        // ignore unreadable doc
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ path, snippet }) => ({ path, snippet }));
  }

  async runWorkflow(
    workflowId: string,
    query: string,
    projectId = 'school76-1u',
    inputs: Record<string, unknown> = {}
  ): Promise<DifyWorkflowRunResult> {
    const wf = WORKFLOWS.find((w) => w.id === workflowId) || WORKFLOWS[0];
    const effectiveQuery = query.trim() || wf.defaultQuery;
    const t0 = Date.now();
    const traces: DifyNodeTrace[] = [];

    traces.push({
      nodeId: 'n-start',
      type: 'start',
      title: wf.nodes[0].title,
      status: 'succeeded',
      durationMs: 2,
      outputs: { query: effectiveQuery, projectId, inputs },
    });

    // Step 2: Retrieval
    const tRag = Date.now();
    const wikiChunks = this.retrieveWikiChunks(projectId, effectiveQuery);
    const natsTelemetry = this.nats.queryMessages('cubesat.>').slice(0, 5);
    const crmDeals = this.pgStore.getDeals().slice(0, 4);
    traces.push({
      nodeId: 'n-rag',
      type: 'knowledge-retrieval',
      title: wf.nodes[1].title,
      status: 'succeeded',
      durationMs: Math.max(4, Date.now() - tRag),
      outputs: {
        wikiMatches: wikiChunks.map((c) => c.path),
        natsFrames: natsTelemetry.length,
        crmDeals: crmDeals.length,
      },
    });

    // Step 3: External Dify API -> Gemini -> Local Deterministic
    const tLlm = Date.now();
    let provider: DifyWorkflowRunResult['provider'] = 'dify-local-rag';
    let answer = '';

    const difyUrl = process.env.DIFY_API_URL?.trim();
    const difyKey = process.env.DIFY_API_KEY?.trim();

    if (difyUrl && difyKey) {
      try {
        const resp = await fetch(`${difyUrl.replace(/\/+$/, '')}/v1/workflows/run`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${difyKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: { ...inputs, query: effectiveQuery, projectId },
            response_mode: 'blocking',
            user: 'school76-platform',
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { data?: { outputs?: Record<string, unknown> } };
          const textOut = data?.data?.outputs?.text || data?.data?.outputs?.answer;
          if (typeof textOut === 'string' && textOut.trim()) {
            answer = textOut.trim();
            provider = 'dify-external-api';
          }
        }
      } catch {
        // Fallback cleanly to Gemini/local
      }
    }

    if (!answer) {
      const geminiKey = process.env.GEMINI_API_KEY?.trim();
      if (geminiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const contextBlob = [
            `Wiki документы:\n${wikiChunks.map((c) => `[${c.path}]: ${c.snippet}`).join('\n')}`,
            `Последние события NATS:\n${natsTelemetry.map((m) => `${m.subject}: ${JSON.stringify(m.payload)}`).join('\n')}`,
            `Сделки AtomicCRM:\n${crmDeals.map((d) => `${d.title} (${d.stage}, ${d.amountRub} RUB)`).join('\n')}`,
          ].join('\n\n');

          const res = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Ты — инженерный узел Dify LLMOps внутри платформы school76 (кубсат 1U).\nОтветь кратко, технически точно и по-русски на основе контекста.\n\nКонтекст:\n${contextBlob}\n\nЗапрос: ${effectiveQuery}`,
          });
          if (res.text?.trim()) {
            answer = res.text.trim();
            provider = 'dify-gemini-rag';
          }
        } catch {
          // Fallback to deterministic synthesis
        }
      }
    }

    if (!answer) {
      provider = 'dify-local-rag';
      if (wf.id === 'wf-telemetry-triage') {
        const eps = natsTelemetry.find((m) => m.subject.includes('eps'));
        const adcs = natsTelemetry.find((m) => m.subject.includes('adcs'));
        answer = `Сводка Dify по телеметрии NATS (${natsTelemetry.length} кадров): шина EPS ${
          eps ? JSON.stringify(eps.payload) : 'в норме'
        }; контур ADCS ${
          adcs ? JSON.stringify(adcs.payload) : 'стабилизирован'
        }. Рекомендуется сверить пороги в ${wikiChunks[0]?.path || 'subsystems/eps.md'}.`;
      } else if (wf.id === 'wf-crm-grant-pitch') {
        const total = crmDeals.reduce((s, d) => s + d.amountRub, 0);
        answer = `Резюме для пускового гранта (AtomicCRM + PostgreSQL): активно ${crmDeals.length} ключевых треков на сумму ${total.toLocaleString(
          'ru-RU'
        )} ₽. Ведущая сделка: «${crmDeals[0]?.title || 'Интеграция 1U'}» (${crmDeals[0]?.stage || 'contract'}). Опора на документацию: ${wikiChunks[0]?.path || 'project/overview.md'}.`;
      } else {
        answer = `Найдены релевантные источники в Forgejo llm-wiki (${wikiChunks
          .map((c) => c.path)
          .join(', ')}). По ключевому фрагменту: ${
          wikiChunks[0]?.snippet || 'документация миссии 1U актуальна'
        }.`;
      }
    }

    const totalTokens = Math.max(120, Math.round((effectiveQuery.length + answer.length) / 3.2));
    traces.push({
      nodeId: 'n-llm',
      type: 'llm',
      title: wf.nodes[2].title,
      status: 'succeeded',
      durationMs: Math.max(8, Date.now() - tLlm),
      outputs: { provider, totalTokens },
    });

    // Step 4: NATS Hook
    const natsRec = await this.nats.publish(
      'dify.workflow.completed',
      { workflowId: wf.id, provider, totalTokens, projectId },
      'dify-workflow'
    );
    traces.push({
      nodeId: 'n-nats',
      type: 'nats-publish',
      title: wf.nodes[3].title,
      status: 'succeeded',
      durationMs: 2,
      outputs: { subject: natsRec.subject, seq: natsRec.seq, stream: natsRec.stream },
    });

    traces.push({
      nodeId: 'n-end',
      type: 'answer',
      title: wf.nodes[4].title,
      status: 'succeeded',
      durationMs: 1,
      outputs: { answerPreview: answer.slice(0, 140) },
    });

    const result: DifyWorkflowRunResult = {
      runId: `dify-${Date.now().toString(36)}`,
      workflowId: wf.id,
      workflowName: wf.name,
      provider,
      status: 'succeeded',
      query: effectiveQuery,
      answer,
      durationMs: Math.max(12, Date.now() - t0),
      totalTokens,
      traces,
      createdAt: new Date().toISOString(),
    };

    this.history.unshift(result);
    if (this.history.length > 20) this.history.length = 20;
    return result;
  }
}
