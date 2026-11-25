import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { PoolClient } from 'pg';
import type { CommunityProject, CubeSatTask, OnboardProgram, SocialPost, UserProfile } from '../../src/types/cubesat.ts';
import { getPool, isPgConfigured, describeTarget } from './pool.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

interface StoredUser extends UserProfile {
  passwordHash: string;
}

/**
 * Mirrors `PersistedState` in server.ts. Declared structurally here so the
 * persistence layer owns the shape it writes and a field added in server.ts
 * cannot silently fail to reach the database.
 */
export interface PersistedMissionState {
  tasks: CubeSatTask[];
  messages: ChatMessageLike[];
  programs: OnboardProgram[];
  users: StoredUser[];
  projects: CommunityProject[];
  posts: SocialPost[];
  nextTaskSeq: number;
}

interface ChatMessageLike {
  id: string;
  projectId: string;
  channel: string;
  author: string;
  authorRole: string;
  text: string;
  kind?: 'user' | 'system';
  command?: string;
  taskRefId?: string;
  programRefId?: string;
  codeSnippet?: { lang: 'python' | 'cpp'; code: string };
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Schema bootstrap
// ---------------------------------------------------------------------------

export async function applySchema(): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      `insert into schema_migrations (id, details)
       values ($1, $2::jsonb)
       on conflict (id) do nothing`,
      ['001-mission-schema', JSON.stringify({ source: 'server/db/schema.sql' })]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** True when the database has no mission rows yet, i.e. it needs a seed import. */
async function isEmptyDatabase(client: PoolClient): Promise<boolean> {
  const res = await client.query<{ count: string }>('select count(*)::text as count from projects');
  return Number(res.rows[0]?.count ?? '0') === 0;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : new Date().toISOString();
}

function asDateOnly(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Reads the full mission state out of PostgreSQL.
 *
 * Returns `null` when the database is not configured or has no rows yet, which
 * lets the caller fall back to the JSON store — that is the path a fresh clone
 * or a machine without Docker takes, and it must keep working.
 */
export async function loadStateFromPg(): Promise<PersistedMissionState | null> {
  const pool = getPool();
  if (!pool) return null;

  const client = await pool.connect();
  try {
    if (await isEmptyDatabase(client)) return null;

    const [users, projects, tasks, messages, programs, posts] = await Promise.all([
      client.query('select * from users order by created_at'),
      client.query('select * from projects order by created_at'),
      client.query('select * from tasks order by created_at'),
      client.query('select * from messages order by created_at'),
      client.query('select * from programs order by updated_at'),
      client.query('select * from posts order by created_at desc'),
    ]);

    const mappedUsers: StoredUser[] = users.rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      role: r.role,
      subsystem: r.subsystem,
      bio: r.bio,
      skills: r.skills ?? [],
      followers: r.followers ?? [],
      following: r.following ?? [],
      joinedProjectIds: r.joined_project_ids ?? [],
      createdAt: asIso(r.created_at),
      passwordHash: r.password_hash,
    }));

    const mappedProjects: CommunityProject[] = projects.rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      category: r.category,
      tags: r.tags ?? [],
      ownerId: r.owner_id,
      memberIds: r.member_ids ?? [],
      forgejoRepo: r.forgejo_repo,
      ...(r.github_repo ? { githubRepo: r.github_repo } : {}),
      ...(r.lifecycle_stage ? { lifecycleStage: r.lifecycle_stage } : {}),
      s3Bucket: r.s3_bucket,
      createdAt: asIso(r.created_at),
    }));

    const mappedTasks: CubeSatTask[] = tasks.rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      description: r.description,
      subsystem: r.subsystem,
      status: r.status,
      priority: r.priority,
      assignee: r.assignee,
      ...(r.linked_program_id ? { linkedProgramId: r.linked_program_id } : {}),
      ...(r.linked_channel ? { linkedChannel: r.linked_channel } : {}),
      ...(asDateOnly(r.start_date) ? { startDate: asDateOnly(r.start_date) } : {}),
      ...(asDateOnly(r.due_date) ? { dueDate: asDateOnly(r.due_date) } : {}),
      progressPct: r.progress_pct,
      ...(Array.isArray(r.depends_on) && r.depends_on.length ? { dependsOn: r.depends_on } : {}),
      checklist: r.checklist ?? [],
      createdAt: asIso(r.created_at),
      updatedAt: asIso(r.updated_at),
    }));

    const mappedMessages: ChatMessageLike[] = messages.rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      channel: r.channel,
      author: r.author,
      authorRole: r.author_role,
      text: r.text,
      ...(r.kind ? { kind: r.kind } : {}),
      ...(r.command ? { command: r.command } : {}),
      ...(r.task_ref_id ? { taskRefId: r.task_ref_id } : {}),
      ...(r.program_ref_id ? { programRefId: r.program_ref_id } : {}),
      ...(r.code_snippet ? { codeSnippet: r.code_snippet } : {}),
      createdAt: asIso(r.created_at),
    }));

    const mappedPrograms: OnboardProgram[] = programs.rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      subsystem: r.subsystem,
      targetBoard: r.target_board,
      author: r.author,
      description: r.description,
      workspaceJson: r.workspace_json ?? {},
      pythonCode: r.python_code,
      cppCode: r.cpp_code,
      versions: r.versions ?? [],
      updatedAt: asIso(r.updated_at),
    }));

    const mappedPosts: SocialPost[] = posts.rows.map((r) => ({
      id: r.id,
      ...(r.project_id ? { projectId: r.project_id } : {}),
      authorId: r.author_id,
      authorName: r.author_name,
      authorHandle: r.author_handle,
      authorRole: r.author_role,
      text: r.text,
      mediaUrls: r.media_urls ?? [],
      likes: r.likes ?? [],
      comments: r.comments ?? [],
      createdAt: asIso(r.created_at),
    }));

    const nextTaskSeq = deriveNextTaskSeq(mappedTasks);

    return {
      users: mappedUsers,
      projects: mappedProjects,
      tasks: mappedTasks,
      messages: mappedMessages,
      programs: mappedPrograms,
      posts: mappedPosts,
      nextTaskSeq,
    };
  } finally {
    client.release();
  }
}

/** Keeps the `SAT-<n>` counter ahead of whatever ids the database holds. */
function deriveNextTaskSeq(tasks: CubeSatTask[]): number {
  let max = 0;
  for (const task of tasks) {
    const match = /^SAT-(\d+)$/.exec(task.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return Math.max(max + 1, 1);
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

/**
 * Writes the whole mission state, replacing what is stored.
 *
 * A full snapshot is deliberate: the in-memory state is the single writer, the
 * row counts are small (hundreds), and diffing per-entity would add a class of
 * bugs (stale deletes) for no measurable gain at this scale.
 */
export async function persistStateToPg(state: PersistedMissionState): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Dependents first, so the delete pass never trips a foreign key.
    const taskIds = state.tasks.map((t) => t.id);
    const messageIds = state.messages.map((m) => m.id);
    const programIds = state.programs.map((p) => p.id);
    const projectIds = state.projects.map((p) => p.id);
    const userIds = state.users.map((u) => u.id);
    const postIds = state.posts.map((p) => p.id);

    await client.query('delete from tasks where not (id = any($1::text[]))', [taskIds]);
    await client.query('delete from messages where not (id = any($1::text[]))', [messageIds]);
    await client.query('delete from programs where not (id = any($1::text[]))', [programIds]);
    await client.query('delete from posts where not (id = any($1::text[]))', [postIds]);
    await client.query('delete from projects where not (id = any($1::text[]))', [projectIds]);
    await client.query('delete from users where not (id = any($1::text[]))', [userIds]);

    for (const user of state.users) {
      await client.query(
        `insert into users (id, username, display_name, role, subsystem, bio, skills, followers,
                            following, joined_project_ids, password_hash, created_at)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12)
         on conflict (id) do update set
           username = excluded.username,
           display_name = excluded.display_name,
           role = excluded.role,
           subsystem = excluded.subsystem,
           bio = excluded.bio,
           skills = excluded.skills,
           followers = excluded.followers,
           following = excluded.following,
           joined_project_ids = excluded.joined_project_ids,
           password_hash = excluded.password_hash,
           created_at = excluded.created_at`,
        [
          user.id,
          user.username,
          user.displayName,
          user.role,
          user.subsystem,
          user.bio,
          JSON.stringify(user.skills ?? []),
          JSON.stringify(user.followers ?? []),
          JSON.stringify(user.following ?? []),
          JSON.stringify(user.joinedProjectIds ?? []),
          user.passwordHash,
          user.createdAt,
        ]
      );
    }

    for (const project of state.projects) {
      await client.query(
        `insert into projects (id, slug, name, description, category, tags, owner_id, member_ids,
                               forgejo_repo, github_repo, lifecycle_stage, s3_bucket, created_at)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$12,$13)
         on conflict (id) do update set
           slug = excluded.slug,
           name = excluded.name,
           description = excluded.description,
           category = excluded.category,
           tags = excluded.tags,
           owner_id = excluded.owner_id,
           member_ids = excluded.member_ids,
           forgejo_repo = excluded.forgejo_repo,
           github_repo = excluded.github_repo,
           lifecycle_stage = excluded.lifecycle_stage,
           s3_bucket = excluded.s3_bucket`,
        [
          project.id,
          project.slug,
          project.name,
          project.description,
          project.category,
          JSON.stringify(project.tags ?? []),
          project.ownerId,
          JSON.stringify(project.memberIds ?? []),
          project.forgejoRepo,
          project.githubRepo ?? null,
          project.lifecycleStage ?? null,
          project.s3Bucket,
          project.createdAt,
        ]
      );
    }

    for (const task of state.tasks) {
      await client.query(
        `insert into tasks (id, project_id, title, description, subsystem, status, priority, assignee,
                            linked_program_id, linked_channel, start_date, due_date, progress_pct,
                            depends_on, checklist, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17)
         on conflict (id) do update set
           project_id = excluded.project_id,
           title = excluded.title,
           description = excluded.description,
           subsystem = excluded.subsystem,
           status = excluded.status,
           priority = excluded.priority,
           assignee = excluded.assignee,
           linked_program_id = excluded.linked_program_id,
           linked_channel = excluded.linked_channel,
           start_date = excluded.start_date,
           due_date = excluded.due_date,
           progress_pct = excluded.progress_pct,
           depends_on = excluded.depends_on,
           checklist = excluded.checklist,
           updated_at = excluded.updated_at`,
        [
          task.id,
          task.projectId,
          task.title,
          task.description,
          task.subsystem,
          task.status,
          task.priority,
          task.assignee,
          task.linkedProgramId ?? null,
          task.linkedChannel ?? null,
          task.startDate ?? null,
          task.dueDate ?? null,
          task.progressPct ?? 0,
          JSON.stringify(task.dependsOn ?? []),
          JSON.stringify(task.checklist ?? []),
          task.createdAt,
          task.updatedAt,
        ]
      );
    }

    for (const message of state.messages) {
      await client.query(
        `insert into messages (id, project_id, channel, author, author_role, text, kind, command,
                               task_ref_id, program_ref_id, code_snippet, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
         on conflict (id) do update set
           project_id = excluded.project_id,
           channel = excluded.channel,
           author = excluded.author,
           author_role = excluded.author_role,
           text = excluded.text,
           kind = excluded.kind,
           command = excluded.command,
           task_ref_id = excluded.task_ref_id,
           program_ref_id = excluded.program_ref_id,
           code_snippet = excluded.code_snippet`,
        [
          message.id,
          message.projectId,
          message.channel,
          message.author,
          message.authorRole,
          message.text,
          message.kind ?? null,
          message.command ?? null,
          message.taskRefId ?? null,
          message.programRefId ?? null,
          message.codeSnippet ? JSON.stringify(message.codeSnippet) : null,
          message.createdAt,
        ]
      );
    }

    for (const program of state.programs) {
      await client.query(
        `insert into programs (id, project_id, name, subsystem, target_board, author, description,
                               workspace_json, python_code, cpp_code, versions, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12)
         on conflict (id) do update set
           project_id = excluded.project_id,
           name = excluded.name,
           subsystem = excluded.subsystem,
           target_board = excluded.target_board,
           author = excluded.author,
           description = excluded.description,
           workspace_json = excluded.workspace_json,
           python_code = excluded.python_code,
           cpp_code = excluded.cpp_code,
           versions = excluded.versions,
           updated_at = excluded.updated_at`,
        [
          program.id,
          program.projectId ?? state.projects[0]?.id ?? 'school76-1u',
          program.name,
          program.subsystem,
          program.targetBoard,
          program.author,
          program.description,
          JSON.stringify(program.workspaceJson ?? {}),
          program.pythonCode,
          program.cppCode,
          JSON.stringify(program.versions ?? []),
          program.updatedAt,
        ]
      );
    }

    for (const post of state.posts) {
      await client.query(
        `insert into posts (id, project_id, author_id, author_name, author_handle, author_role, text,
                            media_urls, likes, comments, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11)
         on conflict (id) do update set
           project_id = excluded.project_id,
           author_name = excluded.author_name,
           author_handle = excluded.author_handle,
           author_role = excluded.author_role,
           text = excluded.text,
           media_urls = excluded.media_urls,
           likes = excluded.likes,
           comments = excluded.comments`,
        [
          post.id,
          post.projectId ?? null,
          post.authorId,
          post.authorName,
          post.authorHandle,
          post.authorRole,
          post.text,
          JSON.stringify(post.mediaUrls ?? []),
          JSON.stringify(post.likes ?? []),
          JSON.stringify(post.comments ?? []),
          post.createdAt,
        ]
      );
    }

    await client.query(
      `insert into schema_migrations (id, details)
       values ($1, $2::jsonb)
       on conflict (id) do update set applied_at = now(), details = excluded.details`,
      [
        'mission-state-sync',
        JSON.stringify({
          tasks: state.tasks.length,
          messages: state.messages.length,
          programs: state.programs.length,
          users: state.users.length,
          projects: state.projects.length,
          posts: state.posts.length,
        }),
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Write-behind queue
// ---------------------------------------------------------------------------

let pendingState: PersistedMissionState | null = null;
let flushLoopRunning = false;
let lastFlushError: string | null = null;
let lastFlushedAt: string | null = null;

/**
 * Schedules a database write without blocking the caller.
 *
 * `saveState()` is called from synchronous request handlers and WebSocket
 * callbacks, so it cannot await. Coalescing consecutive saves is safe because
 * every write is a complete snapshot: the newest one supersedes the rest.
 */
export function scheduleStateSync(state: PersistedMissionState): void {
  if (!isPgConfigured()) return;
  pendingState = state;
  if (flushLoopRunning) return;

  flushLoopRunning = true;
  void (async () => {
    try {
      while (pendingState) {
        const snapshot = pendingState;
        pendingState = null;
        try {
          await persistStateToPg(snapshot);
          lastFlushedAt = new Date().toISOString();
          lastFlushError = null;
        } catch (err) {
          lastFlushError = err instanceof Error ? err.message : String(err);
          console.error('[PostgreSQL] Snapshot sync failed:', lastFlushError);
        }
      }
    } finally {
      flushLoopRunning = false;
    }
  })();
}

/** Waits for any queued snapshot to be written; used on shutdown and by health checks. */
export async function flushStateSync(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while ((flushLoopRunning || pendingState) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export function getPgStateStatus() {
  return {
    configured: isPgConfigured(),
    target: describeTarget(),
    lastFlushedAt,
    lastFlushError,
    pending: pendingState !== null || flushLoopRunning,
  };
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

/**
 * Chooses the mission-state source for this process.
 *
 * With PostgreSQL configured and reachable, the database wins. On a brand-new
 * database the JSON/seed state is imported once so the portal opens with real
 * content instead of empty lists. Without PostgreSQL the JSON store is used
 * exactly as before, which is why a plain `pnpm dev` needs no Docker.
 */
export async function initializeMissionState(
  loadJsonState: () => PersistedMissionState
): Promise<{ state: PersistedMissionState; source: 'postgres' | 'json'; note: string }> {
  if (!isPgConfigured()) {
    return {
      state: loadJsonState(),
      source: 'json',
      note: 'POSTGRES_HOST/USER/DB не заданы — используется JSON-хранилище',
    };
  }

  try {
    await applySchema();
    const fromDb = await loadStateFromPg();
    if (fromDb) {
      return { state: fromDb, source: 'postgres', note: `Загружено из ${describeTarget()}` };
    }

    // Empty database: seed it from the JSON store so the first run is not blank.
    const seed = loadJsonState();
    await persistStateToPg(seed);
    return {
      state: seed,
      source: 'postgres',
      note: `Пустая БД ${describeTarget()} инициализирована из JSON-состояния`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[PostgreSQL] Falling back to JSON store:', message);
    return {
      state: loadJsonState(),
      source: 'json',
      note: `PostgreSQL недоступен (${message}) — используется JSON-хранилище`,
    };
  }
}
