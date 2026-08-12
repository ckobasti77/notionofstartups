/**
 * Namerna zamena za `expo-constants` u WEB bundle-u editora.
 *
 * `@10play/tentap-editor/src/utils/misc.ts#isExpo()` radi ovako:
 *
 *     try { if (require('expo-constants')) isRunningOnExpo = true } catch { … }
 *
 * a rezultat odlučuje da li su `focusListener` i `contentHeightListener` PRAVI
 * ili prazni shim-ovi. U WebView-u moraju biti pravi — shimovan `focusListener`
 * znači `isFocused === false` zauvek, a traka alata se prikazuje baš po tom
 * polju (`note-toolbar.tsx:83`), pa bi nestala bez ijedne greške u logu.
 *
 * Tentap-ov sopstveni build to dobija slučajno: rollup ostavlja `require` kao
 * nedefinisanu promenljivu, pa poziv baci `ReferenceError` koji `catch` proguta.
 * Rolldown (Vite 8) `require()` RAZREŠAVA — i tada povuče ceo `react-native`
 * (Flow sintaksa, build pukne), a da nije pukao, `isExpo()` bi vratio `true`.
 *
 * Zato: CJS modul čiji je izvoz `undefined`. Rolldown CJS modul umotava u lenju
 * funkciju, pa se poziv desi tačno na mestu `require`-a i vrati falsy vrednost —
 * `isExpo()` je `false`, listeneri su pravi, a `react-native` nikad ne uđe u graf.
 */
module.exports = undefined;
