import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ShellyClient } from '../src/shelly/client.js';
import { CliError } from '../src/errors/cli-error.js';

const originalFetch = globalThis.fetch;
function cacheDir(): string { return mkdtempSync(join(tmpdir(), 'scc-api-')); }
function client(interval = 0): ShellyClient {
  return new ShellyClient({ host: 'https://example.shelly.cloud', authKey: 'key with spaces&symbols', timeoutMs: 1000, cacheDir: cacheDir(), rateLimitIntervalMs: interval });
}

afterEach(() => { globalThis.fetch = originalFetch; });

describe('ShellyClient', () => {
  test('constructs v2 URLs with encoded auth_key and redacted plans', () => {
    const c = client();
    const url = c.buildUrl('switch');
    expect(url.pathname).toBe('/v2/devices/api/set/switch');
    expect(url.searchParams.get('auth_key')).toBe('key with spaces&symbols');
    expect(url.toString()).toContain('key+with+spaces%26symbols');
    const plan = c.plan('switch', { id: 'abc', on: true }, 'idempotent_absolute');
    expect(plan.path).toBe('/v2/devices/api/set/switch?auth_key=[REDACTED]');
    expect(plan.url).not.toContain('key with spaces');
  });

  test('sends compact JSON POST without following redirects', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init ?? {} };
      return new Response('', { status: 200 });
    }) as typeof fetch;
    await client().post('light', { id: 'abc', channel: 0, on: true });
    expect(seen?.url).toContain('/v2/devices/api/set/light?auth_key=');
    expect(seen?.init.method).toBe('POST');
    expect(seen?.init.redirect).toBe('manual');
    expect(seen?.init.body).toBe('{"id":"abc","channel":0,"on":true}');
    expect((seen?.init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  test('accepts empty 200 control responses', async () => {
    globalThis.fetch = (async () => new Response('', { status: 200 })) as typeof fetch;
    await expect(client().post('cover', { id: 'abc' })).resolves.toBeNull();
  });

  test('maps upstream API errors', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'DEVICE_OFFLINE', data: { messages: ['offline'] } }), { status: 400 })) as typeof fetch;
    try {
      await client().post('switch', { id: 'abc' });
      throw new Error('expected failure');
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).code).toBe('device_offline');
      expect((e as CliError).exitCode).toBe(5);
    }
  });

  test('preserves non-json error bodies as api status errors', async () => {
    globalThis.fetch = (async () => new Response('bad gateway auth_key=secret', { status: 502 })) as typeof fetch;
    try {
      await client().post('get', { ids: ['abc'] });
      throw new Error('expected failure');
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).code).toBe('api_status_error');
      expect(JSON.stringify((e as CliError).details)).not.toContain('secret');
    }
  });

  test('maps malformed successful JSON', async () => {
    globalThis.fetch = (async () => new Response('{not-json', { status: 200 })) as typeof fetch;
    try {
      await client().post('get', { ids: ['abc'] });
      throw new Error('expected failure');
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).code).toBe('api_malformed_response');
    }
  });

  test('normalizes online 0/1 to boolean', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify([{ id: 123, online: 1, status: { sys: {} } }]), { status: 200 })) as typeof fetch;
    const devices = await client().getDevices({ ids: ['123'] });
    expect(devices[0]?.id).toBe('123');
    expect(devices[0]?.online).toBe(true);
  });

  test('enforces configured request interval', async () => {
    globalThis.fetch = (async () => new Response('', { status: 200 })) as typeof fetch;
    const c = client(35);
    const start = Date.now();
    await c.post('switch', { id: 'a' });
    await c.post('switch', { id: 'a' });
    expect(Date.now() - start).toBeGreaterThanOrEqual(30);
  });
});
