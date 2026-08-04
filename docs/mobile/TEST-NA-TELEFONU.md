# Testiranje na iPhone-u

Dva različita načina, za dve različite faze. Ne mešaj ih.

| Faza | Način | Treba li Apple nalog | Vreme do prvog pokretanja |
|---|---|---|---|
| **0 — 3** | Expo Go | ❌ ne | 5 minuta |
| **1+** (notifikacije) | Development build | ✅ da, $99/god | 24–48h za nalog + 20 min build |

---

## A. Faza 0 — Expo Go (radi odmah, besplatno)

Za tokene i navigaciju ne treba ništa native. Expo Go je dovoljan.

### Koraci

1. **Na iPhone-u:** instaliraj **Expo Go** iz App Store-a
2. **Telefon i PC na istom Wi-Fi** — ovo je najčešći razlog zašto ne radi
3. **Na PC-u, dva terminala:**

```powershell
# Terminal 1 — backend
cd "C:\Users\admin\Desktop\Web Dev Projects\notion-clone"
npx convex dev
```

```powershell
# Terminal 2 — mobilni
cd "C:\Users\admin\Desktop\Web Dev Projects\notion-clone\apps\mobile"
npx expo start
```

4. **Skeniraj QR kod aplikacijom Kamera** (ne Expo Go skenerom — na iOS-u se
   skenira Kamerom, iskoči notifikacija, tapneš je)

Ako ne poveže — telefon i PC nisu na istom Wi-Fi. Rešenje:

```powershell
npx expo start --tunnel
```

Sporije, ali radi kroz bilo koju mrežu.

### Šta proveriti

- [ ] Aplikacija se otvara bez crvenog ekrana greške
- [ ] Pet tabova na dnu: Danas · Prostor · Chat · Obaveštenja · Više
- [ ] Tabovi se prebacuju
- [ ] Header prikazuje naziv startupa
- [ ] Tap na naziv otvara listu tvojih startupa ⚠️ **ovo je pravi test**
- [ ] Promeni temu telefona (Settings → Display) — aplikacija prati
- [ ] Prazna stanja se vide, nema belih ekrana

> ⚠️ **Ako je lista startupa prazna ili baci grešku**, korak 0.3 (Convex + auth)
> nije završen. To nije bag u navigaciji — nedostaje ceo sloj ispod.

---

## B. Faza 1+ — Development build

Čim dođu notifikacije, Expo Go više ne može — custom zvuci traže native kod.

### Šta treba pripremiti unapred

1. **Apple Developer Program — $99/godišnje**
   `developer.apple.com` → Enroll
   **Odobrenje traje 24–48h.** Prijavi se čim počneš Fazu 0, da te ne zadrži.

2. **Registruj telefon:**

```powershell
eas device:create
```

Generiše link → otvoriš ga na iPhone-u → instaliraš profil.

3. **Build:**

```powershell
eas build --profile development --platform ios
```

10–20 minuta. EAS pita da li da upravlja sertifikatima — **reci da**.

4. **Instaliraj:** otvori link sa builda na iPhone-u.

5. **Prvi put obavezno:**
   Settings → General → VPN & Device Management → tvoj profil → **Trust**
   Bez ovoga aplikacija neće da se otvori.

6. **Odsad pokrećeš razvoj sa:**

```powershell
npx expo start --dev-client
```

i skeniraš QR **svojom** aplikacijom, ne Expo Go-om.

---

## Kad zapne

| Simptom | Uzrok | Rešenje |
|---|---|---|
| QR se skenira ali ne učitava | Različit Wi-Fi | `npx expo start --tunnel` |
| Crveni ekran „Unable to resolve module" | Keš | `npx expo start --clear` |
| Lista startupa prazna | Korak 0.3 nije gotov | Vidi `NOCNI-IZVESTAJ.md` |
| „Network request failed" | Convex ne radi | Proveri Terminal 1 i `EXPO_PUBLIC_CONVEX_URL` |
| Aplikacija se ne otvara (dev build) | Profil nije poveren | Settings → VPN & Device Management → Trust |
| Notifikacije ne stižu | Testiraš u Expo Go ili na simulatoru | Treba dev build + **fizički** uređaj |
