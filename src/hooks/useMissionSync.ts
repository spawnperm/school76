import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  CubeSatTask,
  MissionSnapshot,
  OnboardProgram,
  Subsystem,
  TeamPresence,
  WsClientEvent,
  WsServerEvent,
} from '../types/cubesat.ts';
import { PRESET_PROGRAMS } from '../mblock/presets.ts';

export interface EngineerProfile {
  name: string;
  role: string;
  subsystem: Subsystem;
}

const PROFILE_KEY = 'school76_engineer_profile_v1';

function loadProfile(): EngineerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EngineerProfile;
      if (parsed.name && parsed.role && parsed.subsystem) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return {
    name: 'Артём Соколов',
    role: 'Системный инженер',
    subsystem: 'OBC',
  };
}

export function useMissionSync(activeTab: string) {
  const [profile, setProfileState] = useState<EngineerProfile>(loadProfile);
  const [tasks, setTasks] = useState<CubeSatTask[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [programs, setPrograms] = useState<OnboardProgram[]>(PRESET_PROGRAMS);
  const [presence, setPresence] = useState<TeamPresence[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const profileRef = useRef(profile);
  const activeTabRef = useRef(activeTab);

  profileRef.current = profile;
  activeTabRef.current = activeTab;

  const sendEvent = useCallback((event: WsClientEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }, []);

  const updateProfile = useCallback(
    (next: EngineerProfile) => {
      setProfileState(next);
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      sendEvent({
        type: 'presence:join',
        payload: { ...next, activeTab: activeTabRef.current },
      });
    },
    [sendEvent]
  );

  // Notify server when engineer switches workspace tabs
  useEffect(() => {
    sendEvent({
      type: 'presence:join',
      payload: { ...profileRef.current, activeTab },
    });
  }, [activeTab, sendEvent]);

  useEffect(() => {
    let unmounted = false;

    // Initial REST fetch so UI renders immediately even before WS handshake completes
    fetch('/api/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MissionSnapshot | null) => {
        if (!unmounted && data) {
          setTasks(data.tasks);
          setMessages(data.messages);
          if (data.programs.length > 0) setPrograms(data.programs);
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
              setPresence(msg.payload.presence);
              setLoading(false);
              break;
            case 'presence:update':
              setPresence(msg.payload);
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

  const createTask = useCallback(
    (payload: Omit<CubeSatTask, 'id' | 'createdAt' | 'updatedAt'>) => {
      sendEvent({ type: 'task:create', payload });
    },
    [sendEvent]
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Omit<CubeSatTask, 'id' | 'createdAt'>>) => {
      // Optimistic local update
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
    profile,
    updateProfile,
    tasks,
    messages,
    programs,
    presence,
    connected,
    loading,
    createTask,
    updateTask,
    deleteTask,
    sendMessage,
    saveProgram,
    updateVersionNote,
    deleteProgram,
  };
}
