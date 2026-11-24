import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { CiRunConclusion, CiRunStatus, CiWorkflowRun } from '../src/types/cubesat.ts';

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
