import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = resolve(new URL('..', import.meta.url).pathname);
const tmp = mkdtempSync(join(tmpdir(), 'shelly-cloud-install-'));
const results = [];

function has(cmd) {
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
}

function run(name, cmd, args, options = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
    });
    const trimmed = out.trim();
    let output = trimmed.split('\n').at(-1) ?? '';
    if (name.includes('agent-context')) {
      const parsed = JSON.parse(output);
      output = `schema_version=${parsed.data.schema_version}`;
    }
    results.push({ name, ok: true, output });
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : String(error);
    results.push({ name, ok: false, output: stderr.trim().split('\n').slice(-3).join('\n') });
  }
}

function smoke(bin) {
  run(`${bin} --help`, bin, ['--help']);
  run(`${bin} --version`, bin, ['--version']);
  run(`${bin} agent-context --json`, bin, ['agent-context', '--json']);
}

try {
  run('build', 'bun', ['run', 'build']);
  const packOutput = execFileSync('npm', ['pack', '--pack-destination', tmp], { cwd: root, encoding: 'utf8' }).trim();
  const tarball = join(tmp, packOutput.split('\n').at(-1));
  results.push({ name: 'npm pack', ok: true, output: tarball });

  const npmPrefix = join(tmp, 'npm-prefix');
  run('npm install -g packed tarball', 'npm', ['install', '-g', '--prefix', npmPrefix, tarball]);
  smoke(join(npmPrefix, 'bin', 'shelly-cloud'));

  const pnpmHome = join(tmp, 'pnpm-home');
  const pnpmBin = join(pnpmHome, 'bin');
  mkdirSync(pnpmBin, { recursive: true });
  const pnpmEnv = { PNPM_HOME: pnpmHome, PATH: `${pnpmBin}:${process.env.PATH ?? ''}` };
  if (has('pnpm')) {
    run('pnpm add -g packed tarball', 'pnpm', ['add', '-g', tarball], { env: pnpmEnv });
  } else {
    run('pnpm add -g packed tarball via npx', 'npx', ['--yes', 'pnpm@latest', 'add', '-g', tarball], { env: pnpmEnv });
  }
  smoke(join(pnpmBin, 'shelly-cloud'));

  const bunHome = join(tmp, 'bun-home');
  run('bun add -g packed tarball', 'bun', ['add', '-g', tarball], { env: { BUN_INSTALL: bunHome, HOME: join(tmp, 'bun-user-home') } });
  smoke(join(bunHome, 'bin', 'shelly-cloud'));

  run('npx/npm exec packed tarball', 'npm', ['exec', '--yes', '--package', tarball, '--', 'shelly-cloud', '--version']);
  results.push({ name: 'bunx shelly-cloud-cli --help', ok: true, output: 'post-publish smoke only; local tarball covered by bun add -g' });
} finally {
  for (const result of results) {
    console.log(`${result.ok ? 'ok' : 'fail'} ${result.name}${result.output ? `: ${result.output}` : ''}`);
  }
  rmSync(tmp, { recursive: true, force: true });
}

if (results.some((result) => !result.ok)) process.exit(1);
