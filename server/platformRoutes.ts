import type express from 'express';
import {
  CrmContactSchema,
  CrmDealSchema,
  DifyWorkflowRunInputSchema,
  NatsPublishSchema,
  PostgresQuerySchema,
  generateSchool76OpenApiSpec,
} from '../src/schemas/missionSchemas.ts';
import type { PostgresMissionStore } from './postgresStore.ts';
import type { NatsEventBus } from './natsBus.ts';
import type { DirectusHeadlessService } from './directusService.ts';
import type { TinaCmsService } from './tinacmsService.ts';
import type { TraefikGateway } from './traefikGateway.ts';
import type { DifyWorkflowService } from './difyService.ts';
import type { ServerHarnessRuntime } from './harness/runtime.ts';

export interface PlatformRoutesDeps {
  pgStore: PostgresMissionStore;
  nats: NatsEventBus;
  directus: DirectusHeadlessService;
  tinacms: TinaCmsService;
  traefik: TraefikGateway;
  dify: DifyWorkflowService;
  harness: ServerHarnessRuntime;
  requireAuth: express.RequestHandler;
}

export function registerPlatformRoutes(app: express.Express, deps: PlatformRoutesDeps): void {
  const { pgStore, nats, directus, tinacms, traefik, dify, harness, requireAuth } = deps;

  // =========================================================================
  // SCALAR / OPENAPI 3.1 (generated dynamically from Zod schemas)
  // =========================================================================
  app.get('/api/openapi.json', (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const serverUrl = host ? `${proto}://${host}` : '/';
    res.json(generateSchool76OpenApiSpec(serverUrl));
  });

  // =========================================================================
  // POSTGRESQL RELATIONAL SCHEMA & SQL CONSOLE
  // =========================================================================
  app.get('/api/postgres/schema', (_req, res) => {
    res.json({
      connection: pgStore.getConnectionSummary(),
      tables: pgStore.getTablesSchema(),
    });
  });

  app.post('/api/postgres/query', async (req, res) => {
    const parsed = PostgresQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Некорректный SQL-запрос',
      });
      return;
    }
    const result = await pgStore.executeReadOnlySql(parsed.data.sql);
    res.status(result.ok ? 200 : 400).json(result);
  });

  // =========================================================================
  // DIRECTUS HEADLESS CMS & DATA STUDIO
  // =========================================================================
  app.get('/api/directus/server/info', (_req, res) => {
    res.json(directus.getServerInfo());
  });

  app.get('/api/directus/collections', (_req, res) => {
    res.json({ data: directus.getCollections() });
  });

  app.get('/api/directus/items/:collection', (req, res) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const result = directus.listItems(req.params.collection, search);
      res.json({
        data: result.data,
        meta: { total_count: result.total, filter_count: result.total },
      });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Collection error' });
    }
  });

  app.get('/api/directus/items/:collection/:id', (req, res) => {
    try {
      const item = directus.getItem(req.params.collection, req.params.id);
      if (!item) {
        res.status(404).json({ error: 'Запись не найдена' });
        return;
      }
      res.json({ data: item });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Collection error' });
    }
  });

  app.post('/api/directus/items/:collection', requireAuth, async (req, res) => {
    try {
      const created = await directus.createItem(req.params.collection, req.body);
      res.status(201).json({ data: created });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Create failed' });
    }
  });

  app.patch('/api/directus/items/:collection/:id', requireAuth, async (req, res) => {
    try {
      const updated = await directus.updateItem(req.params.collection, req.params.id, req.body);
      res.json({ data: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' });
    }
  });

  app.delete('/api/directus/items/:collection/:id', requireAuth, async (req, res) => {
    try {
      const deleted = await directus.deleteItem(req.params.collection, req.params.id);
      res.json({ data: deleted });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Delete failed' });
    }
  });

  app.get('/api/directus/flows', (_req, res) => {
    res.json({ data: directus.getFlows() });
  });

  app.post('/api/directus/flows/:flowId/trigger', requireAuth, async (req, res) => {
    try {
      const result = await directus.triggerFlow(req.params.flowId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Flow trigger failed' });
    }
  });

  // =========================================================================
  // REFINE REST ADAPTER & ATOMIC CRM
  // =========================================================================
  app.get('/api/refine/:resource', (req, res) => {
    try {
      const search = typeof req.query.q === 'string' ? req.query.q : undefined;
      const result = directus.listItems(req.params.resource, search);
      res.setHeader('X-Total-Count', String(result.total));
      res.json(result.data);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Resource not found' });
    }
  });

  app.get('/api/refine/:resource/:id', (req, res) => {
    try {
      const item = directus.getItem(req.params.resource, req.params.id);
      if (!item) {
        res.status(404).json({ error: 'Record not found' });
        return;
      }
      res.json(item);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Resource not found' });
    }
  });

  app.post('/api/refine/:resource', requireAuth, async (req, res) => {
    try {
      const created = await directus.createItem(req.params.resource, req.body);
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Create failed' });
    }
  });

  app.patch('/api/refine/:resource/:id', requireAuth, async (req, res) => {
    try {
      const updated = await directus.updateItem(req.params.resource, req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' });
    }
  });

  app.delete('/api/refine/:resource/:id', requireAuth, async (req, res) => {
    try {
      const result = await directus.deleteItem(req.params.resource, req.params.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Delete failed' });
    }
  });

  app.get('/api/crm/contacts', (_req, res) => {
    res.json({ contacts: pgStore.getContacts() });
  });

  app.post('/api/crm/contacts', requireAuth, async (req, res) => {
    const parsed = CrmContactSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Ошибка валидации контакта' });
      return;
    }
    const created = await directus.createItem('crm_contacts', parsed.data);
    res.status(201).json({ contact: created });
  });

  app.get('/api/crm/deals', (_req, res) => {
    res.json({ deals: pgStore.getDeals() });
  });

  app.post('/api/crm/deals', requireAuth, async (req, res) => {
    const parsed = CrmDealSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Ошибка валидации сделки' });
      return;
    }
    const created = await directus.createItem('crm_deals', parsed.data);
    res.status(201).json({ deal: created });
  });

  // =========================================================================
  // TINACMS GIT-BACKED CONTENT STUDIO
  // =========================================================================
  app.get('/api/tinacms/collections', (_req, res) => {
    res.json({ collections: tinacms.getCollections() });
  });

  app.get('/api/tinacms/documents', (req, res) => {
    const repo = typeof req.query.repo === 'string' && req.query.repo.trim() ? req.query.repo.trim() : 'school76-1u';
    res.json({
      collections: tinacms.getCollections(),
      documents: tinacms.listDocuments(repo),
    });
  });

  app.post('/api/tinacms/documents', requireAuth, async (req, res) => {
    try {
      const repo = typeof req.body?.repo === 'string' && req.body.repo.trim() ? req.body.repo.trim() : 'school76-1u';
      const user = (req as express.Request & { currentUser?: { displayName: string } }).currentUser;
      const saved = await tinacms.saveDocument(repo, req.body, user?.displayName);
      res.json({ ok: true, document: saved });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'TinaCMS save failed' });
    }
  });

  // =========================================================================
  // NATS JETSTREAM EVENT BUS
  // =========================================================================
  app.get('/api/nats/status', (_req, res) => {
    res.json(nats.getStatus());
  });

  app.get('/api/nats/messages', (req, res) => {
    const subject = typeof req.query.subject === 'string' ? req.query.subject : '>';
    res.json({
      status: nats.getStatus(),
      subjectFilter: subject,
      messages: nats.queryMessages(subject),
    });
  });

  app.post('/api/nats/publish', requireAuth, async (req, res) => {
    const parsed = NatsPublishSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Некорректное сообщение NATS' });
      return;
    }
    const user = (req as express.Request & { currentUser?: { displayName: string } }).currentUser;
    const rec = await nats.publish(
      parsed.data.subject,
      parsed.data.payload,
      user?.displayName || 'engineer',
      parsed.data.stream
    );
    res.status(201).json({ ok: true, message: rec });
  });

  // =========================================================================
  // DIFY LLMOPS WORKFLOWS
  // =========================================================================
  app.get('/api/dify/workflows', (_req, res) => {
    res.json(dify.listWorkflows());
  });

  app.post('/api/dify/workflows/:workflowId/run', requireAuth, async (req, res) => {
    const parsed = DifyWorkflowRunInputSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Некорректные параметры запуска Dify' });
      return;
    }
    try {
      const result = await dify.runWorkflow(
        req.params.workflowId,
        parsed.data.query || '',
        parsed.data.projectId,
        parsed.data.inputs
      );
      res.json({ ok: true, run: result });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Dify workflow error' });
    }
  });

  // =========================================================================
  // TRAEFIK DYNAMIC GATEWAY
  // =========================================================================
  app.get('/api/traefik/overview', (_req, res) => {
    res.json({
      ...traefik.getOverview(),
      dynamicYaml: traefik.toDynamicYaml(),
    });
  });

  app.post('/api/traefik/routers', requireAuth, (req, res) => {
    try {
      const router = traefik.upsertRouter(req.body);
      res.status(201).json({ ok: true, router, dynamicYaml: traefik.toDynamicYaml() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Traefik router validation failed' });
    }
  });

  app.post('/api/traefik/routers/:routerId/toggle', requireAuth, (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    const updated = traefik.toggleRouter(req.params.routerId, enabled);
    if (!updated) {
      res.status(404).json({ error: 'Маршрут Traefik не найден' });
      return;
    }
    res.json({ ok: true, router: updated, dynamicYaml: traefik.toDynamicYaml() });
  });

  app.post('/api/traefik/middlewares/:middlewareId/toggle', requireAuth, (req, res) => {
    const active = Boolean(req.body?.active);
    const updated = traefik.toggleMiddleware(req.params.middlewareId, active);
    if (!updated) {
      res.status(404).json({ error: 'Middleware Traefik не найден' });
      return;
    }
    res.json({ ok: true, middleware: updated, dynamicYaml: traefik.toDynamicYaml() });
  });

  // =========================================================================
  // ARCHIFY LIVE TOPOLOGY GRAPH
  // =========================================================================
  app.get('/api/archify/topology', (_req, res) => {
    const snap = harness.getSnapshot();
    const pgConn = pgStore.getConnectionSummary();
    const natsStatus = nats.getStatus();
    const traefikOverview = traefik.getOverview();
    const collections = directus.getCollections();

    const nodes = [
      { id: 'traefik', label: 'Traefik v3 Gateway', layer: 'edge', tech: 'Traefik', status: 'healthy', metric: `${traefikOverview.routers.filter((r) => r.enabled).length} routers`, x: 420, y: 40 },
      { id: 'refine', label: 'Refine + AtomicCRM', layer: 'frontend', tech: 'Refine + React 19', status: 'healthy', metric: `${pgStore.getDeals().length} deals`, x: 140, y: 170 },
      { id: 'storybook', label: 'Storybook UI Explorer', layer: 'frontend', tech: 'Storybook CSF', status: 'healthy', metric: '6 stories', x: 420, y: 170 },
      { id: 'scalar', label: 'Scalar OpenAPI 3.1', layer: 'frontend', tech: 'Scalar + Zod', status: 'healthy', metric: 'OpenAPI 3.1', x: 700, y: 170 },
      { id: 'directus', label: 'Directus Data Studio', layer: 'services', tech: 'Directus CMS', status: 'healthy', metric: `${collections.length} collections`, x: 140, y: 310 },
      { id: 'tinacms', label: 'TinaCMS Git Editor', layer: 'services', tech: 'TinaCMS + Forgejo', status: 'healthy', metric: `${tinacms.listDocuments().length} docs`, x: 330, y: 310 },
      { id: 'dify', label: 'Dify LLMOps Engine', layer: 'services', tech: 'Dify + Gemini RAG', status: 'healthy', metric: `${dify.getRuns().length} runs`, x: 520, y: 310 },
      { id: 'zod', label: 'Zod Contract Core', layer: 'services', tech: 'Zod v4 Validation', status: 'healthy', metric: '7 schemas', x: 700, y: 310 },
      { id: 'postgres', label: 'PostgreSQL 17 Store', layer: 'data', tech: pgConn.externalConfigured ? 'pg.Pool' : 'PG-Compat SQL', status: 'healthy', metric: `${pgStore.getTablesSchema().length} tables`, x: 190, y: 450 },
      { id: 'nats', label: 'NATS JetStream Bus', layer: 'data', tech: 'NATS + WS Bridge', status: 'healthy', metric: `${natsStatus.totalMessages} msgs`, x: 420, y: 450 },
      { id: 'cordis', label: 'DeepSeek-Harness', layer: 'data', tech: 'Cordis Seams', status: 'healthy', metric: `${snap.metrics.activePlugins} plugins`, x: 650, y: 450 },
    ];

    const edges = [
      { from: 'traefik', to: 'refine', protocol: 'HTTPS' },
      { from: 'traefik', to: 'storybook', protocol: 'HTTPS' },
      { from: 'traefik', to: 'scalar', protocol: 'HTTPS' },
      { from: 'traefik', to: 'directus', protocol: 'REST /api/directus' },
      { from: 'traefik', to: 'dify', protocol: 'REST /api/dify' },
      { from: 'refine', to: 'directus', protocol: 'DataProvider' },
      { from: 'scalar', to: 'zod', protocol: 'z.toJSONSchema' },
      { from: 'directus', to: 'postgres', protocol: 'SQL / pg' },
      { from: 'directus', to: 'nats', protocol: 'JetStream' },
      { from: 'tinacms', to: 'nats', protocol: 'Git Hook' },
      { from: 'dify', to: 'nats', protocol: 'dify.>' },
      { from: 'dify', to: 'postgres', protocol: 'CRM + Wiki' },
      { from: 'cordis', to: 'postgres', protocol: 'dsh-store' },
      { from: 'cordis', to: 'nats', protocol: 'dsh-realtime' },
      { from: 'cordis', to: 'dify', protocol: 'dsh-llm' },
    ];

    const mermaid = [
      'flowchart TB',
      '  Traefik[Traefik v3 Gateway] --> Refine[Refine + AtomicCRM]',
      '  Traefik --> Scalar[Scalar OpenAPI 3.1]',
      '  Traefik --> Storybook[Storybook Explorer]',
      '  Refine --> Directus[Directus Data Studio]',
      '  Scalar --> Zod[Zod v4 Schemas]',
      '  Directus --> Postgres[(PostgreSQL 17)]',
      '  Directus --> NATS((NATS JetStream))',
      '  TinaCMS[TinaCMS Git] --> NATS',
      '  Dify[Dify LLMOps RAG] --> NATS',
      '  Cordis[DeepSeek-Harness] --> Postgres',
      '  Cordis --> NATS',
      '  Cordis --> Dify',
    ].join('\n');

    res.json({ nodes, edges, mermaid });
  });
}
