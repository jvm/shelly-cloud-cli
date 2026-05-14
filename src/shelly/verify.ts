import type { DeviceState } from '../types.js';

export type ControlKind = 'switch' | 'cover' | 'light';

export interface VerificationResult {
  verified: boolean | null;
  status?: string;
  warning?: string;
  expected?: unknown;
  actual?: unknown;
  checks?: Record<string, boolean>;
}

export function verifyDeviceState(kind: ControlKind, device: DeviceState | undefined, channel: number, command: Record<string, unknown>): VerificationResult {
  const status = device?.status;
  if (!status) return { verified: null, status: 'unknown_shape', warning: 'Device status was not present in verification response.' };
  if (kind === 'switch') return verifySwitch(status, channel, command);
  if (kind === 'cover') return verifyCover(status, channel, command);
  return verifyLight(status, channel, command);
}

function verifySwitch(status: Record<string, unknown>, channel: number, command: Record<string, unknown>): VerificationResult {
  const component = status[`switch:${channel}`];
  if (!component || typeof component !== 'object' || typeof (component as { output?: unknown }).output !== 'boolean' || typeof command.on !== 'boolean') return { verified: null, status: 'unknown_shape' };
  const actual = (component as { output: boolean }).output;
  return { verified: actual === command.on, expected: command.on, actual };
}

function verifyCover(status: Record<string, unknown>, channel: number, command: Record<string, unknown>): VerificationResult {
  const component = status[`cover:${channel}`];
  if (!component || typeof component !== 'object') return { verified: null, status: 'unknown_shape' };
  const cover = component as { current_pos?: unknown; state?: unknown };
  if (typeof command.position === 'number' && typeof cover.current_pos === 'number') return { verified: cover.current_pos === command.position, expected: command.position, actual: cover.current_pos };
  if (typeof command.position === 'string' && typeof cover.state === 'string') {
    const expectedState = command.position === 'stop' ? 'stopped' : command.position;
    return { verified: cover.state === expectedState, expected: expectedState, actual: cover.state };
  }
  return { verified: null, status: 'unknown_shape' };
}

function verifyLight(status: Record<string, unknown>, channel: number, command: Record<string, unknown>): VerificationResult {
  const component = status[`light:${channel}`];
  if (!component || typeof component !== 'object') return { verified: null, status: 'unknown_shape' };
  const light = component as Record<string, unknown>;
  const checks: Record<string, boolean> = {};
  for (const [expectedKey, actualKey] of [['on', 'output'], ['brightness', 'brightness']] as const) {
    if (command[expectedKey] !== undefined && light[actualKey] !== undefined) checks[expectedKey] = light[actualKey] === command[expectedKey];
  }
  const values = Object.values(checks);
  if (!values.length) return { verified: null, status: 'unknown_shape' };
  return { verified: values.every(Boolean), checks };
}
