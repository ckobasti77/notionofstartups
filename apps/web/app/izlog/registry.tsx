import type { ComponentType } from "react";

import BrziUnosEkran from "./ekrani/brzi-unos";
import IsplanirajEkran from "./ekrani/isplaniraj";
import LjuskaEkran from "./ekrani/ljuska";
import MojDanEkran from "./ekrani/moj-dan";
import PokretEkran from "./ekrani/pokret";

export type IzlogEkranProps = {
  /** Izabrana varijanta (prva iz `varijante` kad nije zadata; "" bez varijanti). */
  varijanta: string;
};

export type IzlogEkran = {
  naslov: string;
  /** Korak runa koji je dodao ekran. */
  korak: string;
  /** Stanja istog ekrana za zasebne snimke (`&varijanta=`); prva je podrazumevana. */
  varijante?: readonly string[];
  Komponenta: ComponentType<IzlogEkranProps>;
};

/**
 * Registar ekrana izloga. Korak dodaje ekran tako što napravi
 * `ekrani/<ime>.tsx` (samo prezentacione komponente + fixture) i doda
 * JEDAN red ovde. Izlog nikad ne zove `useQuery`.
 */
export const IZLOG_EKRANI: Record<string, IzlogEkran> = {
  pokret: { naslov: "Pokret — primitivi", korak: "K03", Komponenta: PokretEkran },
  ljuska: { naslov: "Ljuska — traka i meniji", korak: "K08", varijante: ["ja", "startup", "meni"], Komponenta: LjuskaEkran },
  "moj-dan": {
    naslov: "Moj dan",
    korak: "K10",
    varijante: ["obican", "prazan", "pretrpan", "po-startupu", "ucitavanje", "greska"],
    Komponenta: MojDanEkran,
  },
  "brzi-unos": { naslov: "Brzi unos", korak: "K10", varijante: ["licno", "startup", "greska"], Komponenta: BrziUnosEkran },
  isplaniraj: { naslov: "Isplaniraj dan", korak: "K10", varijante: ["obican", "prazan"], Komponenta: IsplanirajEkran },
};
