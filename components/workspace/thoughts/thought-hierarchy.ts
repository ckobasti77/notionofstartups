export function isThoughtDescendant<NodeId extends string>(
  candidateId: NodeId,
  ancestorId: NodeId,
  nodesById: ReadonlyMap<NodeId, { parentThoughtId?: NodeId }>,
) {
  let currentId: NodeId | undefined = candidateId;
  const visited = new Set<NodeId>();

  while (currentId !== undefined && !visited.has(currentId)) {
    visited.add(currentId);
    const parentId: NodeId | undefined =
      nodesById.get(currentId)?.parentThoughtId;
    if (parentId === ancestorId) return true;
    currentId = parentId;
  }

  return false;
}
