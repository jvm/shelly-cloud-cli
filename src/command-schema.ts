export interface FlagSchema { name: string; value?: string; description: string; enum?: string[]; range?: string; repeated?: boolean }
export interface CommandSchema { name: string; summary: string; flags?: FlagSchema[]; subcommands?: CommandSchema[]; examples?: string[]; requiresApi?: boolean; mutates?: boolean; safety?: Record<string, unknown> }

export const globalFlags: FlagSchema[] = [
  { name: '--json', description: 'Emit stable JSON result output.' },
  { name: '--agent', description: 'Equivalent to --json --no-input --no-color with bounded output.' },
  { name: '--no-input', description: 'Disable prompts.' },
  { name: '--no-color', description: 'Disable ANSI color.' },
  { name: '--profile', value: '<name>', description: 'Select a local profile.' },
  { name: '--host', value: '<url>', description: 'Override Shelly Cloud host.' },
  { name: '--timeout', value: '<duration>', description: 'Request timeout, e.g. 30000 or 30s.' },
  { name: '--verbose', description: 'Increase diagnostics on stderr without secrets.' },
  { name: '--quiet', description: 'Suppress non-error diagnostics.' },
];
const mutatingFlags: FlagSchema[] = [
  { name: '--dry-run', description: 'Validate and print the redacted request plan without sending.' },
  { name: '--force', description: 'Bypass required safety confirmation for high-risk commands.' },
  { name: '--verify', description: 'Query device state after a successful set when feasible.' },
];

export const commandSchema: CommandSchema = { name: 'shelly-cloud', summary: 'Shelly Cloud Control API CLI', subcommands: [
  { name: 'version', summary: 'Print version.' },
  { name: 'doctor', summary: 'Validate local configuration.', flags: [{ name: '--device-id', value: '<id>', description: 'Optional live smoke-test device.' }], examples: ['shelly-cloud doctor --json'] },
  { name: 'agent-context', summary: 'Print machine-readable command context.', examples: ['shelly-cloud agent-context --json'] },
  { name: 'skill-path', summary: 'Print path to packaged SKILL.md.' },
  { name: 'completion', summary: 'Generate shell completion.', flags: [{ name: '<shell>', description: 'Shell name.', enum: ['bash', 'zsh', 'fish'] }] },
  { name: 'profiles', summary: 'Manage local profiles.', subcommands: [
    { name: 'list', summary: 'List profiles.' }, { name: 'get', summary: 'Show profile.' }, { name: 'save', summary: 'Save profile.', flags: [{ name: '--host', value: '<url>', description: 'HTTPS Shelly Cloud host.' }] }, { name: 'delete', summary: 'Delete profile.' }, { name: 'use', summary: 'Select active profile.' },
  ] },
  { name: 'devices', summary: 'Manage aliases and query known devices.', subcommands: [
    { name: 'list', summary: 'List local aliases.' },
    { name: 'save', summary: 'Save alias.', flags: [{ name: '--id', value: '<id>', description: 'Device ID.' }, { name: '--type', value: '<type>', description: 'Device type.', enum: ['switch', 'cover', 'light'] }, { name: '--channel', value: '<n>', description: 'Default channel.' }] },
    { name: 'delete', summary: 'Delete alias.' },
    { name: 'get', summary: 'Fetch states/settings for 1..10 known IDs.', requiresApi: true, flags: [{ name: '--id', value: '<id>', description: 'Device ID.', repeated: true }, { name: '--device', value: '<alias>', description: 'Alias.', repeated: true }, { name: '--select', value: '<csv>', description: 'status/settings.', enum: ['status', 'settings'] }, { name: '--pick-status', value: '<csv>', description: 'Status keys.' }, { name: '--pick-settings', value: '<csv>', description: 'Settings keys.' }, { name: '--raw', description: 'Include raw upstream response.' }], examples: ['shelly-cloud devices get --id b48a0a1cd978 --json'] },
  ] },
  { name: 'switches', summary: 'Control switches.', subcommands: [{ name: 'set', summary: 'Set switch output.', requiresApi: true, mutates: true, flags: [...mutatingFlags, { name: '--id', value: '<id>', description: 'Device ID.' }, { name: '--device', value: '<alias>', description: 'Alias.' }, { name: '--channel', value: '<n>', description: 'Channel.' }, { name: '--on', value: 'true|false', description: 'Output state.', enum: ['true', 'false'] }, { name: '--toggle-after', value: '<seconds>', description: 'Toggle after seconds.' }], examples: ['shelly-cloud switches set --id b48a0a1cd978 --on true --dry-run --json'], safety: { idempotency: ['idempotent_absolute', 'temporal'] } }] },
  { name: 'covers', summary: 'Control covers.', subcommands: [{ name: 'set', summary: 'Move cover.', requiresApi: true, mutates: true, flags: [...mutatingFlags, { name: '--position', value: '<open|close|stop|0..100>', description: 'Absolute position.' }, { name: '--relative', value: '<-100..100>', description: 'Relative move.' }, { name: '--slat-position', value: '<0..100>', description: 'Slat position.' }, { name: '--slat-relative', value: '<-100..100>', description: 'Relative slat move.' }], safety: { high_risk: 'relative moves require --force' } }] },
  { name: 'lights', summary: 'Control lights.', subcommands: [{ name: 'set', summary: 'Set light state.', requiresApi: true, mutates: true, flags: [...mutatingFlags], safety: { idempotency: ['idempotent_absolute', 'temporal'] } }] },
  { name: 'groups', summary: 'Control mixed groups.', subcommands: [{ name: 'set', summary: 'Set group state from JSON input.', requiresApi: true, mutates: true, flags: [...mutatingFlags, { name: '--input', value: '<path|->', description: 'Group command JSON.' }, { name: '--allow-partial', description: 'Exit 0 on upstream partial failure.' }], safety: { high_risk: 'more than 3 targets require --force' } }] },
  { name: 'feedback', summary: 'Capture local feedback.', subcommands: [{ name: 'list', summary: 'List feedback.' }, { name: 'send', summary: 'Report not configured unless upstream is configured.' }] },
] };

export const exitCodes = { 0: 'success', 1: 'unexpected failure', 2: 'usage or validation error', 3: 'configuration/authentication error', 4: 'not found', 5: 'Shelly Cloud API error', 6: 'rate limited or retry budget exhausted', 7: 'timeout', 8: 'partial failure' };

export function findCommand(path: string[]): { command: CommandSchema; path: string[] } {
  let current = commandSchema;
  const matched: string[] = [];
  for (const part of path) {
    const next = current.subcommands?.find((candidate) => candidate.name === part);
    if (!next) break;
    current = next;
    matched.push(part);
  }
  return { command: current, path: matched };
}

export function help(command?: CommandSchema, path: string[] = []): string {
  const c = command ?? commandSchema;
  const lines = [`Usage: ${usageFor(c, path)}`, '', c.summary, ''];
  if (c === commandSchema) lines.push('Global flags:', ...globalFlags.map(formatFlag), '');
  if (c.flags?.length) lines.push('Flags:', ...c.flags.map(formatFlag), '');
  if (c.subcommands?.length) lines.push('Commands:', ...c.subcommands.map((s) => `  ${s.name.padEnd(14)} ${s.summary}`), '');
  if (c.mutates) lines.push('Safety:', '  Mutating command. Use --dry-run to preview physical side effects before sending.', '');
  if (c.examples?.length) lines.push('Examples:', ...c.examples.map((e) => `  ${e}`));
  return lines.join('\n');
}
function formatFlag(f: FlagSchema): string { return `  ${`${f.name}${f.value ? ` ${f.value}` : ''}`.padEnd(24)} ${f.description}`; }
function usageFor(c: CommandSchema, path: string[]): string {
  return c.name === 'shelly-cloud' ? 'shelly-cloud [global flags] <command> [args]' : `shelly-cloud ${path.join(' ')} [flags]`;
}
