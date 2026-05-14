import type { ErrorEnvelope, ResultEnvelope } from '../types.js';
import { CliError } from '../errors/cli-error.js';
import { redactUnknown } from '../util/redact.js';

export interface RenderContext {
  json: boolean;
  agent: boolean;
  quiet: boolean;
  color: boolean;
}

export function baseMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { generated_at: new Date().toISOString(), ...extra };
}

export function writeResult<T>(ctx: RenderContext, data: T, meta: Record<string, unknown> = {}, human?: string): void {
  if (ctx.json || ctx.agent) {
    const env: ResultEnvelope<T> = { ok: true, data, meta: baseMeta(meta) };
    process.stdout.write(`${JSON.stringify(redactUnknown(env))}\n`);
  } else {
    process.stdout.write(`${human ?? humanize(data)}\n`);
  }
}

export function writeError(ctx: RenderContext, error: CliError): void {
  if (ctx.json || ctx.agent) {
    const env: ErrorEnvelope = {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        hint: error.hint ?? null,
        valid_values: error.validValues ?? null,
        details: error.details,
      },
    };
    process.stderr.write(`${JSON.stringify(redactUnknown(env))}\n`);
  } else {
    process.stderr.write(`error: ${error.message}\n`);
    if (error.hint) process.stderr.write(`hint: ${error.hint}\n`);
    if (error.validValues) process.stderr.write(`valid values: ${JSON.stringify(error.validValues)}\n`);
  }
}

export function diag(ctx: RenderContext, message: string): void {
  if (!ctx.quiet) process.stderr.write(`${message}\n`);
}

function humanize(data: unknown): string {
  if (typeof data === 'string') return data;
  return JSON.stringify(redactUnknown(data), null, 2);
}
