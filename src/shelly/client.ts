import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CliError } from '../errors/cli-error.js';
import { redactedUrl } from '../util/redact.js';
import type { DeviceState, Idempotency } from '../types.js';

export type Endpoint = 'get' | 'switch' | 'cover' | 'light' | 'groups';
const PATHS: Record<Endpoint, string> = {
  get: '/v2/devices/api/get',
  switch: '/v2/devices/api/set/switch',
  cover: '/v2/devices/api/set/cover',
  light: '/v2/devices/api/set/light',
  groups: '/v2/devices/api/set/groups',
};

const upstreamMap: Record<string, string> = {
  DEVICE_FAILED_COMMAND: 'device_failed_command',
  DEVICE_OFFLINE: 'device_offline',
  DEVICE_INVALID_MODE: 'device_invalid_mode',
  DEVICE_INVALID_CHANNEL: 'device_invalid_channel',
  BAD_REQUEST: 'bad_request',
  INSTANCE_NOT_FOUND: 'instance_not_found',
  DEVICE_NOT_FOUND: 'device_not_found',
  UNEXPECTED_SUBSERVICE_ERROR: 'unexpected_subservice_error',
};

let lastRequest = 0;

export interface ApiClientOptions { host: string; authKey: string; timeoutMs: number; cacheDir: string; rateLimitIntervalMs: number; verbose?: boolean }
export interface RequestPlan { method: 'POST'; url: string; endpoint: Endpoint; path: string; body: unknown; idempotency: Idempotency; highRisk: boolean; highRiskReasons: string[] }

export class ShellyClient {
  constructor(private readonly options: ApiClientOptions) {}

  buildUrl(endpoint: Endpoint): URL {
    const url = new URL(PATHS[endpoint], this.options.host);
    url.searchParams.set('auth_key', this.options.authKey);
    return url;
  }

  plan(endpoint: Endpoint, body: unknown, idempotency: Idempotency, highRisk = false, highRiskReasons: string[] = []): RequestPlan {
    const url = this.buildUrl(endpoint);
    return { method: 'POST', url: redactedUrl(url), endpoint, path: `${url.pathname}?auth_key=[REDACTED]`, body, idempotency, highRisk, highRiskReasons };
  }

  async post<T>(endpoint: Endpoint, body: unknown): Promise<T | null> {
    await this.rateLimit();
    const url = this.buildUrl(endpoint);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: controller.signal,
      });
      const text = await response.text();
      const json = text ? parseJson(text, response.ok) : null;
      if (!response.ok) throw apiError(response.status, json, text);
      if (json && typeof json === 'object' && 'error' in json) throw apiError(response.status, json, text);
      return json as T | null;
    } catch (e) {
      if (e instanceof CliError) throw e;
      if (e instanceof Error && e.name === 'AbortError') throw new CliError('timeout', 'Shelly Cloud request timed out', { exitCode: 7 });
      throw new CliError('network_error', 'Network error while contacting Shelly Cloud', { details: { cause: e instanceof Error ? e.message : String(e) }, exitCode: 5 });
    } finally {
      clearTimeout(timer);
    }
  }

  async getDevices(body: unknown): Promise<DeviceState[]> {
    const response = await this.post<unknown>('get', body);
    const list = Array.isArray(response) ? response : response && typeof response === 'object' && Array.isArray((response as { devices?: unknown }).devices) ? (response as { devices: unknown[] }).devices : [];
    return list.map(normalizeDevice);
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, lastRequest + this.options.rateLimitIntervalMs - now);
    if (wait) await sleep(wait);
    await withLedger(this.options.cacheDir, this.options.rateLimitIntervalMs);
    lastRequest = Date.now();
  }
}

function parseJson(text: string, responseOk: boolean): unknown {
  try { return JSON.parse(text) as unknown; } catch {
    if (!responseOk) return null;
    throw new CliError('api_malformed_response', 'Shelly Cloud returned malformed JSON', { details: { body: text.slice(0, 500) }, exitCode: 5 });
  }
}

function apiError(status: number, json: unknown, text: string): CliError {
  const upstream = json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string' ? (json as { error: string }).error : undefined;
  const code = upstream ? upstreamMap[upstream] ?? 'api_status_error' : 'api_status_error';
  return new CliError(code, upstream ? `Shelly Cloud API error: ${upstream}` : `Shelly Cloud API returned HTTP ${status}`, { details: { status, upstream_error: upstream, body: upstream ? json : text.slice(0, 500) }, exitCode: status === 429 ? 6 : 5 });
}

function normalizeDevice(input: unknown): DeviceState {
  const o = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    id: String(o.id ?? o.device_id ?? ''),
    type: typeof o.type === 'string' ? o.type : undefined,
    code: typeof o.code === 'string' ? o.code : undefined,
    gen: typeof o.gen === 'string' ? o.gen : undefined,
    online: typeof o.online === 'number' ? o.online === 1 : typeof o.online === 'boolean' ? o.online : undefined,
    status: o.status && typeof o.status === 'object' ? o.status as Record<string, unknown> : undefined,
    settings: o.settings && typeof o.settings === 'object' ? o.settings as Record<string, unknown> : undefined,
  };
}

async function withLedger(cacheDir: string, interval: number): Promise<void> {
  await mkdir(cacheDir, { recursive: true }).catch(() => undefined);
  const lock = join(cacheDir, 'rate-limit.lock');
  const ledger = join(cacheDir, 'rate-limit.json');
  let handle;
  for (let i = 0; i < 50; i++) {
    try { handle = await open(lock, 'wx'); break; } catch { await sleep(50); }
  }
  if (!handle) throw new CliError('rate_limit_exhausted', 'Could not acquire rate-limit lock', { exitCode: 6 });
  try {
    let previous = 0;
    try { previous = JSON.parse(await readFile(ledger, 'utf8')).last ?? 0; } catch {}
    const wait = Math.max(0, previous + interval - Date.now());
    if (wait) await sleep(wait);
    await writeFile(ledger, JSON.stringify({ last: Date.now() }), { mode: 0o600 });
  } finally {
    await handle.close();
    await rm(lock, { force: true });
  }
}

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
