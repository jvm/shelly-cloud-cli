export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface DeviceAlias {
  alias: string;
  id: string;
  type?: 'switch' | 'cover' | 'light' | string | undefined;
  default_channel?: number | undefined;
  description?: string | undefined;
}

export interface DeviceState {
  id: string;
  type?: string | undefined;
  code?: string | undefined;
  gen?: string | undefined;
  online?: boolean | undefined;
  status?: Record<string, unknown> | undefined;
  settings?: Record<string, unknown> | undefined;
  raw?: unknown;
}

export interface Profile {
  name: string;
  host: string;
  devices: Record<string, DeviceAlias>;
  defaults?: Record<string, unknown> | undefined;
  created_at: string;
  updated_at: string;
}

export interface ProfileStoreData {
  active?: string | undefined;
  profiles: Record<string, Profile>;
}

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Idempotency = 'idempotent_absolute' | 'temporal' | 'non_idempotent_relative' | 'multi_target';

export interface ResultEnvelope<T = unknown> {
  ok: true;
  data: T;
  meta: Record<string, unknown>;
}

export interface ErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    hint?: string | null;
    valid_values?: unknown;
    details?: Record<string, unknown>;
  };
}
