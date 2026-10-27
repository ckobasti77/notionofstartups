/**
 * Dozvole čipova, koraka i instrukcija zadatka iz `permissions` stranice
 * (PROSTOR P1/P14, plan K07 §5.7) — blizanac web `task-page-model.ts ›
 * taskPermissionsOf`. Klijent ne računa „autor" sam (R16): otključan zadatak
 * menja svaki član; na zaključanom menjaju autor, vlasnik i admin (`canEdit`), a
 * izvršilac samo status (D5); kvačicu koraka dobija od servera po koraku
 * (`canToggle`). Ostali dobijaju katanac sa razlogom.
 * `canChangeStatus` (`pages.get`) je istina servera za status — spisak izvršilaca
 * koji klijent vidi može da izostavi člana koga server ne prikazuje.
 */
import { PERMISSION_REASONS, taskPermissions, type TaskPermissions } from '@devotion/shared';

export function taskPermissionsOf(
  permissions: { isLocked: boolean; canEdit: boolean; canChangeStatus?: boolean },
  isAssignee: boolean,
): TaskPermissions {
  const result = taskPermissions({
    kind: 'task',
    isCreator: false,
    isAssignee,
    lockedForViewer: permissions.isLocked && !permissions.canEdit,
  });
  if (
    permissions.canChangeStatus === undefined ||
    permissions.canChangeStatus === result.status.allowed
  ) {
    return result;
  }
  return {
    ...result,
    status: permissions.canChangeStatus
      ? { allowed: true, reason: null }
      : { allowed: false, reason: PERMISSION_REASONS.lockedStatus },
  };
}
