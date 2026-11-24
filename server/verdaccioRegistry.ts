import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type express from 'express';
import type {
  HarnessBundleId,
  VerdaccioPackageRecord,
  VerdaccioRegistryOverview,
} from '../src/harness/types.ts';

export interface PublishVerdaccioPackageInput {
  name: string;
  version?: string;
  description: string;
  author?: string;
  subsystem?: string;
  bundle?: HarnessBundleId;
  dshPluginId?: string;
  marketplaceModuleId?: string;
  dshTools?: string[];
  keywords?: string[];
  code?: string;
  readme?: string;
}

export interface VerdaccioRegistryController {
  getOverview: () => VerdaccioRegistryOverview;
  listPackages: () => VerdaccioPackageRecord[];
  searchPackages: (query?: string) => VerdaccioPackageRecord[];
  getPackage: (name: string) => VerdaccioPackageRecord | null;
  getPackument: (name: string) => Record<string, unknown> | null;
  recordDownload: (name: string) => VerdaccioPackageRecord | null;
  publishPackage: (
    input: PublishVerdaccioPackageInput,
    source?: 'seeded' | 'published'
  ) => VerdaccioPackageRecord;
  syncExternalUpstream: () => Promise<VerdaccioRegistryOverview>;
  readTarballBuffer: (packageName: string, filename: string) => Buffer | null;
  registerRoutes: (app: express.Express) => void;
}

interface PersistedVerdaccioIndex {
  updatedAt: string;
  packages: Record<string, VerdaccioPackageRecord>;
}

const DEFAULT_DSH_PACKAGES: PublishVerdaccioPackageInput[] = [
  {
    name: '@school76/dsh-registry-verdaccio',
    version: '1.2.0',
    description:
      'Провайдер приватного npm-реестра Verdaccio для DeepSeek-Harness: хранение .tgz тарболов, packument API и поиск модулей dsh-*.',
    author: 'DeepSeek-Harness · school76',
    subsystem: 'REGISTRY · Verdaccio',
    bundle: 'dsh-devops',
    dshPluginId: 'dsh-registry-verdaccio',
    marketplaceModuleId: 'mod-portal-verdaccio',
    dshTools: ['verdaccio.search', 'verdaccio.package_info'],
    keywords: ['verdaccio', 'npm', 'dsh', 'cordis', 'cubesat', 'registry'],
  },
  {
    name: '@school76/dsh-telemetry-ax25',
    version: '1.3.2',
    description:
      'Модуль декодирования маяков AX.25 / KISS 435.800 МГц и расчёта суточного энергобюджета EPS для 1U кубсата school76.',
    author: 'school76 RF Lab',
    subsystem: 'COMMS · EPS Telemetry',
    bundle: 'dsh-cubesat',
    dshPluginId: 'dsh-telemetry-ax25',
    marketplaceModuleId: 'mod-dsh-telemetry-ax25',
    dshTools: ['telemetry.decode_ax25', 'telemetry.power_budget'],
    keywords: ['dsh', 'ax25', 'kiss', 'telemetry', 'eps', 'uhf', 'cubesat'],
  },
  {
    name: '@school76/dsh-hil-validator',
    version: '1.1.5',
    description:
      'Статический HIL-аудитор бортового ПО mBlock (MicroPython / STM32 C++): проверка WDT, циклов, бинарного кадра 0xFF 0x55 и порогов защиты.',
    author: 'school76 Flight Software',
    subsystem: 'OBC · HIL QA',
    bundle: 'dsh-cubesat',
    dshPluginId: 'dsh-hil-validator',
    marketplaceModuleId: 'mod-dsh-hil-validator',
    dshTools: ['hil.audit_firmware'],
    keywords: ['dsh', 'hil', 'stm32', 'esp32', 'mblock', 'firmware', 'validator'],
  },
  {
    name: '@school76/dsh-orbit-sgp4',
    version: '1.0.8',
    description:
      'Баллистический модуль расчёта орбитальных пролётов по TLE/SGP4, углов возвышения Az-El и доплеровского сдвига для UHF 435.8 МГц.',
    author: 'school76 Dynamics',
    subsystem: 'GROUND · Orbit SGP4',
    bundle: 'dsh-cubesat',
    dshPluginId: 'dsh-orbit-sgp4',
    marketplaceModuleId: 'mod-dsh-orbit-sgp4',
    dshTools: ['orbit.predict_pass', 'orbit.doppler_shift'],
    keywords: ['dsh', 'orbit', 'sgp4', 'tle', 'doppler', 'azel', 'ground'],
  },
  {
    name: '@school76/dsh-alerts-watchdog',
    version: '1.0.4',
    description:
      'Модуль агрегации рисков и индекса полётной готовности миссии 1U по критическим задачам, программам OBC и состоянию плагинов Cordis.',
    author: 'school76 Mission Control',
    subsystem: 'OPS · Readiness',
    bundle: 'dsh-collab',
    dshPluginId: 'dsh-alerts-watchdog',
    marketplaceModuleId: 'mod-dsh-alerts-watchdog',
    dshTools: ['alerts.mission_readiness'],
    keywords: ['dsh', 'alerts', 'watchdog', 'readiness', 'cubesat', 'mission'],
  },
  {
    name: '@school76/dsh-forge-forgejo',
    version: '2.0.2',
    description:
      'Cordis-провайдер Git-репозитория Forgejo и базы знаний llm-wiki с проверкой графа [[wikilinks]] и сиротских заметок.',
    author: 'DeepSeek-Harness · Forgejo',
    subsystem: 'DOCS · Forgejo',
    bundle: 'dsh-devops',
    dshPluginId: 'dsh-forge-forgejo',
    marketplaceModuleId: 'mod-portal-wiki',
    dshTools: ['wiki.list', 'wiki.lint'],
    keywords: ['dsh', 'forgejo', 'llm-wiki', 'git', 'markdown'],
  },
  {
    name: '@school76/dsh-s3-garage',
    version: '1.0.9',
    description:
      'Провайдер S3-совместимых бакетов Garage для хранения схем ПП, даташитов, 3D-артефактов и снимков полезной нагрузки.',
    author: 'DeepSeek-Harness',
    subsystem: 'STORAGE · Garage S3',
    bundle: 'dsh-devops',
    dshPluginId: 'dsh-s3-garage',
    marketplaceModuleId: 'mod-portal-s3',
    dshTools: ['s3.list_objects'],
    keywords: ['dsh', 's3', 'garage', 'storage', 'artifacts'],
  },
  {
    name: '@school76/dsh-ci-hybrid',
    version: '1.4.0',
    description:
      'Гибридный CI/CD раннер для Forgejo Actions и GitHub Actions с предпушевой валидацией и трассировкой сборок.',
    author: 'DeepSeek-Harness',
    subsystem: 'DEVOPS · Hybrid CI',
    bundle: 'dsh-devops',
    dshPluginId: 'dsh-ci-hybrid',
    marketplaceModuleId: 'mod-portal-ci',
    dshTools: ['ci.list_runs', 'traefik.inspect'],
    keywords: ['dsh', 'ci', 'actions', 'forgejo', 'github'],
  },
  {
    name: '@school76/dsh-llm-gemini',
    version: '2.5.0',
    description:
      'Адаптер планирования DeepSeek-Harness через Gemini Function-Calling с автоматическим фоллбэком на детерминированный планировщик.',
    author: 'DeepSeek-Harness',
    subsystem: 'AGENT · Gemini LLM',
    bundle: 'dsh-base',
    dshPluginId: 'dsh-llm-gemini',
    marketplaceModuleId: 'mod-portal-llm-gemini',
    dshTools: ['harness.inspect'],
    keywords: ['dsh', 'llm', 'gemini', 'agent', 'function-calling'],
  },
  {
    name: '@school76/dsh-store-postgres',
    version: '1.0.0',
    description:
      'Реляционный провайдер PostgreSQL 16 + Zod для хранения проектов, задач подсистем, программ mBlock и сделок AtomicCRM.',
    author: 'school76 Stack',
    subsystem: 'DATA · PostgreSQL',
    bundle: 'dsh-base',
    dshPluginId: 'dsh-store-postgres',
    marketplaceModuleId: 'mod-portal-studio-crm',
    dshTools: ['postgres.query', 'directus.list'],
    keywords: ['dsh', 'postgres', 'zod', 'refine', 'directus', 'atomiccrm'],
  },
  {
    name: '@school76/dsh-realtime-nats',
    version: '1.0.0',
    description:
      'Шина событий реального времени NATS JetStream с мостом в WebSocket-каналы инженерного техчата.',
    author: 'school76 Stack',
    subsystem: 'COLLAB · NATS JetStream',
    bundle: 'dsh-collab',
    dshPluginId: 'dsh-realtime-nats',
    marketplaceModuleId: 'mod-portal-stack-api',
    dshTools: ['nats.publish'],
    keywords: ['dsh', 'nats', 'jetstream', 'websocket', 'realtime'],
  },
];

function createTarHeader(name: string, size: number, mtimeSec: number): Buffer {
  const header = Buffer.alloc(512, 0);
  const cleanName = name.slice(0, 99);
  header.write(cleanName, 0, 'utf8');
  header.write('0000644\0', 100, 'ascii');
  header.write('0000000\0', 108, 'ascii');
  header.write('0000000\0', 116, 'ascii');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
  header.write(`${mtimeSec.toString(8).padStart(11, '0')}\0`, 136, 'ascii');
  header.fill(0x20, 148, 156); // checksum spaces
  header.write('0', 156, 'ascii');
  header.write('ustar\0', 257, 'ascii');
  header.write('00', 263, 'ascii');
  header.write('root\0', 265, 'ascii');
  header.write('root\0', 297, 'ascii');

  let sum = 0;
  for (let i = 0; i < 512; i++) {
    sum += header[i];
  }
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return header;
}

function buildTarGzBuffer(files: Array<{ name: string; content: string }>): {
  gzipped: Buffer;
  unpackedSize: number;
} {
  const chunks: Buffer[] = [];
  const mtimeSec = Math.floor(Date.now() / 1000);
  let unpackedSize = 0;

  for (const file of files) {
    const body = Buffer.from(file.content, 'utf8');
    unpackedSize += body.length;
    chunks.push(createTarHeader(file.name, body.length, mtimeSec));
    chunks.push(body);
    const rem = body.length % 512;
    if (rem !== 0) {
      chunks.push(Buffer.alloc(512 - rem, 0));
    }
  }
  chunks.push(Buffer.alloc(1024, 0));

  const tarBuffer = Buffer.concat(chunks);
  const gzipped = zlib.gzipSync(tarBuffer, { level: 6 });
  return { gzipped, unpackedSize };
}

function sanitizePackageName(rawName: string): string {
  const trimmed = rawName.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('Укажите имя пакета (например, @school76/dsh-custom-sensor)');
  }
  const normalized = trimmed.startsWith('@') ? trimmed : `@school76/${trimmed}`;
  if (!/^(@[a-z0-9-_]+\/)?[a-z0-9-_.]+$/.test(normalized)) {
    throw new Error(`Некорректное имя npm-пакета: "${rawName}"`);
  }
  return normalized;
}

function tarballFilenameFor(packageName: string, version: string): string {
  const shortName = packageName.includes('/') ? packageName.split('/')[1] : packageName;
  return `${shortName}-${version}.tgz`;
}

function tarballPathOnDisk(tarballDir: string, packageName: string, version: string): string {
  const safeBase = packageName.replace(/^@/, '').replace(/\//g, '__');
  return path.join(tarballDir, `${safeBase}-${version}.tgz`);
}

export function createVerdaccioRegistry(rootDir: string): VerdaccioRegistryController {
  const storageDir = path.join(rootDir, 'data', 'verdaccio');
  const tarballDir = path.join(storageDir, 'tarballs');
  const indexFile = path.join(storageDir, 'registry.json');
  const externalUrl = process.env.VERDACCIO_URL?.trim() || '';
  const externalToken = process.env.VERDACCIO_TOKEN?.trim() || '';

  const packages = new Map<string, VerdaccioPackageRecord>();
  let updatedAt = new Date().toISOString();
  let externalReachable: boolean | undefined = externalUrl ? false : undefined;

  const saveIndex = () => {
    updatedAt = new Date().toISOString();
    const record: Record<string, VerdaccioPackageRecord> = {};
    for (const [name, pkg] of packages.entries()) {
      record[name] = pkg;
    }
    const payload: PersistedVerdaccioIndex = {
      updatedAt,
      packages: record,
    };
    fs.mkdirSync(tarballDir, { recursive: true });
    fs.writeFileSync(indexFile, JSON.stringify(payload, null, 2), 'utf8');
  };

  const publishPackage = (
    input: PublishVerdaccioPackageInput,
    source: 'seeded' | 'published' = 'published'
  ): VerdaccioPackageRecord => {
    const name = sanitizePackageName(input.name);
    const version = (input.version?.trim() || '1.0.0').replace(/^v/, '');
    const shortName = name.includes('/') ? name.split('/')[1] : name;
    const dshPluginId = input.dshPluginId?.trim() || shortName;
    const marketplaceModuleId = input.marketplaceModuleId?.trim() || `mod-verdaccio-${shortName}`;
    const dshTools = (input.dshTools || []).map((t) => t.trim()).filter(Boolean);
    const keywords = (input.keywords || ['dsh', 'cubesat', 'school76'])
      .map((k) => k.trim())
      .filter(Boolean);
    const subsystem = input.subsystem?.trim() || 'DSH · Module';
    const bundle: HarnessBundleId = input.bundle || 'dsh-cubesat';
    const author = input.author?.trim() || 'school76 Engineering';
    const now = new Date().toISOString();

    const packageJsonObj = {
      name,
      version,
      description: input.description.trim(),
      main: './index.mjs',
      type: 'module',
      license: 'Apache-2.0',
      author,
      keywords,
      dsh: {
        engine: 'deepseek-harness',
        runtime: 'cordis-v1',
        pluginId: dshPluginId,
        marketplaceModuleId,
        subsystem,
        bundle,
        tools: dshTools,
      },
    };

    const indexCode =
      input.code?.trim() ||
      [
        `// ${name}@${version} — DeepSeek-Harness (Cordis) plugin package`,
        `export const pluginId = ${JSON.stringify(dshPluginId)};`,
        `export const bundle = ${JSON.stringify(bundle)};`,
        `export const subsystem = ${JSON.stringify(subsystem)};`,
        `export const tools = ${JSON.stringify(dshTools)};`,
        `export function apply(ctx) {`,
        `  ctx.effect(() => {});`,
        `  return { pluginId, tools };`,
        `}`,
        '',
      ].join('\n');

    const readmeText =
      input.readme?.trim() ||
      [
        `# ${name} (${version})`,
        '',
        input.description.trim(),
        '',
        `- **Cordis Plugin**: \`${dshPluginId}\``,
        `- **Subsystem**: \`${subsystem}\``,
        `- **Bundle**: \`${bundle}\``,
        `- **Tools**: ${dshTools.length > 0 ? dshTools.map((t) => `\`${t}\``).join(', ') : '—'}`,
        '',
        '## Install via Verdaccio',
        '```bash',
        `npm install ${name}@${version} --registry http://localhost:3000/verdaccio`,
        '```',
        '',
      ].join('\n');

    const { gzipped, unpackedSize } = buildTarGzBuffer([
      { name: 'package/package.json', content: JSON.stringify(packageJsonObj, null, 2) + '\n' },
      { name: 'package/index.mjs', content: indexCode },
      { name: 'package/README.md', content: readmeText },
    ]);

    fs.mkdirSync(tarballDir, { recursive: true });
    const tgzPath = tarballPathOnDisk(tarballDir, name, version);
    fs.writeFileSync(tgzPath, gzipped);

    const shasum = crypto.createHash('sha1').update(gzipped).digest('hex');
    const sha512 = crypto.createHash('sha512').update(gzipped).digest('base64');
    const filename = tarballFilenameFor(name, version);
    const existing = packages.get(name);

    const record: VerdaccioPackageRecord = {
      name,
      version,
      description: input.description.trim(),
      author,
      license: 'Apache-2.0',
      keywords,
      distTags: { latest: version },
      dshPluginId,
      marketplaceModuleId,
      subsystem,
      bundle,
      dshTools,
      dependencies: { '@school76/dsh-cordis-core': '^1.0.0' },
      dist: {
        shasum,
        integrity: `sha512-${sha512}`,
        tarball: `/verdaccio/${name}/-/${filename}`,
        fileCount: 3,
        unpackedSize,
        tarballBytes: gzipped.length,
      },
      publishedAt: existing?.publishedAt || now,
      updatedAt: now,
      downloads: existing?.downloads ?? 0,
      readme: readmeText,
      source: existing?.source === 'seeded' && source === 'seeded' ? 'seeded' : source,
    };

    packages.set(name, record);
    saveIndex();
    return record;
  };

  const loadOrSeed = () => {
    fs.mkdirSync(tarballDir, { recursive: true });
    if (fs.existsSync(indexFile)) {
      try {
        const raw = fs.readFileSync(indexFile, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedVerdaccioIndex>;
        if (parsed && parsed.packages && typeof parsed.packages === 'object') {
          for (const [name, pkg] of Object.entries(parsed.packages)) {
            if (pkg && typeof pkg.name === 'string' && typeof pkg.version === 'string') {
              packages.set(name, pkg);
            }
          }
          if (typeof parsed.updatedAt === 'string') {
            updatedAt = parsed.updatedAt;
          }
        }
      } catch {
        packages.clear();
      }
    }

    for (const seed of DEFAULT_DSH_PACKAGES) {
      const existing = packages.get(seed.name);
      const tgzPath = existing
        ? tarballPathOnDisk(tarballDir, existing.name, existing.version)
        : '';
      if (!existing || !fs.existsSync(tgzPath)) {
        publishPackage(seed, 'seeded');
      }
    }
  };

  loadOrSeed();

  const listPackages = () =>
    Array.from(packages.values()).sort((a, b) => a.name.localeCompare(b.name));

  const searchPackages = (query?: string) => {
    const q = (query || '').trim().toLowerCase();
    const list = listPackages();
    if (!q) return list;
    return list.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q) ||
        pkg.subsystem.toLowerCase().includes(q) ||
        pkg.keywords.some((k) => k.toLowerCase().includes(q)) ||
        pkg.dshTools.some((t) => t.toLowerCase().includes(q))
    );
  };

  const getPackage = (name: string) => packages.get(name) || null;

  const recordDownload = (name: string) => {
    const pkg = packages.get(name);
    if (!pkg) return null;
    const updated: VerdaccioPackageRecord = {
      ...pkg,
      downloads: (pkg.downloads || 0) + 1,
    };
    packages.set(name, updated);
    saveIndex();
    return updated;
  };

  const getPackument = (name: string): Record<string, unknown> | null => {
    const pkg = packages.get(name);
    if (!pkg) return null;
    return {
      _id: pkg.name,
      name: pkg.name,
      description: pkg.description,
      'dist-tags': pkg.distTags,
      versions: {
        [pkg.version]: {
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          main: './index.mjs',
          license: pkg.license,
          author: { name: pkg.author },
          keywords: pkg.keywords,
          dependencies: pkg.dependencies,
          dsh: {
            pluginId: pkg.dshPluginId,
            marketplaceModuleId: pkg.marketplaceModuleId,
            subsystem: pkg.subsystem,
            bundle: pkg.bundle,
            tools: pkg.dshTools,
          },
          dist: {
            shasum: pkg.dist.shasum,
            integrity: pkg.dist.integrity,
            tarball: pkg.dist.tarball,
            fileCount: pkg.dist.fileCount,
            unpackedSize: pkg.dist.unpackedSize,
          },
        },
      },
      time: {
        created: pkg.publishedAt,
        modified: pkg.updatedAt,
        [pkg.version]: pkg.updatedAt,
      },
      readme: pkg.readme,
      _attachments: {
        [tarballFilenameFor(pkg.name, pkg.version)]: {
          content_type: 'application/octet-stream',
          length: pkg.dist.tarballBytes,
        },
      },
    };
  };

  const readTarballBuffer = (packageName: string, filename: string): Buffer | null => {
    const pkg = packages.get(packageName);
    if (!pkg) return null;
    const expected = tarballFilenameFor(pkg.name, pkg.version);
    if (filename !== expected) return null;
    const tgzPath = tarballPathOnDisk(tarballDir, pkg.name, pkg.version);
    if (!fs.existsSync(tgzPath)) return null;
    return fs.readFileSync(tgzPath);
  };

  const getOverview = (): VerdaccioRegistryOverview => {
    const list = listPackages();
    const totalBytes = list.reduce((acc, p) => acc + (p.dist?.tarballBytes || 0), 0);
    const totalDownloads = list.reduce((acc, p) => acc + (p.downloads || 0), 0);
    return {
      engine: 'Verdaccio 5.31 (embedded + npm packument v1)',
      registryUrl: '/verdaccio',
      upstreamMode: externalUrl && externalReachable ? 'external-upstream' : 'embedded-local',
      ...(externalUrl ? { externalUrl, externalReachable } : {}),
      totalPackages: list.length,
      totalTarballs: list.length,
      totalBytes,
      totalDownloads,
      storageDir: 'data/verdaccio',
      updatedAt,
      packages: list,
    };
  };

  const syncExternalUpstream = async (): Promise<VerdaccioRegistryOverview> => {
    if (externalUrl) {
      try {
        const base = externalUrl.replace(/\/+$/, '');
        const headers: Record<string, string> = {};
        if (externalToken) {
          headers.Authorization = `Bearer ${externalToken}`;
        }
        const resp = await fetch(`${base}/-/ping`, {
          headers,
          signal: AbortSignal.timeout(3000),
        });
        externalReachable = resp.ok;
      } catch {
        externalReachable = false;
      }
    }
    loadOrSeed();
    return getOverview();
  };

  const registerRoutes = (app: express.Express) => {
    // Standard Verdaccio / npm ping
    app.get('/verdaccio/-/ping', (_req, res) => {
      res.json({
        ok: true,
        registry: 'school76-verdaccio',
        packages: packages.size,
      });
    });

    // Standard npm v1 search endpoint
    app.get('/verdaccio/-/v1/search', (req, res) => {
      const text = typeof req.query.text === 'string' ? req.query.text : '';
      const size = Math.min(Math.max(Number(req.query.size || 25), 1), 100);
      const matches = searchPackages(text).slice(0, size);
      res.json({
        objects: matches.map((pkg) => ({
          package: {
            name: pkg.name,
            scope: pkg.name.startsWith('@') ? pkg.name.split('/')[0].slice(1) : 'unscoped',
            version: pkg.version,
            description: pkg.description,
            keywords: pkg.keywords,
            date: pkg.updatedAt,
            links: {
              npm: `/verdaccio/${pkg.name}`,
              tarball: pkg.dist.tarball,
            },
            author: { name: pkg.author },
          },
          score: {
            final: 0.96,
            detail: { quality: 0.98, popularity: 0.9, maintenance: 0.99 },
          },
          searchScore: 100000,
        })),
        total: matches.length,
        time: new Date().toUTCString(),
      });
    });

    // Tarball downloads (.tgz) — scoped and unscoped must come before packument routes
    app.get('/verdaccio/@:scope/:pkg/-/:filename', (req, res) => {
      const pkgName = `@${req.params.scope}/${req.params.pkg}`;
      const buf = readTarballBuffer(pkgName, req.params.filename);
      if (!buf) {
        res.status(404).json({ error: `Tarball not found: ${pkgName}/${req.params.filename}` });
        return;
      }
      recordDownload(pkgName);
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
      res.send(buf);
    });

    app.get('/verdaccio/:pkg/-/:filename', (req, res) => {
      const pkgName = req.params.pkg;
      const buf = readTarballBuffer(pkgName, req.params.filename);
      if (!buf) {
        res.status(404).json({ error: `Tarball not found: ${pkgName}/${req.params.filename}` });
        return;
      }
      recordDownload(pkgName);
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
      res.send(buf);
    });

    // Packument JSON endpoints (npm install / yarn / pnpm metadata)
    app.get('/verdaccio/@:scope/:pkg', (req, res) => {
      const pkgName = `@${req.params.scope}/${req.params.pkg}`;
      const packument = getPackument(pkgName);
      if (!packument) {
        res.status(404).json({ error: `Package not found in Verdaccio: ${pkgName}` });
        return;
      }
      res.json(packument);
    });

    app.get('/verdaccio/:pkg', (req, res) => {
      const pkgName = req.params.pkg;
      const packument = getPackument(pkgName);
      if (!packument) {
        res.status(404).json({ error: `Package not found in Verdaccio: ${pkgName}` });
        return;
      }
      res.json(packument);
    });

    // Portal JSON API for Verdaccio UI tab
    app.get('/api/verdaccio/overview', (_req, res) => {
      res.json({ verdaccio: getOverview() });
    });

    app.get('/api/verdaccio/package', (req, res) => {
      const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
      if (!name) {
        res.status(400).json({ error: 'Параметр name обязателен' });
        return;
      }
      const packument = getPackument(name);
      const record = getPackage(name);
      if (!packument || !record) {
        res.status(404).json({ error: `Пакет "${name}" не найден в Verdaccio` });
        return;
      }
      res.json({ package: record, packument });
    });

    app.post('/api/verdaccio/sync', async (_req, res) => {
      const overview = await syncExternalUpstream();
      res.json({ ok: true, verdaccio: overview });
    });
  };

  return {
    getOverview,
    listPackages,
    searchPackages,
    getPackage,
    getPackument,
    recordDownload,
    publishPackage,
    syncExternalUpstream,
    readTarballBuffer,
    registerRoutes,
  };
}
