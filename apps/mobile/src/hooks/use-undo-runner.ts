import { useCallback } from 'react';
import { useMutation } from 'convex/react';

import { api } from '@/convex/_generated/api';
import type { UndoAction } from '@/lib/undo';

/**
 * Izvršava inverz jedne stavke poništavanja. Preseljeno IZ `components/undo-bar.tsx`
 * (PARITET-REVIZIJA C12) da ekran „Istorija radnji" (`app/(app)/istorija.tsx`) može
 * da poništava stariju stavku istim kodom kao traka — dva mesta koja rade isto bi se
 * vremenom razišla. Preseljenje je MEHANIČKO: nijedna grana ni redosled poziva nisu
 * menjani (23 `case` grane, isto kao unija `UndoAction`).
 */
export function useUndoRunner(): (action: UndoAction) => Promise<void> {
  const restoreNodes = useMutation(api.thoughts.restoreNodes);
  const restoreEdges = useMutation(api.thoughts.restoreEdges);
  const restoreIdea = useMutation(api.ideas.restoreOwn);
  const connectIdeas = useMutation(api.ideas.connect);
  const disconnectIdeas = useMutation(api.ideas.disconnect);
  const updateIdeaPositions = useMutation(api.ideas.updatePositions);
  const updateIdeaLayout = useMutation(api.ideas.updateLayout);
  const resetIdeaLayoutSize = useMutation(api.ideas.resetLayoutSize);
  const moveThoughtNodes = useMutation(api.thoughts.moveNodes);
  const updateThoughtLayout = useMutation(api.thoughts.updateNodeLayout);
  const resetThoughtLayoutSize = useMutation(api.thoughts.resetNodeLayoutSize);
  const archiveThoughtEdges = useMutation(api.thoughts.archiveEdges);
  const restoreCheckpoint = useMutation(api.taskCheckpoints.restoreOwn);
  const restoreContribution = useMutation(api.collaboration.restoreOwnContribution);
  const movePages = useMutation(api.areasV2.movePages);
  const resizePage = useMutation(api.areasV2.resizePage);
  const connectPages = useMutation(api.areasV2.connectPages);
  const disconnectPages = useMutation(api.areasV2.disconnectPages);
  const saveCheckpointPlacement = useMutation(api.taskCheckpoints.saveCanvasPlacement);
  const resetCheckpointCanvasSize = useMutation(api.taskCheckpoints.resetCanvasSize);
  const connectCheckpointEdge = useMutation(api.taskCheckpointCanvasEdges.connect);
  const disconnectCheckpointEdge = useMutation(api.taskCheckpointCanvasEdges.disconnect);
  const updatePage = useMutation(api.areasV2.updatePage);
  const movePage = useMutation(api.areasV2.movePage);
  const setChannelMembers = useMutation(api.chat.setChannelMembers);
  const archiveIdea = useMutation(api.ideas.archive);
  const archiveThoughtNodes = useMutation(api.thoughts.archiveNodes);

  return useCallback(
    async (action: UndoAction): Promise<void> => {
      switch (action.kind) {
        case 'thoughts':
          // Redosled je ugovor backenda: PRVO `restoreNodes` (sam vraća veze pale
          // uz čvor), PA `restoreEdges` — obrnuto baca „Obe misli moraju biti aktivne…".
          if (action.nodeIds.length > 0) await restoreNodes({ nodeIds: action.nodeIds });
          if (action.edgeIds.length > 0) await restoreEdges({ edgeIds: action.edgeIds });
          return;
        case 'idea':
          await restoreIdea({ startupId: action.startupId, ideaId: action.ideaId });
          return;
        case 'ideaEdge':
          // `connect` na postojećem pairKey OŽIVLJAVA arhiviranu vezu i ČUVA joj
          // label (`ideas.ts`), pa je ovo tačan inverz za `disconnect`.
          await connectIdeas({
            startupId: action.startupId,
            nodeAId: action.nodeAId,
            nodeBId: action.nodeBId,
          });
          return;
        case 'checkpoint':
          await restoreCheckpoint({ checkpointId: action.checkpointId });
          return;
        case 'contribution':
          await restoreContribution({ contributionId: action.contributionId });
          return;
        case 'pageMove':
          // Inverz poteza je isti poziv sa PRETHODNIM koordinatama (nema „restore"
          // mutacije za raspored). Server i ovde proverava vlasništvo kartice.
          if (action.updates.length > 0) {
            await movePages({
              startupId: action.startupId,
              areaId: action.areaId,
              rootPageId: action.rootPageId,
              updates: action.updates,
            });
          }
          // Isti potez je mogao da ponese i korake (K4) — server prima jedan po pozivu.
          // BEZ `width`/`height`: potez ih nije ni menjao, a `patch` bez njih ih čuva.
          for (const checkpoint of action.checkpoints ?? []) {
            await saveCheckpointPlacement({
              checkpointId: checkpoint.checkpointId,
              canvasRootPageId: action.rootPageId,
              x: checkpoint.x,
              y: checkpoint.y,
            });
          }
          return;
        case 'pageResize':
          // Inverz i za potez ručkom i za „Vrati podrazumevanu veličinu": isti poziv sa
          // dimenzijama od pre radnje. `x`/`y` idu samo ako su OBA poznata (potez ručkom
          // pomera i rub) — server odbija jedno bez drugog.
          await resizePage({
            startupId: action.startupId,
            areaId: action.areaId,
            rootPageId: action.rootPageId,
            pageId: action.pageId,
            width: action.width,
            height: action.height,
            ...(action.x !== undefined && action.y !== undefined
              ? { x: action.x, y: action.y }
              : {}),
          });
          return;
        case 'pageEdgeConnect':
          // Inverz pravljenja veze. Ako je server vratio TUĐU postojeću ivicu (neko je
          // isti par povezao u međuvremenu), ovo pukne sa „Možete ukloniti samo vezu
          // koju ste napravili." — traka tada ostaje i pokaže tu poruku.
          await disconnectPages({
            startupId: action.startupId,
            areaId: action.areaId,
            rootPageId: action.rootPageId,
            edgeId: action.edgeId,
          });
          return;
        case 'pageEdgeDisconnect':
          // `connectPages` NE oživljava arhiviranu ivicu, pa se pravi nova — sa istim
          // parom i istim nazivom (zato ga stavka i nosi).
          await connectPages({
            startupId: action.startupId,
            areaId: action.areaId,
            rootPageId: action.rootPageId,
            sourcePageId: action.sourcePageId,
            targetPageId: action.targetPageId,
            ...(action.label ? { label: action.label } : {}),
          });
          return;
        case 'checkpointResize':
          // USLOVAN inverz (§4 P5 plana K4): korak koji PRE radnje nije imao ručnu
          // veličinu se ne vraća samo dimenzijama — one bi ostale zauvek. Vrati poziciju,
          // pa obriši dimenzije; tek to je stanje od pre radnje. Desktop radi identično.
          if (action.manuallySized) {
            await saveCheckpointPlacement({
              checkpointId: action.checkpointId,
              canvasRootPageId: action.canvasRootPageId,
              x: action.x,
              y: action.y,
              width: action.width,
              height: action.height,
            });
            return;
          }
          await saveCheckpointPlacement({
            checkpointId: action.checkpointId,
            canvasRootPageId: action.canvasRootPageId,
            x: action.x,
            y: action.y,
          });
          await resetCheckpointCanvasSize({
            checkpointId: action.checkpointId,
            canvasRootPageId: action.canvasRootPageId,
          });
          return;
        case 'checkpointEdgeConnect':
          // Ako je server vratio TUĐU postojeću ivicu (neko je isti par povezao u
          // međuvremenu), ovo pukne sa „Možete ukloniti samo vezu koju ste napravili." —
          // traka tada ostaje i pokaže poruku.
          await disconnectCheckpointEdge({
            startupId: action.startupId,
            areaId: action.areaId,
            rootPageId: action.rootPageId,
            edgeId: action.edgeId,
          });
          return;
        case 'checkpointEdgeDisconnect':
          // `connect` NE oživljava arhiviranu ivicu (indeks traži `archivedAt: null`),
          // pa se pravi NOVA — sa istim parom endpointa.
          await connectCheckpointEdge({
            startupId: action.startupId,
            areaId: action.areaId,
            rootPageId: action.rootPageId,
            source: action.source,
            target: action.target,
          });
          return;
        case 'ideaMove':
          // Inverz poteza je isti poziv sa PRETHODNIM (stored) koordinatama.
          if (action.updates.length > 0) {
            await updateIdeaPositions({
              startupId: action.startupId,
              updates: action.updates,
            });
          }
          return;
        case 'ideaResize':
          // USLOVAN inverz: kartica koja pre poteza nije imala ručnu veličinu mora da
          // je i IZGUBI, inače ostaje ručno dimenzionisana zauvek. `resetLayoutSize`
          // ne dira poziciju, pa se ona vraća zasebno.
          if (action.manuallySized) {
            await updateIdeaLayout({
              startupId: action.startupId,
              ideaId: action.ideaId,
              x: action.x,
              y: action.y,
              width: action.width,
              height: action.height,
            });
            return;
          }
          await updateIdeaPositions({
            startupId: action.startupId,
            updates: [{ id: action.ideaId, x: action.x, y: action.y }],
          });
          await resetIdeaLayoutSize({
            startupId: action.startupId,
            ideaId: action.ideaId,
          });
          return;
        case 'ideaEdgeConnect':
          await disconnectIdeas({
            startupId: action.startupId,
            edgeId: action.edgeId,
          });
          return;
        case 'thoughtMove':
          if (action.moves.length > 0) await moveThoughtNodes({ moves: action.moves });
          return;
        case 'thoughtResize':
          if (action.manuallySized) {
            await updateThoughtLayout({
              nodeId: action.nodeId,
              x: action.x,
              y: action.y,
              width: action.width,
              height: action.height,
            });
            return;
          }
          await moveThoughtNodes({
            moves: [{ nodeId: action.nodeId, x: action.x, y: action.y }],
          });
          await resetThoughtLayoutSize({ nodeId: action.nodeId });
          return;
        case 'thoughtEdgeConnect':
          // Inverz PRAVLJENJA veze je arhiviranje — ne `restoreEdges`.
          await archiveThoughtEdges({ edgeIds: [action.edgeId] });
          return;
        case 'channelMembers':
          // Inverz je ISTI poziv sa spiskom od pre izmene. Ako je kanal u
          // međuvremenu arhiviran ili je neko izgubio članstvo u startupu, ovo baci
          // serversku poruku — traka tada namerno OSTAJE (ista konvencija kao gore).
          await setChannelMembers({
            channelId: action.channelId,
            memberProfileIds: action.profileIds,
          });
          return;
        case 'pageRename':
          // Ako je neko u međuvremenu izmenio stranicu, ovo baci `KONFLIKT_IZMENA` —
          // traka tada namerno OSTAJE i pokaže poruku (ista konvencija kao gore).
          await updatePage({
            startupId: action.startupId,
            pageId: action.pageId,
            expectedRevision: action.expectedRevision,
            title: action.title,
          });
          return;
        case 'pageReparent':
          // Inverz premeštanja/ugnježdavanja je ISTI poziv sa mestom od PRE radnje.
          // Ako je ciljni roditelj u međuvremenu arhiviran ili je stranica dobila
          // tuđeg roditelja, poziv baci serversku poruku — traka tada namerno
          // OSTAJE (ista konvencija kao gore). Vraća se mesto, ne arhivirane ivice.
          await movePage({
            startupId: action.startupId,
            pageId: action.pageId,
            targetAreaId: action.targetAreaId,
            targetParentPageId: action.targetParentPageId,
          });
          return;
        case 'ideaCreate':
          // Inverz NOVE ideje (duplikat, „nova grana") je arhiviranje — `archive` usput
          // arhivira i sve ivice te ideje, pa grana nema poseban član.
          await archiveIdea({ startupId: action.startupId, ideaId: action.ideaId });
          return;
        case 'thoughtCreate':
          // Inverz NOVE misli („nova povezana misao") je arhiviranje — `archiveNodes`
          // usput arhivira i ivicu ka izvoru.
          await archiveThoughtNodes({ nodeIds: [action.nodeId] });
          return;
      }
    },
    [
      restoreNodes,
      restoreEdges,
      restoreIdea,
      connectIdeas,
      disconnectIdeas,
      updateIdeaPositions,
      updateIdeaLayout,
      resetIdeaLayoutSize,
      moveThoughtNodes,
      updateThoughtLayout,
      resetThoughtLayoutSize,
      archiveThoughtEdges,
      restoreCheckpoint,
      restoreContribution,
      movePages,
      resizePage,
      connectPages,
      disconnectPages,
      saveCheckpointPlacement,
      resetCheckpointCanvasSize,
      connectCheckpointEdge,
      disconnectCheckpointEdge,
      updatePage,
      movePage,
      setChannelMembers,
      archiveIdea,
      archiveThoughtNodes,
    ],
  );
}
