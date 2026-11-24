import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  CiJobStep,
  CiRunConclusion,
  CiRunStatus,
  CiWorkflowRun,
  ForgejoCommit,
  ForgejoFileEntry,
} from '../src/types/cubesat.ts';

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
  const updated = [commit, ...existing].slice(0, 500);
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
    if (entry.path === 'project/chat.md') continue;
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

export interface ProjectForgejoSyncOptions {
  repo: string;
  projectName: string;
  filepath: string;
  content: string;
  commitMessage: string;
  logTag: 'PROJECT' | 'TEAM' | 'TASK' | 'MBLOCK' | 'WALL' | 'CHAT' | 'AI';
  logSummary: string;
  author: string;
  sectionLabel?: string;
}

export function hasForgejoFile(repo: string, filepath: string): boolean {
  try {
    const { absPath } = resolveFilePath(repo, filepath);
    return fs.existsSync(absPath);
  } catch {
    return false;
  }
}

export function recordProjectChangeToForgejo(opts: ProjectForgejoSyncOptions): ForgejoCommit {
  const {
    repo,
    projectName,
    filepath,
    content,
    commitMessage,
    logTag,
    logSummary,
    author,
    sectionLabel,
  } = opts;

  ensureForgejoRepo(repo, projectName);
  const repoDir = resolveRepoDir(repo);
  const { absPath, relPath } = resolveFilePath(repo, filepath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf-8');

  // Register workspace file in index.md once so it appears as a valid wiki target
  const indexPath = resolveFilePath(repo, 'index.md').absPath;
  const targetSlug = relPath.replace(/\.md$/, '');
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    if (!indexContent.includes(`[[${targetSlug}]]`)) {
      const header = '## Рабочее пространство команды';
      const label = sectionLabel || relPath;
      const line = `- [[${targetSlug}]] — ${label}`;
      const nextIndex = indexContent.includes(header)
        ? `${indexContent.trimEnd()}\n${line}\n`
        : `${indexContent.trimEnd()}\n\n${header}\n${line}\n`;
      fs.writeFileSync(indexPath, nextIndex, 'utf-8');
    }
  }

  // Append structured event to log.md
  const logPath = resolveFilePath(repo, 'log.md').absPath;
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const safeAuthor = author.trim() || 'Команда school76';
  if (fs.existsSync(logPath)) {
    const logContent = fs.readFileSync(logPath, 'utf-8');
    const logLine = `- **${stamp} [${logTag}]:** ${logSummary} (${safeAuthor}).`;
    fs.writeFileSync(logPath, `${logContent.trimEnd()}\n${logLine}\n`, 'utf-8');
  }

  const commit: ForgejoCommit = {
    sha: sha1Hex(`${relPath}:${Date.now()}:${commitMessage}`),
    message: commitMessage.trim() || `Update ${relPath}`,
    author: safeAuthor,
    path: relPath,
    timestamp: new Date().toISOString(),
  };
  appendCommit(repoDir, commit);

  // Mirror asynchronously to external Forgejo if configured
  void mirrorToExternalForgejo(relPath, content, commit.message, repo);

  return commit;
}

// ==========================
// FORGEJO ACTIONS (TEAM CI/CD)
// ==========================
function readActionsFile(repoDir: string): CiWorkflowRun[] {
  const file = path.join(repoDir, '.forgejo-actions.json');
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as CiWorkflowRun[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore corrupt actions log
  }
  return [];
}

function writeActionsFile(repoDir: string, runs: CiWorkflowRun[]) {
  const file = path.join(repoDir, '.forgejo-actions.json');
  fs.writeFileSync(file, JSON.stringify(runs.slice(0, 50), null, 2), 'utf-8');
}

function sanitizeActionRunId(raw: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!clean) throw new Error('Некорректный идентификатор запуска Forgejo Actions');
  return clean;
}

function runRealForgejoChecks(
  repo: string,
  workflowName: string,
  projectName = repo
): {
  conclusion: 'success' | 'failure';
  durationSec: number;
  steps: CiJobStep[];
  errorSummary?: string;
} {
  const startedAt = Date.now();
  const tree = listForgejoTree(repo);
  const paths = new Set(tree.map((f) => f.path));
  const hasCoreFiles = paths.has('index.md') && paths.has('schema.md') && paths.has('log.md');

  const existingTargets = new Set(tree.map((f) => f.path.replace(/\.md$/, '')));
  const brokenLinks: { file: string; target: string }[] = [];
  for (const entry of tree) {
    if (entry.path === 'project/chat.md') continue;
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

  const hasProjectDocs =
    paths.has('README.md') ||
    paths.has('project/overview.md') ||
    tree.some((f) => f.path.startsWith('subsystems/') || f.path.startsWith('concepts/'));

  const step1: CiJobStep = {
    name: `Checkout school76/${repo}`,
    status: 'completed',
    conclusion: tree.length > 0 ? 'success' : 'failure',
    durationSec: 2,
    logLine: `Получено ${tree.length} Markdown-файлов репозитория «${projectName}».`,
  };

  const step2: CiJobStep = {
    name: 'Проверка структуры и ссылок llm-wiki',
    status: 'completed',
    conclusion: hasCoreFiles && brokenLinks.length === 0 ? 'success' : 'failure',
    durationSec: 5,
    logLine: !hasCoreFiles
      ? 'Отсутствуют базовые файлы index.md / schema.md / log.md.'
      : brokenLinks.length > 0
        ? `Найдены битые ссылки (${brokenLinks.length}): ${brokenLinks
            .slice(0, 3)
            .map((b) => `${b.file} -> [[${b.target}]]`)
            .join(', ')}`
        : `Проверено ${tree.length} документов: структура целостная, 0 битых ссылок.`,
  };

  const step3: CiJobStep = {
    name: `Сборка артефактов (${workflowName})`,
    status: 'completed',
    conclusion: hasProjectDocs ? 'success' : 'failure',
    durationSec: 7,
    logLine: hasProjectDocs
      ? 'Документация и спецификации подсистем готовы к публикации.'
      : 'Добавьте README.md или описание подсистем в репозиторий проекта.',
  };

  const steps = [step1, step2, step3];
  const failedStep = steps.find((s) => s.conclusion === 'failure');
  const durationSec = Math.max(4, Math.round((Date.now() - startedAt) / 1000) + 12);

  return {
    conclusion: failedStep ? 'failure' : 'success',
    durationSec,
    steps,
    errorSummary: failedStep?.logLine,
  };
}

export function ensureForgejoActions(
  repo: string,
  projectName = repo,
  projectId?: string
): CiWorkflowRun[] {
  ensureForgejoRepo(repo, projectName);
  const cleanRepo = safeRepoName(repo);
  const repoDir = resolveRepoDir(cleanRepo);
  const existing = readActionsFile(repoDir);
  if (existing.length > 0) {
    return existing;
  }

  const commits = getForgejoCommits(cleanRepo);
  const headSha = commits[0]?.sha?.slice(0, 7) || sha1Hex(cleanRepo).slice(0, 7);
  const now = Date.now();
  const iso = (offsetMin: number) => new Date(now - offsetMin * 60_000).toISOString();

  const seeded: CiWorkflowRun[] =
    cleanRepo === 'school76-1u'
      ? [
          {
            id: 'fg-1u-14',
            provider: 'forgejo',
            repo: `school76/${cleanRepo}`,
            projectId: projectId || 'school76-1u',
            projectName,
            workflowName: 'cubesat-telemetry-ci.yml',
            runNumber: 14,
            runAttempt: 1,
            title: 'Проверка допусков B-dot и профилей энергобюджета EPS',
            branch: 'main',
            commitSha: headSha,
            event: 'push',
            actor: 'Мария Волкова',
            status: 'completed',
            conclusion: 'failure',
            createdAt: iso(18),
            updatedAt: iso(17),
            durationSec: 24,
            canRerun: true,
            errorSummary: 'Порог угловой скорости ADCS в тестовом профиле превысил 2.0 °/с (ожидается калибровка стенда).',
            steps: [
              {
                name: 'Checkout school76/school76-1u',
                status: 'completed',
                conclusion: 'success',
                durationSec: 3,
                logLine: 'Репозиторий загружен (HEAD ' + headSha + ').',
              },
              {
                name: 'Проверка структуры и ссылок llm-wiki',
                status: 'completed',
                conclusion: 'success',
                durationSec: 6,
                logLine: 'Все внутренние ссылки [[...]] прошли валидацию.',
              },
              {
                name: 'Сборка и тест профилей B-dot / EPS',
                status: 'completed',
                conclusion: 'failure',
                durationSec: 15,
                logLine: 'FAIL: Демпфирование B-dot не сошлось за отведённое окно орбиты; перезапустите после обновления конфигурации.',
              },
            ],
          },
          {
            id: 'fg-1u-13',
            provider: 'forgejo',
            repo: `school76/${cleanRepo}`,
            projectId: projectId || 'school76-1u',
            projectName,
            workflowName: 'llm-wiki-lint.yml',
            runNumber: 13,
            runAttempt: 1,
            title: 'Автопроверка целостности базы знаний llm-wiki',
            branch: 'main',
            commitSha: commits[1]?.sha?.slice(0, 7) || headSha,
            event: 'push',
            actor: 'Артём Соколов',
            status: 'completed',
            conclusion: 'success',
            createdAt: iso(95),
            updatedAt: iso(94),
            durationSec: 14,
            canRerun: false,
            steps: [
              {
                name: 'Checkout school76/school76-1u',
                status: 'completed',
                conclusion: 'success',
                durationSec: 2,
                logLine: 'Получены файлы базы знаний.',
              },
              {
                name: 'Индексация index.md и ссылок [[...]]',
                status: 'completed',
                conclusion: 'success',
                durationSec: 12,
                logLine: 'Проверено 9 документов: битых ссылок не обнаружено.',
              },
            ],
          },
          {
            id: 'fg-1u-12',
            provider: 'forgejo',
            repo: `school76/${cleanRepo}`,
            projectId: projectId || 'school76-1u',
            projectName,
            workflowName: 'stm32-firmware-check.yml',
            runNumber: 12,
            runAttempt: 1,
            title: 'Статический анализ бортового ПО OBC / COMMS',
            branch: 'main',
            commitSha: commits[2]?.sha?.slice(0, 7) || headSha,
            event: 'workflow_dispatch',
            actor: 'Дмитрий Орлов',
            status: 'completed',
            conclusion: 'success',
            createdAt: iso(240),
            updatedAt: iso(239),
            durationSec: 31,
            canRerun: false,
          },
        ]
      : cleanRepo === 'ground-sdr'
        ? [
            {
              id: 'fg-sdr-8',
              provider: 'forgejo',
              repo: `school76/${cleanRepo}`,
              projectId: projectId || 'ground-sdr',
              projectName,
              workflowName: 'sdr-decoder-ci.yml',
              runNumber: 8,
              runAttempt: 1,
              title: 'Тест приёма кадров AX.25 (435.800 МГц)',
              branch: 'main',
              commitSha: headSha,
              event: 'push',
              actor: 'Дмитрий Орлов',
              status: 'completed',
              conclusion: 'failure',
              createdAt: iso(35),
              updatedAt: iso(34),
              durationSec: 19,
              canRerun: true,
              errorSummary: 'Контрольная сумма тестового пакета AX.25 отклонена на частоте 435.800 МГц.',
              steps: [
                {
                  name: 'Checkout school76/ground-sdr',
                  status: 'completed',
                  conclusion: 'success',
                  durationSec: 2,
                  logLine: 'Файлы наземной станции загружены.',
                },
                {
                  name: 'Валидация декодера AX.25 UI-frame',
                  status: 'completed',
                  conclusion: 'failure',
                  durationSec: 17,
                  logLine: 'FAIL: Ошибка CRC-16 в тестовом семпле приёмника SDR.',
                },
              ],
            },
            {
              id: 'fg-sdr-7',
              provider: 'forgejo',
              repo: `school76/${cleanRepo}`,
              projectId: projectId || 'ground-sdr',
              projectName,
              workflowName: 'llm-wiki-lint.yml',
              runNumber: 7,
              runAttempt: 1,
              title: 'Проверка документации наземного сегмента',
              branch: 'main',
              commitSha: headSha,
              event: 'push',
              actor: 'Артём Соколов',
              status: 'completed',
              conclusion: 'success',
              createdAt: iso(160),
              updatedAt: iso(159),
              durationSec: 11,
              canRerun: false,
            },
          ]
        : [
            {
              id: `fg-${cleanRepo}-2`,
              provider: 'forgejo',
              repo: `school76/${cleanRepo}`,
              projectId,
              projectName,
              workflowName: 'project-ci-check.yml',
              runNumber: 2,
              runAttempt: 1,
              title: `Первичная проверка репозитория команды «${projectName}»`,
              branch: 'main',
              commitSha: headSha,
              event: 'push',
              actor: 'Система Forgejo CI',
              status: 'completed',
              conclusion: 'failure',
              createdAt: iso(10),
              updatedAt: iso(9),
              durationSec: 12,
              canRerun: true,
              errorSummary: 'Требуется повторная проверка документации после инициализации проекта.',
              steps: [
                {
                  name: `Checkout school76/${cleanRepo}`,
                  status: 'completed',
                  conclusion: 'success',
                  durationSec: 2,
                  logLine: 'Репозиторий команды создан.',
                },
                {
                  name: 'Проверка README.md и структуры llm-wiki',
                  status: 'completed',
                  conclusion: 'failure',
                  durationSec: 10,
                  logLine: 'Ожидается подтверждение документации проекта.',
                },
              ],
            },
            {
              id: `fg-${cleanRepo}-1`,
              provider: 'forgejo',
              repo: `school76/${cleanRepo}`,
              projectId,
              projectName,
              workflowName: 'llm-wiki-init.yml',
              runNumber: 1,
              runAttempt: 1,
              title: 'Инициализация структуры llm-wiki',
              branch: 'main',
              commitSha: headSha,
              event: 'push',
              actor: 'Система Forgejo CI',
              status: 'completed',
              conclusion: 'success',
              createdAt: iso(15),
              updatedAt: iso(14),
              durationSec: 8,
              canRerun: false,
            },
          ];

  writeActionsFile(repoDir, seeded);
  return seeded;
}

export async function listForgejoActionRuns(
  repo: string,
  projectName = repo,
  projectId?: string
): Promise<{
  repo: string;
  externalConfigured: boolean;
  runs: CiWorkflowRun[];
}> {
  const cleanRepo = safeRepoName(repo);
  const baseUrl = process.env.FORGEJO_URL?.trim();
  const token = process.env.FORGEJO_TOKEN?.trim();
  const owner = process.env.FORGEJO_OWNER?.trim() || 'school76';

  if (baseUrl && token) {
    try {
      const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(cleanRepo)}/actions/runs?limit=15`;
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/json',
        },
      });
      if (response.ok) {
        const data = (await response.json()) as { workflow_runs?: Record<string, any>[] } | Record<string, any>[];
        const rawList = Array.isArray(data)
          ? data
          : Array.isArray(data?.workflow_runs)
            ? data.workflow_runs
            : null;
        if (rawList) {
          const mapped: CiWorkflowRun[] = rawList.map((r, idx) => {
            const status: CiRunStatus =
              r.status === 'queued' || r.status === 'waiting'
                ? 'queued'
                : r.status === 'in_progress' || r.status === 'running'
                  ? 'in_progress'
                  : 'completed';
            const conclusion: CiRunConclusion =
              r.conclusion === 'success' ||
              r.conclusion === 'failure' ||
              r.conclusion === 'cancelled' ||
              r.conclusion === 'timed_out'
                ? r.conclusion
                : status === 'completed'
                  ? 'success'
                  : null;
            return {
              id: String(r.id ?? `ext-${idx}`),
              provider: 'forgejo',
              repo: `${owner}/${cleanRepo}`,
              projectId,
              projectName,
              workflowName: String(r.name || r.workflow_id || 'forgejo-ci.yml'),
              runNumber: Number(r.run_number || idx + 1),
              runAttempt: Number(r.run_attempt || 1),
              title: String(r.display_title || r.title || 'Forgejo Actions Run'),
              branch: String(r.head_branch || 'main'),
              commitSha: String(r.head_sha || '').slice(0, 7),
              event: String(r.event || 'push'),
              actor: String(r.actor?.login || owner),
              status,
              conclusion,
              createdAt: String(r.created_at || new Date().toISOString()),
              updatedAt: String(r.updated_at || new Date().toISOString()),
              canRerun:
                status === 'completed' &&
                (conclusion === 'failure' || conclusion === 'cancelled' || conclusion === 'timed_out'),
            };
          });
          return {
            repo: `${owner}/${cleanRepo}`,
            externalConfigured: true,
            runs: mapped,
          };
        }
      }
    } catch {
      // Fall back to embedded Forgejo Actions store
    }
  }

  const runs = ensureForgejoActions(cleanRepo, projectName, projectId).map((run) => ({
    ...run,
    projectId: run.projectId || projectId,
    projectName: run.projectName || projectName,
  }));

  return {
    repo: `school76/${cleanRepo}`,
    externalConfigured: Boolean(baseUrl && token),
    runs,
  };
}

export async function rerunForgejoActionRun(
  repo: string,
  rawRunId: string,
  author: string,
  projectMeta?: { projectName?: string; projectId?: string }
): Promise<CiWorkflowRun> {
  const cleanRepo = safeRepoName(repo);
  const runId = sanitizeActionRunId(rawRunId);
  const projectName = projectMeta?.projectName || cleanRepo;

  const baseUrl = process.env.FORGEJO_URL?.trim();
  const token = process.env.FORGEJO_TOKEN?.trim();
  const owner = process.env.FORGEJO_OWNER?.trim() || 'school76';

  if (baseUrl && token) {
    try {
      const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(cleanRepo)}/actions/runs/${encodeURIComponent(runId)}/rerun`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/json',
        },
      });
      if (response.ok) {
        const list = await listForgejoActionRuns(cleanRepo, projectName, projectMeta?.projectId);
        const found = list.runs.find((r) => r.id === runId);
        if (found) return found;
      }
    } catch {
      // Fall through to embedded Forgejo runner
    }
  }

  ensureForgejoActions(cleanRepo, projectName, projectMeta?.projectId);
  const repoDir = resolveRepoDir(cleanRepo);
  const runs = readActionsFile(repoDir);
  const idx = runs.findIndex((r) => r.id === runId);
  if (idx === -1) {
    throw new Error('Запуск сборки Forgejo Actions не найден');
  }

  const target = runs[idx];
  const checkResult = runRealForgejoChecks(cleanRepo, target.workflowName, projectName);
  const nowIso = new Date().toISOString();

  const updatedRun: CiWorkflowRun = {
    ...target,
    projectId: target.projectId || projectMeta?.projectId,
    projectName,
    runAttempt: (target.runAttempt || 1) + 1,
    actor: author.trim() || target.actor,
    status: 'completed',
    conclusion: checkResult.conclusion,
    updatedAt: nowIso,
    durationSec: checkResult.durationSec,
    steps: checkResult.steps,
    errorSummary: checkResult.errorSummary,
    canRerun: checkResult.conclusion === 'failure',
  };

  runs[idx] = updatedRun;
  writeActionsFile(repoDir, runs);

  // Append CI rerun record to Forgejo llm-wiki log.md
  try {
    const logFile = readForgejoFile(cleanRepo, 'log.md');
    const stamp = nowIso.replace('T', ' ').slice(0, 16);
    const statusWord = checkResult.conclusion === 'success' ? 'УСПЕХ' : 'ОШИБКА';
    const logLine = `- **${stamp} [CI-RERUN]:** Перезапуск сборки \`${updatedRun.workflowName}\` #${updatedRun.runNumber} (попытка ${updatedRun.runAttempt}) — ${statusWord} (${author}).`;
    await writeForgejoFile(
      cleanRepo,
      'log.md',
      `${logFile.content.trimEnd()}\n${logLine}\n`,
      `[CI] Rerun ${updatedRun.workflowName} #${updatedRun.runNumber}`,
      author
    );
  } catch {
    // Non-fatal if log.md append fails
  }

  return updatedRun;
}

export async function dispatchForgejoActionRun(
  repo: string,
  workflowName: string,
  author: string,
  projectMeta?: { projectName?: string; projectId?: string }
): Promise<CiWorkflowRun> {
  const cleanRepo = safeRepoName(repo);
  const projectName = projectMeta?.projectName || cleanRepo;
  ensureForgejoActions(cleanRepo, projectName, projectMeta?.projectId);

  const repoDir = resolveRepoDir(cleanRepo);
  const runs = readActionsFile(repoDir);
  const commits = getForgejoCommits(cleanRepo);
  const headSha = commits[0]?.sha?.slice(0, 7) || sha1Hex(cleanRepo).slice(0, 7);
  const nextNumber = runs.reduce((max, r) => Math.max(max, r.runNumber || 0), 0) + 1;
  const safeWorkflow =
    workflowName.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64) || 'project-ci-check.yml';

  const checkResult = runRealForgejoChecks(cleanRepo, safeWorkflow, projectName);
  const nowIso = new Date().toISOString();

  const newRun: CiWorkflowRun = {
    id: `fg-${cleanRepo}-${nextNumber}-${Date.now().toString(36)}`,
    provider: 'forgejo',
    repo: `school76/${cleanRepo}`,
    projectId: projectMeta?.projectId,
    projectName,
    workflowName: safeWorkflow,
    runNumber: nextNumber,
    runAttempt: 1,
    title: `Ручной запуск проверки для «${projectName}»`,
    branch: 'main',
    commitSha: headSha,
    event: 'workflow_dispatch',
    actor: author.trim() || 'Инженер school76',
    status: 'completed',
    conclusion: checkResult.conclusion,
    createdAt: nowIso,
    updatedAt: nowIso,
    durationSec: checkResult.durationSec,
    steps: checkResult.steps,
    errorSummary: checkResult.errorSummary,
    canRerun: checkResult.conclusion === 'failure',
  };

  writeActionsFile(repoDir, [newRun, ...runs]);
  return newRun;
}


