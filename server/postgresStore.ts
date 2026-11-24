import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import type { CrmContact, CrmDeal } from '../src/schemas/missionSchemas.ts';
import type { CommunityProject, CubeSatTask, OnboardProgram } from '../src/types/cubesat.ts';

export interface PostgresColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  references?: string;
}

export interface PostgresTableInfo {
  name: string;
  description: string;
  rowCount: number;
  columns: PostgresColumnInfo[];
}

export interface PostgresQueryResult {
  ok: boolean;
  engine: 'external-pg' | 'embedded-pg-compat';
  sql: string;
  durationMs: number;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  error?: string;
}

interface CrmPersistedFile {
  contacts: CrmContact[];
  deals: CrmDeal[];
  nextContactSeq: number;
  nextDealSeq: number;
}

export interface PostgresStorePort {
  getProjects: () => CommunityProject[];
  getTasks: () => CubeSatTask[];
  getPrograms: () => OnboardProgram[];
}

declare global {
  var _school76ExternalPgPool: Pool | undefined;
}

function getExternalPgPool(): Pool | null {
  const host = process.env.POSTGRES_HOST?.trim();
  const user = process.env.POSTGRES_USER?.trim();
  const database = process.env.POSTGRES_DB?.trim();
  if (!host || !user || !database) return null;

  if (!global._school76ExternalPgPool) {
    global._school76ExternalPgPool = new Pool({
      host,
      port: Number(process.env.POSTGRES_PORT || 5432),
      user,
      password: process.env.POSTGRES_PASSWORD || undefined,
      database,
      max: 5,
      connectionTimeoutMillis: 4000,
    });
    global._school76ExternalPgPool.on('error', (err) => {
      console.warn('[PostgreSQL] Idle pool notice:', err.message);
    });
  }
  return global._school76ExternalPgPool;
}

function createSeedCrm(): CrmPersistedFile {
  const now = '2026-11-24T09:00:00.000Z';
  return {
    nextContactSeq: 6,
    nextDealSeq: 6,
    contacts: [
      {
        id: 'cnt-1',
        firstName: 'Елена',
        lastName: 'Ковалёва',
        email: 'kovaleva@sputnix-edu.example',
        phone: '+7 (495) 001-76-01',
        organization: 'Аэрокосмический центр «СтратоСфера»',
        role: 'Куратор пусковых грантов',
        subsystemFocus: 'PAYLOAD',
        segment: 'launch_provider',
        notes: 'Согласование окна интеграции 1U-кубсата в транспортно-пусковой контейнер (ТПК).',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cnt-2',
        firstName: 'Игорь',
        lastName: 'Морозов',
        email: 'morozov@rf-ground.example',
        phone: '+7 (342) 210-43-58',
        organization: 'Станция приёма UHF-Пермь',
        role: 'Оператор наземного сегмента',
        subsystemFocus: 'COMMS',
        segment: 'ground_station',
        notes: 'Готов принять тестовые пакеты AX.25 435.800 МГц и логировать доплеровский сдвиг.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cnt-3',
        firstName: 'Ольга',
        lastName: 'Никитина',
        email: 'nikitina@lyceum76.example',
        phone: '+7 (342) 255-76-76',
        organization: 'Школа №76 · Космический класс',
        role: 'Руководитель инженерной программы',
        subsystemFocus: 'OBC',
        segment: 'school',
        notes: 'Координация школьной команды разработчиков бортового ПО в mBlock 5.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cnt-4',
        firstName: 'Максим',
        lastName: 'Орлов',
        email: 'orlov@eps-cells.example',
        phone: '+7 (812) 440-19-20',
        organization: 'НИИ Фотовольтаики',
        role: 'Инженер солнечных панелей',
        subsystemFocus: 'EPS',
        segment: 'vendor',
        notes: 'Поставка GaAs фотоэлементов и защита шин 3V3 / 5V для каркаса 1U.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cnt-5',
        firstName: 'Виктор',
        lastName: 'Савельев',
        email: 'savelev@polytech-space.example',
        phone: '+7 (342) 219-80-12',
        organization: 'Политех · Лаборатория малых КА',
        role: 'Руководитель термовакуумных испытаний',
        subsystemFocus: 'ADCS',
        segment: 'university',
        notes: 'Предоставление стенда Гельмгольца для отладки алгоритма демпфирования B-dot.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    deals: [
      {
        id: 'deal-1',
        title: 'Грант на лётную интеграцию 1U в ТПК',
        organization: 'Аэрокосмический центр «СтратоСфера»',
        contactId: 'cnt-1',
        stage: 'contract',
        amountRub: 1850000,
        probabilityPct: 80,
        subsystem: 'PAYLOAD',
        expectedCloseDate: '2026-12-15',
        ownerName: 'Артём Соколов',
        description: 'Покрытие вибрационных и термовакуумных испытаний, а также выделение места в запуске.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'deal-2',
        title: 'Комплект солнечных панелей GaAs 1U (4 грани)',
        organization: 'НИИ Фотовольтаики',
        contactId: 'cnt-4',
        stage: 'flight_ready',
        amountRub: 420000,
        probabilityPct: 95,
        subsystem: 'EPS',
        expectedCloseDate: '2026-12-02',
        ownerName: 'Мария Волкова',
        description: 'Квалифицированные панели с термодатчиками TMP117 и разъёмами Harwin.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'deal-3',
        title: 'Сеть приёмных станций UHF-SDR (Пермь — Казань)',
        organization: 'Станция приёма UHF-Пермь',
        contactId: 'cnt-2',
        stage: 'review',
        amountRub: 290000,
        probabilityPct: 65,
        subsystem: 'COMMS',
        expectedCloseDate: '2026-12-22',
        ownerName: 'Дмитрий Лебедев',
        description: 'Интеграция наземных приёмников mDrawBot Az-El с шиной телеметрии NATS.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'deal-4',
        title: 'Испытания B-dot на стенде Гельмгольца',
        organization: 'Политех · Лаборатория малых КА',
        contactId: 'cnt-5',
        stage: 'completed',
        amountRub: 180000,
        probabilityPct: 100,
        subsystem: 'ADCS',
        expectedCloseDate: '2026-11-25',
        ownerName: 'Мария Волкова',
        description: 'Подтверждено гашение угловой скорости за 2 витка с прошивкой STM32F4.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'deal-5',
        title: 'Партнёрство со школами: приём маяка school76-1U',
        organization: 'Школа №76 · Космический класс',
        contactId: 'cnt-3',
        stage: 'lead',
        amountRub: 150000,
        probabilityPct: 50,
        subsystem: 'GROUND',
        expectedCloseDate: '2027-01-15',
        ownerName: 'Артём Соколов',
        description: 'Подключение 5 региональных школьных кружков к открытой телеметрии AX.25.',
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

export class PostgresMissionStore {
  private readonly crmFile: string;
  private crm: CrmPersistedFile;
  private port: PostgresStorePort;

  constructor(rootDir: string, port: PostgresStorePort) {
    const dataDir = path.join(rootDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    this.crmFile = path.join(dataDir, 'school76.crm.json');
    this.port = port;
    this.crm = this.loadCrm();
  }

  private loadCrm(): CrmPersistedFile {
    try {
      if (fs.existsSync(this.crmFile)) {
        const raw = fs.readFileSync(this.crmFile, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<CrmPersistedFile>;
        if (Array.isArray(parsed.contacts) && Array.isArray(parsed.deals)) {
          return {
            contacts: parsed.contacts,
            deals: parsed.deals,
            nextContactSeq: parsed.nextContactSeq || parsed.contacts.length + 1,
            nextDealSeq: parsed.nextDealSeq || parsed.deals.length + 1,
          };
        }
      }
    } catch {
      // fallback to seed
    }
    const seed = createSeedCrm();
    this.saveCrm(seed);
    return seed;
  }

  private saveCrm(data: CrmPersistedFile) {
    try {
      fs.writeFileSync(this.crmFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // ignore disk write issues in read-only mode
    }
  }

  getConnectionSummary() {
    const hasExternal = Boolean(
      process.env.POSTGRES_HOST?.trim() &&
        process.env.POSTGRES_USER?.trim() &&
        process.env.POSTGRES_DB?.trim()
    );
    return {
      driver: hasExternal ? 'pg.Pool (PostgreSQL 16)' : 'embedded-pg-compat (PostgreSQL 16 SQL)',
      externalConfigured: hasExternal,
      database: process.env.POSTGRES_DB?.trim() || 'school76_mission',
      host: process.env.POSTGRES_HOST?.trim() ? 'configured (env)' : 'embedded-local',
      dialect: 'PostgreSQL 16 + Zod Schema',
    };
  }

  getContacts(): CrmContact[] {
    return this.crm.contacts;
  }

  createContact(input: Omit<CrmContact, 'id' | 'createdAt' | 'updatedAt'>): CrmContact {
    const now = new Date().toISOString();
    const contact: CrmContact = {
      ...input,
      id: `cnt-${this.crm.nextContactSeq++}`,
      createdAt: now,
      updatedAt: now,
    };
    this.crm.contacts.unshift(contact);
    this.saveCrm(this.crm);
    return contact;
  }

  updateContact(id: string, patch: Partial<CrmContact>): CrmContact | null {
    const idx = this.crm.contacts.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const updated: CrmContact = {
      ...this.crm.contacts[idx],
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.crm.contacts[idx] = updated;
    this.saveCrm(this.crm);
    return updated;
  }

  deleteContact(id: string): boolean {
    const before = this.crm.contacts.length;
    this.crm.contacts = this.crm.contacts.filter((c) => c.id !== id);
    if (this.crm.contacts.length !== before) {
      this.saveCrm(this.crm);
      return true;
    }
    return false;
  }

  getDeals(): CrmDeal[] {
    return this.crm.deals;
  }

  createDeal(input: Omit<CrmDeal, 'id' | 'createdAt' | 'updatedAt'>): CrmDeal {
    const now = new Date().toISOString();
    const deal: CrmDeal = {
      ...input,
      id: `deal-${this.crm.nextDealSeq++}`,
      createdAt: now,
      updatedAt: now,
    };
    this.crm.deals.unshift(deal);
    this.saveCrm(this.crm);
    return deal;
  }

  updateDeal(id: string, patch: Partial<CrmDeal>): CrmDeal | null {
    const idx = this.crm.deals.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    const updated: CrmDeal = {
      ...this.crm.deals[idx],
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.crm.deals[idx] = updated;
    this.saveCrm(this.crm);
    return updated;
  }

  deleteDeal(id: string): boolean {
    const before = this.crm.deals.length;
    this.crm.deals = this.crm.deals.filter((d) => d.id !== id);
    if (this.crm.deals.length !== before) {
      this.saveCrm(this.crm);
      return true;
    }
    return false;
  }

  getTablesSchema(): PostgresTableInfo[] {
    const projects = this.port.getProjects();
    const tasks = this.port.getTasks();
    const programs = this.port.getPrograms();

    return [
      {
        name: 'projects',
        description: 'Миссии и проекты кубсатов (school76-1U, ground-sdr)',
        rowCount: projects.length,
        columns: [
          { name: 'id', type: 'text', nullable: false, primaryKey: true },
          { name: 'slug', type: 'text', nullable: false },
          { name: 'name', type: 'text', nullable: false },
          { name: 'category', type: 'text', nullable: false },
          { name: 'lifecycle_stage', type: 'text', nullable: true },
          { name: 'forgejo_repo', type: 'text', nullable: false },
          { name: 's3_bucket', type: 'text', nullable: false },
          { name: 'created_at', type: 'timestamptz', nullable: false },
        ],
      },
      {
        name: 'tasks',
        description: 'Инженерные задачи подсистем OBC, EPS, ADCS, COMMS, PAYLOAD, GROUND',
        rowCount: tasks.length,
        columns: [
          { name: 'id', type: 'text', nullable: false, primaryKey: true },
          { name: 'project_id', type: 'text', nullable: false, references: 'projects.id' },
          { name: 'title', type: 'text', nullable: false },
          { name: 'subsystem', type: 'varchar(16)', nullable: false },
          { name: 'status', type: 'varchar(24)', nullable: false },
          { name: 'priority', type: 'varchar(16)', nullable: false },
          { name: 'assignee', type: 'text', nullable: false },
          { name: 'progress_pct', type: 'integer', nullable: false },
          { name: 'due_date', type: 'date', nullable: true },
        ],
      },
      {
        name: 'programs',
        description: 'Программы бортового ПО mBlock (MicroPython / STM32 C++)',
        rowCount: programs.length,
        columns: [
          { name: 'id', type: 'text', nullable: false, primaryKey: true },
          { name: 'project_id', type: 'text', nullable: false, references: 'projects.id' },
          { name: 'name', type: 'text', nullable: false },
          { name: 'subsystem', type: 'varchar(16)', nullable: false },
          { name: 'board_profile', type: 'varchar(32)', nullable: false },
          { name: 'author', type: 'text', nullable: false },
          { name: 'updated_at', type: 'timestamptz', nullable: false },
        ],
      },
      {
        name: 'crm_contacts',
        description: 'AtomicCRM: контакты школ, вузов, пусковых операторов и поставщиков',
        rowCount: this.crm.contacts.length,
        columns: [
          { name: 'id', type: 'text', nullable: false, primaryKey: true },
          { name: 'first_name', type: 'text', nullable: false },
          { name: 'last_name', type: 'text', nullable: false },
          { name: 'email', type: 'text', nullable: false },
          { name: 'organization', type: 'text', nullable: false },
          { name: 'segment', type: 'varchar(32)', nullable: false },
          { name: 'subsystem_focus', type: 'varchar(16)', nullable: false },
        ],
      },
      {
        name: 'crm_deals',
        description: 'AtomicCRM: воронка грантов, контрактов на запуск и закупок оборудования',
        rowCount: this.crm.deals.length,
        columns: [
          { name: 'id', type: 'text', nullable: false, primaryKey: true },
          { name: 'title', type: 'text', nullable: false },
          { name: 'organization', type: 'text', nullable: false },
          { name: 'contact_id', type: 'text', nullable: true, references: 'crm_contacts.id' },
          { name: 'stage', type: 'varchar(24)', nullable: false },
          { name: 'amount_rub', type: 'numeric(14,2)', nullable: false },
          { name: 'probability_pct', type: 'integer', nullable: false },
          { name: 'subsystem', type: 'varchar(16)', nullable: false },
        ],
      },
    ];
  }

  private getTableRows(tableName: string): Record<string, unknown>[] | null {
    switch (tableName.toLowerCase()) {
      case 'projects':
        return this.port.getProjects().map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          category: p.category,
          lifecycle_stage: p.lifecycleStage || 'design',
          forgejo_repo: p.forgejoRepo,
          s3_bucket: p.s3Bucket,
          created_at: p.createdAt,
        }));
      case 'tasks':
        return this.port.getTasks().map((t) => ({
          id: t.id,
          project_id: t.projectId,
          title: t.title,
          subsystem: t.subsystem,
          status: t.status,
          priority: t.priority,
          assignee: t.assignee,
          progress_pct: t.progressPct ?? 0,
          due_date: t.dueDate || null,
        }));
      case 'programs':
        return this.port.getPrograms().map((pr) => ({
          id: pr.id,
          project_id: pr.projectId,
          name: pr.name,
          subsystem: pr.subsystem,
          board_profile: pr.targetBoard || 'STM32F4 OBC (Arduino C++)',
          author: pr.author,
          updated_at: pr.updatedAt,
        }));
      case 'crm_contacts':
        return this.crm.contacts.map((c) => ({
          id: c.id,
          first_name: c.firstName,
          last_name: c.lastName,
          email: c.email,
          organization: c.organization,
          segment: c.segment,
          subsystem_focus: c.subsystemFocus,
        }));
      case 'crm_deals':
        return this.crm.deals.map((d) => ({
          id: d.id,
          title: d.title,
          organization: d.organization,
          contact_id: d.contactId,
          stage: d.stage,
          amount_rub: d.amountRub,
          probability_pct: d.probabilityPct,
          subsystem: d.subsystem,
        }));
      default:
        return null;
    }
  }

  async executeReadOnlySql(rawSql: string): Promise<PostgresQueryResult> {
    const t0 = Date.now();
    const sql = rawSql.trim().replace(/;+\s*$/, '');

    // Check external pg pool first if explicitly configured
    const pool = getExternalPgPool();
    if (pool) {
      if (!/^(SELECT|SHOW|WITH)\b/i.test(sql)) {
        return {
          ok: false,
          engine: 'external-pg',
          sql,
          durationMs: Date.now() - t0,
          columns: [],
          rows: [],
          rowCount: 0,
          error: 'В SQL-консоли разрешены только безопасные запросы чтения (SELECT / SHOW).',
        };
      }
      try {
        const res = await pool.query(sql);
        const columns = res.fields.map((f) => f.name);
        return {
          ok: true,
          engine: 'external-pg',
          sql,
          durationMs: Date.now() - t0,
          columns,
          rows: res.rows,
          rowCount: res.rowCount ?? res.rows.length,
        };
      } catch (err) {
        return {
          ok: false,
          engine: 'external-pg',
          sql,
          durationMs: Date.now() - t0,
          columns: [],
          rows: [],
          rowCount: 0,
          error: err instanceof Error ? err.message : 'PostgreSQL query error',
        };
      }
    }

    // Embedded PostgreSQL-compatible SQL evaluator (strictly parameterized / read-only)
    if (/^SHOW\s+TABLES$/i.test(sql) || /^\\dt$/i.test(sql)) {
      const rows = this.getTablesSchema().map((t) => ({
        table_schema: 'public',
        table_name: t.name,
        row_count: t.rowCount,
        description: t.description,
      }));
      return {
        ok: true,
        engine: 'embedded-pg-compat',
        sql,
        durationMs: Date.now() - t0,
        columns: ['table_schema', 'table_name', 'row_count', 'description'],
        rows,
        rowCount: rows.length,
      };
    }

    const selectMatch = sql.match(
      /^SELECT\s+(.+?)\s+FROM\s+([a-z_][a-z0-9_]*)(?:\s+WHERE\s+([a-z_][a-z0-9_]*)\s*=\s*'([^']*)')?(?:\s+ORDER\s+BY\s+([a-z_][a-z0-9_]*)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i
    );

    if (!selectMatch) {
      return {
        ok: false,
        engine: 'embedded-pg-compat',
        sql,
        durationMs: Date.now() - t0,
        columns: [],
        rows: [],
        rowCount: 0,
        error:
          'Поддерживаются запросы SHOW TABLES и SELECT <cols|*> FROM <table_name> [WHERE col = \'val\'] [ORDER BY col ASC|DESC] [LIMIT n].',
      };
    }

    const [, colsRaw, tableName, whereCol, whereVal, orderCol, orderDir, limitRaw] = selectMatch;
    const tableRows = this.getTableRows(tableName);
    if (!tableRows) {
      return {
        ok: false,
        engine: 'embedded-pg-compat',
        sql,
        durationMs: Date.now() - t0,
        columns: [],
        rows: [],
        rowCount: 0,
        error: `Таблица "${tableName}" не найдена. Доступны: projects, tasks, programs, crm_contacts, crm_deals.`,
      };
    }

    let filtered = [...tableRows];
    if (whereCol && whereVal !== undefined) {
      const target = whereVal.toLowerCase();
      filtered = filtered.filter((r) => String(r[whereCol] ?? '').toLowerCase() === target);
    }

    if (orderCol) {
      const desc = orderDir?.toUpperCase() === 'DESC';
      filtered.sort((a, b) => {
        const av = a[orderCol];
        const bv = b[orderCol];
        if (typeof av === 'number' && typeof bv === 'number') {
          return desc ? bv - av : av - bv;
        }
        return desc
          ? String(bv ?? '').localeCompare(String(av ?? ''))
          : String(av ?? '').localeCompare(String(bv ?? ''));
      });
    }

    const limit = limitRaw ? Math.min(200, Math.max(1, Number.parseInt(limitRaw, 10))) : 50;
    filtered = filtered.slice(0, limit);

    // Handle COUNT(*)
    if (/^COUNT\(\*\)$/i.test(colsRaw.trim())) {
      return {
        ok: true,
        engine: 'embedded-pg-compat',
        sql,
        durationMs: Date.now() - t0,
        columns: ['count'],
        rows: [{ count: filtered.length }],
        rowCount: 1,
      };
    }

    const requestedCols =
      colsRaw.trim() === '*'
        ? Object.keys(tableRows[0] || {})
        : colsRaw
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean);

    const projected = filtered.map((r) => {
      const out: Record<string, unknown> = {};
      for (const col of requestedCols) {
        out[col] = r[col] ?? null;
      }
      return out;
    });

    return {
      ok: true,
      engine: 'embedded-pg-compat',
      sql,
      durationMs: Date.now() - t0,
      columns: requestedCols,
      rows: projected,
      rowCount: projected.length,
    };
  }
}
