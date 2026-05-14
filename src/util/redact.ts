const KEY_NAMES = /(?:auth_key|authorization|api[_-]?key|token|secret|password|SHELLY_CLOUD_KEY)/i;

export function redact(input: string): string {
  let out = input;
  out = out.replace(/(auth_key=)[^&\s)"'}]+/gi, '$1[REDACTED]');
  const envKey = process.env.SHELLY_CLOUD_KEY;
  if (envKey) out = out.split(envKey).join('[REDACTED]');
  out = out.replace(/(SHELLY_CLOUD_KEY\s*[=:]\s*)[^\s]+/gi, '$1[REDACTED]');
  return out;
}

export function redactValue(key: string, value: unknown): unknown {
  if (KEY_NAMES.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactUnknown(v));
  if (value && typeof value === 'object') return redactObject(value as Record<string, unknown>);
  return value;
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactUnknown(v));
  if (value && typeof value === 'object') return redactObject(value as Record<string, unknown>);
  return value;
}

export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = redactValue(k, v);
  return out;
}

export function redactedUrl(url: URL): string {
  const clone = new URL(url.toString());
  if (clone.searchParams.has('auth_key')) clone.searchParams.set('auth_key', '[REDACTED]');
  return clone.toString();
}
