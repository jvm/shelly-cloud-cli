import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

const hasLiveReadEnv = Boolean(process.env.SHELLY_CLOUD_KEY && process.env.SHELLY_CLOUD_HOST && process.env.SHELLY_TEST_DEVICE_ID);
const hasMutationEnv = hasLiveReadEnv && process.env.SHELLY_TEST_ENABLE_MUTATION === '1';

function runCli(args: string[]) {
  return spawnSync('bun', ['src/cli.ts', ...args], {
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 45_000,
  });
}

function redacted(output: string): string {
  let value = output;
  for (const secret of [process.env.SHELLY_CLOUD_KEY, process.env.SHELLY_CLOUD_HOST, process.env.SHELLY_TEST_DEVICE_ID]) {
    if (secret) value = value.split(secret).join('[REDACTED]');
  }
  return value;
}

describe('live Shelly Cloud integration', () => {
  test.skipIf(!hasLiveReadEnv)('devices get returns JSON for SHELLY_TEST_DEVICE_ID', () => {
    const result = runCli(['devices', 'get', '--id', process.env.SHELLY_TEST_DEVICE_ID!, '--json']);
    expect(result.status, redacted(result.stderr)).toBe(0);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; data: { devices: unknown[] } };
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.data.devices)).toBe(true);
  });

  test.skipIf(!hasMutationEnv)('mutation smoke is explicitly enabled and uses dry-run by default', () => {
    const result = runCli(['switches', 'set', '--id', process.env.SHELLY_TEST_DEVICE_ID!, '--on', 'true', '--dry-run', '--json']);
    expect(result.status, redacted(result.stderr)).toBe(0);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; data: { dry_run: boolean } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.dry_run).toBe(true);
  });
});
