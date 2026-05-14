#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandSchema, exitCodes, findCommand, globalFlags, help } from './command-schema.js';
import { resolveConfig, requireApiConfig, type GlobalOptions } from './config/config.js';
import { CliError, toCliError } from './errors/cli-error.js';
import { writeError, writeResult, type RenderContext } from './output/render.js';
import { loadStore, resolveAlias, saveAlias, saveStore, selectedProfile, upsertProfile } from './profiles/store.js';
import { ShellyClient } from './shelly/client.js';
import { verifyDeviceState } from './shelly/verify.js';
import type { DeviceAlias, Idempotency } from './types.js';
import { parseBool, parseCsv, parseIntRange, parsePositiveNumber } from './util/parse.js';
import { redact } from './util/redact.js';

const VERSION = '0.1.4';

interface Parsed { globals: GlobalOptions; args: string[]; flags: Map<string, string[]>; positionals: string[] }

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const ctx: RenderContext = { json: parsed.globals.json || parsed.globals.agent, agent: parsed.globals.agent, quiet: parsed.globals.quiet, color: Boolean(process.stdout.isTTY && !parsed.globals.json && !parsed.globals.agent && !parsed.globals.noColor && !process.env.NO_COLOR) };
  try {
    if (has(parsed, '--help') || parsed.args.length === 0) {
      const found = findCommand(parsed.positionals);
      process.stdout.write(`${help(found.command, found.path)}\n`);
      return;
    }
    if (has(parsed, '--version')) { process.stdout.write(`${VERSION}\n`); return; }
    await dispatch(parsed, ctx);
  } catch (e) {
    const err = toCliError(e);
    writeError(ctx, err);
    process.exitCode = err.exitCode;
  }
}

async function dispatch(p: Parsed, ctx: RenderContext): Promise<void> {
  const [cmd, sub, ...rest] = p.positionals;
  if (cmd === 'version') return void process.stdout.write(`${VERSION}\n`);
  if (cmd === 'agent-context') return agentContext(p, ctx);
  if (cmd === 'skill-path') return void process.stdout.write(`${skillPath()}\n`);
  if (cmd === 'completion') return completion(sub);

  const profile = await selectedProfile(resolveConfig(p.globals).configDir, p.globals.profile).catch((e) => {
    if (cmd === 'profiles' || cmd === 'feedback' || cmd === 'doctor') return undefined;
    throw e;
  });
  const config = resolveConfig(p.globals, profile);

  if (cmd === 'doctor') return doctor(p, ctx, config);
  if (cmd === 'profiles') return profiles(sub, rest, p, ctx, config.configDir);
  if (cmd === 'devices' && ['list', 'save', 'delete'].includes(sub ?? '')) return deviceAliases(sub!, rest, p, ctx, config.configDir, config.profile);
  if (cmd === 'feedback') return feedback(sub, rest, p, ctx, config.stateDir);

  if (cmd === 'devices' && sub === 'get') return devicesGet(p, ctx, config);
  if (cmd === 'switches' && sub === 'set') return switchSet(p, ctx, config);
  if (cmd === 'covers' && sub === 'set') return coverSet(p, ctx, config);
  if (cmd === 'lights' && sub === 'set') return lightSet(p, ctx, config);
  if (cmd === 'groups' && sub === 'set') return groupsSet(p, ctx, config);
  throw new CliError('invalid_option', `Unknown command: ${[cmd, sub].filter(Boolean).join(' ')}`, { hint: 'Run shelly-cloud --help', exitCode: 2 });
}

async function doctor(p: Parsed, ctx: RenderContext, config: ReturnType<typeof resolveConfig>): Promise<void> {
  const checks: Record<string, unknown>[] = [];
  try { if (config.host) checks.push({ name: 'host', ok: true, value: config.host }); else checks.push({ name: 'host', ok: false, message: 'No host configured' }); } catch (e) { checks.push({ name: 'host', ok: false, message: String(e) }); }
  checks.push({ name: 'auth_key', ok: Boolean(config.authKey), message: config.authKey ? 'present' : 'missing' });
  checks.push({ name: 'runtime', ok: Number(process.versions.node.split('.')[0]) >= 20, node: process.version });
  checks.push({ name: 'profiles', ok: true, path: config.configDir });
  const id = first(p, '--device-id');
  if (id) {
    const api = requireApiConfig(config);
    const client = new ShellyClient({ ...api, timeoutMs: config.timeoutMs, cacheDir: config.cacheDir, rateLimitIntervalMs: config.rateLimitIntervalMs });
    await client.getDevices({ ids: [id], select: ['status'] });
    checks.push({ name: 'device_smoke', ok: true });
  }
  writeResult(ctx, { checks }, { host: config.host ?? null, profile: config.profile ?? null, request_count: id ? 1 : 0 }, checks.map((c) => `${c.ok ? 'ok' : 'fail'} ${c.name}`).join('\n'));
}

async function profiles(sub: string | undefined, rest: string[], p: Parsed, ctx: RenderContext, configDir: string): Promise<void> {
  const store = await loadStore(configDir);
  if (sub === 'list') return writeResult(ctx, { profiles: Object.values(store.profiles), active: store.active ?? null }, { request_count: 0 });
  const name = rest[0];
  if (!name) throw new CliError('invalid_option', `profiles ${sub ?? ''} requires <name>`);
  if (sub === 'get' || sub === 'show') {
    const prof = store.profiles[name]; if (!prof) throw new CliError('missing_profile', `Profile not found: ${name}`, { exitCode: 4 });
    return writeResult(ctx, { profile: prof }, { request_count: 0 });
  }
  if (sub === 'save') {
    const host = first(p, '--host'); if (!host) throw new CliError('missing_host', 'profiles save requires --host', { exitCode: 3 });
    return writeResult(ctx, { profile: await upsertProfile(configDir, name, host) }, { request_count: 0 });
  }
  if (sub === 'delete') { if (!store.profiles[name]) throw new CliError('missing_profile', `Profile not found: ${name}`, { exitCode: 4 }); delete store.profiles[name]; if (store.active === name) delete store.active; await saveStore(configDir, store); return writeResult(ctx, { deleted: name }, { request_count: 0 }); }
  if (sub === 'use') { if (!store.profiles[name]) throw new CliError('missing_profile', `Profile not found: ${name}`, { exitCode: 4 }); store.active = name; await saveStore(configDir, store); return writeResult(ctx, { active: name }, { request_count: 0 }); }
  throw new CliError('invalid_option', 'profiles command must be list|get|save|delete|use');
}

async function deviceAliases(sub: string, rest: string[], p: Parsed, ctx: RenderContext, configDir: string, profileName?: string): Promise<void> {
  if (!profileName) throw new CliError('missing_profile', 'Device aliases require a selected profile', { exitCode: 4 });
  const store = await loadStore(configDir);
  const profile = store.profiles[profileName]; if (!profile) throw new CliError('missing_profile', `Profile not found: ${profileName}`, { exitCode: 4 });
  if (sub === 'list') return writeResult(ctx, { devices: Object.values(profile.devices), truncated: false, limit: 100 }, { request_count: 0, truncated: false });
  const aliasName = rest[0]; if (!aliasName) throw new CliError('invalid_option', `devices ${sub} requires <alias>`);
  if (sub === 'save') {
    const id = first(p, '--id'); if (!id) throw new CliError('invalid_option', 'devices save requires --id');
    const channel = parseIntRange(first(p, '--channel'), '--channel', 0, 32);
    const alias: DeviceAlias = { alias: aliasName, id, type: first(p, '--type'), default_channel: channel, description: first(p, '--description') };
    return writeResult(ctx, { device: await saveAlias(configDir, profileName, alias) }, { request_count: 0 });
  }
  if (sub === 'delete') { if (!profile.devices[aliasName]) throw new CliError('device_not_found', `Device alias not found: ${aliasName}`, { exitCode: 4 }); delete profile.devices[aliasName]; await saveStore(configDir, store); return writeResult(ctx, { deleted: aliasName }, { request_count: 0 }); }
}

async function devicesGet(p: Parsed, ctx: RenderContext, config: ReturnType<typeof resolveConfig>): Promise<void> {
  const ids = await resolveIds(p, config.configDir, config.profile);
  if (ids.length < 1 || ids.length > 10) throw new CliError('invalid_option', 'devices get requires 1..10 total --id/--device values', { hint: 'Example: shelly-cloud devices get --id b48a0a1cd978 --json' });
  const select = parseCsv(first(p, '--select') ?? 'status');
  for (const s of select) if (!['status', 'settings'].includes(s)) throw new CliError('invalid_option', `--select invalid value: ${s}`, { validValues: ['status', 'settings'] });
  const api = requireApiConfig(config); const client = new ShellyClient({ ...api, timeoutMs: config.timeoutMs, cacheDir: config.cacheDir, rateLimitIntervalMs: config.rateLimitIntervalMs });
  const body: Record<string, unknown> = { ids, select };
  const ps = parseCsv(first(p, '--pick-status')); if (ps.length) body.pick_status = ps;
  const pt = parseCsv(first(p, '--pick-settings')); if (pt.length) body.pick_settings = pt;
  const devices = await client.getDevices(body);
  writeResult(ctx, { devices }, { host: config.host, profile: config.profile ?? null, request_count: 1, truncated: false });
}

async function switchSet(p: Parsed, ctx: RenderContext, config: ReturnType<typeof resolveConfig>): Promise<void> {
  const target = await resolveOne(p, config); const on = parseBool(first(p, '--on'), '--on'); const toggle = parsePositiveNumber(first(p, '--toggle-after'), '--toggle-after');
  const command: Record<string, unknown> = { on }; if (toggle !== undefined) command.toggle_after = toggle;
  await control('switch', p, ctx, config, target.id, target.channel, command, toggle ? 'temporal' : 'idempotent_absolute');
}

async function coverSet(p: Parsed, ctx: RenderContext, config: ReturnType<typeof resolveConfig>): Promise<void> {
  const target = await resolveOne(p, config); const command: Record<string, unknown> = {};
  const posRaw = first(p, '--position'); const rel = parseIntRange(first(p, '--relative'), '--relative', -100, 100);
  if (posRaw && rel !== undefined) throw new CliError('invalid_option', '--position and --relative cannot be used together', { hint: 'Use absolute --position or relative --relative, not both.' });
  if (posRaw) command.position = ['open', 'close', 'stop'].includes(posRaw) ? posRaw : parseIntRange(posRaw, '--position', 0, 100);
  if (rel !== undefined) command.relative = rel;
  const slatPos = parseIntRange(first(p, '--slat-position'), '--slat-position', 0, 100); const slatRel = parseIntRange(first(p, '--slat-relative'), '--slat-relative', -100, 100);
  if (slatPos !== undefined && slatRel !== undefined) throw new CliError('invalid_option', '--slat-position and --slat-relative cannot be used together');
  if (slatPos !== undefined) command.slatPosition = slatPos; if (slatRel !== undefined) command.slatRelative = slatRel;
  const duration = parsePositiveNumber(first(p, '--duration'), '--duration'); if (duration !== undefined) { if (!['open', 'close', 'stop'].includes(String(command.position))) throw new CliError('invalid_option', '--duration may only be supplied with --position open|close|stop'); command.duration = duration; }
  if (!Object.keys(command).length) throw new CliError('invalid_option', 'covers set requires a movement parameter');
  const idem: Idempotency = rel !== undefined || slatRel !== undefined ? 'non_idempotent_relative' : 'idempotent_absolute';
  if (idem === 'non_idempotent_relative' && !has(p, '--force') && !has(p, '--dry-run')) throw new CliError('invalid_option', 'Relative cover moves require --force unless --dry-run is used', { hint: 'Use --dry-run first, then repeat with --force if safe.' });
  await control('cover', p, ctx, config, target.id, target.channel, command, idem, idem === 'non_idempotent_relative', ['relative movement is non-idempotent']);
}

async function lightSet(p: Parsed, ctx: RenderContext, config: ReturnType<typeof resolveConfig>): Promise<void> {
  const target = await resolveOne(p, config); const command: Record<string, unknown> = {};
  if (first(p, '--on') !== undefined) command.on = parseBool(first(p, '--on'), '--on');
  const ranges: [string, string, number, number][] = [['--temperature','temperature',2700,7000],['--brightness','brightness',0,100],['--red','red',0,255],['--green','green',0,255],['--blue','blue',0,255],['--white','white',0,255],['--gain','gain',0,100],['--effect','effect',0,6]];
  const mode = first(p, '--mode'); if (mode) { if (!['color','white'].includes(mode)) throw new CliError('invalid_option', '--mode must be color or white', { validValues: ['color','white'] }); command.mode = mode; }
  for (const [flag, key, min, max] of ranges) { const v = parseIntRange(first(p, flag), flag, min, max); if (v !== undefined) command[key] = v; }
  const toggle = parsePositiveNumber(first(p, '--toggle-after'), '--toggle-after'); if (toggle !== undefined) command.toggle_after = toggle;
  if (!Object.keys(command).length) throw new CliError('invalid_option', 'lights set requires at least one state-changing flag');
  await control('light', p, ctx, config, target.id, target.channel, command, toggle ? 'temporal' : 'idempotent_absolute');
}

async function control(kind: 'switch'|'cover'|'light', p: Parsed, ctx: RenderContext, config: ReturnType<typeof resolveConfig>, id: string, channel: number, command: Record<string, unknown>, idempotency: Idempotency, highRisk = false, highRiskReasons: string[] = []): Promise<void> {
  const api = has(p, '--dry-run') ? { host: config.host ?? 'https://dry-run.invalid', authKey: '[REDACTED]' } : requireApiConfig(config);
  const client = new ShellyClient({ ...api, timeoutMs: config.timeoutMs, cacheDir: config.cacheDir, rateLimitIntervalMs: config.rateLimitIntervalMs });
  const body = { id, channel, ...command };
  const plan = client.plan(kind, body, idempotency, highRisk, highRiskReasons);
  if (has(p, '--dry-run')) return writeResult(ctx, { dry_run: true, reason: 'No request sent because --dry-run was supplied.', request: plan }, { host: config.host ?? null, request_count: 0, idempotency });
  await client.post(kind, body);
  const verified = has(p, '--verify') ? await verifyControl(client, kind, id, channel, command) : null;
  writeResult(ctx, { kind, id, channel, command, verified }, { host: config.host, profile: config.profile ?? null, request_count: has(p, '--verify') ? 2 : 1, idempotency });
}

async function verifyControl(client: ShellyClient, kind: 'switch'|'cover'|'light', id: string, channel: number, command: Record<string, unknown>): Promise<unknown> {
  try {
    const [device] = await client.getDevices({ ids: [id], select: ['status'] });
    return verifyDeviceState(kind, device, channel, command);
  } catch (e) {
    return { verified: null, status: 'verification_failed', warning: e instanceof Error ? e.message : String(e) };
  }
}

async function groupsSet(p: Parsed, ctx: RenderContext, config: ReturnType<typeof resolveConfig>): Promise<void> {
  const input = first(p, '--input'); if (!input) throw new CliError('invalid_option', 'groups set requires --input <path|->');
  const text = input === '-' ? await readStdin(1024 * 1024) : await readFile(input, 'utf8');
  if (text.length > 1024 * 1024) throw new CliError('invalid_option', 'Group input exceeds 1 MiB limit');
  let body: Record<string, unknown>;
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { throw new CliError('invalid_option', 'Group input must be valid JSON'); }
  validateGroup(body);
  const count = countTargets(body); const highRisk = count > 3;
  if (highRisk && !has(p, '--force') && !has(p, '--dry-run')) throw new CliError('invalid_option', 'Group commands targeting more than 3 IDs require --force unless --dry-run');
  const api = has(p, '--dry-run') ? { host: config.host ?? 'https://dry-run.invalid', authKey: '[REDACTED]' } : requireApiConfig(config);
  const client = new ShellyClient({ ...api, timeoutMs: config.timeoutMs, cacheDir: config.cacheDir, rateLimitIntervalMs: config.rateLimitIntervalMs });
  const plan = client.plan('groups', body, 'multi_target', highRisk, highRisk ? ['group target count exceeds 3'] : []);
  if (has(p, '--dry-run')) return writeResult(ctx, { dry_run: true, reason: 'No request sent because --dry-run was supplied.', request: plan, target_count: count }, { host: config.host ?? null, request_count: 0, idempotency: 'multi_target' });
  const res = await client.post<Record<string, unknown>>('groups', body) ?? {};
  const failed = res.failedCommands && typeof res.failedCommands === 'object' ? res.failedCommands as Record<string,string> : {};
  if (Object.keys(failed).length && !has(p, '--allow-partial')) { writeResult(ctx, { failedCommands: failed }, { host: config.host, request_count: 1 }); throw new CliError('partial_failure', `${Object.keys(failed).length} group command failed`, { details: { failed_count: Object.keys(failed).length }, exitCode: 8 }); }
  writeResult(ctx, { result: res }, { host: config.host, request_count: 1, idempotency: 'multi_target' });
}

async function feedback(sub: string | undefined, rest: string[], p: Parsed, ctx: RenderContext, stateDir: string): Promise<void> {
  const file = join(stateDir, 'feedback.jsonl');
  if (sub === 'list') { const lines = existsSync(file) ? (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean).slice(-100).map((l) => JSON.parse(l)) : []; return writeResult(ctx, { feedback: lines, truncated: false, limit: 100 }, { request_count: 0 }); }
  if (sub === 'send') throw new CliError('not_configured', 'Feedback upstream submission is not configured', { exitCode: 2 });
  const message = [sub, ...rest].filter(Boolean).join(' '); if (!message) throw new CliError('invalid_option', 'feedback requires a message or subcommand');
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const entry = { message: redact(message), created_at: new Date().toISOString() };
  await writeFile(file, `${JSON.stringify(entry)}\n`, { flag: 'a', mode: 0o600 });
  writeResult(ctx, { saved: true }, { request_count: 0 });
}

function agentContext(p: Parsed, ctx: RenderContext): void {
  writeResult(ctx, { schema_version: '1.0.0', name: 'shelly-cloud', version: VERSION, description: 'Agent-native Shelly Cloud CLI', commands: commandSchema, global_flags: globalFlags, exit_codes: exitCodes, environment: ['SHELLY_CLOUD_KEY','SHELLY_CLOUD_HOST','SHELLY_CLOUD_PROFILE','NO_COLOR'], capabilities: { json_output: true, non_interactive: true, dry_run: true, feedback: true, remote_discovery: false }, feedback: { upstream_configured: false } }, { request_count: 0 });
}

function completion(shell?: string): void { if (!shell || !['bash','zsh','fish'].includes(shell)) throw new CliError('invalid_option', 'completion requires bash, zsh, or fish', { validValues: ['bash','zsh','fish'] }); process.stdout.write(`# ${shell} completion for shelly-cloud\n`); }
function skillPath(): string { return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'SKILL.md'); }

async function resolveIds(p: Parsed, configDir: string, profile?: string): Promise<string[]> { const ids = all(p, '--id'); for (const a of all(p, '--device')) ids.push((await resolveAlias(configDir, profile, a)).id); return ids.map(String); }
async function resolveOne(p: Parsed, config: ReturnType<typeof resolveConfig>): Promise<{ id: string; channel: number }> { const alias = first(p, '--device'); const direct = first(p, '--id'); if (!alias && !direct) throw new CliError('invalid_option', 'Command requires --id <id> or --device <alias>'); const a = alias ? await resolveAlias(config.configDir, config.profile, alias) : undefined; return { id: direct ?? a!.id, channel: parseIntRange(first(p, '--channel'), '--channel', 0, 32) ?? a?.default_channel ?? 0 }; }

function validateGroup(body: Record<string, unknown>): void { const allowed = new Set(['switch','cover','light']); for (const k of Object.keys(body)) if (!allowed.has(k)) throw new CliError('invalid_option', `Unknown group field: ${k}`); for (const [k, v] of Object.entries(body)) { if (!v || typeof v !== 'object') throw new CliError('invalid_option', `Group ${k} must be an object`); const o = v as { ids?: unknown; command?: unknown }; if (!Array.isArray(o.ids) || !o.ids.every((id) => typeof id === 'string' && /.+_\d+$/.test(id))) throw new CliError('invalid_option', `Group ${k}.ids must contain <ID>_<CHANNEL> strings`); if (!o.command || typeof o.command !== 'object') throw new CliError('invalid_option', `Group ${k}.command is required`); } }
function countTargets(body: Record<string, unknown>): number { return Object.values(body).reduce<number>((n, v) => n + (v && typeof v === 'object' && Array.isArray((v as { ids?: unknown }).ids) ? (v as { ids: unknown[] }).ids.length : 0), 0); }
async function readStdin(limit: number): Promise<string> { const chunks: Buffer[] = []; let total = 0; for await (const c of process.stdin) { const b = Buffer.from(c); total += b.length; if (total > limit) throw new CliError('invalid_option', 'stdin exceeds 1 MiB limit'); chunks.push(b); } return Buffer.concat(chunks).toString('utf8'); }

function parseArgs(argv: string[]): Parsed {
  const globals: GlobalOptions = { json: false, agent: false, noInput: !process.stdin.isTTY || !process.stdout.isTTY, noColor: false, verbose: false, quiet: false };
  const flags = new Map<string, string[]>(); const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) { const a = argv[i]!; if (a.startsWith('--')) { const eq = a.indexOf('='); const name = eq > 0 ? a.slice(0, eq) : a; const inline = eq > 0 ? a.slice(eq + 1) : undefined; const takes = ['--profile','--host','--timeout','--id','--device','--select','--pick-status','--pick-settings','--on','--channel','--toggle-after','--position','--relative','--duration','--slat-position','--slat-relative','--mode','--temperature','--brightness','--red','--green','--blue','--white','--gain','--effect','--input','--type','--description','--device-id'].includes(name); const val = inline ?? (takes ? argv[++i] : 'true'); if (takes && val === undefined) throw new CliError('invalid_option', `${name} requires a value`); flags.set(name, [...(flags.get(name) ?? []), val ?? 'true']); } else positionals.push(a); }
  globals.json = hasMap(flags, '--json'); globals.agent = hasMap(flags, '--agent'); if (globals.agent) { globals.json = true; globals.noInput = true; globals.noColor = true; }
  globals.noColor ||= hasMap(flags, '--no-color'); globals.verbose = hasMap(flags, '--verbose'); globals.quiet = hasMap(flags, '--quiet'); globals.profile = firstMap(flags, '--profile'); globals.host = firstMap(flags, '--host'); globals.timeout = firstMap(flags, '--timeout');
  return { globals, args: argv, flags, positionals };
}
function has(p: Parsed, k: string): boolean { return hasMap(p.flags, k); } function first(p: Parsed, k: string): string | undefined { return firstMap(p.flags, k); } function all(p: Parsed, k: string): string[] { return p.flags.get(k) ?? []; }
function hasMap(m: Map<string,string[]>, k: string): boolean { return m.has(k); } function firstMap(m: Map<string,string[]>, k: string): string | undefined { return m.get(k)?.[0]; }

void main();
