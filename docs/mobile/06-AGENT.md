# AI agent u aplikaciji

> Cilj: da možeš da pitaš „koji su mi hitni zadaci" ili „pročitaj mi poslednju
> misao" i dobiješ odgovor iz **svojih** podataka — na oba klijenta, sa modelom
> koji ti biraš.
>
> Prvo čitanje, pa pisanje. Prvo jedan zajednički agent, pa personalizacija.

---

## 1. Šta agent jeste, a šta nije

**Jeste:** još jedan učesnik u chatu koji ume da postavlja upite nad aplikacijom
umesto tebe i da odgovara rečenicom, ne tabelom.

**Nije:** zaseban ekran, zaseban sistem dozvola, ni „AI dugme" na svakom
prikazu. Ako je chat mesto gde tim priča, agent je samo još jedan sagovornik u
tom istom mestu.

Praktično, to znači `kind: "agent"` kanal iz `04-CHAT.md` — po korisniku jedan,
privatan. Plus `@agent` pominjanje u bilo kom kanalu, kad hoćeš da tim vidi
odgovor.

---

## 2. ⚠️ Pravilo bez kojeg ništa ne valja

> **Agent izvršava upite kao korisnik koji pita, nikad kao superkorisnik.**

Ovo je najlakše zabrljati i najskuplje popraviti kasnije.

Ako tim deli jedan API ključ, lako je napisati agenta koji čita bazu bez
ograničenja — i onda član koji nema pristup nekoj oblasti pita „šta ima novo" i
dobije sadržaj koji ne sme da vidi.

Zato svaki alat agenta prolazi kroz **iste** provere kao i klijent:

```ts
// convex/agentTools.ts
export const listMyTasks = internalQuery({
  args: {
    asProfileId: v.id("profiles"),      // ko pita
    startupId: v.id("startups"),
    status: v.optional(taskStatusValidator),
    priority: v.optional(taskPriorityValidator),
  },
  handler: async (ctx, args) => {
    // Ista provera koju bi uradio i pravi klijent
    await requireMembershipFor(ctx, args.startupId, args.asProfileId);
    // ...
  },
});
```

Deljeni je **ključ za model**, ne pristup podacima. Ta razlika je ceo dizajn.

---

## 3. Mini harness — jedan adapter, svi provajderi

Ovo je ključno pojednostavljenje: **skoro svi provajderi govore
OpenAI-kompatibilan `/chat/completions` sa tool calling-om.** Groq, OpenRouter,
DeepSeek, Mistral, Together, lokalni Ollama — svi. Google Gemini takođe ima
OpenAI-compat endpoint.

Znači ne pišeš pet adaptera. Pišeš **jedan**, a provajder je samo tri polja:

```
baseUrl  +  model  +  apiKey
```

### Tabela

```ts
aiProviders: defineTable({
  startupId: v.id("startups"),
  label: v.string(),                    // "Groq — Llama 3.3" (korisnikov naziv)
  baseUrl: v.string(),                  // https://api.groq.com/openai/v1
  model: v.string(),                    // llama-3.3-70b-versatile
  apiKey: v.string(),                   // ⚠️ nikad ne izlazi iz internal funkcija
  keySuffix: v.string(),                // "…a3f9" — ovo se pokazuje u UI
  isDefault: v.boolean(),
  enabled: v.boolean(),
  createdByProfileId: v.id("profiles"),
  lastUsedAt: v.union(v.number(), v.null()),
  lastErrorAt: v.union(v.number(), v.null()),
  lastError: v.union(v.string(), v.null()),
  createdAt: v.number(),
})
  .index("by_startup", ["startupId", "enabled"])
  .index("by_startup_and_default", ["startupId", "isDefault"])
```

### ⚠️ Disciplina oko ključa

- `apiKey` se čita **isključivo** unutar `internalQuery` / `internalAction`
- **Nijedan** javni upit ne sme da vrati to polje
- UI vidi samo `label`, `model`, `keySuffix`, `enabled`, `lastError`
- Izmena ključa je „unesi nov", nikad „prikaži postojeći"
- Dodavanje i brisanje provajdera može **samo admin** (`requireAdmin`)

> Alternativa: ključevi u Convex env promenljivama (`npx convex env set`), kao
> postojeći VAPID ključevi. Sigurnije, ali se ne mogu menjati iz aplikacije.
> Pošto je tražena UI kontrola — ide u bazu, uz pravila gore.

### Tok „dodaj model"

```
Podešavanja → AI → [+ Dodaj model]

┌────────────────────────────────────┐
│  Naziv       [ Groq — Llama 3.3  ] │
│  Provajder   [ Groq            ▾ ] │  ← popunjava baseUrl automatski
│  Model       [ llama-3.3-70b-… ▾ ] │
│  API ključ   [ ••••••••••••••••• ] │
│                                    │
│  [ Testiraj vezu ]     [ Sačuvaj ] │
└────────────────────────────────────┘
```

„Testiraj vezu" šalje jedan trivijalan poziv sa jednim alatom i proverava da li
model **ume tool calling**. Ako ne ume — odbij ga odmah sa jasnom porukom, a ne
kasnije kad korisnik postavi pitanje.

Padajući spisak provajdera nosi gotove `baseUrl` vrednosti, a `custom` opcija
pušta da se unese ručno.

---

## 4. Alati

### Faza A — čitanje (ovo ti treba prvo)

| Alat | Vraća |
|---|---|
| `listMyTasks` | Zadaci dodeljeni meni, filter po statusu, prioritetu, roku |
| `listTeamTasks` | Zadaci drugih — filter po izvršiocu, statusu, prioritetu, roku |
| `getTask` | Pun detalj: instrukcije, checkpointi, izvršioci |
| `listOverdue` | Sve što je prekoračilo rok, meni ili timu |
| `searchPages` | Pretraga po `convex/search.ts` |
| `getPage` | Sadržaj beleške ili stranice |
| `listMyThoughts` | Moje misli, najnovije prvo |
| `listIdeas` | Ideje, filter po statusu i glasovima |
| `listApprovals` | Zahtevi koji čekaju moj glas |
| `getPuls` | Sedmični pregled |
| `listUnreadChat` | Gde imam nepročitano |

Svi primaju `asProfileId` i `startupId`. Svi zovu postojeće upite ili njihove
`internal` blizance.

### Faza B — pisanje (kad čitanje proradi)

| Alat | Radnja |
|---|---|
| `createTask` | Nov zadatak |
| `createNote` | Nova beleška |
| `createThought` | Nova misao |
| `setTaskStatus` | Promena statusa |
| `assignTask` | Dodela izvršioca |
| `addCheckpoint` | Nov checkpoint |

> **Pisanje ide kroz postojeće mutacije, ne kroz novi kod.** `createTask` alat
> zove `pages.create` sa `kind: "task"` — istu funkciju koju zove i dugme u UI.
> Time validacija, dozvole, aktivnost i obaveštenja rade automatski, a ne
> postoji druga vrata u sistem.

### Potvrda pre pisanja

Svaka radnja koja menja podatke traži potvrdu u chatu:

```
🤖  Napraviću zadatak:
    „Popraviti prelom na landing strani"
    Dev · prioritet visok · rok sutra

    [ Napravi ]   [ Izmeni ]   [ Otkaži ]
```

Bez ovoga će agent pre ili kasnije napraviti nešto što nisi tražio, i izgubićeš
poverenje u njega. Čitanje ide bez potvrde, pisanje nikad.

---

## 5. Kako izgleda jedan krug

```
Ti:    „koji su mi hitni zadaci za ovu nedelju?"
         ↓
convex/agent.ts  (action)
         ↓
  POST {baseUrl}/chat/completions
    model, messages, tools: [...], tool_choice: "auto"
         ↓
  model vraća tool_call: listMyTasks({ priority: "urgent", dueBefore: … })
         ↓
  ctx.runQuery(internal.agentTools.listMyTasks, { asProfileId, … })
         ↓
  rezultat nazad u messages kao tool result
         ↓
  model sastavlja odgovor
         ↓
Agent: „Tri hitna. Redizajn landinga ističe danas u 17h i još je u toku.
        Poziv sa investitorom je sutra. Ugovor je prekoračio rok pre dva dana —
        taj bih prvi pogledao."
```

Petlja ide dok model ne prestane da traži alate, uz **tvrdo ograničenje**:

```ts
const MAX_TOOL_ROUNDS = 6;
const MAX_TOOL_CALLS_PER_ROUND = 4;
```

Bez toga jedan loše postavljen upit ume da napravi trideset poziva i potroši
dnevni limit.

---

## 6. Šta konkretno možeš da pitaš

Tvoji primeri, i šta ih pokriva:

| Pitanje | Alati |
|---|---|
| „Pročitaj mi zadatke koji su hitni a meni dodeljeni" | `listMyTasks(priority: urgent)` |
| „Koji su hitni zadaci dodeljeni drugima?" | `listTeamTasks(priority: urgent)` |
| „Pročitaj mi poslednju misao koju sam ubacio" | `listMyThoughts(limit: 1)` |
| „Šta je prekoračilo rok?" | `listOverdue` |
| „Šta čeka moj glas?" | `listApprovals` |
| „Šta smo pričali o cenovniku?" | `searchPages` |
| „Napravi zadatak da se popravi prelom" | `createTask` + potvrda |
| „Sumiraj mi nedelju" | `getPuls` + `listOverdue` |

---

## 7. Koji model

### Realnost troška

Za interni tim ovo je **jeftinije nego što misliš**. Flash/nano klasa modela
danas košta oko **$0.03–0.30 po milionu ulaznih** i **$0.20–0.40 po milionu
izlaznih** tokena.

Grubo: pet ljudi, po dvadeset pitanja dnevno, sa alatima i kontekstom — negde
oko **$1–3 mesečno**. Manje od kafe.

### Besplatne opcije

| Provajder | Limit | Napomena |
|---|---|---|
| **Groq** | ~30 zahteva/min, ~1.000/dan | Najbrži odziv, Llama 3.3 70B |
| **Google AI Studio** | ~5–15/min, 20–1.500/dan | Gemini Flash |
| **Cerebras** | ~30/min, ~1M tokena/dan | Llama 3.3 70B |
| **OpenRouter** | ~20/min, 50/dan | 1.000/dan uz $10 dopune |

⚠️ **Ograničenja se broje po zahtevu, ne po pitanju.** Jedno pitanje sa dva
kruga alata = tri zahteva. Sa timom od pet ljudi, besplatni limiti se dodiruju
brzo.

### Preporuka

1. **Kreni na Groq besplatnom ključu** — najbrži je i limit je najdarežljiviji
2. **Pređi na flash-klasu sa plaćenim ključem** čim vas limiti počnu da udaraju

Pošto je harness provajder-agnostičan, prelazak je izmena jednog reda u
podešavanjima. Ne vezuj se ni za koga.

> Pre nego što upišete konkretan model u kod — proverite aktuelnu ponudu.
> Cene i besplatni limiti se menjaju svakih par meseci.

---

## 8. Web paritet

Agent je **obavezno na oba klijenta**. Backend je isti, razlikuje se samo prikaz:

| | Mobilni | Web |
|---|---|---|
| Razgovor sa agentom | Chat tab → 🤖 Agent | `view=chat` → kanal Agent |
| `@agent` u kanalu | ✅ | ✅ |
| Potvrda pre pisanja | Bottom sheet | Dijalog |
| Podešavanja modela | Ekran „AI" | Dijalog „AI" |
| Glasovno pitanje | ✅ `expo-av` | ✅ `MediaRecorder` |

Izuzetaka nema — sve što agent radi, radi na oba mesta.

---

## 9. Redosled implementacije

| # | Šta | Trajanje |
|---|---|---|
| 1 | `aiProviders` tabela + admin UI za dodavanje ključa (oba klijenta) | 2 dana |
| 2 | OpenAI-kompatibilan klijent + „Testiraj vezu" | 1 dan |
| 3 | `agentTools.ts` — pet osnovnih alata za čitanje | 2 dana |
| 4 | `agent.ts` akcija — petlja sa alatima, ograničenja | 2 dana |
| 5 | `kind: "agent"` kanal, prikaz na oba klijenta | 2 dana |
| 6 | Ostali alati za čitanje | 1 dan |
| 7 | `@agent` pominjanje u običnim kanalima | 1 dan |
| 8 | Alati za pisanje + potvrda | 2 dana |
| 9 | Glasovno pitanje | 1 dan |

**Ukupno ~2,5 nedelje.**

---

## 10. Šta NE radimo u v1

- ❌ Agent koji sam kreće da radi bez pitanja
- ❌ Agent koji piše bez potvrde
- ❌ Fino podešavanje modela na vašim podacima
- ❌ Ugrađivanje i vektorska pretraga — `convex/search.ts` je za sad dovoljan
- ❌ Agent koji čita chat drugih ljudi (čita samo ono što i ti smeš)
- ❌ Više agenata sa različitim ličnostima

---

## 11. Otvoreno pitanje

**Ključ po startupu ili po korisniku?**

Predlog: **po startupu, admin ga postavlja.** To je ono što si tražio — „da
imamo svi tu jednog agenta". Prostije za podešavanje i trošak je na jednom
mestu.

Ostavi mesta za lični ključ kasnije (`profileId` kolona koja je `null` za
deljene) — ako neko poželi jači model o svom trošku, tabela to već podržava.
