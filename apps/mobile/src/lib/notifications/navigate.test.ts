import { describe, expect, test } from 'vitest';

import type { NotificationDestination } from '@/convex/lib/notificationTarget';

import { navigateToNotificationDestination } from './navigate';

type Call = { method: 'push' | 'navigate'; href: unknown };

/** Lažni router: beleži samo `push`/`navigate` (jedino što prevodilac zove). */
function fakeRouter() {
  const calls: Call[] = [];
  const router = {
    push: (href: unknown) => calls.push({ method: 'push', href }),
    navigate: (href: unknown) => calls.push({ method: 'navigate', href }),
  } as unknown as Parameters<typeof navigateToNotificationDestination>[0];
  return { router, calls };
}

function dest(partial: Partial<NotificationDestination> & Pick<NotificationDestination, 'screen'>) {
  return { scope: 'startup', entityId: null, weekStart: null, ...partial } as NotificationDestination;
}

describe('obaveštenje → ekran na telefonu (PROSTOR K09)', () => {
  test('cilj `approvals` (stara Odobrenja) vodi u Korpu', () => {
    const { router, calls } = fakeRouter();
    navigateToNotificationDestination(router, dest({ screen: 'approvals' }));
    expect(calls).toEqual([{ method: 'push', href: '/korpa' }]);
  });

  test('rezerva startupa je početna Prostora bez parametra segmenta', () => {
    const { router, calls } = fakeRouter();
    navigateToNotificationDestination(router, dest({ screen: 'today' }));
    expect(calls).toEqual([{ method: 'navigate', href: '/prostor' }]);
  });

  test('`area` do K14 pada na početnu Prostora; lična rezerva ide na Danas', () => {
    const area = fakeRouter();
    navigateToNotificationDestination(area.router, dest({ screen: 'area', entityId: 'a1' }));
    expect(area.calls).toEqual([{ method: 'navigate', href: '/prostor' }]);

    const personal = fakeRouter();
    navigateToNotificationDestination(personal.router, dest({ screen: 'today', scope: 'personal' }));
    expect(personal.calls).toEqual([{ method: 'navigate', href: '/danas' }]);
  });

  test('ostali ciljevi su nepromenjeni: stranica, ideja, lista ideja', () => {
    const page = fakeRouter();
    navigateToNotificationDestination(page.router, dest({ screen: 'page', entityId: 'pg1' }));
    expect(page.calls).toEqual([{ method: 'push', href: { pathname: '/stranica/[id]', params: { id: 'pg1' } } }]);

    const idea = fakeRouter();
    navigateToNotificationDestination(idea.router, dest({ screen: 'ideas', entityId: 'i1' }));
    expect(idea.calls).toEqual([{ method: 'push', href: { pathname: '/ideja/[id]', params: { id: 'i1' } } }]);

    const ideas = fakeRouter();
    navigateToNotificationDestination(ideas.router, dest({ screen: 'ideas' }));
    expect(ideas.calls).toEqual([{ method: 'push', href: '/ideje' }]);
  });
});
