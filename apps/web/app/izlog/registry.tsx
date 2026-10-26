import type { ComponentType } from "react";

import BiracDatumaEkran from "./ekrani/birac-datuma";
import BrziUnosEkran from "./ekrani/brzi-unos";
import InboxEkran from "./ekrani/inbox";
import IstorijaIzmenaEkran from "./ekrani/istorija-izmena";
import KomentariEkran from "./ekrani/komentari";
import IsplanirajEkran from "./ekrani/isplaniraj";
import KorpaEkran from "./ekrani/korpa";
import LjuskaEkran from "./ekrani/ljuska";
import LjuskaStartupEkran from "./ekrani/ljuska-startup";
import MojDanEkran from "./ekrani/moj-dan";
import MojiZadaciEkran from "./ekrani/moji-zadaci";
import PanelZadatkaEkran from "./ekrani/panel-zadatka";
import PokretEkran from "./ekrani/pokret";
import PorukeEkran from "./ekrani/poruke";
import StranicaEkran from "./ekrani/stranica";
import ZadaciStartupEkran from "./ekrani/zadaci-startup";

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
  "moji-zadaci": {
    naslov: "Moji zadaci",
    korak: "K11",
    varijante: ["obican", "filteri", "prazan", "bez-rezultata", "ucitavanje"],
    Komponenta: MojiZadaciEkran,
  },
  "panel-zadatka": { naslov: "Panel zadatka", korak: "K11", varijante: ["kreator", "clan", "licni", "prebaci"], Komponenta: PanelZadatkaEkran },
  "birac-datuma": { naslov: "Birač datuma", korak: "K11", varijante: ["otvoren", "izabran"], Komponenta: BiracDatumaEkran },
  inbox: {
    naslov: "Inbox",
    korak: "K14",
    varijante: ["mesano", "neprocitano", "ceka-tebe", "prazno", "ucitavanje", "greska", "ceka-tebe-ucitavanje", "ceka-tebe-greska"],
    Komponenta: InboxEkran,
  },
  poruke: {
    naslov: "Poruke",
    korak: "K15",
    varijante: ["hub", "lista", "startup-kanal", "prazan", "nova-poruka", "nova-grupa", "podesavanja-grupe", "ucitavanje", "greska", "nova-poruka-ucitavanje"],
    Komponenta: PorukeEkran,
  },
  "zadaci-startup": {
    naslov: "Zadaci u startupu",
    korak: "K17",
    varijante: ["komandni-centar", "tabla", "brzo-pravljenje", "detalj", "prazan", "ucitavanje"],
    Komponenta: ZadaciStartupEkran,
  },
  "ljuska-startup": {
    naslov: "Ljuska startupa — meni (PROSTOR)",
    korak: "K08",
    varijante: ["meni", "clan", "mobilni-meni"],
    Komponenta: LjuskaStartupEkran,
  },
  korpa: {
    naslov: "Korpa",
    korak: "K08",
    varijante: ["stranice", "ideje", "prilozi", "oporavljeno", "prazna", "ucitavanje", "greska"],
    Komponenta: KorpaEkran,
  },
  stranica: {
    naslov: "Stranica — dokument tima",
    korak: "K10",
    varijante: ["clan", "zakljucana-autor", "zakljucana-clan", "konflikt", "prisustvo", "tabela", "fajl", "ucitavanje", "obrisana", "greska"],
    Komponenta: StranicaEkran,
  },
  komentari: {
    naslov: "Komentari",
    korak: "K10",
    varijante: ["lista", "pominjanje", "izmena", "prazno", "greska", "ucitavanje"],
    Komponenta: KomentariEkran,
  },
  "istorija-izmena": {
    naslov: "Istorija izmena",
    korak: "K10",
    varijante: ["lista", "pregled", "potvrda", "zakljucano", "prazno", "ucitavanje", "greska"],
    Komponenta: IstorijaIzmenaEkran,
  },
};
