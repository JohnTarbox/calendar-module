import { describe, it, expect } from 'vitest';
import { resolveKey, AVAILABLE_VIEWS } from './keyboard.js';

/**
 * Custom-view activation (AVS §5): the `x`/`4` shortcut is INERT in v1 (Custom not built yet) and
 * LIVE in v2. Asserts the phase gating that lets the same skin ship Custom dark in v1 and lit in v2.
 */
describe('Custom view shortcut activation (AVS §5)', () => {
  it('x / 4 are inert in v1 (Custom absent from the switcher)', () => {
    expect(resolveKey('x', 'v1')).toEqual({ kind: 'inert' });
    expect(resolveKey('4', 'v1')).toEqual({ kind: 'inert' });
    expect(AVAILABLE_VIEWS.v1).not.toContain('custom');
  });

  it('x / 4 switch to Custom in v2', () => {
    expect(resolveKey('x', 'v2')).toEqual({ kind: 'switchView', view: 'custom' });
    expect(resolveKey('4', 'v2')).toEqual({ kind: 'switchView', view: 'custom' });
    expect(AVAILABLE_VIEWS.v2).toContain('custom');
  });

  it('week / day shortcuts also light up only in v2', () => {
    expect(resolveKey('w', 'v1')).toEqual({ kind: 'inert' });
    expect(resolveKey('w', 'v2')).toEqual({ kind: 'switchView', view: 'week' });
    expect(resolveKey('d', 'v2')).toEqual({ kind: 'switchView', view: 'day' });
  });
});
