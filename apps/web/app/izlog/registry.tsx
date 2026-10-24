import type { ComponentType } from "react";

import PokretEkran from "./ekrani/pokret";

export type IzlogEkran = {
  naslov: string;
  /** Korak runa koji je dodao ekran. */
  korak: string;
  Komponenta: ComponentType;
};

/**
 * Registar ekrana izloga. Korak dodaje ekran tako što napravi
 * `ekrani/<ime>.tsx` (samo prezentacione komponente + fixture) i doda
 * JEDAN red ovde. Izlog nikad ne zove `useQuery`.
 */
export const IZLOG_EKRANI: Record<string, IzlogEkran> = {
  pokret: { naslov: "Pokret — primitivi", korak: "K03", Komponenta: PokretEkran },
};
