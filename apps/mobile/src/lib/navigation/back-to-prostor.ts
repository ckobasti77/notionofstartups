import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Povratak u Prostor sa gurnutog ekrana (K09). NE `router.navigate('/prostor')`:
 * expo-router taj NAVIGATE vezuje za postojeći `(tabs)` samo kad je on na vrhu
 * steka, pa bi sa Korpe/Dokumenata gurnuo DRUGI `(tabs)` iznad ekrana (dupli
 * Prostor, „nazad" vraća na ekran sa kog se otišlo). `dismissTo` skida ekrane
 * do postojećeg `(tabs)` (i doda ga ako ga nema), uz opcione parametre.
 */
export function dismissToProstor(
  router: Router,
  params?: { areaId: string; areaLabel: string },
): void {
  if (params) router.dismissTo({ pathname: '/prostor', params });
  else router.dismissTo('/prostor');
}

/**
 * „Nazad" sa ekrana do kog se stiže i iz obaveštenja ili deep linka (bez
 * prethodnog ekrana): tada Prostor ZAMENJUJE ovaj ekran, da „nazad" sa Prostora
 * ne vrati ponovo ovde.
 */
export function backOrProstor(router: Router): void {
  if (router.canGoBack()) router.back();
  else router.replace('/prostor');
}
