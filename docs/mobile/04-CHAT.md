# Chat sistem — dizajn

> Model: **hibrid** — kanali po oblastima i DM za opšti razgovor, plus threadovi
> zakačeni direktno za zadatke, stranice i ideje.
>
> Ovo je jedina funkcija koja opravdava zamenu kombinacije Slack + Notion jednim
> alatom: razgovor nikad ne živi odvojeno od posla o kome se priča.

---

## 1. Zašto hibrid

**Čist Slack model** (samo kanali) — lak za implementaciju, ali za mali tim koji
vodi više startupa završi tako da odluka o zadatku živi u kanalu, zadatak živi u
aplikaciji, i za mesec dana niko ne zna zašto je nešto odlučeno.

**Čisti threadovi** (samo diskusije na entitetima) — disciplinovano, ali ljudima
fali mesto za „ej, jesi tu" i „gledajte ovo", pa se vrate na WhatsApp.

**Hibrid** — oba, sa mostom između njih: kad se otvori thread na zadatku, u
kanalu oblasti se pojavi tiha sistemska poruka sa linkom. Tim vidi da se negde
priča, a razgovor ostaje uz posao.

---

## 2. Schema

Pet novih tabela u `convex/schema.ts`.

### `chatChannels`

```ts
chatChannels: defineTable({
  startupId: v.id("startups"),

  kind: v.union(
    v.literal("startup"),   // opšti kanal — svi članovi startupa, tačno jedan
    v.literal("area"),      // kanal oblasti: #dev, #marketing
    v.literal("custom"),    // ručno napravljen kanal
    v.literal("dm"),        // razgovor dvoje ljudi
    v.literal("thread"),    // diskusija zakačena za entitet
    v.literal("agent"),     // razgovor sa AI agentom (vidi 06-AGENT.md)
  ),

  // kind === "area"
  areaId: v.union(v.id("startupAreas"), v.null()),

  // kind === "thread" — polimorfna veza
  anchorType: v.union(
    v.literal("page"),              // beleška, zadatak, fajl, tabela
    v.literal("idea"),
    v.literal("thought"),
    v.literal("deletionRequest"),
    v.null(),
  ),
  anchorId: v.union(v.string(), v.null()),

  // kind === "dm" — sortirani par, za deterministično pronalaženje
  dmKey: v.union(v.string(), v.null()),   // "profileA:profileB", ID-jevi sortirani

  name: v.string(),
  isPrivate: v.boolean(),

  // denormalizovano zbog liste razgovora — bez ovoga je N+1
  lastMessageAt: v.number(),
  lastMessagePreview: v.string(),
  lastMessageAuthorId: v.union(v.id("profiles"), v.null()),
  messageCount: v.number(),

  createdByProfileId: v.id("profiles"),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
})
  .index("by_startup_and_lastMessageAt", ["startupId", "archivedAt", "lastMessageAt"])
  .index("by_startup_and_kind", ["startupId", "kind", "archivedAt"])
  .index("by_anchor", ["anchorType", "anchorId"])
  .index("by_startup_and_dmKey", ["startupId", "dmKey"])
  .index("by_area", ["areaId", "archivedAt"])
```

**`lastMessagePreview` je denormalizacija i to je namerno.** Lista razgovora mora
da prikaže poslednju poruku za svaki kanal. Bez ovoga bi svaki ulaz u listu
značio dodatni upit — 20 kanala = 21 upit. Ovako je jedan.

**`dmKey`** je `[profileA._id, profileB._id].sort().join(":")`. Time je DM između
dvoje ljudi uvek isti kanal, bez obzira ko ga prvi otvori.

### `chatMessages`

```ts
chatMessages: defineTable({
  channelId: v.id("chatChannels"),
  startupId: v.id("startups"),          // duplirano zbog provere pristupa bez join-a
  authorProfileId: v.union(v.id("profiles"), v.null()),  // null = sistemska

  body: v.string(),
  mentions: v.array(v.id("profiles")),  // izvučeno na serveru iz teksta

  kind: v.union(
    v.literal("text"),
    v.literal("file"),
    v.literal("voice"),
    v.literal("system"),                // "Marko je otvorio diskusiju"
  ),

  attachmentStorageId: v.optional(v.id("_storage")),
  attachmentName: v.union(v.string(), v.null()),
  attachmentType: v.union(v.string(), v.null()),
  attachmentSize: v.union(v.number(), v.null()),
  voiceDurationMs: v.union(v.number(), v.null()),

  replyToMessageId: v.union(v.id("chatMessages"), v.null()),

  editedAt: v.union(v.number(), v.null()),
  deletedAt: v.union(v.number(), v.null()),   // soft delete
  createdAt: v.number(),
})
  .index("by_channel_and_createdAt", ["channelId", "createdAt"])
  .index("by_channel_active", ["channelId", "deletedAt", "createdAt"])
  .index("by_author", ["authorProfileId", "createdAt"])
```

**Soft delete, ne hard.** Obrisana poruka postaje „Poruka je obrisana" — inače
razgovor iznad nje gubi smisao.

### `chatMembers`

```ts
chatMembers: defineTable({
  channelId: v.id("chatChannels"),
  profileId: v.id("profiles"),
  startupId: v.id("startups"),
  role: v.union(v.literal("owner"), v.literal("member")),
  notificationLevel: v.union(
    v.literal("all"),        // svaka poruka
    v.literal("mentions"),   // samo @
    v.literal("none"),       // ništa
  ),
  joinedAt: v.number(),
  leftAt: v.union(v.number(), v.null()),
})
  .index("by_channel", ["channelId", "leftAt"])
  .index("by_profile", ["profileId", "leftAt"])
  .index("by_channel_and_profile", ["channelId", "profileId"])
```

Za `kind === "area"` članstvo je **implicitno** — ko je u startupu, u kanalu je.
`chatMembers` se koristi samo za DM, privatne kanale i threadove.

### `chatReads`

```ts
chatReads: defineTable({
  channelId: v.id("chatChannels"),
  profileId: v.id("profiles"),
  startupId: v.id("startups"),
  lastReadAt: v.number(),
  lastReadMessageId: v.union(v.id("chatMessages"), v.null()),
  unreadCount: v.number(),        // održavano inkrementalno
  mentionCount: v.number(),
  updatedAt: v.number(),
})
  .index("by_channel_and_profile", ["channelId", "profileId"])
  .index("by_profile", ["profileId"])
  .index("by_profile_and_startup", ["profileId", "startupId"])
```

**`unreadCount` se održava inkrementalno**, ne računa se pri svakom čitanju.
Brojanje poruka novijih od `lastReadAt` za 20 kanala je 20 skeniranja pri svakom
otvaranju liste. Ovako je jedno čitanje po kanalu.

### `chatReactions`

```ts
chatReactions: defineTable({
  messageId: v.id("chatMessages"),
  profileId: v.id("profiles"),
  emoji: v.string(),
  createdAt: v.number(),
})
  .index("by_message", ["messageId"])
  .index("by_message_and_profile_and_emoji", ["messageId", "profileId", "emoji"])
```

---

## 3. Dozvole

**Nema novog sistema dozvola.** Sve ide kroz postojeći `requireStartupMember` iz
`convex/lib/auth.ts`.

```ts
async function requireChannelAccess(
  ctx: ReadCtx,
  channelId: Id<"chatChannels">,
) {
  const channel = await ctx.db.get("chatChannels", channelId);
  if (channel === null || channel.archivedAt !== null) {
    throw new Error("Razgovor nije pronađen.");
  }

  // Član startupa — osnovni uslov za sve
  const { profile } = await requireStartupMember(ctx, channel.startupId);

  // Javni kanal oblasti: članstvo u startupu je dovoljno
  if (channel.kind === "area" && !channel.isPrivate) {
    return { channel, profile };
  }

  // Thread: nasleđuje pristup od entiteta za koji je zakačen
  if (channel.kind === "thread") {
    await requireAnchorAccess(ctx, channel, profile);
    return { channel, profile };
  }

  // DM, privatni i custom kanali: mora biti u chatMembers
  const membership = await ctx.db
    .query("chatMembers")
    .withIndex("by_channel_and_profile", (q) =>
      q.eq("channelId", channelId).eq("profileId", profile._id),
    )
    .unique();

  if (membership === null || membership.leftAt !== null) {
    throw new Error("Nemate pristup ovom razgovoru.");
  }
  return { channel, profile, membership };
}
```

**Ključni princip: thread nasleđuje dozvole od svog entiteta.** Ako korisnik može
da vidi zadatak, može da vidi i diskusiju o njemu. Ako ne može — thread ne
postoji za njega. Time se izbegava drugi, paralelni model dozvola koji bi se
neminovno razišao sa prvim.

`role === "admin"` (`requireAdmin`) dodatno može: arhivirati bilo koji kanal,
obrisati tuđu poruku, praviti privatne kanale.

---

## 4. Lazy threadovi

Zadatak **nema** kanal dok neko ne napiše prvu poruku.

Sa 500 zadataka, unapred kreirani threadovi bi značili 500 praznih kanala u
tabeli i u svakom upitu nad listom. Zato:

```ts
export const sendToAnchor = mutation({
  args: {
    startupId: v.id("startups"),
    anchorType: v.union(/* page | idea | thought | deletionRequest */),
    anchorId: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireAnchorAccessById(ctx, args.anchorType, args.anchorId, profile);

    let channel = await ctx.db
      .query("chatChannels")
      .withIndex("by_anchor", (q) =>
        q.eq("anchorType", args.anchorType).eq("anchorId", args.anchorId),
      )
      .unique();

    if (channel === null) {
      // Prva poruka pravi kanal
      const channelId = await ctx.db.insert("chatChannels", {
        startupId: args.startupId,
        kind: "thread",
        anchorType: args.anchorType,
        anchorId: args.anchorId,
        areaId: null,
        dmKey: null,
        name: await anchorTitle(ctx, args.anchorType, args.anchorId),
        isPrivate: false,
        lastMessageAt: Date.now(),
        lastMessagePreview: "",
        lastMessageAuthorId: null,
        messageCount: 0,
        createdByProfileId: profile._id,
        archivedAt: null,
        createdAt: Date.now(),
      });
      channel = await ctx.db.get("chatChannels", channelId);

      // Most ka kanalu oblasti — tim vidi da je diskusija otvorena
      await postSystemMessageToArea(ctx, args, profile, channelId);
    }

    return await insertMessage(ctx, channel!, profile, args.body);
  },
});
```

---

## 5. Unread logika

Najsuptilniji deo. Loše urađen unread je razlog zašto ljudi napuste chat.

### Pri slanju poruke

```ts
// 1. Upiši poruku
const messageId = await ctx.db.insert("chatMessages", { ... });

// 2. Osveži denormalizovani pregled kanala
await ctx.db.patch("chatChannels", channel._id, {
  lastMessageAt: now,
  lastMessagePreview: preview(body),          // max 100 znakova
  lastMessageAuthorId: profile._id,
  messageCount: channel.messageCount + 1,
});

// 3. Uvećaj unread svima osim autoru
for (const recipientId of await channelRecipients(ctx, channel)) {
  if (recipientId === profile._id) continue;

  const read = await getChatRead(ctx, channel._id, recipientId);
  const isMentioned = mentions.includes(recipientId);

  await upsertChatRead(ctx, {
    channelId: channel._id,
    profileId: recipientId,
    unreadCount: (read?.unreadCount ?? 0) + 1,
    mentionCount: (read?.mentionCount ?? 0) + (isMentioned ? 1 : 0),
  });
}
```

### Pri čitanju

```ts
export const markChannelRead = mutation({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const { channel, profile } = await requireChannelAccess(ctx, args.channelId);
    await upsertChatRead(ctx, {
      channelId: channel._id,
      profileId: profile._id,
      lastReadAt: Date.now(),
      unreadCount: 0,
      mentionCount: 0,
    });
  },
});
```

### Pravila koja se lako promaše

- **Autor nikad ne dobija unread za svoju poruku** — očigledno, ali se zaboravi
- **Čitanje na jednom uređaju čisti badge na svim** — `chatReads` je po profilu,
  ne po uređaju
- **Sistemske poruke ne prave unread** — `kind === "system"` se preskače
- **Ne označavaj pročitanim samo zato što je kanal otvoren u pozadini** — traži
  da je ekran u prvom planu i da je dno liste vidljivo
- **Badge na aplikaciji** = zbir `unreadCount` kroz sve kanale svih startupa +
  `notifications.unreadCount`

### Broj poruka koji nije bitan

Za kanale sa `notificationLevel === "mentions"` prikazuj **tačku**, ne broj.
Broj sugeriše da moraš da ih pročitaš sve; tačka kaže „ima nečeg novog".

---

## 5b. Opšti kanal startupa

Svaki startup ima **tačno jedan** opšti kanal — mesto za sve što ne pripada
nijednoj oblasti.

```ts
{
  kind: "startup",
  areaId: null,
  name: "Opšte",
  isPrivate: false,
}
```

Pravila koja ga razlikuju od ostalih:

- **Članstvo je implicitno.** Ko je u `startupMembers`, u kanalu je. Nema
  `chatMembers` redova, ne može se napustiti.
- **Ne može se arhivirati ni obrisati.** Ni admin.
- **Pravi ga migracija**, zajedno sa kanalima oblasti (sekcija 9).
- Stoji **prvi** u listi razgovora, iznad oblasti.

```ts
// convex/lib/chat.ts
export async function startupChannel(ctx: ReadCtx, startupId: Id<"startups">) {
  return await ctx.db
    .query("chatChannels")
    .withIndex("by_startup_and_kind", (q) =>
      q.eq("startupId", startupId).eq("kind", "startup").eq("archivedAt", null),
    )
    .unique();
}
```

Time hijerarhija razgovora izgleda ovako:

```
Opšte              ← ceo startup, jedan
# dev              ← po oblasti
# marketing
# sales
# other
🧵 Redizajn        ← threadovi na entitetima
👤 Marko           ← DM
🤖 Agent           ← AI (06-AGENT.md)
```

---

## 5c. Pretvaranje poruke u entitet

> Ovo je funkcija zbog koje hibridni model ima smisla: razgovor ne ostaje
> razgovor, nego postaje posao.

Long-press na poruku (mobilni) ili kontekstni meni (web) → **„Pretvori u…"** →
zadatak · ideja · misao · beleška.

### Mutacija

```ts
export const convertMessage = mutation({
  args: {
    messageId: v.id("chatMessages"),
    target: v.union(
      v.literal("task"),
      v.literal("note"),
      v.literal("idea"),
      v.literal("thought"),
    ),
    areaId: v.optional(v.id("startupAreas")),   // za task i note
    title: v.optional(v.string()),              // ako korisnik menja naslov
  },
  returns: v.object({
    kind: v.string(),
    id: v.string(),
  }),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("chatMessages", args.messageId);
    if (message === null || message.deletedAt !== null) {
      throw new Error("Poruka nije pronađena.");
    }
    const { channel, profile } = await requireChannelAccess(ctx, message.channelId);

    const title = args.title?.trim() || deriveTitle(message.body);

    // Ide kroz POSTOJEĆE putanje kreiranja — bez novog koda za validaciju,
    // dozvole i aktivnost. Ovo je ceo trik.
    const created = await createFromChat(ctx, {
      target: args.target,
      startupId: channel.startupId,
      areaId: args.areaId,
      title,
      body: message.body,
      profileId: profile._id,
      sourceMessageId: message._id,
    });

    // Trag u razgovoru, da se zna gde je poruka otišla
    await postSystemMessage(ctx, channel._id, {
      body: `${profile.displayName} je pretvorio/la poruku u ${LABEL[args.target]}`,
      targetType: created.kind,
      targetId: created.id,
    });

    return created;
  },
});
```

### Veza u oba smera

Kreirani entitet nosi `sourceMessageId`, pa se sa zadatka može skočiti nazad na
razgovor iz koga je nastao:

```ts
// dodatak na `pages`, `ideaNodes`, `thoughtNodes`
sourceMessageId: v.optional(v.union(v.id("chatMessages"), v.null())),
```

A u razgovoru ostaje sistemska poruka sa linkom napred. Nijedna strana ne gubi
kontekst.

### Šta se ponovo koristi

Na webu već postoje `thought-conversion-dialog.tsx` i
`thought-destination-picker.tsx` — obrazac za „pretvori ovo u ono, izaberi
odredište" je rešen. Chat konverzija koristi isti UI, samo sa drugim izvorom.

### Detalji koji se lako promaše

- **Prilog se prenosi.** Ako je poruka imala sliku, ona postaje prilog na
  stranici, ne gubi se.
- **Naslov se izvodi iz prvog reda**, ostatak ide u telo. Poruka od 400 znakova
  ne sme da postane zadatak sa 400 znakova u naslovu.
- **Konverzija ne briše poruku.** Razgovor ostaje čitljiv.
- **Ista poruka se može pretvoriti više puta** — jednom u zadatak, jednom u
  ideju. Ne zaključavaj.

---

## 6. Veza sa obaveštenjima

Chat ne pravi svoj sistem obaveštenja. Koristi postojeći `createNotification` iz
`convex/lib/notifications.ts`:

```ts
for (const recipientId of recipients) {
  if (recipientId === profile._id) continue;

  const level = await notificationLevelFor(ctx, channel, recipientId);
  const isMentioned = mentions.includes(recipientId);

  if (level === "none") continue;
  if (level === "mentions" && !isMentioned) continue;

  const type = isMentioned
    ? "chat_mention"
    : channel.kind === "dm"
      ? "chat_dm"
      : "chat_message";

  await createNotification(ctx, {
    recipientProfileId: recipientId,
    startupId: channel.startupId,
    type,
    title: channel.kind === "dm" ? profile.displayName : `#${channel.name}`,
    body: preview(body),
    targetType: "chat",
    targetId: channel._id,
    actorProfileId: profile._id,
    // Jedno obaveštenje po kanalu po minutu — bez ovoga brz razgovor
    // pretvori telefon u alarm
    dedupeKey: `chat:${channel._id}:${recipientId}:${Math.floor(now / 60000)}`,
  });
}
```

`dedupeKey` sa minutnim prozorom je **obavezan**. Bez njega deset poruka u minutu
znači deset zvonjava.

Mapiranje na zvuke (`03-NOTIFIKACIJE.md`):

| Tip | Kanal | Zvuk |
|---|---|---|
| `chat_dm` | `dm_v1` | mek dvotonski |
| `chat_mention` | `mention_v1` | oštar uzlazni, timeSensitive |
| `chat_message` | `channel_v1` | tih jedan ton |

---

## 7. Realtime i paginacija

Convex realtime radi bez ijedne linije WebSocket koda:

```tsx
const { results, status, loadMore } = usePaginatedQuery(
  api.chat.messages,
  { channelId },
  { initialNumItems: 50 },
);
```

Nova poruka se pojavi kod svih automatski.

**Obrnuta paginacija:** chat se čita odozdo naviše. Lista mora biti `inverted`
sa `FlatList`, a `loadMore` se poziva pri skrolovanju **gore**, ne dole.

**Optimistički unos:** poruka se pojavi odmah, sa oznakom „šalje se", pa se
zameni pravom kad Convex potvrdi. Convex ima ugrađen optimistic update — koristi
ga, jer razlika od 200 ms u chatu se oseti.

**Indikator kucanja:** ne u bazi. Ephemeral stanje kroz zaseban lagani mehanizam
ili se jednostavno preskoči u v1 — vredi manje nego što košta.

---

## 8. Funkcije u `convex/chat.ts`

### Upiti

| Funkcija | Vraća |
|---|---|
| `listChannels` | Kanali startupa sa unread brojevima, sortirano po `lastMessageAt` |
| `listDirectMessages` | DM-ovi trenutnog korisnika |
| `listFollowedThreads` | Threadovi u kojima korisnik učestvuje |
| `messages` | Paginirane poruke kanala, sa autorima i reakcijama |
| `channelForAnchor` | Kanal za dati entitet ili `null` |
| `unreadSummary` | Ukupan broj za badge, po startupu i globalno |
| `searchMessages` | Pretraga kroz poruke (Convex search index) |

### Mutacije

| Funkcija | Radnja |
|---|---|
| `sendMessage` | Slanje u postojeći kanal |
| `sendToAnchor` | Slanje sa lazy kreiranjem threada |
| `editMessage` | Izmena (samo autor, ograničenje ~15 min) |
| `deleteMessage` | Soft delete (autor ili admin) |
| `markChannelRead` | Nuliranje unread-a |
| `toggleReaction` | Dodaj/ukloni emoji |
| `createChannel` | Novi custom kanal (admin) |
| `openDirectMessage` | Nađi ili napravi DM po `dmKey` |
| `setNotificationLevel` | `all` / `mentions` / `none` po kanalu |
| `archiveChannel` | Arhiviranje (admin) |

### Interne

| Funkcija | Radnja |
|---|---|
| `postSystemMessage` | Sistemske poruke („diskusija otvorena") |
| `backfillAreaChannels` | Migracija: kanal po oblasti za sve startupe |

---

## 9. Migracija

Projekat već koristi `@convex-dev/migrations`. Jedna migracija:

1. Za svaki aktivan startup, za svaku njegovu oblast — napravi `chatChannels`
   sa `kind: "area"`, `name` iz `startupAreas.label`
2. Za svakog člana — `chatReads` sa `unreadCount: 0`
3. Bez sistemskih poruka dobrodošlice (prazan kanal je bolji od lažnog sadržaja)

Threadovi se ne migriraju — nastaju sami, kad zatrebaju.

---

## 10. Faze implementacije

| # | Šta | Trajanje |
|---|---|---|
| 1 | Schema, indeksi, migracija kanala oblasti | 2 dana |
| 2 | `sendMessage`, `messages`, `listChannels` | 2 dana |
| 3 | Unread logika + `markChannelRead` | 1 dan |
| 4 | Mobilni UI: lista razgovora + ekran razgovora | 4 dana |
| 5 | DM (`openDirectMessage`, `dmKey`) | 1 dan |
| 6 | Threadovi na entitetima + most ka kanalu | 2 dana |
| 7 | Pominjanja sa autocomplete-om | 1 dan |
| 8 | Reakcije, odgovori, izmena, brisanje | 2 dana |
| 9 | Prilozi (slika, fajl, kamera) | 2 dana |
| 10 | Veza sa obaveštenjima i zvucima | 2 dana |
| 11 | Web verzija chata (paritet sa desktopom) | 3 dana |

**Ukupno ~3 nedelje.** Backend je ~40% posla, mobilni UI ~40%, web ~20%.

---

## 11. Šta *ne* radimo u v1

Namerno izostavljeno — svaka stavka je zaseban projekat:

- ❌ End-to-end enkripcija (Convex već štiti podatke; E2E bi ubio pretragu)
- ❌ Glasovni i video pozivi (koristite Meet ili Zoom)
- ❌ Indikator kucanja (košta više nego što vredi)
- ❌ Zakazane poruke
- ❌ Botovi i integracije
- ❌ Threadovi unutar threadova
- ❌ Gosti van startupa

Ako nešto od ovoga zatreba, ulazi u zaseban plan sa sopstvenom procenom.
