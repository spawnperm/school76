import { connect, StringCodec, type NatsConnection } from 'nats';

export interface NatsStreamInfo {
  name: string;
  subjects: string[];
  retention: 'limits' | 'workqueue' | 'interest';
  messages: number;
  bytes: number;
}

export interface NatsMessageRecord {
  seq: number;
  stream: string;
  subject: string;
  payload: unknown;
  publisher: string;
  timestamp: string;
}

export function matchNatsSubject(pattern: string, subject: string): boolean {
  const patTokens = pattern.trim().split('.');
  const subTokens = subject.trim().split('.');

  for (let i = 0; i < patTokens.length; i++) {
    const p = patTokens[i];
    if (p === '>') {
      return i <= subTokens.length;
    }
    if (i >= subTokens.length) return false;
    if (p === '*') continue;
    if (p !== subTokens[i]) return false;
  }
  return patTokens.length === subTokens.length;
}

export class NatsEventBus {
  private readonly messages: NatsMessageRecord[] = [];
  private seq = 1;
  private nc: NatsConnection | null = null;
  private externalAttempted = false;
  private readonly sc = StringCodec();
  private readonly onPublishListeners = new Set<(msg: NatsMessageRecord) => void>();

  constructor() {
    this.seedInitialEvents();
  }

  private seedInitialEvents() {
    const seeds: Array<{ subject: string; payload: unknown; publisher: string }> = [
      {
        subject: 'cubesat.obc.boot',
        payload: { projectId: 'school76-1u', mode: 'NOMINAL', wdtMs: 1200, vbatMv: 8140 },
        publisher: 'obc-stm32',
      },
      {
        subject: 'cubesat.eps.telemetry',
        payload: { bus3v3: 3.31, bus5v: 5.02, socPct: 84, solarMa: 412, tempC: 21.4 },
        publisher: 'eps-controller',
      },
      {
        subject: 'cubesat.adcs.bdot',
        payload: { omegaX: 0.012, omegaY: -0.008, omegaZ: 0.004, stabilized: true },
        publisher: 'adcs-daemon',
      },
      {
        subject: 'crm.deals.updated',
        payload: { dealId: 'deal-2', stage: 'flight_ready', amountRub: 420000 },
        publisher: 'atomic-crm',
      },
      {
        subject: 'dify.workflow.completed',
        payload: { workflowId: 'wf-wiki-rag', tokens: 342, latencyMs: 185 },
        publisher: 'dify-runner',
      },
    ];

    for (const s of seeds) {
      this.recordInternal(s.subject, s.payload, s.publisher);
    }
  }

  private resolveStream(subject: string, explicitStream?: string): string {
    if (explicitStream && explicitStream.trim()) return explicitStream.trim();
    if (subject.startsWith('cubesat.')) return 'CUBESAT_TELEMETRY';
    if (subject.startsWith('crm.')) return 'CRM_PIPELINE';
    if (subject.startsWith('dify.')) return 'DIFY_RUNS';
    return 'MISSION_EVENTS';
  }

  private recordInternal(
    subject: string,
    payload: unknown,
    publisher: string,
    explicitStream?: string
  ): NatsMessageRecord {
    const record: NatsMessageRecord = {
      seq: this.seq++,
      stream: this.resolveStream(subject, explicitStream),
      subject,
      payload,
      publisher,
      timestamp: new Date().toISOString(),
    };
    this.messages.unshift(record);
    if (this.messages.length > 250) {
      this.messages.length = 250;
    }
    for (const cb of this.onPublishListeners) {
      try {
        cb(record);
      } catch {
        // ignore listener failure
      }
    }
    return record;
  }

  onMessage(listener: (msg: NatsMessageRecord) => void): () => void {
    this.onPublishListeners.add(listener);
    return () => {
      this.onPublishListeners.delete(listener);
    };
  }

  private async ensureExternalClient(): Promise<NatsConnection | null> {
    const natsUrl = process.env.NATS_URL?.trim();
    if (!natsUrl) return null;
    if (this.nc && !this.nc.isClosed()) return this.nc;
    if (this.externalAttempted) return null;
    this.externalAttempted = true;
    try {
      this.nc = await connect({ servers: natsUrl, timeout: 2500 });
      return this.nc;
    } catch {
      return null;
    }
  }

  async publish(
    subject: string,
    payload: unknown,
    publisher = 'school76-server',
    stream?: string
  ): Promise<NatsMessageRecord> {
    const rec = this.recordInternal(subject, payload, publisher, stream);
    const client = await this.ensureExternalClient();
    if (client) {
      try {
        const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
        client.publish(subject, this.sc.encode(serialized));
      } catch {
        // embedded broker already persisted event
      }
    }
    return rec;
  }

  queryMessages(subjectFilter = '>'): NatsMessageRecord[] {
    const filter = subjectFilter.trim() || '>';
    return this.messages.filter((m) => matchNatsSubject(filter, m.subject));
  }

  getStreams(): NatsStreamInfo[] {
    const defs: Array<{ name: string; subjects: string[]; retention: NatsStreamInfo['retention'] }> = [
      {
        name: 'CUBESAT_TELEMETRY',
        subjects: ['cubesat.>'],
        retention: 'limits',
      },
      {
        name: 'CRM_PIPELINE',
        subjects: ['crm.>'],
        retention: 'limits',
      },
      {
        name: 'DIFY_RUNS',
        subjects: ['dify.>'],
        retention: 'interest',
      },
      {
        name: 'MISSION_EVENTS',
        subjects: ['tasks.>', 'tinacms.>', 'directus.>', 'traefik.>'],
        retention: 'limits',
      },
    ];

    return defs.map((def) => {
      const matched = this.messages.filter((m) => m.stream === def.name);
      const bytes = matched.reduce(
        (acc, m) => acc + Buffer.byteLength(JSON.stringify(m.payload ?? {}), 'utf-8'),
        0
      );
      return {
        ...def,
        messages: matched.length,
        bytes,
      };
    });
  }

  getStatus() {
    const natsUrl = process.env.NATS_URL?.trim();
    return {
      mode: this.nc && !this.nc.isClosed() ? 'external-nats' : 'embedded-jetstream',
      externalConfigured: Boolean(natsUrl),
      totalMessages: this.messages.length,
      latestSeq: this.seq - 1,
      streams: this.getStreams(),
    };
  }
}
