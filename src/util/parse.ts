import { CliError } from '../errors/cli-error.js';

export function parseBool(value: string | undefined, name: string): boolean {
  if (value === undefined) throw new CliError('invalid_option', `${name} requires true or false`, { validValues: ['true', 'false'] });
  if (/^(true|1|yes|on)$/i.test(value)) return true;
  if (/^(false|0|no|off)$/i.test(value)) return false;
  throw new CliError('invalid_option', `${name} must be true or false (got: "${value}")`, { validValues: ['true', 'false'] });
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

export function parseIntRange(value: string | undefined, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!/^-?\d+$/.test(value)) throw new CliError('invalid_option', `${name} must be an integer ${min}..${max}`, { details: { value } });
  const n = Number(value);
  if (n < min || n > max) throw new CliError('invalid_option', `${name} must be in range ${min}..${max}`, { details: { value } });
  return n;
}

export function parsePositiveNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value.replace(/s$/i, ''));
  if (!Number.isFinite(n) || n <= 0) throw new CliError('invalid_option', `${name} must be a positive number`, { details: { value } });
  return n;
}

export function parseDurationMs(value: string | undefined, name = '--timeout'): number | undefined {
  if (value === undefined) return undefined;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/i.exec(value);
  if (!m) throw new CliError(name === '--timeout' ? 'invalid_timeout' : 'invalid_option', `${name} must be a duration like 30000, 30s, or 1m`, { exitCode: name === '--timeout' ? 3 : 2 });
  const amount = Number(m[1]);
  const unit = m[2]?.toLowerCase() ?? 'ms';
  const ms = unit === 'm' ? amount * 60000 : unit === 's' ? amount * 1000 : amount;
  if (!Number.isFinite(ms) || ms <= 0) throw new CliError(name === '--timeout' ? 'invalid_timeout' : 'invalid_option', `${name} must be positive`, { exitCode: name === '--timeout' ? 3 : 2 });
  return Math.round(ms);
}
