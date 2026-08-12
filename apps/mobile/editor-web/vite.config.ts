import path from 'node:path';

import { defineConfig } from 'vite';

/**
 * Build sopstvenog tentap web bundle-a (`npm run editor:build --workspace @devotion/mobile`).
 *
 * Izlaz je JEDAN `dist/editor.js` (iife, bez chunk-ova i preload-a), koji
 * `inline.mjs` ubaci u `template.html` i upiše u `src/lib/note-editor-html.ts`.
 * `lib` + `iife` umesto `vite-plugin-singlefile`: nula novih paketa i
 * deterministički izlaz.
 */
const TENTAP = path.resolve(
  __dirname,
  '../../../node_modules/@10play/tentap-editor',
);

/**
 * Alias vodi na IZVOR paketa, ne na `lib-web/index.mjs`. `lib-web` je unapred
 * izgrađen sa UGRAĐENIM `@tiptap/core`-om i ProseMirror-om (spolja su ostavljeni
 * samo react/react-dom), pa bi naš `TableKit`/`CodeBlock`/`NoteFile` gradio čvorove
 * nad DRUGOM ProseMirror šemom. Iz izvora se sve razrešava na jednu hoistovanu
 * kopiju `@tiptap/core@3.29.2` — isto što tentap radi u svom `editor:build`.
 *
 * REGEX, ne string: prefiks bi `@10play/tentap-editor/web` preveo u
 * `…/webEditorUtils/index.ts/web`.
 */
const TENTAP_WEB_SOURCE = path.join(TENTAP, 'src/webEditorUtils/index.ts');

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@10play\/tentap-editor\/web$/, replacement: TENTAP_WEB_SOURCE },
      { find: /^@10play\/tentap-editor$/, replacement: TENTAP_WEB_SOURCE },
      // Vidi `expo-constants-absent.cjs` — bez ovoga build povuče `react-native`
      // (Flow, pukne), a i da ne pukne, traka alata bi tiho nestala.
      {
        find: /^expo-constants$/,
        replacement: path.resolve(__dirname, 'expo-constants-absent.cjs'),
      },
      // Mora sa kosom crtom: goli `@` bi pojeo i `@tiptap/*` i `@10play/*`.
      { find: /^@\//, replacement: `${path.resolve(__dirname, '../src')}/` },
    ],
    // Dve kopije React-a ili ProseMirror-a u jednom bundle-u su tih kvar;
    // `@10play/tentap-editor/node_modules` sadrži react-dom 18.
    dedupe: ['react', 'react-dom', '@tiptap/core', '@tiptap/pm'],
  },
  define: {
    // WebView bundle je uvek produkcijski — bez ovoga React traži `process`.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    // Apsolutno: `root` je `apps/mobile` (radni direktorijum workspace skripte),
    // pa bi relativan `dist` završio pored `src/`, a ne pored ovog fajla.
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    modulePreload: false,
    lib: {
      entry: path.resolve(__dirname, 'index.ts'),
      formats: ['iife'],
      name: 'DevotionNoteEditor',
      fileName: () => 'editor.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true, entryFileNames: 'editor.js' },
    },
  },
});
