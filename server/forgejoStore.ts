import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ForgejoCommit, ForgejoFileEntry } from '../src/types/cubesat.ts';

const REPOS_ROOT = path.resolve(process.cwd(), 'data', 'forgejo-repos');

function safeRepoName(repo: string): string {
  const clean = repo.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!clean) throw new Error('Invalid repository identifier');
  return clean;
}

function resolveRepoDir(repo: string): string {
  const cleanRepo = safeRepoName(repo);
  const dir = path.resolve(REPOS_ROOT, 'school76', cleanRepo);
  if (!dir.startsWith(REPOS_ROOT + path.sep)) {
    throw new Error('Repository path out of bounds');
  }
  return dir;
}

function resolveFilePath(repo: string, filepath: string): { absPath: string; relPath: string } {
  const repoDir = resolveRepoDir(repo);
  const normalized = filepath.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || !normalized.endsWith('.md')) {
    throw new Error('Only relative .md paths are permitted in the Forgejo wiki store');
  }
  const absPath = path.resolve(repoDir, normalized);
  if (!absPath.startsWith(repoDir + path.sep)) {
    throw new Error('Path traversal blocked');
  }
  return { absPath, relPath: normalized };
}

function sha1Hex(content: string): string {
  return crypto.createHash('sha1').update(content, 'utf-8').digest('hex').slice(0, 12);
}

function readCommitsFile(repoDir: string): ForgejoCommit[] {
  const logFile = path.join(repoDir, '.forgejo-commits.json');
  try {
    if (fs.existsSync(logFile)) {
      const parsed = JSON.parse(fs.readFileSync(logFile, 'utf-8')) as ForgejoCommit[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore corrupt log
  }
  return [];
}

function appendCommit(repoDir: string, commit: ForgejoCommit) {
  const logFile = path.join(repoDir, '.forgejo-commits.json');
  const existing = readCommitsFile(repoDir);
  const updated = [commit, ...existing].slice(0, 100);
  fs.writeFileSync(logFile, JSON.stringify(updated, null, 2), 'utf-8');
}

export function ensureForgejoRepo(repo: string, projectName = repo) {
  const repoDir = resolveRepoDir(repo);
  if (fs.existsSync(path.join(repoDir, 'index.md'))) {
    return;
  }

  fs.mkdirSync(repoDir, { recursive: true });
  const now = new Date().toISOString();

  const initialFiles: Record<string, string> =
    repo === 'school76-1u'
      ? {
          'index.md': `# База знаний проекта school76 (1U CubeSat)

> Каталог документации в формате **llm-wiki**. Markdown-файлы хранятся во встроенном репозитории Forgejo, а схемы и медиа — в бакете Garage S3.

## Архитектура и подсистемы
- [[subsystems/obc]] — Бортовой компьютер STM32F4 / ESP32-S3, конечный автомат и планировщик mBlock.
- [[subsystems/eps]] — Энергопитание 2S Li-Ion, MPPT-контроллер и коммутация шин 3.3В / 5В.
- [[subsystems/adcs]] — Датчики Солнца, IMU 9-DOF и алгоритм демпфирования B-dot.
- [[subsystems/comms]] — UHF трансивер 435.800 МГц, протокол AX.25 и дипольная антенна.

## Инженерные концепции
- [[concepts/bdot-detumble]] — Расчёт коэффициентов B-dot после отделения от ракеты-носителя.

## Исходные материалы (Raw Sources)
- [[raw/1u-power-budget]] — Таблица энергопотребления режимов NOMINAL, SAFE и SCIENCE.

## Служебные файлы LLM-Wiki
- [[schema]] — Правила структуры файлов, тегов и индексации.
- [[log]] — Хронологический журнал изменений и проверок ссылок.
`,
          'schema.md': `# Схема LLM-Wiki проекта school76

1. Все инженерные документы хранятся в формате Markdown с явными внутренними связями \`[[folder/page]]\`.
2. \`index.md\` — главный каталог знаний; каждая новая страница должна быть зарегистрирована в нём.
3. \`log.md\` — журнал операций (только дополнение: \`[INGEST]\`, \`[EDIT]\`, \`[LINT]\`).
4. Папка \`raw/\` содержит необработанные заметки испытаний и протоколы замеров.
5. Изображения и схемы загружаются в **Garage S3** (\`school76-media\`) и встраиваются через \`![описание](/api/s3/school76-media/...)\`.
`,
          'log.md': `# Журнал LLM-Wiki

- **2026-11-24 [INIT]:** Инициализирована структура \`llm-wiki\` в репозитории Forgejo \`school76/school76-1u\`.
- **2026-11-24 [INGEST]:** Обработан источник \`raw/1u-power-budget.md\`, обновлена статья [[subsystems/eps]] и добавлена схема 1U в Garage S3.
- **2026-11-24 [LINT]:** Проверка целостности ссылок \`[[...]]\` выполнена: 0 битых ссылок.
`,
          'subsystems/obc.md': `# Бортовой компьютер (OBC)

![Схема компоновки 1U кубсата school76](/api/s3/school76-media/cubesat-1u-cutaway.jpg)

Бортовой вычислитель управляет конечным автоматом режимов (\`NOMINAL\`, \`SAFE\`, \`SCIENCE\`, \`DETUMBLE\`), ведёт журнал телеметрии во FRAM и исполняет визуальные алгоритмы **mBlock Борт ПО**.

## Связанные модули
- [[subsystems/eps]] — контроль порога 25% для аварийного перехода в \`SAFE\`.
- [[subsystems/comms]] — передача бинарного кадра телеметрии каждые 2 секунды.
`,
          'subsystems/eps.md': `# Система энергопитания (EPS)

Сборка 2S Li-Ion (5200 мАч, номинал 7.4 В) заряжается от пяти фотопанелей GaAs через MPPT-преобразователи.

## Управляемые шины
- \`COMMS_3V3\` — питание UHF-трансивера (по умолчанию ВКЛ).
- \`ADCS_5V\` — питание драйверов магнитных катушек (включается в \`DETUMBLE\`).
- \`PAYLOAD_5V\` — питание камеры ДЗЗ и дозиметра (только при АКБ > 45%).

Подробнее о замерах: [[raw/1u-power-budget]].
`,
          'subsystems/adcs.md': `# Ориентация и стабилизация (ADCS)

Подсистема использует трёхосевой гироскоп IMU и три взаимно перпендикулярные магнитные катушки. См. теорию в [[concepts/bdot-detumble]].
`,
          'subsystems/comms.md': `# Радиосвязь (COMMS)

Несущая частота **435.800 МГц**, модуляция AFSK 1200 бод, формат кадров **AX.25 UI-frame** с позывным \`SCHOOL76-1U\`.
`,
          'concepts/bdot-detumble.md': `# Алгоритм демпфирования B-dot

Управляющий момент катушек пропорционален скорости изменения вектора магнитного поля Земли в связанной системе координат спутника: \`m = -k * dB/dt\`.

Порог выхода в режим \`NOMINAL\` по результатам тестов в mBlock Studio: \`|gyro_x| <= 2.0 °/с\`.
`,
          'raw/1u-power-budget.md': `# Замеры энергобюджета 1U (стенд №2)

- Дежурный режим OBC: 1.1 Вт
- Передача маяка AX.25 (20 дБм): +0.8 Вт
- Катушки ADCS (B-dot пик): +1.2 Вт
- Полезная нагрузка (камера 1280x720): +2.4 Вт
- Термостат АКБ в тени Земли: +1.5 Вт
`,
        }
      : {
          'index.md': `# База знаний проекта ${projectName}

> Документация проекта в формате **llm-wiki** (репозиторий Forgejo \`school76/${repo}\`).

## Основные разделы
- [[schema]] — Структура базы знаний и правила оформления.
- [[log]] — Журнал событий и индексации.
`,
          'schema.md': `# Схема LLM-Wiki

1. Каталог \`index.md\` содержит ссылки \`[[...]]\` на все ключевые документы.
2. Журнал \`log.md\` фиксирует историю изменений и загрузки исходных материалов.
`,
          'log.md': `# Журнал LLM-Wiki

- **${now.slice(0, 10)} [INIT]:** Создан репозиторий документации \`${repo}\` в формате llm-wiki.
`,
        };

  for (const [rel, content] of Object.entries(initialFiles)) {
    const { absPath } = resolveFilePath(repo, rel);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf-8');
  }

  appendCommit(repoDir, {
    sha: sha1Hex(now + repo),
    message: `Initialize llm-wiki structure for ${repo}`,
    author: 'Артём Соколов',
    path: 'index.md',
    timestamp: now,
  });
}

export function listForgejoTree(repo: string): ForgejoFileEntry[] {
  ensureForgejoRepo(repo);
  const repoDir = resolveRepoDir(repo);
  const results: ForgejoFileEntry[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        const stat = fs.statSync(full);
        const content = fs.readFileSync(full, 'utf-8');
        const rel = path.relative(repoDir, full).replace(/\\/g, '/');
        results.push({
          path: rel,
          name: entry.name,
          sha: sha1Hex(content),
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
        });
      }
    }
  }

  walk(repoDir);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

export function readForgejoFile(repo: string, filepath: string): { path: string; content: string; sha: string } {
  ensureForgejoRepo(repo);
  const { absPath, relPath } = resolveFilePath(repo, filepath);
  if (!fs.existsSync(absPath)) {
    throw new Error('File not found');
  }
  const content = fs.readFileSync(absPath, 'utf-8');
  return { path: relPath, content, sha: sha1Hex(content) };
}

async function mirrorToExternalForgejo(filepath: string, content: string, message: string, repo: string) {
  const baseUrl = process.env.FORGEJO_URL?.trim();
  const token = process.env.FORGEJO_TOKEN?.trim();
  const owner = process.env.FORGEJO_OWNER?.trim() || 'school76';
  if (!baseUrl || !token) return;

  try {
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filepath}`;
    const b64 = Buffer.from(content, 'utf-8').toString('base64');
    await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        branch: 'main',
        content: b64,
        message,
      }),
    });
  } catch (err) {
    console.warn('External Forgejo mirror skipped:', err instanceof Error ? err.message : err);
  }
}

export async function writeForgejoFile(
  repo: string,
  filepath: string,
  content: string,
  message: string,
  author: string
): Promise<{ path: string; sha: string; commit: ForgejoCommit }> {
  ensureForgejoRepo(repo);
  const repoDir = resolveRepoDir(repo);
  const { absPath, relPath } = resolveFilePath(repo, filepath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf-8');

  const sha = sha1Hex(content + Date.now().toString());
  const commit: ForgejoCommit = {
    sha,
    message: message.trim() || `Update ${relPath}`,
    author: author.trim() || 'Инженер school76',
    path: relPath,
    timestamp: new Date().toISOString(),
  };
  appendCommit(repoDir, commit);
  await mirrorToExternalForgejo(relPath, content, commit.message, repo);
  return { path: relPath, sha, commit };
}

export function deleteForgejoFile(repo: string, filepath: string, author: string) {
  ensureForgejoRepo(repo);
  const repoDir = resolveRepoDir(repo);
  const { absPath, relPath } = resolveFilePath(repo, filepath);
  if (relPath === 'index.md' || relPath === 'log.md' || relPath === 'schema.md') {
    throw new Error('Core llm-wiki files cannot be deleted');
  }
  if (!fs.existsSync(absPath)) {
    throw new Error('File not found');
  }
  fs.unlinkSync(absPath);
  appendCommit(repoDir, {
    sha: sha1Hex(relPath + Date.now().toString()),
    message: `Delete ${relPath}`,
    author: author.trim() || 'Инженер school76',
    path: relPath,
    timestamp: new Date().toISOString(),
  });
}

export function getForgejoCommits(repo: string): ForgejoCommit[] {
  ensureForgejoRepo(repo);
  return readCommitsFile(resolveRepoDir(repo));
}

export async function lintForgejoWiki(repo: string, author: string) {
  const tree = listForgejoTree(repo);
  const existingTargets = new Set(tree.map((f) => f.path.replace(/\.md$/, '')));
  const brokenLinks: { file: string; target: string }[] = [];

  for (const entry of tree) {
    const { content } = readForgejoFile(repo, entry.path);
    const cleaned = content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '');
    const regex = /\[\[([^\]|#]+)(?:#[^\]]*)?(?:\|[^\]]*)?\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(cleaned)) !== null) {
      const target = match[1].trim().replace(/\.md$/, '');
      if (!existingTargets.has(target)) {
        brokenLinks.push({ file: entry.path, target });
      }
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const logEntry =
    brokenLinks.length === 0
      ? `\n- **${stamp} [LINT]:** Проверка целостности llm-wiki выполнена (${author}): проверено ${tree.length} файлов, битых ссылок нет.`
      : `\n- **${stamp} [LINT]:** Обнаружено ${brokenLinks.length} битых ссылок (${brokenLinks.map((b) => `\`${b.file}\` -> \`[[${b.target}]]\``).join(', ')}).`;

  const currentLog = readForgejoFile(repo, 'log.md').content;
  await writeForgejoFile(repo, 'log.md', currentLog.trimEnd() + logEntry + '\n', 'Run llm-wiki link lint', author);

  return { totalFiles: tree.length, brokenLinks };
}

export async function ingestSourceToWiki(
  repo: string,
  title: string,
  rawContent: string,
  category: 'concepts' | 'subsystems' | 'sources',
  author: string
) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || `note-${Date.now().toString(36)}`;

  // Transliterate simple Cyrillic or keep safe ascii slug for file path
  const asciiMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const safeSlug = slug
    .split('')
    .map((ch) => asciiMap[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48) || `note-${Date.now().toString(36)}`;

  const rawPath = `raw/${safeSlug}.md`;
  const wikiPath = `${category}/${safeSlug}.md`;

  await writeForgejoFile(
    repo,
    rawPath,
    `# Исходник: ${title}\n\n${rawContent.trim()}\n`,
    `Add raw source ${rawPath}`,
    author
  );

  // Compile wiki article (optionally via server-side Gemini if key is configured, else structured compiler)
  let compiledBody = '';
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Скомпилируй техническую статью в формате llm-wiki на русском языке по заголовку "${title}" из следующего исходника. Используй Markdown, краткие разделы и ссылку на исходник [[raw/${safeSlug}]].\n\nИсходник:\n${rawContent.slice(0, 6000)}`,
      });
      if (response.text?.trim()) {
        compiledBody = response.text.trim();
      }
    } catch {
      // Fall back to deterministic compiler below
    }
  }

  if (!compiledBody) {
    const lines = rawContent
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const summaryPoints = lines.slice(0, 6).map((l) => `- ${l.replace(/^[-*]\s*/, '')}`).join('\n');
    compiledBody = `# ${title}\n\n> Статья базы знаний в формате **llm-wiki**. Первоисточник: [[raw/${safeSlug}]].\n\n## Ключевые положения\n\n${summaryPoints || rawContent}\n\n## Полный конспект\n\n${rawContent.trim()}\n`;
  }

  await writeForgejoFile(repo, wikiPath, compiledBody + '\n', `Compile llm-wiki page ${wikiPath}`, author);

  // Register in index.md
  const indexFile = readForgejoFile(repo, 'index.md');
  const wikiTarget = wikiPath.replace(/\.md$/, '');
  const indexLine = `- [[${wikiTarget}]] — ${title} (источник: [[raw/${safeSlug}]])`;
  if (!indexFile.content.includes(`[[${wikiTarget}]]`)) {
    await writeForgejoFile(
      repo,
      'index.md',
      indexFile.content.trimEnd() + `\n${indexLine}\n`,
      `Register [[${wikiTarget}]] in index.md`,
      author
    );
  }

  // Append audit entry to log.md
  const stamp = new Date().toISOString().slice(0, 10);
  const logFile = readForgejoFile(repo, 'log.md');
  const logLine = `- **${stamp} [INGEST]:** Загружен \`${rawPath}\`, создана статья [[${wikiTarget}]] и обновлен [[index]] (${author}).`;
  await writeForgejoFile(
    repo,
    'log.md',
    logFile.content.trimEnd() + `\n${logLine}\n`,
    `Log ingest of ${wikiTarget}`,
    author
  );

  return { rawPath, wikiPath };
}
