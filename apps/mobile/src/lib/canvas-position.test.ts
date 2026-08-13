import { describe, expect, it } from 'vitest';

import { absoluteNodePosition } from './canvas-position';

type Node = { _id: string; x: number; y: number; parentId?: string };

const parentOf = (node: Node) => node.parentId;

describe('absoluteNodePosition', () => {
  it('vraća sopstvene koordinate za top-level čvor', () => {
    const nodes: Node[] = [{ _id: 'a', x: 10, y: 20 }];
    expect(absoluteNodePosition(nodes, 'a', parentOf)).toEqual({ x: 10, y: 20, complete: true });
  });

  it('sabira jedan nivo ugnježdenja', () => {
    const nodes: Node[] = [
      { _id: 'parent', x: 100, y: 200 },
      { _id: 'child', x: 10, y: 20, parentId: 'parent' },
    ];
    expect(absoluteNodePosition(nodes, 'child', parentOf)).toEqual({
      x: 110,
      y: 220,
      complete: true,
    });
  });

  it('sabira dva nivoa ugnježdenja', () => {
    const nodes: Node[] = [
      { _id: 'grandparent', x: 1000, y: 2000 },
      { _id: 'parent', x: 100, y: 200, parentId: 'grandparent' },
      { _id: 'child', x: 10, y: 20, parentId: 'parent' },
    ];
    expect(absoluteNodePosition(nodes, 'child', parentOf)).toEqual({
      x: 1110,
      y: 2220,
      complete: true,
    });
  });

  it('roditelj koji nije u listi daje complete:false', () => {
    const nodes: Node[] = [{ _id: 'child', x: 10, y: 20, parentId: 'missing-parent' }];
    const result = absoluteNodePosition(nodes, 'child', parentOf);
    expect(result.complete).toBe(false);
  });

  it('ciklus se prekida i ne visi', () => {
    const nodes: Node[] = [
      { _id: 'a', x: 1, y: 1, parentId: 'b' },
      { _id: 'b', x: 2, y: 2, parentId: 'a' },
    ];
    const result = absoluteNodePosition(nodes, 'a', parentOf);
    expect(result.complete).toBe(false);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });

  it('nepoznat id daje complete:false', () => {
    const nodes: Node[] = [{ _id: 'a', x: 10, y: 20 }];
    expect(absoluteNodePosition(nodes, 'nepostojeci', parentOf)).toEqual({
      x: 0,
      y: 0,
      complete: false,
    });
  });
});
