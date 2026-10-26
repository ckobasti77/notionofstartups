import { Redirect } from 'expo-router';

/**
 * Stara ruta „Odobrenja" (PROSTOR P4, K09): glasanje o brisanju i odobravanje
 * ugnežđavanja su ugašeni, a „Oporavljeno" je u Korpi. Fajl ostaje zbog deep
 * linkova (`devotion://odobrenja`) i starih poziva — samo preusmerava u Korpu.
 */
export default function OdobrenjaRedirect() {
  return <Redirect href="/korpa" />;
}
