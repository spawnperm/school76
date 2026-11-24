import type express from 'express';
import { TraefikRouterUpsertSchema } from '../src/schemas/missionSchemas.ts';

export interface TraefikRouter {
  id: string;
  rule: string;
  service: string;
  entryPoints: Array<'web' | 'websecure' | 'nats'>;
  middlewares: string[];
  tls: boolean;
  enabled: boolean;
  targetPort: number;
  requestsCount: number;
  avgLatencyMs: number;
}

export interface TraefikMiddleware {
  id: string;
  type: 'rateLimit' | 'headers' | 'stripPrefix' | 'circuitBreaker' | 'compress';
  description: string;
  config: Record<string, unknown>;
  active: boolean;
}

export class TraefikGateway {
  private routers: TraefikRouter[] = [
    {
      id: 'school76-api',
      rule: 'PathPrefix(`/api/`)',
      service: 'school76-express-core',
      entryPoints: ['websecure'],
      middlewares: ['security-headers', 'ratelimit-api'],
      tls: true,
      enabled: true,
      targetPort: 3000,
      requestsCount: 142,
      avgLatencyMs: 6,
    },
    {
      id: 'directus-cms',
      rule: 'PathPrefix(`/api/directus`, `/api/refine`)',
      service: 'directus-headless-svc',
      entryPoints: ['websecure'],
      middlewares: ['security-headers', 'ratelimit-api'],
      tls: true,
      enabled: true,
      targetPort: 8055,
      requestsCount: 48,
      avgLatencyMs: 9,
    },
    {
      id: 'tinacms-git',
      rule: 'PathPrefix(`/api/tinacms`)',
      service: 'tinacms-forgejo-bridge',
      entryPoints: ['websecure'],
      middlewares: ['security-headers'],
      tls: true,
      enabled: true,
      targetPort: 4001,
      requestsCount: 24,
      avgLatencyMs: 11,
    },
    {
      id: 'dify-llmops',
      rule: 'PathPrefix(`/api/dify`)',
      service: 'dify-workflow-engine',
      entryPoints: ['websecure'],
      middlewares: ['security-headers', 'circuit-breaker'],
      tls: true,
      enabled: true,
      targetPort: 5001,
      requestsCount: 19,
      avgLatencyMs: 42,
    },
    {
      id: 'nats-ws-bridge',
      rule: 'PathPrefix(`/ws`, `/api/nats`)',
      service: 'nats-jetstream-broker',
      entryPoints: ['websecure', 'nats'],
      middlewares: ['security-headers'],
      tls: true,
      enabled: true,
      targetPort: 4222,
      requestsCount: 86,
      avgLatencyMs: 3,
    },
    {
      id: 'scalar-openapi',
      rule: 'PathPrefix(`/api/openapi.json`)',
      service: 'scalar-openapi-docs',
      entryPoints: ['websecure'],
      middlewares: ['security-headers', 'gzip-compress'],
      tls: true,
      enabled: true,
      targetPort: 3000,
      requestsCount: 31,
      avgLatencyMs: 4,
    },
  ];

  private middlewares: TraefikMiddleware[] = [
    {
      id: 'security-headers',
      type: 'headers',
      description: 'Заголовки безопасности (X-Content-Type-Options, Referrer-Policy, X-Traefik-Router)',
      config: {
        contentTypeNosniff: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
      },
      active: true,
    },
    {
      id: 'ratelimit-api',
      type: 'rateLimit',
      description: 'Ограничение всплесков запросов API (120 req/s, burst 240)',
      config: { average: 120, burst: 240 },
      active: true,
    },
    {
      id: 'circuit-breaker',
      type: 'circuitBreaker',
      description: 'Предохранитель для LLM-пайплайнов Dify при высокой задержке',
      config: { expression: 'LatencyAtQuantileMS(50.0) > 4000' },
      active: true,
    },
    {
      id: 'gzip-compress',
      type: 'compress',
      description: 'Сжатие OpenAPI-спецификаций Scalar и JSON-ответов',
      config: { minResponseBodyBytes: 1024 },
      active: true,
    },
  ];

  middleware(): express.RequestHandler {
    return (req, res, next) => {
      const started = Date.now();
      const matched = this.matchPath(req.path);
      if (matched && !matched.enabled) {
        res.status(503).json({
          error: `Маршрут Traefik "${matched.id}" временно отключён администратором шлюза.`,
        });
        return;
      }

      const headersActive = this.middlewares.find((m) => m.id === 'security-headers')?.active;
      if (headersActive) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('X-Gateway-Engine', 'Traefik-v3-Dynamic');
        if (matched) {
          res.setHeader('X-Traefik-Router', matched.id);
        }
      }

      res.on('finish', () => {
        if (matched) {
          const elapsed = Math.max(1, Date.now() - started);
          matched.requestsCount += 1;
          matched.avgLatencyMs = Math.round(matched.avgLatencyMs * 0.8 + elapsed * 0.2);
        }
      });

      next();
    };
  }

  matchPath(reqPath: string): TraefikRouter | null {
    if (reqPath.startsWith('/api/directus') || reqPath.startsWith('/api/refine')) {
      return this.routers.find((r) => r.id === 'directus-cms') || null;
    }
    if (reqPath.startsWith('/api/tinacms')) {
      return this.routers.find((r) => r.id === 'tinacms-git') || null;
    }
    if (reqPath.startsWith('/api/dify')) {
      return this.routers.find((r) => r.id === 'dify-llmops') || null;
    }
    if (reqPath.startsWith('/api/nats') || reqPath.startsWith('/ws')) {
      return this.routers.find((r) => r.id === 'nats-ws-bridge') || null;
    }
    if (reqPath === '/api/openapi.json') {
      return this.routers.find((r) => r.id === 'scalar-openapi') || null;
    }
    if (reqPath.startsWith('/api/')) {
      return this.routers.find((r) => r.id === 'school76-api') || null;
    }
    return null;
  }

  getOverview() {
    return {
      version: 'Traefik v3.2 (school76-gateway)',
      entryPoints: [
        { name: 'web', address: ':80' },
        { name: 'websecure', address: ':443 (TLS / ACME)' },
        { name: 'nats', address: ':4222 (NATS JetStream)' },
      ],
      externalAdminUrlConfigured: Boolean(process.env.TRAEFIK_ADMIN_URL?.trim()),
      routers: this.routers,
      middlewares: this.middlewares,
    };
  }

  toggleRouter(id: string, enabled: boolean): TraefikRouter | null {
    const r = this.routers.find((item) => item.id === id);
    if (!r) return null;
    r.enabled = enabled;
    return r;
  }

  upsertRouter(input: unknown): TraefikRouter {
    const parsed = TraefikRouterUpsertSchema.parse(input);
    const existing = this.routers.find((r) => r.id === parsed.id);
    if (existing) {
      Object.assign(existing, parsed);
      return existing;
    }
    const created: TraefikRouter = {
      ...parsed,
      requestsCount: 0,
      avgLatencyMs: 5,
    };
    this.routers.push(created);
    return created;
  }

  toggleMiddleware(id: string, active: boolean): TraefikMiddleware | null {
    const m = this.middlewares.find((item) => item.id === id);
    if (!m) return null;
    m.active = active;
    return m;
  }

  toDynamicYaml(): string {
    const lines: string[] = [
      '# Generated by school76 Traefik Dynamic Gateway',
      'http:',
      '  routers:',
    ];
    for (const r of this.routers) {
      if (!r.enabled) continue;
      lines.push(`    ${r.id}:`);
      lines.push(`      rule: "${r.rule}"`);
      lines.push(`      service: ${r.service}`);
      lines.push(`      entryPoints: [${r.entryPoints.join(', ')}]`);
      if (r.middlewares.length > 0) {
        lines.push(`      middlewares: [${r.middlewares.join(', ')}]`);
      }
      if (r.tls) {
        lines.push('      tls: {}');
      }
    }
    lines.push('  services:');
    const seen = new Set<string>();
    for (const r of this.routers) {
      if (seen.has(r.service)) continue;
      seen.add(r.service);
      lines.push(`    ${r.service}:`);
      lines.push('      loadBalancer:');
      lines.push('        servers:');
      lines.push(`          - url: "http://127.0.0.1:${r.targetPort}"`);
    }
    lines.push('  middlewares:');
    for (const m of this.middlewares) {
      if (!m.active) continue;
      lines.push(`    ${m.id}:`);
      lines.push(`      ${m.type}:`);
      for (const [k, v] of Object.entries(m.config)) {
        lines.push(`        ${k}: ${JSON.stringify(v)}`);
      }
    }
    return lines.join('\n');
  }
}
