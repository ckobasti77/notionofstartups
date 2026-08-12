import { useMutation } from 'convex/react';
import { Minus, Plus, RotateCcw } from 'lucide-react-native';
import { Alert } from 'react-native';

import { NodeSizeSection, type SizeOption } from '@/components/canvas/node-size-section';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { clampPageNodeSize, PAGE_NODE_SIZE } from '@/lib/canvas-node-size';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Kartica čiju veličinu menjamo. Sve stiže uz `node:actions` / `selection` poruku iz
 * embeda (`PageNodeDetail`) — native ovde ne radi nijedan dodatni upit.
 */
export type PageSizeTarget = {
  _id: Id<'pages'>;
  title: string;
  canResize: boolean;
  width: number;
  height: number;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  rootPageId: Id<'pages'> | null;
};

/** Korak za „Umanji" / „Uvećaj" — dovoljno da se vidi, dovoljno malo da se ne preskoči. */
const STEP = 0.1;

/**
 * Veličina kartice stranice na kanvasu — native put koji ne traži precizan prst
 * (K2, `docs/mobile/lanac4/planovi/faza-k2.md`). Od K3 to više nije sopstveni sheet
 * nego SEKCIJA u sheet-u „Akcije kartice" (`page-node-sheet.tsx`), koji otvara dugi
 * pritisak na karticu u režimu „Uredi raspored" ili četvrta ikonica rail-a.
 *
 * „Umanji / Uvećaj" nisu ukras: to je JEDINI put do veličine za čitač ekrana i za mali
 * zum, gde se ugaone ručke namerno ne crtaju (kartica bi nestala pod četiri mete od
 * 44pt). „Vrati podrazumevanu veličinu" je parnjak desktop stavke u toolbar-u čvora.
 *
 * Sve tri radnje pišu u bazu i sve tri imaju „Poništi" — kroz POSTOJEĆU traku
 * (`lib/undo.ts`, član `pageResize`), ne kroz drugu površinu. Klamp je klijentski da
 * se ne šalje poziv koji bi server ionako odsekao, ali server ostaje merodavan.
 *
 * `busy` živi u RODITELJU: veličina i veze dele jednu bravu, jer se u istom sheet-u
 * ne smeju okinuti jedna preko druge.
 *
 * Od K4 je ovo ADAPTER: prikaz (naslov sekcije, redovi, prazna stanja, brava, dodirne
 * mete) živi u deljenom `NodeSizeSection`, koji koristi i sheet checkpoint oblačića.
 * Tekstovi, redosled redova i mutacije su ostali nepromenjeni.
 */
export function PageSizeSection({
  page,
  busy,
  setBusy,
  onClose,
  onApplied,
}: {
  page: PageSizeTarget;
  /** Ključ reda koji je u toku, ili `null` — jedna brava za ceo sheet. */
  busy: string | null;
  setBusy: (key: string | null) => void;
  onClose: () => void;
  /** Nova veličina posle uspešne izmene — pozivalac osvežava svoj `selectedNode`. */
  onApplied?: (width: number, height: number) => void;
}) {
  const colors = useThemeColors();
  const resizePage = useMutation(api.areasV2.resizePage);
  const resetPageSize = useMutation(api.areasV2.resetPageSize);

  /** Zajednički omotač: brava, haptika, poruka greške, zatvaranje po uspehu. */
  const run = async (key: string, action: () => Promise<void>) => {
    if (busy !== null) return;
    setBusy(key);
    haptics.tap();
    try {
      await action();
      haptics.success();
      onClose();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Veličina kartice nije promenjena.'));
    } finally {
      setBusy(null);
    }
  };

  const scale = (factor: number, key: string) => {
    const next = clampPageNodeSize(page.width * factor, page.height * factor);
    if (next.width === page.width && next.height === page.height) {
      // Već na granici: tiho slanje poziva koji ništa ne menja bi izgledalo kao kvar.
      haptics.warning();
      Alert.alert(
        'Granica veličine',
        factor < 1
          ? `Kartica je već najmanja moguća (${PAGE_NODE_SIZE.minWidth} × ${PAGE_NODE_SIZE.minHeight}).`
          : `Kartica je već najveća moguća (${PAGE_NODE_SIZE.maxWidth} × ${PAGE_NODE_SIZE.maxHeight}).`,
      );
      return;
    }
    const before = { width: page.width, height: page.height };
    void run(key, async () => {
      await resizePage({
        startupId: page.startupId,
        areaId: page.areaId,
        rootPageId: page.rootPageId,
        pageId: page._id,
        width: next.width,
        height: next.height,
      });
      // Bez `x`/`y`: sheet menja samo veličinu, kartica ostaje gde jeste.
      pushUndo({
        label: `Veličina kartice: ${next.width} × ${next.height}.`,
        action: {
          kind: 'pageResize',
          startupId: page.startupId,
          areaId: page.areaId,
          rootPageId: page.rootPageId,
          pageId: page._id,
          width: before.width,
          height: before.height,
        },
      });
      onApplied?.(next.width, next.height);
    });
  };

  const reset = () => {
    const before = { width: page.width, height: page.height };
    void run('reset', async () => {
      await resetPageSize({
        startupId: page.startupId,
        areaId: page.areaId,
        rootPageId: page.rootPageId,
        pageId: page._id,
      });
      // Inverz reseta je `resizePage` sa starim dimenzijama — isto što radi desktop.
      pushUndo({
        label: 'Vraćena je podrazumevana veličina kartice.',
        action: {
          kind: 'pageResize',
          startupId: page.startupId,
          areaId: page.areaId,
          rootPageId: page.rootPageId,
          pageId: page._id,
          width: before.width,
          height: before.height,
        },
      });
      onApplied?.(PAGE_NODE_SIZE.defaultWidth, PAGE_NODE_SIZE.defaultHeight);
    });
  };

  const isDefault =
    page.width === PAGE_NODE_SIZE.defaultWidth && page.height === PAGE_NODE_SIZE.defaultHeight;

  const options: SizeOption[] = [
    {
      key: 'smaller',
      title: 'Umanji',
      subtitle: `Za 10% — najmanje ${PAGE_NODE_SIZE.minWidth} × ${PAGE_NODE_SIZE.minHeight}`,
      icon: <Minus size={20} color={colors.mutedForeground} />,
      onPress: () => scale(1 - STEP, 'smaller'),
    },
    {
      key: 'bigger',
      title: 'Uvećaj',
      subtitle: `Za 10% — najviše ${PAGE_NODE_SIZE.maxWidth} × ${PAGE_NODE_SIZE.maxHeight}`,
      icon: <Plus size={20} color={colors.mutedForeground} />,
      onPress: () => scale(1 + STEP, 'bigger'),
    },
    {
      key: 'reset',
      title: 'Vrati podrazumevanu veličinu',
      titleNumberOfLines: 2,
      subtitle: `${PAGE_NODE_SIZE.defaultWidth} × ${PAGE_NODE_SIZE.defaultHeight}`,
      icon: <RotateCcw size={20} color={colors.mutedForeground} />,
      disabled: isDefault,
      onPress: reset,
    },
  ];

  return (
    <NodeSizeSection
      canResize={page.canResize}
      deniedNote="Veličinu može da menja autor kartice."
      options={options}
      note={isDefault ? 'Kartica je već u podrazumevanoj veličini.' : undefined}
      hint={
        'U režimu „Uredi raspored" veličinu možeš da menjaš i prevlačenjem tačaka u ' +
        'uglovima izabrane kartice.'
      }
      busy={busy}
    />
  );
}
