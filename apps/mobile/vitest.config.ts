import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Testovi mobilnog klijenta. Jedini projekat u repou kome treba DOM (`jsdom`) —
 * round-trip tela beleške se meri kroz pravi ProseMirror `DOMParser`/`DOMSerializer`.
 *
 * Aliasi su NAMERNO isti kao u `editor-web/vite.config.ts`: ako se raziđu, test
 * više ne meri isti graf koji se pakuje u WebView.
 */
const TENTAP = path.resolve(
  __dirname,
  '../../node_modules/@10play/tentap-editor',
);

export default defineConfig({
  resolve: {
    // Redosled je bitan: prvi match pobeđuje.
    alias: [
      {
        find: /^@10play\/tentap-editor(\/web)?$/,
        replacement: path.join(TENTAP, 'src/webEditorUtils/index.ts'),
      },
      {
        find: /^expo-constants$/,
        replacement: path.resolve(__dirname, 'editor-web/expo-constants-absent.cjs'),
      },
      {
        find: '@/convex',
        replacement: path.resolve(__dirname, '../../packages/backend/convex'),
      },
      { find: /^@\//, replacement: `${path.resolve(__dirname, 'src')}/` },
    ],
    dedupe: ['@tiptap/core', '@tiptap/pm'],
  },
  test: {
    name: 'mobile',
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
