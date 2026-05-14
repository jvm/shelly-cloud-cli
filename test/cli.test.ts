import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = ['src/cli.ts'];
function run(args: string[], env: Record<string, string> = {}, input?: string) {
  return spawnSync('bun', [...cli, ...args], { input, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'scc-config-')), XDG_CACHE_HOME: mkdtempSync(join(tmpdir(), 'scc-cache-')), XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'scc-state-')), ...env } });
}

describe('cli basics', () => {
  test('help and version', () => {
    expect(run(['--help']).status).toBe(0);
    expect(run(['--version']).stdout.trim()).toMatch(/^0\.1\.4/);
  });

  test('json validation errors go to stderr', () => {
    const r = run(['devices', 'get', '--json']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(JSON.parse(r.stderr).ok).toBe(false);
  });

  test('missing host happens before missing key', () => {
    const r = run(['devices', 'get', '--id', 'abc', '--json']);
    expect(r.status).toBe(3);
    expect(JSON.parse(r.stderr).error.code).toBe('missing_host');
  });

  test('dry-run does not require auth key and redacts auth_key', () => {
    const r = run(['switches', 'set', '--host', 'https://example.com', '--id', 'abc', '--on', 'true', '--dry-run', '--json']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.data.request.path).toContain('auth_key=[REDACTED]');
    expect(r.stdout).not.toContain('SHELLY_CLOUD_KEY');
  });

  test('cover relative requires force unless dry-run', () => {
    const r = run(['covers', 'set', '--host', 'https://example.com', '--id', 'abc', '--relative', '-10', '--json'], { SHELLY_CLOUD_KEY: 'secret-value' });
    expect(r.status).toBe(2);
  });

  test('agent context is parseable', () => {
    const r = run(['agent-context', '--json']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.data.schema_version).toBe('1.0.0');
    expect(out.data.capabilities.remote_discovery).toBe(false);
  });

  test('groups set reads stdin and validates dry-run', () => {
    const input = JSON.stringify({ switch: { ids: ['abc_0'], command: { on: true } } });
    const r = run(['groups', 'set', '--host', 'https://example.com', '--input', '-', '--dry-run', '--json'], {}, input);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).data.target_count).toBe(1);
  });

  test('command-specific help is schema-derived and advertises dry-run', () => {
    const r = run(['switches', 'set', '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage: shelly-cloud switches set');
    expect(r.stdout).toContain('--dry-run');
    expect(r.stdout).toContain('Mutating command');
  });

  test('devices get rejects more than 10 ids before network config', () => {
    const args = ['devices', 'get', '--json'];
    for (let i = 0; i < 11; i++) args.push('--id', String(i));
    const r = run(args);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stderr).error.code).toBe('invalid_option');
  });

  test('devices get rejects invalid select values', () => {
    const r = run(['devices', 'get', '--id', 'abc', '--select', 'status,half', '--json']);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stderr).error.valid_values).toEqual(['status', 'settings']);
  });

  test('switches set requires explicit boolean on value', () => {
    const r = run(['switches', 'set', '--host', 'https://example.com', '--id', 'abc', '--json']);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stderr).error.message).toContain('--on requires true or false');
  });

  test('covers set rejects mutually exclusive slat flags', () => {
    const r = run(['covers', 'set', '--host', 'https://example.com', '--id', 'abc', '--slat-position', '10', '--slat-relative', '5', '--dry-run', '--json']);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stderr).error.message).toContain('--slat-position and --slat-relative');
  });

  test('lights set rejects out-of-range values', () => {
    const r = run(['lights', 'set', '--host', 'https://example.com', '--id', 'abc', '--brightness', '101', '--dry-run', '--json']);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stderr).error.message).toContain('--brightness');
  });

  test('groups set rejects unknown fields and invalid json', () => {
    const unknown = run(['groups', 'set', '--host', 'https://example.com', '--input', '-', '--dry-run', '--json'], {}, JSON.stringify({ scene: {} }));
    expect(unknown.status).toBe(2);
    expect(JSON.parse(unknown.stderr).error.message).toContain('Unknown group field');
    const invalid = run(['groups', 'set', '--host', 'https://example.com', '--input', '-', '--dry-run', '--json'], {}, '{nope');
    expect(invalid.status).toBe(2);
    expect(JSON.parse(invalid.stderr).error.message).toContain('valid JSON');
  });

  test('groups set requires force above safety threshold', () => {
    const input = JSON.stringify({ switch: { ids: ['a_0', 'b_0', 'c_0', 'd_0'], command: { on: true } } });
    const r = run(['groups', 'set', '--host', 'https://example.com', '--input', '-', '--json'], {}, input);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stderr).error.message).toContain('require --force');
  });

  test('skill path points to skill file after source run', () => {
    const r = run(['skill-path']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('skills/SKILL.md');
  });
});
