import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clientHarnessRegistry,
  type FrontendNavSlot,
} from '../harness/frontendRegistry.ts';
import type {
  HarnessAgentRunResult,
  HarnessRuntimeSnapshot,
  HarnessToolExecutionResult,
  MarketplaceSnapshot,
} from '../harness/types.ts';

export function useHarnessRuntime() {
  const [snapshot, setSnapshot] = useState<HarnessRuntimeSnapshot | null>(null);
  const [marketplace, setMarketplace] = useState<MarketplaceSnapshot | null>(null);
  const [agentHistory, setAgentHistory] = useState<HarnessAgentRunResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const navSlots: FrontendNavSlot[] = useMemo(
    () => clientHarnessRegistry.syncWithServerSnapshot(snapshot),
    [snapshot]
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [harnessRes, marketRes] = await Promise.all([
        fetch('/api/harness/state'),
        fetch('/api/marketplace'),
      ]);
      const harnessData = await harnessRes.json().catch(() => ({}));
      if (!harnessRes.ok) {
        throw new Error(harnessData.error || 'Не удалось загрузить состояние DeepSeek-Harness');
      }
      if (harnessData.snapshot) {
        setSnapshot(harnessData.snapshot as HarnessRuntimeSnapshot);
      }
      if (Array.isArray(harnessData.agentHistory)) {
        setAgentHistory(harnessData.agentHistory as HarnessAgentRunResult[]);
      }
      if (marketRes.ok) {
        const marketData = await marketRes.json().catch(() => ({}));
        if (marketData.marketplace) {
          setMarketplace(marketData.marketplace as MarketplaceSnapshot);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка подключения к ядру DeepSeek-Harness');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activateProfile = useCallback(async (profileId: string) => {
    setBusyAction(`profile:${profileId}`);
    setError(null);
    try {
      const res = await fetch(`/api/harness/profiles/${encodeURIComponent(profileId)}/activate`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось переключить профиль');
      if (data.snapshot) setSnapshot(data.snapshot);
      if (data.marketplace) setMarketplace(data.marketplace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка переключения профиля');
    } finally {
      setBusyAction(null);
    }
  }, []);

  const togglePlugin = useCallback(async (pluginId: string, enabled?: boolean) => {
    setBusyAction(`plugin:${pluginId}`);
    setError(null);
    try {
      const res = await fetch(`/api/harness/plugins/${encodeURIComponent(pluginId)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enabled !== undefined ? { enabled } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить состояние плагина');
      if (data.snapshot) setSnapshot(data.snapshot);
      if (data.marketplace) setMarketplace(data.marketplace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка переключения плагина');
    } finally {
      setBusyAction(null);
    }
  }, []);

  const switchSeamProvider = useCallback(async (seamId: string, providerId: string) => {
    setBusyAction(`seam:${seamId}`);
    setError(null);
    try {
      const res = await fetch(`/api/harness/seams/${encodeURIComponent(seamId)}/provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось переключить провайдер шва');
      if (data.snapshot) setSnapshot(data.snapshot);
      if (data.marketplace) setMarketplace(data.marketplace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка смены провайдера');
    } finally {
      setBusyAction(null);
    }
  }, []);

  const mutateMarketplace = useCallback(
    async (
      moduleId: string,
      action: 'install' | 'uninstall' | 'activate' | 'deactivate'
    ): Promise<MarketplaceSnapshot | null> => {
      setBusyAction(`market:${action}:${moduleId}`);
      setError(null);
      try {
        const res = await fetch(
          `/api/marketplace/modules/${encodeURIComponent(moduleId)}/${action}`,
          { method: 'POST' }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Ошибка операции Маркетплейса');
        if (data.marketplace) setMarketplace(data.marketplace as MarketplaceSnapshot);
        if (data.snapshot) setSnapshot(data.snapshot as HarnessRuntimeSnapshot);
        return (data.marketplace as MarketplaceSnapshot) || null;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка операции Маркетплейса');
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    []
  );

  const installMarketplaceModule = useCallback(
    (moduleId: string) => mutateMarketplace(moduleId, 'install'),
    [mutateMarketplace]
  );

  const uninstallMarketplaceModule = useCallback(
    (moduleId: string) => mutateMarketplace(moduleId, 'uninstall'),
    [mutateMarketplace]
  );

  const activateMarketplaceModule = useCallback(
    (moduleId: string) => mutateMarketplace(moduleId, 'activate'),
    [mutateMarketplace]
  );

  const deactivateMarketplaceModule = useCallback(
    (moduleId: string) => mutateMarketplace(moduleId, 'deactivate'),
    [mutateMarketplace]
  );

  const executeTool = useCallback(
    async (
      toolName: string,
      args: Record<string, unknown>
    ): Promise<HarnessToolExecutionResult> => {
      setBusyAction(`tool:${toolName}`);
      setError(null);
      try {
        const res = await fetch(`/api/harness/tools/${encodeURIComponent(toolName)}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ args }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Ошибка вызова инструмента');
        if (data.snapshot) setSnapshot(data.snapshot);
        if (data.marketplace) setMarketplace(data.marketplace);
        return data.result as HarnessToolExecutionResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка вызова инструмента';
        setError(msg);
        return { toolName, ok: false, durationMs: 0, output: null, error: msg };
      } finally {
        setBusyAction(null);
      }
    },
    []
  );

  const runAgentGoal = useCallback(
    async (goal: string, projectId?: string): Promise<HarnessAgentRunResult | null> => {
      setBusyAction('agent:run');
      setError(null);
      try {
        const res = await fetch('/api/harness/agent/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal, projectId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Ошибка выполнения агентского цикла');
        if (data.snapshot) setSnapshot(data.snapshot);
        if (data.marketplace) setMarketplace(data.marketplace);
        if (Array.isArray(data.agentHistory)) setAgentHistory(data.agentHistory);
        return (data.run as HarnessAgentRunResult) || null;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка агентского цикла');
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    []
  );

  return {
    snapshot,
    marketplace,
    agentHistory,
    navSlots,
    loading,
    busyAction,
    error,
    refresh,
    activateProfile,
    togglePlugin,
    switchSeamProvider,
    installMarketplaceModule,
    uninstallMarketplaceModule,
    activateMarketplaceModule,
    deactivateMarketplaceModule,
    executeTool,
    runAgentGoal,
  };
}
