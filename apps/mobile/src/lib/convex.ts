import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';

import type { TokenStorage } from '@convex-dev/auth/react';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    'EXPO_PUBLIC_CONVEX_URL nije podešen. Dodaj ga u apps/mobile/.env.local (isti convex.cloud URL kao web).',
  );
}

export const convex = new ConvexReactClient(convexUrl, {
  // Native aplikacija nema "unsaved changes" upozorenje kao browser tab.
  unsavedChangesWarning: false,
});

/**
 * Token skladište za Convex Auth na React Native-u.
 *
 * Na webu se default koristi `localStorage`; na native-u toga nema, pa token
 * (JWT + refresh) ide u `expo-secure-store` — Keychain na iOS, EncryptedShared-
 * Preferences na Androidu. Bez ovog adaptera se sesija ne pamti između pokretanja.
 */
export const secureStorage: TokenStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

/**
 * Stabilan namespace za ključeve tokena. Convex Auth ionako uklanja
 * ne-alfanumeričke znakove radi RN kompatibilnosti, ali eksplicitna vrednost
 * sprečava da se ključ promeni (i tako izloguje korisnika) ako se URL promeni.
 */
export const AUTH_STORAGE_NAMESPACE = 'notioncloneauth';
