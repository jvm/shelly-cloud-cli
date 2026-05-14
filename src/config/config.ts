import { homedir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../errors/cli-error.js';
import { parseDurationMs } from '../util/parse.js';
import type { Profile } from '../types.js';

export interface GlobalOptions {
  json: boolean;
  agent: boolean;
  noInput: boolean;
  noColor: boolean;
  profile?: string | undefined;
  host?: string | undefined;
  timeout?: string | undefined;
  verbose: boolean;
  quiet: boolean;
}

export interface EffectiveConfig {
  host?: string | undefined;
  authKey?: string | undefined;
  profile?: string | undefined;
  timeoutMs: number;
  rateLimitIntervalMs: number;
  configDir: string;
  cacheDir: string;
  stateDir: string;
}

export function xdgConfigDir(): string { return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'); }
export function xdgCacheDir(): string { return process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'); }
export function xdgStateDir(): string { return process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'); }

export function normalizeHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try { url = new URL(value); } catch { throw new CliError('invalid_host', `Invalid Shelly Cloud host: ${value}`, { hint: 'Use an HTTPS origin such as https://shelly-143-eu.shelly.cloud', exitCode: 3 }); }
  if (url.protocol !== 'https:') throw new CliError('unsupported_protocol', 'Shelly Cloud host must use https://', { hint: 'Plain HTTP is rejected to protect the authorization key.', validValues: ['https'], exitCode: 3 });
  return url.origin;
}

export function resolveConfig(opts: GlobalOptions, selectedProfile?: Profile): EffectiveConfig {
  const timeoutMs = parseDurationMs(opts.timeout, '--timeout') ?? 30000;
  const profileName = opts.profile ?? process.env.SHELLY_CLOUD_PROFILE ?? selectedProfile?.name;
  const host = normalizeHost(opts.host ?? process.env.SHELLY_CLOUD_HOST ?? selectedProfile?.host);
  return {
    host,
    authKey: process.env.SHELLY_CLOUD_KEY?.trim() || undefined,
    profile: profileName,
    timeoutMs,
    rateLimitIntervalMs: 1000,
    configDir: join(xdgConfigDir(), 'shelly-cloud'),
    cacheDir: join(xdgCacheDir(), 'shelly-cloud'),
    stateDir: join(xdgStateDir(), 'shelly-cloud'),
  };
}

export function requireApiConfig(config: EffectiveConfig): { host: string; authKey: string } {
  if (!config.host) throw new CliError('missing_host', 'Shelly Cloud host is required for API commands', { hint: 'Set SHELLY_CLOUD_HOST or pass --host https://your-account.shelly.cloud', exitCode: 3 });
  if (!config.authKey) throw new CliError('missing_auth_key', 'SHELLY_CLOUD_KEY is required for API commands', { hint: 'Set SHELLY_CLOUD_KEY in the environment before running API commands.', exitCode: 3 });
  return { host: config.host, authKey: config.authKey };
}
