import { mkdir, readFile, rename, writeFile, chmod, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CliError } from '../errors/cli-error.js';
import type { DeviceAlias, Profile, ProfileStoreData } from '../types.js';
import { normalizeHost } from '../config/config.js';

const EMPTY: ProfileStoreData = { profiles: {} };

export function profilesPath(configDir: string): string { return join(configDir, 'profiles.json'); }

export async function loadStore(configDir: string): Promise<ProfileStoreData> {
  const path = profilesPath(configDir);
  if (!existsSync(path)) return { ...EMPTY, profiles: {} };
  try {
    const data = JSON.parse(await readFile(path, 'utf8')) as ProfileStoreData;
    if (!data.profiles || typeof data.profiles !== 'object') throw new Error('missing profiles object');
    return { profiles: data.profiles, active: data.active };
  } catch (e) {
    throw new CliError('profile_parse_error', 'Could not parse profiles.json', { details: { path, cause: e instanceof Error ? e.message : String(e) }, exitCode: 3 });
  }
}

export async function saveStore(configDir: string, data: ProfileStoreData): Promise<void> {
  const path = profilesPath(configDir);
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await chmod(tmp, 0o600).catch(() => undefined);
    await rename(tmp, path);
    await chmod(path, 0o600).catch(() => undefined);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw new CliError('profile_write_error', 'Could not write profiles.json', { details: { path, cause: e instanceof Error ? e.message : String(e) }, exitCode: 3 });
  }
}

export async function selectedProfile(configDir: string, name?: string): Promise<Profile | undefined> {
  const store = await loadStore(configDir);
  const selected = name ?? process.env.SHELLY_CLOUD_PROFILE ?? store.active;
  if (!selected) return undefined;
  const p = store.profiles[selected];
  if (!p) throw new CliError('missing_profile', `Profile not found: ${selected}`, { exitCode: 4 });
  return p;
}

export async function upsertProfile(configDir: string, name: string, host: string): Promise<Profile> {
  const store = await loadStore(configDir);
  const now = new Date().toISOString();
  const existing = store.profiles[name];
  const profile: Profile = { name, host: normalizeHost(host)!, devices: existing?.devices ?? {}, defaults: existing?.defaults, created_at: existing?.created_at ?? now, updated_at: now };
  store.profiles[name] = profile;
  await saveStore(configDir, store);
  return profile;
}

export async function saveAlias(configDir: string, profileName: string, alias: DeviceAlias): Promise<DeviceAlias> {
  const store = await loadStore(configDir);
  const profile = store.profiles[profileName];
  if (!profile) throw new CliError('missing_profile', `Profile not found: ${profileName}`, { exitCode: 4 });
  profile.devices[alias.alias] = alias;
  profile.updated_at = new Date().toISOString();
  await saveStore(configDir, store);
  return alias;
}

export async function resolveAlias(configDir: string, profileName: string | undefined, alias: string): Promise<DeviceAlias> {
  if (!profileName) throw new CliError('missing_profile', `No profile selected for alias: ${alias}`, { hint: 'Use --profile, SHELLY_CLOUD_PROFILE, or profiles use.', exitCode: 4 });
  const p = await selectedProfile(configDir, profileName);
  const d = p?.devices[alias];
  if (!d) throw new CliError('device_not_found', `Device alias not found: ${alias}`, { exitCode: 4 });
  return d;
}
