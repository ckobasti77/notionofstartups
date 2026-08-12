/**
 * Ulazna tačka web bundle-a koji se izvršava u tentap WebView-u.
 *
 * Doslovno prati `@10play/tentap-editor/src/simpleWebEditor/index.tsx`, uz jednu
 * razliku: umesto `TenTapStartKit` koristi `NOTE_BRIDGES` — istu listu koju
 * native strana šalje kroz `bridgeExtensions`. Otud tabela, blok koda, `<hr>` i
 * `noteFile` čvor postoje i u Tiptap šemi unutar WebView-a.
 *
 * Bez JSX-a (`createElement`), pa build ne traži `@vitejs/plugin-react`.
 *
 * Izlaz ovog fajla se kroz `editor-web/inline.mjs` upisuje u
 * `src/lib/note-editor-html.ts` i odatle ide kao `customSource` u
 * `components/stranica/note-editor.tsx`.
 */
import { EditorContent } from '@tiptap/react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

// Alias u `vite.config.ts` vodi ovo na IZVOR paketa (`src/webEditorUtils`), ne na
// unapred izgrađen `lib-web/index.mjs`. Razlog: `lib-web` u sebi nosi SOPSTVENU
// kopiju `@tiptap/core` i ProseMirror-a (externalizovani su samo react/react-dom),
// pa bi naše ekstenzije radile nad drugom šemom — tiha, teško uočljiva greška.
import { useTenTap } from '@10play/tentap-editor/web';

import { NOTE_BRIDGES } from '@/lib/note-editor-bridges';

declare global {
  interface Window {
    /** Native upiše `true` kroz `injectedJavaScriptBeforeContentLoaded`. */
    contentInjected?: boolean;
  }
}

function NoteEditorApp() {
  const editor = useTenTap({ bridges: NOTE_BRIDGES });
  return createElement(EditorContent, {
    editor,
    className: window.dynamicHeight ? 'dynamic-height' : undefined,
  });
}

/**
 * Na Androidu `react-native-webview` ume da ubaci sadržaj TEK posle `load`
 * događaja, pa se čeka `window.contentInjected` pre montiranja — inače bi editor
 * krenuo sa praznim telom i pregazio belešku.
 */
const timer = setInterval(() => {
  if (!window.contentInjected) return;
  clearInterval(timer);
  const container = document.getElementById('root');
  if (container === null) return;
  createRoot(container).render(createElement(NoteEditorApp));
}, 1);
