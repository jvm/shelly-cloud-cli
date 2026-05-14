import type { ExitCode } from '../types.js';
import { redact } from '../util/redact.js';

export class CliError extends Error {
  readonly code: string;
  readonly hint?: string | undefined;
  readonly validValues?: unknown;
  readonly details: Record<string, unknown>;
  readonly exitCode: ExitCode;

  constructor(code: string, message: string, options: { hint?: string; validValues?: unknown; details?: Record<string, unknown>; exitCode?: ExitCode } = {}) {
    super(redact(message));
    this.name = 'CliError';
    this.code = code;
    this.hint = options.hint ? redact(options.hint) : undefined;
    this.validValues = options.validValues;
    this.details = sanitizeDetails(options.details ?? {});
    this.exitCode = options.exitCode ?? 2;
  }
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new CliError('unexpected_error', 'Unexpected failure', {
    hint: 'Run again with --verbose for safe diagnostics, or file an issue with the command and redacted details.',
    details: { cause: redact(message) },
    exitCode: 1,
  });
}

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(redact(JSON.stringify(details))) as Record<string, unknown>;
}
