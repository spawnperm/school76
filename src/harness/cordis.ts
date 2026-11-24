import type {
  HarnessBundleId,
  HarnessEventEntry,
  HarnessPluginKind,
  HarnessPluginSnapshot,
  HarnessPluginStatus,
  HarnessProfileDescriptor,
  HarnessRuntimeSnapshot,
  HarnessSeamDescriptor,
  HarnessToolSchema,
} from './types.ts';

export type Disposer = () => void;

export interface HarnessPluginMeta {
  id: string;
  name: string;
  description: string;
  bundle: HarnessBundleId;
  kind: HarnessPluginKind;
  locked?: boolean;
  inject?: string[];
  provides?: string[];
  providesSeam?: string;
  consumesSeam?: string;
  uiTab?: HarnessPluginSnapshot['uiTab'];
}

export interface HarnessPluginDefinition<S extends Record<string, unknown> = Record<string, unknown>>
  extends HarnessPluginMeta {
  apply: (ctx: HarnessContext<S>) => void;
}

interface InternalPluginRecord<S extends Record<string, unknown>> {
  def: HarnessPluginDefinition<S>;
  enabled: boolean;
  status: HarnessPluginStatus;
  missingDeps: string[];
  errorMessage?: string;
  disposers: Disposer[];
  providedKeys: string[];
}

interface InternalSeamRecord {
  id: string;
  title: string;
  description: string;
  availableProviderIds: Set<string>;
  activeProviderId: string | null;
  consumerIds: Set<string>;
}

/**
 * Cordis-inspired Context & Reversible Effect Scope.
 * Plugins register services, listeners, routes, and tools on a context;
 * disabling or swapping a plugin cleanly unwinds every effect it created.
 */
export class HarnessContext<S extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    public readonly kernel: HarnessKernel<S>,
    public readonly pluginId: string
  ) {}

  get services(): Partial<S> {
    return this.kernel.services;
  }

  service<K extends keyof S>(key: K): S[K] {
    const val = this.kernel.services[key];
    if (val === undefined) {
      throw new Error(`Harness service "${String(key)}" is not active`);
    }
    return val;
  }

  effect(disposer: Disposer): void {
    this.kernel.registerEffect(this.pluginId, disposer);
  }

  provide<K extends keyof S>(key: K, implementation: S[K]): void {
    this.kernel.provideService(this.pluginId, String(key), implementation);
  }

  on<T = unknown>(event: string, handler: (payload: T) => void): void {
    const off = this.kernel.subscribe(event, handler);
    this.effect(off);
  }

  emit<T = unknown>(event: string, payload: T): void {
    this.kernel.emit(event, payload);
  }

  registerTool(schema: Omit<HarnessToolSchema, 'pluginId'>): void {
    this.kernel.registerTool(this.pluginId, {
      ...schema,
      pluginId: this.pluginId,
    });
  }
}

export class HarnessKernel<S extends Record<string, unknown> = Record<string, unknown>> {
  public readonly services: Partial<S> = {};
  private readonly plugins = new Map<string, InternalPluginRecord<S>>();
  private readonly seams = new Map<string, InternalSeamRecord>();
  private readonly profiles = new Map<string, HarnessProfileDescriptor>();
  private readonly tools = new Map<string, HarnessToolSchema>();
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  private readonly events: HarnessEventEntry[] = [];
  private activeProfileId = 'cubesat-full';

  constructor(_engineLabel = 'DeepSeek-Harness (Cordis)') {
    this.recordEvent('kernel:boot', 'kernel', 'Инициализирован Cordis-контейнер DeepSeek-Harness');
  }

  recordEvent(type: HarnessEventEntry['type'], source: string, message: string): void {
    this.events.unshift({
      id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      source,
      message,
    });
    if (this.events.length > 60) {
      this.events.length = 60;
    }
  }

  defineSeam(id: string, title: string, description: string): this {
    if (!this.seams.has(id)) {
      this.seams.set(id, {
        id,
        title,
        description,
        availableProviderIds: new Set(),
        activeProviderId: null,
        consumerIds: new Set(),
      });
    }
    return this;
  }

  registerProfile(profile: HarnessProfileDescriptor): this {
    this.profiles.set(profile.id, profile);
    return this;
  }

  plugin(def: HarnessPluginDefinition<S>, enabled = true): this {
    const existing = this.plugins.get(def.id);
    if (existing) {
      this.teardownPlugin(def.id);
    }

    const rec: InternalPluginRecord<S> = {
      def,
      enabled,
      status: enabled ? 'waiting_deps' : 'disabled',
      missingDeps: [],
      disposers: [],
      providedKeys: [],
    };
    this.plugins.set(def.id, rec);

    if (def.providesSeam) {
      const seam = this.seams.get(def.providesSeam);
      if (seam) {
        seam.availableProviderIds.add(def.id);
        if (enabled && !seam.activeProviderId) {
          seam.activeProviderId = def.id;
        }
      }
    }

    if (def.consumesSeam) {
      const seam = this.seams.get(def.consumesSeam);
      if (seam) {
        seam.consumerIds.add(def.id);
      }
    }

    this.reconcile();
    return this;
  }

  registerEffect(pluginId: string, disposer: Disposer): void {
    const rec = this.plugins.get(pluginId);
    if (!rec) return;
    rec.disposers.push(disposer);
  }

  provideService(pluginId: string, key: string, impl: unknown): void {
    const rec = this.plugins.get(pluginId);
    if (!rec) return;
    (this.services as Record<string, unknown>)[key] = impl;
    rec.providedKeys.push(key);
    rec.disposers.push(() => {
      if ((this.services as Record<string, unknown>)[key] === impl) {
        delete (this.services as Record<string, unknown>)[key];
      }
    });
  }

  registerTool(pluginId: string, schema: HarnessToolSchema): void {
    this.tools.set(schema.name, schema);
    this.registerEffect(pluginId, () => {
      const current = this.tools.get(schema.name);
      if (current?.pluginId === pluginId) {
        this.tools.delete(schema.name);
      }
    });
  }

  subscribe<T = unknown>(event: string, handler: (payload: T) => void): Disposer {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped = handler as (payload: unknown) => void;
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  emit<T = unknown>(event: string, payload: T): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch {
        // Isolate listener failures
      }
    }
  }

  private teardownPlugin(pluginId: string): void {
    const rec = this.plugins.get(pluginId);
    if (!rec) return;
    const wasActive = rec.status === 'active';
    while (rec.disposers.length > 0) {
      const fn = rec.disposers.pop();
      try {
        fn?.();
      } catch {
        // Ensure all disposers unwind
      }
    }
    rec.providedKeys = [];
    if (wasActive) {
      this.recordEvent('plugin:unmount', pluginId, `Плагин «${rec.def.name}» выгружен (эффекты откатаны)`);
    }
  }

  reconcile(): void {
    let changed = true;
    let guard = 0;

    while (changed && guard < 24) {
      changed = false;
      guard++;

      for (const [id, rec] of this.plugins.entries()) {
        const inject = rec.def.inject || [];
        const missing = inject.filter((dep) => !(dep in this.services));
        rec.missingDeps = missing;

        if (!rec.enabled) {
          if (rec.status === 'active') {
            this.teardownPlugin(id);
            changed = true;
          }
          rec.status = 'disabled';
          rec.errorMessage = undefined;
          continue;
        }

        if (missing.length > 0) {
          if (rec.status === 'active') {
            this.teardownPlugin(id);
            changed = true;
          }
          rec.status = 'waiting_deps';
          continue;
        }
      }

      for (const [id, rec] of this.plugins.entries()) {
        if (!rec.enabled || rec.status === 'active' || rec.status === 'error') continue;
        const inject = rec.def.inject || [];
        const missing = inject.filter((dep) => !(dep in this.services));
        rec.missingDeps = missing;
        if (missing.length > 0) {
          rec.status = 'waiting_deps';
          continue;
        }

        try {
          const ctx = new HarnessContext<S>(this, id);
          rec.def.apply(ctx);
          rec.status = 'active';
          rec.errorMessage = undefined;
          this.recordEvent('plugin:mount', id, `Смонтирован плагин «${rec.def.name}»`);
          changed = true;
        } catch (err) {
          this.teardownPlugin(id);
          rec.status = 'error';
          rec.errorMessage = err instanceof Error ? err.message : 'Plugin mount failed';
          changed = true;
        }
      }
    }

    for (const seam of this.seams.values()) {
      const activeProvider = Array.from(seam.availableProviderIds).find(
        (pid) => this.plugins.get(pid)?.status === 'active'
      );
      seam.activeProviderId = activeProvider || null;
    }
  }

  togglePlugin(pluginId: string, nextEnabled?: boolean): HarnessPluginSnapshot {
    const rec = this.plugins.get(pluginId);
    if (!rec) {
      throw new Error(`Плагин "${pluginId}" не найден в реестре Cordis`);
    }
    if (rec.def.locked && nextEnabled === false) {
      throw new Error(`Системный плагин "${pluginId}" защищён от отключения`);
    }
    const target = nextEnabled !== undefined ? nextEnabled : !rec.enabled;

    if (target && rec.def.providesSeam) {
      const seam = this.seams.get(rec.def.providesSeam);
      if (seam) {
        for (const rivalId of seam.availableProviderIds) {
          if (rivalId !== pluginId) {
            const rival = this.plugins.get(rivalId);
            if (rival && rival.enabled) {
              rival.enabled = false;
            }
          }
        }
      }
    }

    rec.enabled = target;
    this.reconcile();
    return this.getPluginSnapshot(pluginId)!;
  }

  switchSeamProvider(seamId: string, providerId: string): HarnessSeamDescriptor {
    const seam = this.seams.get(seamId);
    if (!seam) {
      throw new Error(`Seam "${seamId}" не найден`);
    }
    if (!seam.availableProviderIds.has(providerId)) {
      throw new Error(`Провайдер "${providerId}" не зарегистрирован для seam "${seamId}"`);
    }
    for (const pid of seam.availableProviderIds) {
      const rec = this.plugins.get(pid);
      if (rec) {
        rec.enabled = pid === providerId;
      }
    }
    this.reconcile();
    this.recordEvent(
      'seam:swap',
      seamId,
      `Для шва «${seam.title}» выбран провайдер «${providerId}»`
    );
    return this.getSeamSnapshot(seamId)!;
  }

  activateProfile(profileId: string): HarnessRuntimeSnapshot {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Профиль "${profileId}" не найден`);
    }
    this.activeProfileId = profileId;

    const enabledSet = new Set(profile.enabledPlugins);
    for (const [id, rec] of this.plugins.entries()) {
      if (rec.def.locked) {
        rec.enabled = true;
        continue;
      }
      if (rec.def.providesSeam && profile.seamProviders[rec.def.providesSeam]) {
        rec.enabled = profile.seamProviders[rec.def.providesSeam] === id;
        continue;
      }
      rec.enabled = enabledSet.has(id);
    }

    this.reconcile();
    this.recordEvent(
      'profile:activate',
      profileId,
      `Активирован профиль композиции «${profile.name}»`
    );
    return this.getSnapshot();
  }

  getActiveProfileId(): string {
    return this.activeProfileId;
  }

  getToolSchemas(): HarnessToolSchema[] {
    return Array.from(this.tools.values());
  }

  getPluginSnapshot(id: string): HarnessPluginSnapshot | null {
    const rec = this.plugins.get(id);
    if (!rec) return null;
    return {
      id: rec.def.id,
      name: rec.def.name,
      description: rec.def.description,
      bundle: rec.def.bundle,
      kind: rec.def.kind,
      status: rec.status,
      locked: rec.def.locked,
      inject: rec.def.inject || [],
      provides: rec.def.provides || [],
      providesSeam: rec.def.providesSeam,
      consumesSeam: rec.def.consumesSeam,
      missingDeps: rec.missingDeps,
      effectCount: rec.disposers.length,
      uiTab: rec.def.uiTab,
      errorMessage: rec.errorMessage,
    };
  }

  getSeamSnapshot(id: string): HarnessSeamDescriptor | null {
    const seam = this.seams.get(id);
    if (!seam) return null;
    return {
      id: seam.id,
      title: seam.title,
      description: seam.description,
      activeProviderId: seam.activeProviderId,
      availableProviderIds: Array.from(seam.availableProviderIds),
      consumerIds: Array.from(seam.consumerIds),
    };
  }

  getSnapshot(): HarnessRuntimeSnapshot {
    const plugins = Array.from(this.plugins.keys())
      .map((id) => this.getPluginSnapshot(id)!)
      .filter(Boolean);
    const seams = Array.from(this.seams.keys())
      .map((id) => this.getSeamSnapshot(id)!)
      .filter(Boolean);
    const activePlugins = plugins.filter((p) => p.status === 'active').length;
    const activeEffects = plugins.reduce((sum, p) => sum + p.effectCount, 0);

    return {
      engine: 'DeepSeek-Harness (Cordis)',
      activeProfileId: this.activeProfileId,
      profiles: Array.from(this.profiles.values()),
      seams,
      plugins,
      tools: this.getToolSchemas(),
      events: [...this.events],
      metrics: {
        activePlugins,
        totalPlugins: plugins.length,
        activeEffects,
        registeredTools: this.tools.size,
        seamsCount: seams.length,
      },
    };
  }
}
