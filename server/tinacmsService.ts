import {
  TinaDocSchema,
  type TinaDoc,
} from '../src/schemas/missionSchemas.ts';
import {
  listForgejoTree,
  readForgejoFile,
  writeForgejoFile,
} from './forgejoStore.ts';
import type { NatsEventBus } from './natsBus.ts';

export interface TinaCollectionSpec {
  id: 'mission-briefs' | 'subsystems-wiki' | 'release-notes' | 'team-guides';
  label: string;
  folder: string;
  description: string;
}

export const TINA_COLLECTIONS: TinaCollectionSpec[] = [
  {
    id: 'mission-briefs',
    label: 'Брифы миссии',
    folder: 'content/briefs',
    description: 'Паспорта миссии 1U, цели орбитального эксперимента и требования к запуску.',
  },
  {
    id: 'subsystems-wiki',
    label: 'Подсистемы 1U',
    folder: 'subsystems',
    description: 'Документация OBC, EPS, ADCS, COMMS и полезной нагрузки с frontmatter.',
  },
  {
    id: 'release-notes',
    label: 'Релизы ПО',
    folder: 'content/releases',
    description: 'Заметки о версиях прошивок STM32/ESP32 и тестах на стенде.',
  },
  {
    id: 'team-guides',
    label: 'Регламенты команды',
    folder: 'content/guides',
    description: 'Чек-листы предполётных проверок, сборки и наземных сеансов связи.',
  },
];

function serializeFrontmatter(doc: Omit<TinaDoc, 'path' | 'sha'>): string {
  const tagsLine = JSON.stringify(doc.tags || []);
  return [
    '---',
    `title: ${JSON.stringify(doc.title)}`,
    `collection: ${JSON.stringify(doc.collection)}`,
    `subsystem: ${JSON.stringify(doc.subsystem)}`,
    `status: ${JSON.stringify(doc.status)}`,
    `author: ${JSON.stringify(doc.author)}`,
    `summary: ${JSON.stringify(doc.summary || '')}`,
    `tags: ${tagsLine}`,
    `updatedAt: ${JSON.stringify(doc.updatedAt)}`,
    '---',
    '',
    doc.body.trim(),
    '',
  ].join('\n');
}

function parseFrontmatter(
  raw: string,
  fallbackCollection: TinaCollectionSpec['id'],
  slug: string,
  filepath: string,
  sha?: string
): TinaDoc {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    const titleMatch = raw.match(/^#\s+(.+)$/m);
    return {
      collection: fallbackCollection,
      slug,
      path: filepath,
      title: titleMatch ? titleMatch[1].trim() : slug,
      subsystem: 'OBC',
      status: 'published',
      author: 'school76',
      summary: '',
      tags: [],
      body: raw,
      updatedAt: new Date().toISOString(),
      sha,
    };
  }

  const metaLines = fmMatch[1].split(/\r?\n/);
  const meta: Record<string, unknown> = {};
  for (const line of metaLines) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const valRaw = line.slice(idx + 1).trim();
    try {
      meta[key] = JSON.parse(valRaw);
    } catch {
      meta[key] = valRaw.replace(/^['"]|['"]$/g, '');
    }
  }

  return {
    collection: (meta.collection as TinaCollectionSpec['id']) || fallbackCollection,
    slug,
    path: filepath,
    title: typeof meta.title === 'string' && meta.title ? meta.title : slug,
    subsystem:
      typeof meta.subsystem === 'string' &&
      ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'].includes(meta.subsystem)
        ? (meta.subsystem as TinaDoc['subsystem'])
        : 'OBC',
    status:
      meta.status === 'draft' || meta.status === 'review' || meta.status === 'published'
        ? meta.status
        : 'published',
    author: typeof meta.author === 'string' && meta.author ? meta.author : 'Артём Соколов',
    summary: typeof meta.summary === 'string' ? meta.summary : '',
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    body: fmMatch[2].trim(),
    updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : new Date().toISOString(),
    sha,
  };
}

export class TinaCmsService {
  private readonly nats: NatsEventBus;

  constructor(nats: NatsEventBus) {
    this.nats = nats;
    this.seedInitialDocs('school76-1u');
  }

  private seedInitialDocs(repo: string) {
    const existing = listForgejoTree(repo);
    const paths = new Set(existing.map((e) => e.path));

    const seeds: Array<Omit<TinaDoc, 'path' | 'sha'>> = [
      {
        collection: 'mission-briefs',
        slug: 'cubesat-1u-charter',
        title: 'Паспорт образовательной миссии school76-1U',
        subsystem: 'OBC',
        status: 'published',
        author: 'Артём Соколов',
        summary: 'Целевые параметры орбиты ССО 520 км, радиомаяк AX.25 435.800 МГц и стек ПО.',
        tags: ['1U', 'Charter', 'SS0-520'],
        updatedAt: '2026-11-24T09:15:00.000Z',
        body: `# Миссия school76-1U\n\nОбразовательный наноспутник формата **1U (100×100×113.5 мм)** разрабатывается инженерной командой школы №76.\n\n## Ключевые подсистемы\n- **OBC**: STM32F405 + визуальная среда mBlock 5\n- **EPS**: 2S Li-Ion 5200 мА·ч + солнечные панели GaAs\n- **ADCS**: алгоритм демпфирования B-dot\n- **COMMS**: AX.25 435.800 МГц + наземные станции UHF-SDR`,
      },
      {
        collection: 'release-notes',
        slug: 'firmware-v2-4-beacon',
        title: 'Релиз бортового ПО v2.4.1 (Beacon + Safe Mode)',
        subsystem: 'COMMS',
        status: 'published',
        author: 'Дмитрий Лебедев',
        summary: 'Добавлена автопроверка энергобюджета EPS перед включением передатчика AX.25.',
        tags: ['Release', 'v2.4.1', 'AX.25'],
        updatedAt: '2026-11-24T10:30:00.000Z',
        body: `# Firmware v2.4.1\n\n## Что нового\n1. Добавлен переход в режим \`SAFE\` при падении заряда АКБ ниже 25%.\n2. Настроена телеметрия по шине \`0xFF 0x55\` и публикация событий в NATS \`cubesat.obc.boot\`.\n3. Пройдены модульные тесты симулятора mBlock.`,
      },
      {
        collection: 'team-guides',
        slug: 'pre-flight-checklist',
        title: 'Регламент предпусковых проверок ТПК',
        subsystem: 'GROUND',
        status: 'review',
        author: 'Мария Волкова',
        summary: 'Контрольный список перед передачей кубсата в транспортно-пусковой контейнер.',
        tags: ['Checklist', 'QA', 'Launch'],
        updatedAt: '2026-11-24T11:00:00.000Z',
        body: `# Чек-лист перед интеграцией\n\n- [x] Проверены концевые выключатели RBF (Remove Before Flight)\n- [x] Подтверждено гашение B-dot на стенде Гельмгольца\n- [ ] Проведён сквозной приём телеметрии на станции UHF-Пермь`,
      },
    ];

    for (const seed of seeds) {
      const col = TINA_COLLECTIONS.find((c) => c.id === seed.collection)!;
      const filepath = `${col.folder}/${seed.slug}.md`;
      if (!paths.has(filepath)) {
        try {
          writeForgejoFile(
            repo,
            filepath,
            serializeFrontmatter(seed),
            `docs(tinacms): инициализация документа ${seed.slug}`,
            seed.author
          );
        } catch {
          // ignore if forgejo repo not ready
        }
      }
    }
  }

  getCollections() {
    return TINA_COLLECTIONS;
  }

  listDocuments(repo = 'school76-1u'): TinaDoc[] {
    this.seedInitialDocs(repo);
    const tree = listForgejoTree(repo);
    const docs: TinaDoc[] = [];

    for (const entry of tree) {
      if (!entry.path.endsWith('.md')) continue;
      const col = TINA_COLLECTIONS.find((c) => entry.path.startsWith(`${c.folder}/`));
      if (!col) continue;
      try {
        const file = readForgejoFile(repo, entry.path);
        const slug = entry.path
          .slice(col.folder.length + 1)
          .replace(/\.md$/i, '');
        docs.push(parseFrontmatter(file.content, col.id, slug, entry.path, file.sha));
      } catch {
        // skip unreadable files
      }
    }

    return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveDocument(repo: string, rawInput: unknown, actorName?: string): Promise<TinaDoc> {
    const parsed = TinaDocSchema.parse(rawInput);
    const col = TINA_COLLECTIONS.find((c) => c.id === parsed.collection);
    if (!col) {
      throw new Error(`Коллекция TinaCMS "${parsed.collection}" не найдена`);
    }
    const cleanSlug = parsed.slug.replace(/^\/+|\/+$/g, '').replace(/\.md$/i, '');
    const filepath = `${col.folder}/${cleanSlug}.md`;
    const now = new Date().toISOString();

    const docRecord: Omit<TinaDoc, 'path' | 'sha'> = {
      ...parsed,
      slug: cleanSlug,
      author: actorName || parsed.author,
      updatedAt: now,
    };

    const markdown = serializeFrontmatter(docRecord);
    const result = await writeForgejoFile(
      repo,
      filepath,
      markdown,
      `docs(tinacms): обновить "${parsed.title}"`,
      docRecord.author
    );

    await this.nats.publish(
      'tinacms.document.saved',
      { repo, path: filepath, title: parsed.title, status: parsed.status },
      'tinacms-git'
    );

    return {
      ...docRecord,
      path: filepath,
      sha: result.sha,
    };
  }
}
