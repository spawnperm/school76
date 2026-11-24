import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type {
  CiRunConclusion,
  CiRunStatus,
  CiWorkflowRun,
  GitHubJobLogSummary,
  GitHubJobStepSummary,
  GitHubRunLogsResponse,
  GitHubRunStatusSnapshot,
  GitHubWorkflowDescriptor,
} from '../src/types/cubesat.ts';

export interface GitChangedFile {
  status: string;
  path: string;
}

export interface GitRecentCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitHubSyncStatus {
  gitAvailable: boolean;
  repo: string;
  branch: string;
  lastCommitSha: string;
  lastCommitMessage: string;
  lastCommitAt: string;
  commitCount: number;
  recentCommits: GitRecentCommit[];
  changedFiles: GitChangedFile[];
  aheadCount: number;
  tokenConfigured: boolean;
}

function buildGitEnv(rootDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_DIR: path.join(rootDir, '.git'),
    GIT_WORK_TREE: rootDir,
    GIT_TERMINAL_PROMPT: '0',
  };
}

function runGit(rootDir: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: rootDir,
    env: buildGitEnv(rootDir),
    encoding: 'utf-8',
    maxBuffer: 2 * 1024 * 1024,
  }).trimEnd();
}

function sanitizeMessage(raw: unknown): string {
  const cleaned =
    typeof raw === 'string'
      ? raw.replace(/[\r\n\0]+/g, ' ').trim().slice(0, 180)
      : '';
  return cleaned || 'chore: update school76 workspace';
}

function sanitizeAuthorName(raw: unknown): string {
  const cleaned =
    typeof raw === 'string'
      ? raw.replace(/[\r\n\0<>]+/g, ' ').trim().slice(0, 64)
      : '';
  return cleaned || 'school76-engineer';
}

function getTargetBranch(): string {
  const raw = (process.env.GITHUB_BRANCH || 'main').trim();
  return /^[a-zA-Z0-9._/-]{1,64}$/.test(raw) ? raw : 'main';
}

function getRepoLabel(rootDir: string): string {
  if (process.env.GITHUB_REPO?.trim()) {
    return process.env.GITHUB_REPO.trim();
  }
  try {
    const remote = runGit(rootDir, ['remote', 'get-url', 'origin']);
    const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/i);
    if (match) return match[1];
  } catch {
    // ignore
  }
  return 'spawnperm/school76';
}

export function getGitHubStatus(rootDir: string): GitHubSyncStatus {
  const gitDir = path.join(rootDir, '.git');
  const branchDefault = getTargetBranch();
  if (!fs.existsSync(gitDir)) {
    return {
      gitAvailable: false,
      repo: getRepoLabel(rootDir),
      branch: branchDefault,
      lastCommitSha: '',
      lastCommitMessage: '',
      lastCommitAt: '',
      commitCount: 0,
      recentCommits: [],
      changedFiles: [],
      aheadCount: 0,
      tokenConfigured: Boolean(process.env.GITHUB_TOKEN?.trim()),
    };
  }

  let branch = branchDefault;
  try {
    branch = runGit(rootDir, ['rev-parse', '--abbrev-ref', 'HEAD']) || branchDefault;
  } catch {
    // fallback
  }

  let lastCommitSha = '';
  let lastCommitMessage = '';
  let lastCommitAt = '';
  let commitCount = 0;
  const recentCommits: GitRecentCommit[] = [];
  try {
    const countOut = runGit(rootDir, ['rev-list', '--count', 'HEAD']);
    commitCount = Number.parseInt(countOut, 10) || 0;
  } catch {
    commitCount = 0;
  }

  try {
    const logOut = runGit(rootDir, ['log', '-n', '5', '--pretty=format:%h%x1f%s%x1f%an%x1f%cI']);
    for (const line of logOut.split('\n')) {
      if (!line.trim()) continue;
      const [sha, msg, author, dt] = line.split('\x1f');
      if (!sha) continue;
      recentCommits.push({
        sha,
        message: msg || '',
        author: author || 'engineer',
        date: dt || '',
      });
    }
    if (recentCommits.length > 0) {
      lastCommitSha = recentCommits[0].sha;
      lastCommitMessage = recentCommits[0].message;
      lastCommitAt = recentCommits[0].date;
    }
  } catch {
    // ignore
  }

  const changedFiles: GitChangedFile[] = [];
  try {
    const statusOut = runGit(rootDir, ['status', '--porcelain']);
    for (const line of statusOut.split('\n')) {
      if (!line.trim()) continue;
      changedFiles.push({
        status: line.slice(0, 2).trim() || 'M',
        path: line.slice(3).trim(),
      });
    }
  } catch {
    // ignore
  }

  let aheadCount = 0;
  try {
    const aheadOut = runGit(rootDir, ['rev-list', '--count', `origin/${branch}..HEAD`]);
    aheadCount = Number.parseInt(aheadOut, 10) || 0;
  } catch {
    aheadCount = 0;
  }

  return {
    gitAvailable: true,
    repo: getRepoLabel(rootDir),
    branch,
    lastCommitSha,
    lastCommitMessage,
    lastCommitAt,
    commitCount,
    recentCommits,
    changedFiles,
    aheadCount,
    tokenConfigured: Boolean(process.env.GITHUB_TOKEN?.trim()),
  };
}

function sanitizeGitHubToken(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') {
    throw new Error('Некорректный формат ключа GitHub');
  }
  const cleaned = raw.replace(/[\r\n\0]+/g, '').trim();
  if (!cleaned) return '';
  if (!/^[A-Za-z0-9_.-]{10,512}$/.test(cleaned)) {
    throw new Error('Некорректный формат ключа GitHub (ожидается Personal Access Token)');
  }
  return cleaned;
}

export function commitAndPushToGitHub(
  rootDir: string,
  rawMessage: unknown,
  rawAuthorName: unknown,
  authorEmail: string,
  rawToken?: unknown
): {
  ok: boolean;
  commitSha: string;
  commitMessage: string;
  branch: string;
  pushed: boolean;
  filesCommitted: number;
} {
  const gitDir = path.join(rootDir, '.git');
  if (!fs.existsSync(gitDir)) {
    throw new Error('Локальный Git-репозиторий не найден');
  }

  const overrideToken = sanitizeGitHubToken(rawToken);
  const envToken = process.env.GITHUB_TOKEN?.trim() || '';
  const token = overrideToken || envToken;

  let remoteUrl = '';
  try {
    remoteUrl = runGit(rootDir, ['remote', 'get-url', 'origin']);
  } catch {
    // ignore
  }
  if (/^https?:\/\//i.test(remoteUrl) && !token) {
    throw new Error(
      'Для отправки на GitHub введите ключ доступа (Personal Access Token) в форме или задайте GITHUB_TOKEN в Secrets сервера.'
    );
  }

  const statusBefore = getGitHubStatus(rootDir);
  const message = sanitizeMessage(rawMessage);
  const authorName = sanitizeAuthorName(rawAuthorName);
  const safeEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+$/.test(authorEmail)
    ? authorEmail
    : 'engineer@school76.local';
  const branch = getTargetBranch();

  let filesCommitted = 0;
  if (statusBefore.changedFiles.length > 0) {
    runGit(rootDir, ['add', '-A']);
    runGit(rootDir, [
      '-c',
      `user.name=${authorName}`,
      '-c',
      `user.email=${safeEmail}`,
      'commit',
      '-m',
      message,
    ]);
    filesCommitted = statusBefore.changedFiles.length;
  } else if (statusBefore.aheadCount === 0) {
    throw new Error('Нет незафиксированных изменений или неотправленных коммитов');
  }

  const commitSha = runGit(rootDir, ['rev-parse', '--short', 'HEAD']);
  const authB64 = token
    ? Buffer.from(`x-access-token:${token}`, 'utf-8').toString('base64')
    : '';

  try {
    if (token) {
      runGit(rootDir, [
        '-c',
        `http.https://github.com/.extraheader=Authorization: Basic ${authB64}`,
        'push',
        'origin',
        branch,
      ]);
    } else {
      runGit(rootDir, ['push', 'origin', branch]);
    }
  } catch (err) {
    const rawErr = err instanceof Error ? err.message : String(err);
    let scrubbedErr = token ? rawErr.split(token).join('[REDACTED]') : rawErr;
    if (authB64) {
      scrubbedErr = scrubbedErr.split(authB64).join('[REDACTED]');
    }
    if (/could not read Username|Authentication failed|Permission|403|401/i.test(scrubbedErr)) {
      throw new Error(
        filesCommitted > 0
          ? `Локальный коммит ${commitSha} создан, но GitHub отклонил авторизацию — проверьте ключ доступа (нужны права repo / Contents: Read & Write).`
          : 'GitHub отклонил авторизацию — проверьте ключ доступа (нужны права repo / Contents: Read & Write).'
      );
    }
    throw new Error(`Ошибка отправки в GitHub: ${scrubbedErr.slice(0, 220)}`);
  }

  return {
    ok: true,
    commitSha,
    commitMessage: message,
    branch,
    pushed: true,
    filesCommitted,
  };
}

export function sanitizeGitHubRepo(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') {
    throw new Error('Некорректный формат репозитория GitHub');
  }
  const cleaned = raw.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  if (!cleaned) return '';
  if (cleaned.includes('..') || !/^[a-zA-Z0-9._-]{1,100}\/[a-zA-Z0-9._-]{1,100}$/.test(cleaned)) {
    throw new Error('Репозиторий GitHub должен быть указан в формате owner/repo');
  }
  return cleaned;
}

function sanitizeRunId(raw: unknown): string {
  const cleaned = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!/^\d{1,20}$/.test(cleaned)) {
    throw new Error('Некорректный идентификатор запуска сборки');
  }
  return cleaned;
}

function mapGitHubStatus(raw: unknown): CiRunStatus {
  if (raw === 'queued' || raw === 'waiting' || raw === 'pending' || raw === 'requested') {
    return 'queued';
  }
  if (raw === 'in_progress') {
    return 'in_progress';
  }
  return 'completed';
}

function mapGitHubConclusion(raw: unknown): CiRunConclusion {
  if (
    raw === 'success' ||
    raw === 'failure' ||
    raw === 'cancelled' ||
    raw === 'timed_out' ||
    raw === 'skipped' ||
    raw === 'neutral'
  ) {
    return raw;
  }
  if (raw === 'startup_failure' || raw === 'action_required') {
    return 'failure';
  }
  return null;
}

function buildGitHubHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'school76-ci-panel',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function scrubCredential(text: string, token: string): string {
  if (!token) return text;
  return text.split(token).join('[REDACTED]');
}

export async function listGitHubWorkflowRuns(
  rootDir: string,
  rawRepo?: unknown,
  rawToken?: unknown
): Promise<{
  repo: string;
  totalCount: number;
  tokenConfigured: boolean;
  runs: CiWorkflowRun[];
}> {
  const overrideRepo = sanitizeGitHubRepo(rawRepo);
  const repo = overrideRepo || getRepoLabel(rootDir);
  const [owner, repoName] = repo.split('/');
  const overrideToken = sanitizeGitHubToken(rawToken);
  const envToken = process.env.GITHUB_TOKEN?.trim() || '';
  const token = overrideToken || envToken;

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs?per_page=15`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: buildGitHubHeaders(token),
    });
  } catch (err) {
    const msg = scrubCredential(err instanceof Error ? err.message : String(err), token);
    throw new Error(`Не удалось подключиться к GitHub API: ${msg.slice(0, 180)}`);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    total_count?: number;
    workflow_runs?: Record<string, any>[];
    message?: string;
  };

  if (!response.ok) {
    const apiMsg = scrubCredential(payload?.message || `HTTP ${response.status}`, token);
    if (response.status === 404) {
      throw new Error(
        `Репозиторий ${repo} не найден или закрыт. Для приватных репозиториев укажите ключ доступа (PAT).`
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Доступ к GitHub Actions ограничен (${apiMsg}). Укажите или проверьте ключ доступа (PAT).`);
    }
    throw new Error(`Ошибка GitHub API (${response.status}): ${apiMsg}`);
  }

  const rawRuns = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
  const runs: CiWorkflowRun[] = rawRuns.map((run) => {
    const status = mapGitHubStatus(run.status);
    const conclusion = mapGitHubConclusion(run.conclusion);
    const startedMs = run.run_started_at ? new Date(run.run_started_at).getTime() : NaN;
    const updatedMs = run.updated_at ? new Date(run.updated_at).getTime() : NaN;
    const durationSec =
      !Number.isNaN(startedMs) && !Number.isNaN(updatedMs) && updatedMs >= startedMs
        ? Math.round((updatedMs - startedMs) / 1000)
        : undefined;
    const safeUrl =
      typeof run.html_url === 'string' && /^https:\/\/github\.com\//i.test(run.html_url)
        ? run.html_url
        : undefined;

    return {
      id: String(run.id),
      provider: 'github',
      repo,
      workflowName: typeof run.name === 'string' && run.name ? run.name : 'Workflow',
      runNumber: typeof run.run_number === 'number' ? run.run_number : 0,
      runAttempt: typeof run.run_attempt === 'number' ? run.run_attempt : 1,
      title:
        typeof run.display_title === 'string' && run.display_title
          ? run.display_title
          : typeof run.head_commit?.message === 'string'
            ? run.head_commit.message.split('\n')[0]
            : 'Workflow run',
      branch: typeof run.head_branch === 'string' ? run.head_branch : 'main',
      commitSha: typeof run.head_sha === 'string' ? run.head_sha.slice(0, 7) : '',
      event: typeof run.event === 'string' ? run.event : 'push',
      actor: typeof run.actor?.login === 'string' ? run.actor.login : 'github',
      status,
      conclusion,
      createdAt: typeof run.created_at === 'string' ? run.created_at : new Date().toISOString(),
      updatedAt: typeof run.updated_at === 'string' ? run.updated_at : new Date().toISOString(),
      durationSec,
      htmlUrl: safeUrl,
      canRerun:
        status === 'completed' &&
        (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'cancelled'),
    };
  });

  return {
    repo,
    totalCount: typeof payload.total_count === 'number' ? payload.total_count : runs.length,
    tokenConfigured: Boolean(envToken),
    runs,
  };
}

export async function rerunGitHubWorkflowRun(
  rootDir: string,
  rawRunId: unknown,
  rawRepo?: unknown,
  rawToken?: unknown
): Promise<{
  ok: boolean;
  repo: string;
  runId: string;
  mode: 'rerun-failed-jobs' | 'rerun';
}> {
  const overrideRepo = sanitizeGitHubRepo(rawRepo);
  const repo = overrideRepo || getRepoLabel(rootDir);
  const [owner, repoName] = repo.split('/');
  const runId = sanitizeRunId(rawRunId);
  const overrideToken = sanitizeGitHubToken(rawToken);
  const envToken = process.env.GITHUB_TOKEN?.trim() || '';
  const token = overrideToken || envToken;

  if (!token) {
    throw new Error(
      'Для перезапуска сборки GitHub Actions введите ключ доступа (PAT) с правами actions:write / repo или задайте GITHUB_TOKEN на сервере.'
    );
  }

  const baseRunUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs/${encodeURIComponent(runId)}`;
  const headers = buildGitHubHeaders(token);

  let mode: 'rerun-failed-jobs' | 'rerun' = 'rerun-failed-jobs';
  let response = await fetch(`${baseRunUrl}/rerun-failed-jobs`, {
    method: 'POST',
    headers,
  });

  // If no failed jobs exist (e.g. cancelled workflow or startup failure), fall back to full rerun
  if (response.status === 422 || response.status === 400) {
    mode = 'rerun';
    response = await fetch(`${baseRunUrl}/rerun`, {
      method: 'POST',
      headers,
    });
  }

  if (!response.ok) {
    const errPayload = (await response.json().catch(() => ({}))) as { message?: string };
    const apiMsg = scrubCredential(errPayload?.message || `HTTP ${response.status}`, token);
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `GitHub отклонил перезапуск сборки (${apiMsg}). Проверьте права ключа (нужны repo или Actions: Read and Write).`
      );
    }
    throw new Error(`Не удалось перезапустить сборку GitHub Actions (${response.status}): ${apiMsg}`);
  }

  return {
    ok: true,
    repo,
    runId,
    mode,
  };
}

function condenseJobLogText(rawText: string): { lines: string[]; totalLines: number } {
  const capped = rawText.length > 512_000 ? rawText.slice(-512_000) : rawText;
  const cleanedLines = capped
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\.\d+Z)\s+/, '[$2] ')
        .trimEnd()
    )
    .filter((line) => {
      const stripped = line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
      return stripped !== '' && !stripped.startsWith('##[endgroup]');
    });

  const totalLines = cleanedLines.length;
  if (totalLines <= 65) {
    return { lines: cleanedLines, totalLines };
  }

  const errorPattern =
    /##\[error\]|\berror\b|ERR!|\bFAIL\b|Exception|AssertionError|Process completed with exit code [1-9]|ENOENT|SyntaxError|TypeError|TS\d{4}:/i;
  const selected = new Set<number>();

  let clusters = 0;
  let lastErrorIdx = -10;
  for (let i = 0; i < totalLines; i++) {
    if (errorPattern.test(cleanedLines[i])) {
      if (i - lastErrorIdx > 5) {
        clusters += 1;
      }
      lastErrorIdx = i;
      if (clusters <= 4) {
        for (let k = Math.max(0, i - 2); k <= Math.min(totalLines - 1, i + 4); k++) {
          selected.add(k);
        }
      }
    }
  }

  // Always include the tail of the log so final exit summary is visible
  const tailStart = Math.max(0, totalLines - 32);
  for (let i = tailStart; i < totalLines; i++) {
    selected.add(i);
  }

  const sortedIndices = Array.from(selected).sort((a, b) => a - b);
  const result: string[] = [];
  let prev = -1;
  for (const idx of sortedIndices) {
    if (prev !== -1 && idx > prev + 1) {
      result.push(`... (пропущено ${idx - prev - 1} строк) ...`);
    } else if (prev === -1 && idx > 0) {
      result.push(`... (пропущено первых ${idx} строк) ...`);
    }
    result.push(cleanedLines[idx]);
    prev = idx;
  }

  return { lines: result.slice(0, 80), totalLines };
}

export async function getGitHubWorkflowRunLogs(
  rootDir: string,
  rawRunId: unknown,
  rawRepo?: unknown,
  rawToken?: unknown
): Promise<GitHubRunLogsResponse> {
  const overrideRepo = sanitizeGitHubRepo(rawRepo);
  const repo = overrideRepo || getRepoLabel(rootDir);
  const [owner, repoName] = repo.split('/');
  const runId = sanitizeRunId(rawRunId);
  const overrideToken = sanitizeGitHubToken(rawToken);
  const envToken = process.env.GITHUB_TOKEN?.trim() || '';
  const token = overrideToken || envToken;

  const headers = buildGitHubHeaders(token);
  const jobsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs/${encodeURIComponent(runId)}/jobs?per_page=20`;

  let jobsRes: Response;
  try {
    jobsRes = await fetch(jobsUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const msg = scrubCredential(err instanceof Error ? err.message : String(err), token);
    throw new Error(`Не удалось получить задания сборки GitHub Actions: ${msg.slice(0, 180)}`);
  }

  const jobsPayload = (await jobsRes.json().catch(() => ({}))) as {
    jobs?: Record<string, any>[];
    message?: string;
  };

  if (!jobsRes.ok) {
    const apiMsg = scrubCredential(jobsPayload?.message || `HTTP ${jobsRes.status}`, token);
    throw new Error(`Ошибка загрузки шагов сборки (${jobsRes.status}): ${apiMsg}`);
  }

  const rawJobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : [];
  // Prioritize failed/timed_out/cancelled jobs first
  const sortedJobs = [...rawJobs].sort((a, b) => {
    const aFail = a.conclusion === 'failure' || a.conclusion === 'timed_out' ? 0 : 1;
    const bFail = b.conclusion === 'failure' || b.conclusion === 'timed_out' ? 0 : 1;
    return aFail - bFail;
  });

  const jobsToFetchLogs = new Set(sortedJobs.slice(0, 2).map((j) => String(j.id)));

  const jobs: GitHubJobLogSummary[] = await Promise.all(
    sortedJobs.map(async (job) => {
      const jobId = String(job.id);
      const status = mapGitHubStatus(job.status);
      const conclusion = mapGitHubConclusion(job.conclusion);
      const startedMs = job.started_at ? new Date(job.started_at).getTime() : NaN;
      const completedMs = job.completed_at ? new Date(job.completed_at).getTime() : NaN;
      const durationSec =
        !Number.isNaN(startedMs) && !Number.isNaN(completedMs) && completedMs >= startedMs
          ? Math.round((completedMs - startedMs) / 1000)
          : undefined;
      const safeUrl =
        typeof job.html_url === 'string' && /^https:\/\/github\.com\//i.test(job.html_url)
          ? job.html_url
          : undefined;

      const rawSteps = Array.isArray(job.steps) ? job.steps : [];
      const steps: GitHubJobStepSummary[] = rawSteps.map((st: Record<string, any>, idx: number) => {
        const stStart = st.started_at ? new Date(st.started_at).getTime() : NaN;
        const stEnd = st.completed_at ? new Date(st.completed_at).getTime() : NaN;
        return {
          number: typeof st.number === 'number' ? st.number : idx + 1,
          name: typeof st.name === 'string' ? st.name : `Step ${idx + 1}`,
          status: mapGitHubStatus(st.status),
          conclusion: mapGitHubConclusion(st.conclusion),
          durationSec:
            !Number.isNaN(stStart) && !Number.isNaN(stEnd) && stEnd >= stStart
              ? Math.round((stEnd - stStart) / 1000)
              : undefined,
        };
      });

      let logLines: string[] = [];
      let totalLogLines = 0;
      let logNotice: string | undefined;

      if (jobsToFetchLogs.has(jobId) && status === 'completed') {
        const logUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/jobs/${encodeURIComponent(jobId)}/logs`;
        try {
          const logRes = await fetch(logUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(8_000),
          });
          if (logRes.ok) {
            const rawText = await logRes.text();
            const condensed = condenseJobLogText(rawText);
            logLines = condensed.lines;
            totalLogLines = condensed.totalLines;
          } else if (logRes.status === 401 || logRes.status === 403) {
            logNotice =
              'Для загрузки текстового вывода лога GitHub требует ключ доступа (PAT) — структура шагов показана ниже.';
          } else if (logRes.status === 410) {
            logNotice = 'Срок хранения сырых логов этого запуска на GitHub истёк.';
          } else {
            logNotice = `Логи недоступны (HTTP ${logRes.status}).`;
          }
        } catch {
          logNotice = 'Таймаут загрузки текстового вывода задания.';
        }
      }

      return {
        id: jobId,
        name: typeof job.name === 'string' ? job.name : 'job',
        status,
        conclusion,
        durationSec,
        htmlUrl: safeUrl,
        steps,
        logLines,
        totalLogLines,
        logNotice,
      };
    })
  );

  const failedJob = jobs.find((j) => j.conclusion === 'failure' || j.conclusion === 'timed_out');
  const failedStep = failedJob?.steps.find(
    (s) => s.conclusion === 'failure' || s.conclusion === 'timed_out'
  );
  const condensedSummary = failedJob
    ? failedStep
      ? `Сбой в задании «${failedJob.name}» на шаге #${failedStep.number} «${failedStep.name}»`
      : `Сбой в задании «${failedJob.name}»`
    : jobs.length > 0
      ? `Заданий выполнено: ${jobs.length}`
      : 'Задания для этого запуска не найдены';

  return {
    repo,
    runId,
    jobs,
    condensedSummary,
  };
}

function sanitizeBranchRef(raw: unknown, fallback: string): string {
  const cleaned = typeof raw === 'string' ? raw.trim() : '';
  if (!cleaned) return fallback;
  if (!/^[a-zA-Z0-9._/-]{1,64}$/.test(cleaned) || cleaned.includes('..')) {
    throw new Error('Некорректное имя ветки Git');
  }
  return cleaned;
}

function sanitizeWorkflowId(raw: unknown): string {
  const cleaned = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!cleaned) return '';
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(cleaned) || cleaned.includes('..')) {
    throw new Error('Некорректный идентификатор workflow GitHub Actions');
  }
  return cleaned;
}

function mapGitHubApiRun(repo: string, run: Record<string, any>): CiWorkflowRun {
  const status = mapGitHubStatus(run.status);
  const conclusion = mapGitHubConclusion(run.conclusion);
  const startedMs = run.run_started_at ? new Date(run.run_started_at).getTime() : NaN;
  const updatedMs = run.updated_at ? new Date(run.updated_at).getTime() : NaN;
  const durationSec =
    !Number.isNaN(startedMs) && !Number.isNaN(updatedMs) && updatedMs >= startedMs
      ? Math.round((updatedMs - startedMs) / 1000)
      : undefined;
  const safeUrl =
    typeof run.html_url === 'string' && /^https:\/\/github\.com\//i.test(run.html_url)
      ? run.html_url
      : undefined;

  return {
    id: String(run.id),
    provider: 'github',
    repo,
    workflowName: typeof run.name === 'string' && run.name ? run.name : 'Workflow',
    runNumber: typeof run.run_number === 'number' ? run.run_number : 0,
    runAttempt: typeof run.run_attempt === 'number' ? run.run_attempt : 1,
    title:
      typeof run.display_title === 'string' && run.display_title
        ? run.display_title
        : typeof run.head_commit?.message === 'string'
          ? run.head_commit.message.split('\n')[0]
          : 'Workflow run',
    branch: typeof run.head_branch === 'string' ? run.head_branch : 'main',
    commitSha: typeof run.head_sha === 'string' ? run.head_sha.slice(0, 7) : '',
    event: typeof run.event === 'string' ? run.event : 'push',
    actor: typeof run.actor?.login === 'string' ? run.actor.login : 'github',
    status,
    conclusion,
    createdAt: typeof run.created_at === 'string' ? run.created_at : new Date().toISOString(),
    updatedAt: typeof run.updated_at === 'string' ? run.updated_at : new Date().toISOString(),
    durationSec,
    htmlUrl: safeUrl,
    canRerun:
      status === 'completed' &&
      (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'cancelled'),
  };
}

export async function listGitHubWorkflows(
  rootDir: string,
  rawRepo?: unknown,
  rawToken?: unknown
): Promise<{
  repo: string;
  tokenConfigured: boolean;
  workflows: GitHubWorkflowDescriptor[];
}> {
  const overrideRepo = sanitizeGitHubRepo(rawRepo);
  const repo = overrideRepo || getRepoLabel(rootDir);
  const [owner, repoName] = repo.split('/');
  const overrideToken = sanitizeGitHubToken(rawToken);
  const envToken = process.env.GITHUB_TOKEN?.trim() || '';
  const token = overrideToken || envToken;

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/workflows?per_page=30`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: buildGitHubHeaders(token),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const msg = scrubCredential(err instanceof Error ? err.message : String(err), token);
    throw new Error(`Не удалось получить список workflows GitHub Actions: ${msg.slice(0, 180)}`);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    workflows?: Record<string, any>[];
    message?: string;
  };

  if (!response.ok) {
    const apiMsg = scrubCredential(payload?.message || `HTTP ${response.status}`, token);
    if (response.status === 404) {
      throw new Error(
        `Репозиторий ${repo} не найден или закрыт. Укажите ключ доступа (PAT) для просмотра workflows.`
      );
    }
    throw new Error(`Ошибка загрузки workflows GitHub (${response.status}): ${apiMsg}`);
  }

  const rawList = Array.isArray(payload.workflows) ? payload.workflows : [];
  const unitTestRegex = /unit|test|vitest|jest|pytest|spec|check|verify|ci/i;
  const workflows: GitHubWorkflowDescriptor[] = rawList
    .filter((wf) => wf && wf.state === 'active')
    .map((wf) => {
      const wfName = typeof wf.name === 'string' ? wf.name : 'Workflow';
      const wfPath = typeof wf.path === 'string' ? wf.path : '';
      const safeHtml =
        typeof wf.html_url === 'string' && /^https:\/\/github\.com\//i.test(wf.html_url)
          ? wf.html_url
          : undefined;
      return {
        id: String(wf.id),
        name: wfName,
        path: wfPath,
        state: String(wf.state),
        htmlUrl: safeHtml,
        isUnitTestCandidate: unitTestRegex.test(`${wfName} ${wfPath}`),
      };
    })
    .sort((a, b) => Number(b.isUnitTestCandidate) - Number(a.isUnitTestCandidate));

  return {
    repo,
    tokenConfigured: Boolean(envToken),
    workflows,
  };
}

export async function findLatestWorkflowRun(
  rootDir: string,
  rawRepo?: unknown,
  rawWorkflowId?: unknown,
  rawBranch?: unknown,
  rawSinceIso?: unknown,
  rawToken?: unknown
): Promise<{ repo: string; run: CiWorkflowRun | null }> {
  const overrideRepo = sanitizeGitHubRepo(rawRepo);
  const repo = overrideRepo || getRepoLabel(rootDir);
  const [owner, repoName] = repo.split('/');
  const workflowId = sanitizeWorkflowId(rawWorkflowId);
  const branch = sanitizeBranchRef(rawBranch, getTargetBranch());
  const overrideToken = sanitizeGitHubToken(rawToken);
  const envToken = process.env.GITHUB_TOKEN?.trim() || '';
  const token = overrideToken || envToken;
  const sinceMs =
    typeof rawSinceIso === 'string' && rawSinceIso
      ? new Date(rawSinceIso).getTime()
      : NaN;

  const base = workflowId
    ? `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/workflows/${encodeURIComponent(workflowId)}/runs`
    : `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs`;
  const params = new URLSearchParams({
    branch,
    per_page: '10',
  });

  const res = await fetch(`${base}?${params.toString()}`, {
    method: 'GET',
    headers: buildGitHubHeaders(token),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    return { repo, run: null };
  }
  const data = (await res.json().catch(() => ({}))) as { workflow_runs?: Record<string, any>[] };
  const rawRuns = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  if (rawRuns.length === 0) {
    return { repo, run: null };
  }

  if (!Number.isNaN(sinceMs)) {
    const matched = rawRuns.find((r) => {
      const createdMs = r.created_at ? new Date(r.created_at).getTime() : 0;
      return createdMs >= sinceMs - 15_000;
    });
    return { repo, run: matched ? mapGitHubApiRun(repo, matched) : null };
  }

  return { repo, run: mapGitHubApiRun(repo, rawRuns[0]) };
}

export async function dispatchGitHubUnitTests(
  rootDir: string,
  options: {
    rawRepo?: unknown;
    rawBranch?: unknown;
    rawWorkflowId?: unknown;
    rawToken?: unknown;
  }
): Promise<{
  ok: boolean;
  repo: string;
  branch: string;
  workflowId: string;
  workflowName: string;
  dispatchedAt: string;
  run: CiWorkflowRun | null;
}> {
  const overrideRepo = sanitizeGitHubRepo(options.rawRepo);
  const repo = overrideRepo || getRepoLabel(rootDir);
  const [owner, repoName] = repo.split('/');
  const branch = sanitizeBranchRef(options.rawBranch, getTargetBranch());
  const requestedWorkflowId = sanitizeWorkflowId(options.rawWorkflowId);
  const overrideToken = sanitizeGitHubToken(options.rawToken);
  const envToken = process.env.GITHUB_TOKEN?.trim() || '';
  const token = overrideToken || envToken;

  if (!token) {
    throw new Error(
      'Для принудительного запуска тестов в GitHub Actions введите ключ доступа (PAT) с правами actions:write / repo.'
    );
  }

  const wfCatalog = await listGitHubWorkflows(rootDir, repo, token);
  if (wfCatalog.workflows.length === 0) {
    throw new Error(
      `В репозитории ${repo} не найдено активных workflows (.github/workflows/*.yml). Добавьте workflow для модульных тестов и повторите попытку.`
    );
  }

  const chosenWorkflow =
    (requestedWorkflowId
      ? wfCatalog.workflows.find(
          (w) => w.id === requestedWorkflowId || w.path.endsWith(`/${requestedWorkflowId}`)
        )
      : undefined) ||
    wfCatalog.workflows.find((w) => w.isUnitTestCandidate) ||
    wfCatalog.workflows[0];

  const dispatchedAt = new Date().toISOString();
  const dispatchUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/workflows/${encodeURIComponent(chosenWorkflow.id)}/dispatches`;

  const dispatchRes = await fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      ...buildGitHubHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: branch }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!dispatchRes.ok) {
    const errPayload = (await dispatchRes.json().catch(() => ({}))) as { message?: string };
    const apiMsg = scrubCredential(errPayload?.message || `HTTP ${dispatchRes.status}`, token);
    if (dispatchRes.status === 422 && /workflow_dispatch/i.test(apiMsg)) {
      const err = new Error(
        `Workflow «${chosenWorkflow.name}» не содержит триггер workflow_dispatch в ветке ${branch}. Добавьте on: workflow_dispatch или перезапустите последний прогон.`
      ) as Error & { code?: string; latestRun?: CiWorkflowRun | null };
      err.code = 'NO_WORKFLOW_DISPATCH';
      const latest = await findLatestWorkflowRun(rootDir, repo, chosenWorkflow.id, branch, undefined, token).catch(
        () => ({ repo, run: null })
      );
      err.latestRun = latest.run;
      throw err;
    }
    if (dispatchRes.status === 401 || dispatchRes.status === 403) {
      throw new Error(
        `GitHub отклонил запуск тестов (${apiMsg}). Проверьте права токена (нужны Actions: Read and Write / workflow).`
      );
    }
    throw new Error(`Ошибка запуска тестов GitHub Actions (${dispatchRes.status}): ${apiMsg}`);
  }

  // Wait briefly so GitHub registers the queued run for immediate status polling
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const lookup = await findLatestWorkflowRun(
    rootDir,
    repo,
    chosenWorkflow.id,
    branch,
    dispatchedAt,
    token
  ).catch(() => ({ repo, run: null }));

  return {
    ok: true,
    repo,
    branch,
    workflowId: chosenWorkflow.id,
    workflowName: chosenWorkflow.name,
    dispatchedAt,
    run: lookup.run,
  };
}

export async function getGitHubWorkflowRunStatus(
  rootDir: string,
  rawRunId: unknown,
  rawRepo?: unknown,
  rawToken?: unknown
): Promise<GitHubRunStatusSnapshot> {
  const overrideRepo = sanitizeGitHubRepo(rawRepo);
  const repo = overrideRepo || getRepoLabel(rootDir);
  const [owner, repoName] = repo.split('/');
  const runId = sanitizeRunId(rawRunId);
  const overrideToken = sanitizeGitHubToken(rawToken);
  const envToken = process.env.GITHUB_TOKEN?.trim() || '';
  const token = overrideToken || envToken;

  const headers = buildGitHubHeaders(token);
  const runUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs/${encodeURIComponent(runId)}`;

  const runRes = await fetch(runUrl, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const runPayload = (await runRes.json().catch(() => ({}))) as Record<string, any>;
  if (!runRes.ok) {
    const apiMsg = scrubCredential(runPayload?.message || `HTTP ${runRes.status}`, token);
    throw new Error(`Не удалось получить статус запуска #${runId} (${runRes.status}): ${apiMsg}`);
  }

  const run = mapGitHubApiRun(repo, runPayload);
  const jobsInfo = await getGitHubWorkflowRunLogs(rootDir, runId, repo, token).catch(() => ({
    repo,
    runId,
    jobs: [] as GitHubJobLogSummary[],
    condensedSummary: 'Задания выполняются...',
  }));

  return {
    repo,
    run,
    jobs: jobsInfo.jobs,
    condensedSummary: jobsInfo.condensedSummary,
  };
}

