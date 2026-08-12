import type { Id } from '@/convex/_generated/dataModel';

/**
 * Kraj checkpoint veze na kanvasu (K4) — isti oblik kao serverski
 * `taskCheckpointCanvasEndpointValidator` (`packages/backend/convex/lib/validators.ts`).
 * Veza sme da spoji korak sa korakom ILI korak sa karticom, ali nikad karticu sa
 * karticom — to je `areasV2.connectPages`, druga tabela i druga mutacija.
 *
 * Zašto zaseban modul: tip treba i traci „Poništi" (`lib/undo.ts`) i deljenoj sekciji
 * veza (`components/canvas/node-edges-section.tsx`). Da živi u jednom od njih, drugi bi
 * uvozio iz `components/` u `lib/` (ili obrnuto) i napravio kružnu zavisnost.
 */
export type CheckpointEndpoint =
  | { kind: 'page'; id: Id<'pages'> }
  | { kind: 'task_checkpoint'; id: Id<'taskCheckpoints'> };
