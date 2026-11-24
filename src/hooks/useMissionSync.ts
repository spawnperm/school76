import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatMessage,
  CommunityProject,
  CubeSatTask,
  ForgejoCommit,
  MissionSnapshot,
  OnboardProgram,
  SocialPost,
  Subsystem,
  TeamPresence,
  UserProfile,
  WsClientEvent,
  WsServerEvent,
} from '../types/cubesat.ts';
import { PRESET_PROGRAMS } from '../mblock/presets.ts';

export interface EngineerProfile {
  name: string;
  role: string;
  subsystem: Subsystem;
}

export function useMissionSync(activeTab: string) {
  // Bearer session token held strictly in React memory (never persisted to browser storage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<CommunityProject[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [tasks, setTasks] = useState<CubeSatTask[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [programs, setPrograms] = useState<OnboardProgram[]>(PRESET_PROGRAMS);
  const [presence, setPresence] = useState<TeamPresence[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const currentUser = useMemo(
    () => (currentUserId ? users.find((u) => u.id === currentUserId) || null : null),
    [users, currentUserId]
  );

  const profile: EngineerProfile = useMemo(
    () =>
      currentUser
        ? {
            name: currentUser.displayName,
            role: currentUser.role,
            subsystem: currentUser.subsystem,
          }
        : {
            name: 'Гость-инженер',
            role: 'Наблюдатель',
            subsystem: 'OBC',
          },
    [currentUser]
  );

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const sendEvent = useCallback((event: WsClientEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }, []);

  useEffect(() => {
    sendEvent({
      type: 'presence:join',
      payload: { ...profileRef.current, activeTab },
    });
  }, [activeTab, currentUser?.displayName, currentUser?.role, currentUser?.subsystem, sendEvent]);

  useEffect(() => {
    let unmounted = false;

    fetch('/api/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MissionSnapshot | null) => {
        if (!unmounted && data) {
          setTasks(data.tasks);
          setMessages(data.messages);
          if (data.programs.length > 0) setPrograms(data.programs);
          if (Array.isArray(data.users)) setUsers(data.users);
          if (Array.isArray(data.projects)) setProjects(data.projects);
          if (Array.isArray(data.posts)) setPosts(data.posts);
          setPresence(data.presence);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!unmounted) setLoading(false);
      });

    function connect() {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) {
          ws.close();
          return;
        }
        setConnected(true);
        ws.send(
          JSON.stringify({
            type: 'presence:join',
            payload: { ...profileRef.current, activeTab: activeTabRef.current },
          } satisfies WsClientEvent)
        );
      };

      ws.onmessage = (ev) => {
        if (unmounted) return;
        try {
          const msg = JSON.parse(ev.data) as WsServerEvent;
          switch (msg.type) {
            case 'init:state':
              setTasks(msg.payload.tasks);
              setMessages(msg.payload.messages);
              if (msg.payload.programs.length > 0) setPrograms(msg.payload.programs);
              setUsers(msg.payload.users || []);
              setProjects(msg.payload.projects || []);
              setPosts(msg.payload.posts || []);
              setPresence(msg.payload.presence);
              setLoading(false);
              break;
            case 'presence:update':
              setPresence(msg.payload);
              break;
            case 'social:sync':
              setUsers(msg.payload.users);
              setProjects(msg.payload.projects);
              setPosts(msg.payload.posts);
              break;
            case 'task:created':
              setTasks((prev) =>
                prev.some((t) => t.id === msg.payload.id) ? prev : [msg.payload, ...prev]
              );
              break;
            case 'task:updated':
              setTasks((prev) =>
                prev.map((t) => (t.id === msg.payload.id ? msg.payload : t))
              );
              break;
            case 'task:deleted':
              setTasks((prev) => prev.filter((t) => t.id !== msg.payload.id));
              break;
            case 'chat:message':
              setMessages((prev) =>
                prev.some((m) => m.id === msg.payload.id) ? prev : [...prev, msg.payload]
              );
              break;
            case 'program:saved':
              setPrograms((prev) => {
                const exists = prev.some((p) => p.id === msg.payload.id);
                if (exists) {
                  return prev.map((p) => (p.id === msg.payload.id ? msg.payload : p));
                }
                return [msg.payload, ...prev];
              });
              break;
            case 'program:deleted':
              setPrograms((prev) => prev.filter((p) => p.id !== msg.payload.id));
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setConnected(false);
        reconnectTimerRef.current = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers || {});
      if (authToken) {
        headers.set('Authorization', `Bearer ${authToken}`);
      }
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const res = await fetch(url, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Ошибка запроса');
      }
      return data;
    },
    [authToken]
  );

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Ошибка входа');
    }
    setAuthToken(data.token);
    setCurrentUserId(data.user.id);
    setUsers((prev) =>
      prev.some((u) => u.id === data.user.id)
        ? prev.map((u) => (u.id === data.user.id ? data.user : u))
        : [...prev, data.user]
    );
    return data.user as UserProfile;
  }, []);

  const register = useCallback(
    async (payload: {
      username: string;
      displayName: string;
      password: string;
      role: string;
      subsystem: Subsystem;
      bio?: string;
    }) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Ошибка регистрации');
      }
      setAuthToken(data.token);
      setCurrentUserId(data.user.id);
      setUsers((prev) => [...prev, data.user]);
      return data.user as UserProfile;
    },
    []
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setCurrentUserId(null);
  }, []);

  const updateMyProfile = useCallback(
    async (patch: Partial<Pick<UserProfile, 'displayName' | 'role' | 'subsystem' | 'bio' | 'skills'>>) => {
      const data = await authFetch('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return data.user as UserProfile;
    },
    [authFetch]
  );

  const toggleFollow = useCallback(
    async (userId: string) => {
      await authFetch(`/api/users/${encodeURIComponent(userId)}/follow`, { method: 'POST' });
    },
    [authFetch]
  );

  const createProject = useCallback(
    async (payload: {
      name: string;
      slug: string;
      description: string;
      category: string;
      tags: string[];
      githubRepo?: string;
    }) => {
      const data = await authFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return data.project as CommunityProject;
    },
    [authFetch]
  );

  const toggleJoinProject = useCallback(
    async (projectId: string) => {
      await authFetch(`/api/projects/${encodeURIComponent(projectId)}/join`, { method: 'POST' });
    },
    [authFetch]
  );

  const generateProjectDescription = useCallback(
    async (projectId: string) => {
      const data = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/generate-description`,
        { method: 'POST' }
      );
      if (data.project) {
        setProjects((prev) =>
          prev.map((p) => (p.id === data.project.id ? data.project : p))
        );
      }
      return data.description as string;
    },
    [authFetch]
  );

  const generateProjectReadme = useCallback(
    async (projectId: string) => {
      const data = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/generate-readme`,
        { method: 'POST' }
      );
      return data as {
        readme: string;
        filename: string;
        repo: string;
        generatedAt: string;
      };
    },
    [authFetch]
  );

  const uploadProjectReadme = useCallback(
    async (projectId: string, content: string, commitMessage?: string) => {
      const data = await authFetch(
        `/api/projects/${encodeURIComponent(projectId)}/readme`,
        {
          method: 'POST',
          body: JSON.stringify({ content, commitMessage }),
        }
      );
      return data as {
        ok: boolean;
        path: string;
        repo: string;
        commit: ForgejoCommit;
      };
    },
    [authFetch]
  );

  const createPost = useCallback(
    async (payload: { text: string; projectId?: string; mediaUrls?: string[] }) => {
      const data = await authFetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return data.post as SocialPost;
    },
    [authFetch]
  );

  const toggleLikePost = useCallback(
    async (postId: string) => {
      await authFetch(`/api/posts/${encodeURIComponent(postId)}/like`, { method: 'POST' });
    },
    [authFetch]
  );

  const commentPost = useCallback(
    async (postId: string, text: string) => {
      await authFetch(`/api/posts/${encodeURIComponent(postId)}/comment`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
    },
    [authFetch]
  );

  const createTask = useCallback(
    (payload: Omit<CubeSatTask, 'id' | 'createdAt' | 'updatedAt'>) => {
      sendEvent({ type: 'task:create', payload });
    },
    [sendEvent]
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Omit<CubeSatTask, 'id' | 'createdAt'>>) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t))
      );
      sendEvent({ type: 'task:update', payload: { id, patch } });
    },
    [sendEvent]
  );

  const deleteTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      sendEvent({ type: 'task:delete', payload: { id } });
    },
    [sendEvent]
  );

  const sendMessage = useCallback(
    (payload: Omit<ChatMessage, 'id' | 'createdAt'>) => {
      const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      sendEvent({ type: 'chat:send', payload: { ...payload, id } });
    },
    [sendEvent]
  );

  const saveProgram = useCallback(
    (payload: Omit<OnboardProgram, 'updatedAt' | 'versions'> & { saveNote?: string }) => {
      sendEvent({ type: 'program:save', payload });
    },
    [sendEvent]
  );

  const updateVersionNote = useCallback(
    (programId: string, versionId: string, note: string) => {
      setPrograms((prev) =>
        prev.map((p) => {
          if (p.id !== programId || !p.versions) return p;
          return {
            ...p,
            versions: p.versions.map((v) => (v.id === versionId ? { ...v, note } : v)),
          };
        })
      );
      sendEvent({
        type: 'program:update_version_note',
        payload: { programId, versionId, note },
      });
    },
    [sendEvent]
  );

  const deleteProgram = useCallback(
    (id: string) => {
      sendEvent({ type: 'program:delete', payload: { id } });
    },
    [sendEvent]
  );

  return {
    authToken,
    authFetch,
    currentUser,
    profile,
    users,
    projects,
    posts,
    tasks,
    messages,
    programs,
    presence,
    connected,
    loading,
    login,
    register,
    logout,
    updateMyProfile,
    toggleFollow,
    createProject,
    toggleJoinProject,
    generateProjectDescription,
    generateProjectReadme,
    uploadProjectReadme,
    createPost,
    toggleLikePost,
    commentPost,
    createTask,
    updateTask,
    deleteTask,
    sendMessage,
    saveProgram,
    updateVersionNote,
    deleteProgram,
  };
}
