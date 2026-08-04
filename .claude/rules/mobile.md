---
paths: ["apps/mobile/**"]
---

# Mobilni klijent (Expo)

- Stilizuj kroz NativeWind (`className`) — nikad direktne Tailwind/DOM `style` klase.
- Rute: expo-router, file-based u `src/app/` — ne `app/`.
- Instaliraj sa `npx expo install <pkg>` — nikad `npm install <pkg>`.
- Dodirna meta minimum 44pt; osnovni tekst minimum 16px.
- Svaki ekran ima safe area gore i dole (insets / `SafeAreaView`).
- Animacije: `react-native-reanimated` — nikad Framer Motion.
- Nikad web API-ji: `window`, `document`, `localStorage`.
