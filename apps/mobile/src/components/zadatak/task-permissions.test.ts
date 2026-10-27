import { PERMISSION_REASONS } from '@devotion/shared';
import { describe, expect, it } from 'vitest';

import { taskPermissionsOf } from './task-permissions';

describe('dozvole zadatka iz permissions stranice', () => {
  it('otključan zadatak menja svaki član, i ko nije izvršilac', () => {
    const result = taskPermissionsOf({ isLocked: false, canEdit: true, canChangeStatus: true }, false);
    expect(result.status.allowed).toBe(true);
    expect(result.priority.allowed).toBe(true);
    expect(result.due.allowed).toBe(true);
    expect(result.instructions.allowed).toBe(true);
    expect(result.checkpoints.allowed).toBe(true);
  });

  it('zaključan: autor/vlasnik/admin (canEdit) menjaju sve', () => {
    const result = taskPermissionsOf({ isLocked: true, canEdit: true, canChangeStatus: true }, false);
    expect(result.priority.allowed).toBe(true);
    expect(result.instructions.allowed).toBe(true);
  });

  it('zaključan: izvršilac menja samo status, ostalo ima razlog (korake završava kroz canToggle reda)', () => {
    const result = taskPermissionsOf({ isLocked: true, canEdit: false, canChangeStatus: true }, true);
    expect(result.status.allowed).toBe(true);
    // Dodavanje i uređivanje koraka je zaključano; kvačica po koraku je zastavica servera (canToggle).
    expect(result.checkpoints.allowed).toBe(false);
    expect(result.priority.allowed).toBe(false);
    expect(result.priority.reason).toBeTruthy();
    expect(result.instructions.allowed).toBe(false);
  });

  it('zaključan: neizvršilac ne menja ni status, uz razlog zaključavanja', () => {
    const result = taskPermissionsOf({ isLocked: true, canEdit: false, canChangeStatus: false }, false);
    expect(result.status).toEqual({ allowed: false, reason: PERMISSION_REASONS.lockedStatus });
  });

  it('canChangeStatus sa servera nadjačava spisak izvršilaca koji klijent vidi', () => {
    // Spisak ne sadrži člana, ali server kaže da sme.
    const allowed = taskPermissionsOf({ isLocked: true, canEdit: false, canChangeStatus: true }, false);
    expect(allowed.status).toEqual({ allowed: true, reason: null });
    // Spisak sadrži člana, ali server kaže da ne sme.
    const denied = taskPermissionsOf({ isLocked: true, canEdit: false, canChangeStatus: false }, true);
    expect(denied.status.allowed).toBe(false);
  });
});
