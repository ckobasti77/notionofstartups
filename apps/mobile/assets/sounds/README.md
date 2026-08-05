# Zvuci obaveštenja

Ove fajlove **ti praviš** (Audacity/ffmpeg). Referenciraju se iz `app.json`
(`expo-notifications` → `sounds`) i iz kataloga kanala
(`packages/backend/convex/lib/notificationChannels.ts`).

## Fajlovi (tačno 6, tačna imena)

| Fajl | Kanal | Kontura visine | Trajanje |
|---|---|---|---|
| `dm.wav` | Direktne poruke | dva tona, dole pa gore (▁▔) | ~0.4 s |
| `mention.wav` | Pominjanja | tri tona uzlazno, oštro (▁▂▔) | ~0.5 s |
| `channel.wav` | Poruke u kanalu | jedan tih ton (▁) | ~0.25 s |
| `task.wav` | Zadaci | dva ista tona, odsečno (▔▔) | ~0.35 s |
| `deadline.wav` | Rokovi | dva tona, gore pa dole (▔▁) | ~0.8 s |
| `vote.wav` | Glasanja | tri tona silazno, tvrdo (▔▂▁) | ~0.9 s |

Kanal `quiet` (ideje, puls) **nema zvuk** — ne treba fajl.

## Format (obavezno)

- **Kodiranje:** Linear PCM signed 16-bit little-endian
- **Sample rate:** 44100 Hz
- **Kanali:** mono (1)
- **Trajanje:** `< 1 s` (svi)
- **Glasnoća:** normalizovano na −3 dB peak (da svi budu podjednako glasni)

Jedan te isti `.wav` radi i na Androidu i na iOS-u (iOS prihvata PCM `.wav`).
**Ne koristimo `.caf`** — config plugin kopira isti niz na obe platforme, a Android
`res/raw` izvodi ime resursa bez ekstenzije, pa bi `dm.wav` + `dm.caf` srušili
Android build (duplirani resurs `raw/dm`).

## Imena (Android build pukne ako se prekrši)

Samo **mala slova, brojevi, donja crta**. `dm.wav` ✓ · `dm-soft.wav` ✗ · `dmSoft.wav` ✗
(config plugin poziva `assertValidAndroidAssetName`).

## Priprema (ffmpeg)

```bash
for name in dm mention channel task deadline vote; do
  ffmpeg -i src/$name.wav -c:a pcm_s16le -ar 44100 -ac 1 assets/sounds/$name.wav
done
# provera:
ffprobe assets/sounds/dm.wav   # mora: pcm_s16le, 44100 Hz, mono
```

## Još jedan asset koji fali

`app.json` referencira i `../images/notification-icon.png` — **bela silueta na
providnoj pozadini** (~96×96). Android sve u boji pretvori u beli kvadrat, pa mora
biti čista silueta.
