import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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

export function commitAndPushToGitHub(
  rootDir: string,
  rawMessage: unknown,
  rawAuthorName: unknown,
  authorEmail: string
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
  const token = process.env.GITHUB_TOKEN?.trim();

  try {
    if (token) {
      const authB64 = Buffer.from(`x-access-token:${token}`, 'utf-8').toString('base64');
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
    const scrubbedErr = token ? rawErr.split(token).join('[REDACTED]') : rawErr;
    if (/could not read Username|Authentication failed|Permission|403|401/i.test(scrubbedErr)) {
      throw new Error(
        filesCommitted > 0
          ? `Локальный коммит ${commitSha} создан, но для отправки на GitHub задайте GITHUB_TOKEN в Secrets сервера.`
          : 'Для отправки на GitHub задайте переменную GITHUB_TOKEN в Secrets сервера.'
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
