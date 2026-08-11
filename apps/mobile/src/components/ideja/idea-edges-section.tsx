import { Link2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import {
  ideaDisplayTitle,
  type IdeaListEdge,
  type IdeaListNode,
} from '@/components/ideja/idea-actions-sheet';
import type { IdeaEdgeDetail } from '@/components/ideja/idea-edge-sheet';
import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import type { Id } from '@/convex/_generated/dataModel';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { radius } from '@/theme/tokens';

/**
 * Sekcija „Veze" na detalju ideje (PARITET A4) — direktne veze ove ideje, red po
 * vezi (naslov druge strane + naziv veze). Podaci su VEĆ u pretplati ekrana
 * (`ideas.list`), nema drugog upita. Bez veza nema ni sekcije (kao detalj misli):
 * prazna sekcija bi samo gurala Diskusiju niže, a „Poveži sa idejom…" postoji u
 * „…" meniju.
 */
export function IdeaEdgesSection({
  ideaId,
  nodes,
  edges,
  onOpenEdge,
}: {
  ideaId: Id<'ideaNodes'>;
  nodes: IdeaListNode[];
  edges: IdeaListEdge[];
  onOpenEdge: (detail: IdeaEdgeDetail) => void;
}) {
  const colors = useThemeColors();

  const titlesById = useMemo(
    () => new Map(nodes.map((node) => [node._id, ideaDisplayTitle(node)])),
    [nodes],
  );
  const connections = useMemo(
    () =>
      edges
        .filter((edge) => edge.nodeAId === ideaId || edge.nodeBId === ideaId)
        .map((edge) => ({
          edge,
          otherId: edge.nodeAId === ideaId ? edge.nodeBId : edge.nodeAId,
        })),
    [edges, ideaId],
  );

  if (connections.length === 0) return null;

  return (
    <>
      <SectionHeader title="Veze" count={connections.length} style={styles.header} />
      {connections.map(({ edge, otherId }) => {
        const otherTitle = titlesById.get(otherId) ?? 'Ideja';
        return (
          <Row
            key={edge._id}
            style={styles.row}
            icon={<Link2 size={20} color={colors.mutedForeground} />}
            title={otherTitle}
            titleNumberOfLines={2}
            subtitle={edge.label ?? undefined}
            onPress={() => {
              haptics.tap();
              onOpenEdge({ edge, otherTitle, otherId });
            }}
            accessibilityLabel={`Veza sa: ${otherTitle}${edge.label ? `, ${edge.label}` : ''}`}
            accessibilityHint="Otvara uređivanje veze."
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: 8,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 0,
    paddingVertical: 4,
    borderRadius: radius.control,
  },
});
