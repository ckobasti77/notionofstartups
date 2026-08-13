import { describe, expect, it } from 'vitest';

import {
  MAX_PAGE_FILE_BYTES,
  MAX_PAGE_FILES,
  MAX_PAGE_MEDIA_BYTES,
} from '@/convex/lib/page_files';
import { planPageFilePicks, rejectedPicksMessage } from '@/lib/page-file-picks';

const MB = 1024 * 1024;

describe('planPageFilePicks', () => {
  it('T1 — podržan fajl u granicama prolazi', () => {
    const plan = planPageFilePicks({
      existingCount: 0,
      picked: [{ name: 'slika.jpg', mimeType: 'image/jpeg', size: 2 * MB }],
    });
    expect(plan.accepted).toHaveLength(1);
    expect(plan.rejected).toEqual([]);
  });

  it('T2 — prevelik video pada na medijskoj granici, ne na opštoj', () => {
    // Video ima širu granicu (200 MB) — 60 MB mora da PROĐE, a 210 MB da padne.
    const plan = planPageFilePicks({
      existingCount: 0,
      picked: [
        { name: 'kratak.mp4', mimeType: 'video/mp4', size: 60 * MB },
        { name: 'dugacak.mp4', mimeType: 'video/mp4', size: MAX_PAGE_MEDIA_BYTES + 1 },
      ],
    });
    expect(plan.accepted.map((item) => item.name)).toEqual(['kratak.mp4']);
    expect(plan.rejected).toEqual([
      { name: 'dugacak.mp4', reason: 'veći od 200 MB' },
    ]);
  });

  it('T3 — prevelik dokument pada na opštoj granici od 50 MB', () => {
    const plan = planPageFilePicks({
      existingCount: 0,
      picked: [{ name: 'ugovor.pdf', mimeType: 'application/pdf', size: MAX_PAGE_FILE_BYTES + 1 }],
    });
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toEqual([{ name: 'ugovor.pdf', reason: 'veći od 50 MB' }]);
  });

  it('T4 — nepodržan tip se odbija i imenuje tip', () => {
    const plan = planPageFilePicks({
      existingCount: 0,
      picked: [{ name: 'app.exe', mimeType: 'application/x-msdownload', size: 1024 }],
    });
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected[0].reason).toContain('tip nije podržan');
  });

  it('T5 — `size: null` NE odbija fajl (Android galerija)', () => {
    const plan = planPageFilePicks({
      existingCount: 0,
      picked: [{ name: 'IMG_0042.HEIC', mimeType: '', size: null }],
    });
    // Prazan mimeType → kategorija se izvodi iz ekstenzije (`heic` = slika).
    expect(plan.accepted).toHaveLength(1);
    expect(plan.rejected).toEqual([]);
  });

  it('T6 — kapacitet: višak preko MAX_PAGE_FILES se odseca i PRIJAVI', () => {
    const picked = Array.from({ length: 4 }, (_, index) => ({
      name: `f${index}.jpg`,
      mimeType: 'image/jpeg',
      size: MB,
    }));
    const plan = planPageFilePicks({
      existingCount: MAX_PAGE_FILES - 2,
      picked,
    });
    expect(plan.accepted.map((item) => item.name)).toEqual(['f0.jpg', 'f1.jpg']);
    expect(plan.rejected.map((item) => item.name)).toEqual(['f2.jpg', 'f3.jpg']);
    expect(plan.rejected[0].reason).toContain(String(MAX_PAGE_FILES));
  });

  it('T7 — nepodržan fajl ne troši mesto u kapacitetu', () => {
    const plan = planPageFilePicks({
      existingCount: MAX_PAGE_FILES - 1,
      picked: [
        { name: 'app.exe', mimeType: 'application/x-msdownload', size: 1024 },
        { name: 'ok.jpg', mimeType: 'image/jpeg', size: MB },
      ],
    });
    expect(plan.accepted.map((item) => item.name)).toEqual(['ok.jpg']);
    expect(plan.rejected.map((item) => item.name)).toEqual(['app.exe']);
  });

  it('T8 — pun oblačić odbija sve, ništa ne prolazi', () => {
    const plan = planPageFilePicks({
      existingCount: MAX_PAGE_FILES,
      picked: [{ name: 'jos-jedna.jpg', mimeType: 'image/jpeg', size: MB }],
    });
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toHaveLength(1);
  });

  it('T9 — poruka imenuje svaki odbijen fajl', () => {
    const message = rejectedPicksMessage([
      { name: 'a.exe', reason: 'tip nije podržan' },
      { name: 'b.mp4', reason: 'veći od 200 MB' },
    ]);
    expect(message).toBe('„a.exe" — tip nije podržan\n„b.mp4" — veći od 200 MB');
  });

  it('T10 — prazan izbor daje prazan plan', () => {
    const plan = planPageFilePicks({ existingCount: 3, picked: [] });
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toEqual([]);
  });
});
