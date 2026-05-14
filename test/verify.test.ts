import { describe, expect, test } from 'bun:test';
import { verifyDeviceState } from '../src/shelly/verify.js';

describe('verifyDeviceState', () => {
  test('verifies switch success and mismatch', () => {
    const device = { id: 'abc', status: { 'switch:0': { output: true } } };
    expect(verifyDeviceState('switch', device, 0, { on: true }).verified).toBe(true);
    expect(verifyDeviceState('switch', device, 0, { on: false }).verified).toBe(false);
  });

  test('verifies cover position and state', () => {
    expect(verifyDeviceState('cover', { id: 'abc', status: { 'cover:0': { current_pos: 50 } } }, 0, { position: 50 }).verified).toBe(true);
    const stopped = verifyDeviceState('cover', { id: 'abc', status: { 'cover:0': { state: 'stopped' } } }, 0, { position: 'stop' });
    expect(stopped.verified).toBe(true);
    expect(stopped.expected).toBe('stopped');
  });

  test('verifies light common fields', () => {
    const result = verifyDeviceState('light', { id: 'abc', status: { 'light:0': { output: true, brightness: 75 } } }, 0, { on: true, brightness: 75 });
    expect(result.verified).toBe(true);
    expect(result.checks).toEqual({ on: true, brightness: true });
  });

  test('reports unknown shape as null', () => {
    expect(verifyDeviceState('switch', { id: 'abc', status: {} }, 0, { on: true }).verified).toBeNull();
    expect(verifyDeviceState('light', undefined, 0, { on: true }).status).toBe('unknown_shape');
  });
});
