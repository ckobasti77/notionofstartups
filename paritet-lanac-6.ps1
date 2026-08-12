# ============================================================================
#  DEVOTION - LANAC 6: POTPUN FUNKCIONALNI PARITET
#
#  Osnova: docs/mobile/PARITET-REVIZIJA-12-08.md (sest nezavisnih revizora).
#  Brojac po imenima Convex funkcija kaze 6. Stvarnih rupa ima oko 40.
#  Cilj: zatvoriti sekcije B, C i D iz tog dokumenta.
#
#  Svi koraci na Opus 5.
#
#  Pokretanje:
#      powershell -ExecutionPolicy Bypass -File .\paritet-lanac-6.ps1
#
#  Ujutru: docs\mobile\lanac6\IZVESTAJ.md
# ============================================================================

param(
    # JAK model - planiranje, revizija i faze gde se donose arhitektonske odluke.
    # "opus" je alias koji nalog razresava na Opus 5.
    [string]$Jak = "opus",

    # SLABIJI model - faze gde je uzor pred nosom i posao je mehanicki.
    # Na sitnim, dobro opisanim zadacima je brzi i ne halucinira manje od jakog.
    [string]$Slab = "sonnet",

    # Preskoci faze pre ove. Kljucevi: p1 ... p7
    [string]$Od = ""
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Grana       = "paritet6-" + (Get-Date -Format "yyyyMMdd-HHmm")
$LanacDir    = "docs\mobile\lanac6"
$LogDir      = "$LanacDir\logovi"
$PromptDir   = "$LanacDir\promptovi"
$PlanDir     = "$LanacDir\planovi"
$Izvestaj    = "$LanacDir\IZVESTAJ.md"
$RokPlan     = 3600
$RokFaza     = 16200
$RokProvera  = 2700
$MaxPopravki = 3

if (-not (Test-Path "convex.json") -or -not (Test-Path "apps\mobile")) {
    Write-Host "GRESKA: pokreni iz root-a repoa." -ForegroundColor Red; exit 1
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "GRESKA: 'claude' nije na PATH-u." -ForegroundColor Red; exit 1
}
if (-not (Test-Path "docs\mobile\PARITET-REVIZIJA-12-08.md")) {
    Write-Host "GRESKA: nema docs\mobile\PARITET-REVIZIJA-12-08.md - to je osnova lanca." -ForegroundColor Red; exit 1
}
if (Test-Path ".git\index.lock") {
    Write-Host "Uklanjam zaostali .git\index.lock" -ForegroundColor DarkGray
    Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path $LogDir, $PromptDir, $PlanDir | Out-Null
Remove-Item "$LogDir\*" -Force -ErrorAction SilentlyContinue

git checkout -b $Grana 2>&1 | Out-Null

$Pomoc = (& claude --help 2>&1 | Out-String)
if ($Pomoc -match "--permission-mode") { $FLAG_PERM = "--permission-mode bypassPermissions" }
else                                   { $FLAG_PERM = "--dangerously-skip-permissions" }
$FLAG_EFFORT = $null
foreach ($k in @("--effort","--reasoning-effort","--thinking-effort")) {
    if ($Pomoc -match [regex]::Escape($k)) { $FLAG_EFFORT = $k; break }
}
if (-not $FLAG_EFFORT) {
    Write-Host "GRESKA: ova verzija claude CLI-ja nema zastavicu za effort." -ForegroundColor Red
    exit 1
}

function Zapisi([string]$t) { Add-Content -Path $Izvestaj -Value $t -Encoding UTF8 }

function ZapisiFajl([string]$putanja, [string]$sadrzaj) {
    [System.IO.File]::WriteAllText((Join-Path (Get-Location).Path $putanja), $sadrzaj,
        (New-Object System.Text.UTF8Encoding($false)))
}

function PustiKlod {
    param([string]$PromptFajl, [string]$Log, [int]$Rok, [string]$ModelKorak, [string]$Effort)
    if (-not $Effort)     { throw "PustiKlod bez effort-a." }
    if (-not $ModelKorak) { throw "PustiKlod bez modela." }

    $lista = @("-p", "--model", $ModelKorak)
    $lista += @($FLAG_EFFORT, $Effort)
    $lista += ($FLAG_PERM -split ' ')
    Write-Host "      [model $ModelKorak | effort $Effort]" -ForegroundColor DarkGray
    $spojeni = $lista -join "`t"

    for ($pokusaj = 1; $pokusaj -le 72; $pokusaj++) {

        $preRedova = 0
        if (Test-Path $Log) {
            $preRedova = @(Get-Content -LiteralPath $Log -ErrorAction SilentlyContinue).Count
        }

        $job = Start-Job -ScriptBlock {
            param($pf, $lg, $wd, $sp)
            Set-Location $wd
            $al = $sp -split "`t"
            (Get-Content -LiteralPath $pf -Raw) | & claude @al 2>&1 |
                Out-File -FilePath $lg -Append -Encoding UTF8
            if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
        } -ArgumentList $PromptFajl, $Log, (Get-Location).Path, $spojeni

        $gotov = Wait-Job $job -Timeout $Rok
        if (-not $gotov) {
            Write-Host "    !! istekao rok, prekidam korak" -ForegroundColor Yellow
            Stop-Job $job; Remove-Job $job -Force
            return 124
        }
        $rc = Receive-Job $job; Remove-Job $job -Force
        if ($rc -is [array]) { $rc = $rc[-1] }

        $sviRedovi = @(Get-Content -LiteralPath $Log -ErrorAction SilentlyContinue)
        $novo = ($sviRedovi | Select-Object -Skip $preRedova) -join "`n"

        if ($novo -match "unknown option|unknown argument|error: unknown") {
            Write-Host ""
            Write-Host "PREKID: claude odbija argumente: claude $($lista -join ' ')" -ForegroundColor Red
            exit 1
        }

        if ($novo -match "hit your weekly limit|usage limit|rate limit|Claude usage limit reached") {
            $kad = ""
            $m = [regex]::Match($novo, "resets?\s+([^\r\n]{1,40})")
            if ($m.Success) { $kad = " (resetuje se " + $m.Groups[1].Value.Trim() + ")" }
            Write-Host ""
            Write-Host "    LIMIT u $(Get-Date -Format 'HH:mm')$kad" -ForegroundColor Yellow
            Write-Host "    Cekam 20 min pa pokusavam ISTI korak ponovo (pokusaj $pokusaj/72)." -ForegroundColor Yellow
            Zapisi "- LIMIT u $(Get-Date -Format 'HH:mm')$kad - cekam 20 min, pokusaj $pokusaj"
            git add -A 2>&1 | Out-Null
            git commit -q -m "Cekanje na limit potrosnje (pokusaj $pokusaj)" 2>&1 | Out-Null
            Start-Sleep -Seconds 1200
            continue
        }

        if ([string]::IsNullOrWhiteSpace($novo)) {
            Write-Host "    !! prazan odgovor - cekam 5 min pa ponovo (pokusaj $pokusaj/72)" -ForegroundColor Red
            Zapisi "- prazan odgovor, ponavljam (pokusaj $pokusaj)"
            Start-Sleep -Seconds 300
            continue
        }

        if ($pokusaj -gt 1) {
            Write-Host "    nastavljeno posle cekanja (pokusaj $pokusaj)" -ForegroundColor Green
            Zapisi "- nastavljeno posle cekanja u $(Get-Date -Format 'HH:mm')"
        }
        if ($null -eq $rc) { return 0 }
        return [int]$rc
    }

    Write-Host "    !! 24h cekanja i limit se nije oslobodio - odustajem od koraka" -ForegroundColor Red
    Zapisi "- **ODUSTAO** posle 24h cekanja na limit"
    return 126
}

function PokreniSaRokom([string]$Komanda, [string]$Log, [int]$Rok) {
    $job = Start-Job -ScriptBlock {
        param($k, $l, $wd)
        Set-Location $wd
        cmd /c "$k" *>&1 | Out-File -FilePath $l -Append -Encoding UTF8
        $LASTEXITCODE
    } -ArgumentList $Komanda, $Log, (Get-Location).Path
    $d = Wait-Job $job -Timeout $Rok
    if (-not $d) { Stop-Job $job; Remove-Job $job -Force; return 124 }
    $rc = Receive-Job $job; Remove-Job $job -Force
    if ($rc -is [array]) { $rc = $rc[-1] }
    if ($null -eq $rc) { return 0 }
    return [int]$rc
}

$Zaglavlje = @"
Devotion monorepo: apps/web (Next.js), apps/mobile (Expo/React Native),
packages/backend (Convex). Sve na srpskom. Nenadzirano izvrsavanje - ne pitaj,
odlucuj i radi.

PROCITAJ PRVO:
  docs/mobile/PARITET-REVIZIJA-12-08.md  <- OSNOVA ovog lanca, spisak svih rupa
  docs/mobile/ZA-POPRAVKU.md             <- naucene zamke, ne ponavljaj ih
  docs/mobile/00-PLAN.md                 <- arhitektura, protokol WebView mosta
  docs/mobile/lanac4/REZIM.md            <- protokol rezima "Uredi raspored"

BACKEND SMES DA MENJAS. Neke rupe traze nove funkcije (npr. chat.setChannelMembers
ne postoji uopste). Kad dodajes funkciju, dodaj i test.

NAJVAZNIJE PRAVILO OVOG LANCA - MRTAV KOD JE NEUSPEH.
Dva puta se vec desilo da je posao "uradjen" a nedostupan:
  1. Faza K4 lanca 4: komponente napisane, native ljuska nikad povezana, sheet je
     bio mrtav kod. Nijedna kapija to nije videla - kod se kompajlira, lint je cist.
  2. inviteLinkUrl je UVEZEN u apps/mobile/src/app/(app)/pozivnice.tsx i NIKAD
     POZVAN, pa se pozivnica i dalje kopira kao goli kod.
Zato: za SVAKU novu komponentu, hook ili helper dokazi lancem uvoza do ekrana koji
korisnik stvarno otvara. Ako ne mozes da napises taj lanac - nije uradjeno.

OSTALA PRAVILA:
- Paritet je FUNKCIONALNI, ne vizuelni. Pitaj se kako se isti ishod postize prstom.
- Dodirna meta min 44pt. Tekst min 16px osim meta.
- Svaka izmena koja pise u bazu ima "Ponisti" - koristi postojeci lib/undo.ts.
- Prazno, ucitavanje i greska - sva tri stanja svuda gde dodajes.
- Uz svaki cekiran kvadratic napisi fajl i liniju kao dokaz.
- Ne cekiraj nista sto ne mozes da dokazes. Radije napisi "nije uradjeno" -
  faza K6 lanca 4 je to uradila i zato joj se veruje.
- Ako menjas apps/mobile/package.json, zapisi u docs/mobile/lanac6/NATIVE-BUILD.md
  (native build je tada obavezan, Metro reload nije dovoljan).

"@

$Kraj = @"

NA KRAJU FAZE, ovim redom:
  cd apps/mobile && npx tsc --noEmit
  cd apps/web    && npx tsc --noEmit
  npm run lint
  npm test
  npm run build
Popravi sve sto padne. Ne ostavljaj gresku sledecoj fazi.
"@

$Faze = @(
    @{
        k = "p1"; effort = "high";  model = $Slab
        n = "P1 - Preimenovanje, pozivnica kao link, mrtav kod"
        cilj = "Sa telefona mozes da preimenujes bilo sta, a pozivnica se kopira kao link koji se otvara."
        telo = @"
FAZA P1 - NAJJEFTINIJE, A NAJVISE BOLI (revizija: B2, B3, B5, C17, mrtav kod)

1. PREIMENOVANJE (B2, B3). Sa telefona se moze preimenovati samo beleska.
   Zadatak (zadatak/[id].tsx:168) i stranice tipa Tabela i Prilozi
   (stranica/[id].tsx:77) imaju naslov kao cist tekst. Web to radi u
   page-editor-view.tsx:694 i :1097.
   Dodaj "Preimenuj" u page-actions-sheet.tsx i ekvivalent za zadatak.
   Ista mutacija koju beleska vec koristi.

2. POZIVNICA KAO LINK (B5). apps/mobile/src/app/(app)/pozivnice.tsx:258 kopira
   GOLI KOD. Helper inviteLinkUrl je uvezen na liniji 33 i NIKAD POZVAN.
   Web (admin-dialog.tsx:408) kopira punu adresu sa ?invite=KOD.
   Popravi da mobilni kopira isto. Ovo je najvazniji red u celoj fazi - korisnik
   pusta aplikaciju drugarima i pozivnica koja se ne otvara je zid.

3. KOD POSTOJECE POZIVNICE (C17). Kod zivi samo u jednokratnom Alert-u; kad ga
   zatvoris, nema ga vise (server cuva hash). Web ga drzi u panelu.
   Resenje: kod ostaje vidljiv u redu pozivnice dok je sesija ziva, ili se pri
   kreiranju ponudi "Podeli" kroz sistemski share sheet. Odluci i obrazlozi.

4. MRTAV EXPORT CHAT_PRESENCE_REFRESH_MS. validators.ts:189 ga izvozi, niko ga ne
   uvozi - oba hook-a hardkoduju svojih 15_000
   (apps/web/components/workspace/chat/use-chat-presence.ts:14,
    apps/mobile/src/hooks/use-chat-presence.ts:13).
   Neka oba uvoze deljenu konstantu, da promena TTL-a na serveru pomeri i klijente.

5. Prodji kroz apps/mobile/src i nadji JOS mrtvih uvoza istog tipa
   (uvezeno pa nikad pozvano). Popravi ili ukloni. Spisak u izvestaj faze.
"@
    },
    @{
        k = "p2"; effort = "max";   model = $Jak
        n = "P2 - Editor beleske: tabela, slika, prilog, kod"
        cilj = "Beleska koja sadrzi tabelu, sliku, prilog ili blok koda moze da se uredjuje sa telefona."
        telo = @"
FAZA P2 - EDITOR BELESKE (revizija: B1, B7) - NAJTEZA FAZA LANCA

Ovo je jedini nalaz cele revizije gde mobilni korisnik ostaje bez pristupa
SADRZAJU KOJI VEC POSTOJI, a ne samo bez alata.

Stanje: apps/mobile/src/components/stranica/note-editor.tsx:167 postavlja
bodyEditable=false i pada na NoteReader cim beleska sadrzi tabelu, prilog ili
blok koda. Web (rich-text-editor.tsx:404,409,417,429) sve to ume.

Cilj po vaznosti:
  a) UREDIVANJE beleske koja te blokove VEC SADRZI, bez gubitka podataka.
     Ovo je vaznije od ubacivanja novih. Ako stignes samo dotle - faza je uspela.
  b) Ubacivanje slike u telo (galerija i kamera; tok uploada vec postoji u
     components/stranica/files-panel.tsx).
  c) Ubacivanje priloga (noteFile cvor).
  d) Tabela: ubacivanje, dodavanje i brisanje reda i kolone, red zaglavlja.
     Uvoz CSV/XLSX ostavi za kraj i preskoci ako nema vremena - zapisi zasto.

Tehnicki: @10play/tentap-editor prosiruje se kroz bridge extensions. Proveri sta
je vec u bundle-u pre nego sto dodajes. Ako moras da dodas paket u
apps/mobile/package.json, ZAPISI u docs/mobile/lanac6/NATIVE-BUILD.md - tada je
native build obavezan i korisnik to mora da zna.

ZAMKA: gubitak sadrzaja pri round-tripu je gori od nemogucnosti uredjivanja.
Napisi test koji uzme dokument sa tabelom, otvori ga, sacuva bez izmene i uporedi
JSON. Ako se razlikuje - stani i zapisi, ne isporucuj.
"@
    },
    @{
        k = "p3"; effort = "max";   model = $Jak
        n = "P3 - Chat: diskusija nad idejom, clanovi kanala, prilozi"
        cilj = "Chat na telefonu radi sve sto radi na webu: diskusija uz ideju, clanovi privatnog kanala, vise fajlova, video, kopiranje teksta."
        telo = @"
FAZA P3 - CHAT (revizija: B4, B6 i sitno iz sekcije D)

1. DISKUSIJA NAD IDEJOM (B4). Web nudi EntityDiscussionPanel sa anchorType="idea"
   na dva mesta (ideas-view.tsx:646 i :818). Mobilni chat.channelForAnchor i
   sendToAnchor zove ISKLJUCIVO sa anchorType:'page'
   (components/zadatak/discussion-link.tsx:48-49,63). Ekran ideje ima
   ContributionThread, sto je druga stvar (predlozi izmena) iako je sekcija
   nazvana "Diskusija" (ideja/[id].tsx:252).
   Backend je ceo tu. Uopsti discussion-link.tsx da prima anchorType i prikljuci
   ga na ekran ideje. Pazi da naziv sekcije ne bude dvosmislen.

2. CLANOVI PRIVATNOG KANALA (B6). Privatan kanal napravljen sa telefona ostaje
   TRAJNO bez clanova: new-conversation-sheet.tsx:117 ne salje memberProfileIds, a
   chat.setChannelMembers NE POSTOJI UOPSTE (komentar u kodu upucuje na web
   putanju koje nema). Dodaj biranje clanova pri kreiranju I mutaciju
   setChannelMembers sa testom, pa izlaz iz cheorsokaka postoji na obe platforme.

3. PRILOZI I SITNICE:
   - vise fajlova odjednom (mobilni uvek uzima result.assets[0]; web salje po
     jednu poruku po fajlu preko use-attachment-sender.ts)
   - video iz galerije (mediaTypes: ['images'] u chat kompozeru, a
     components/stranica/files-panel.tsx:112 istog tima vec koristi
     ['images','videos'] - dakle nije platformsko ogranicenje)
   - kopiranje teksta poruke (message-bubble.tsx:193 nema selectable; expo-clipboard
     se vec koristi drugde)
   - pretraga clanova pri otvaranju DM-a (web new-conversation.tsx:154)
   - pomen @ u SREDINI teksta (mobilni message-composer.tsx:106 gleda lastIndexOf
     i brise sve posle @; web umece na poziciju kursora)
   - izmena poruke koja nosi prilog (mobilni canEdit trazi kind==='text', web ne;
     backend to dozvoljava)
   - objasnjenje zasto izmena vise nije moguca posle 15 minuta

4. STORAGE SIROCICI. chat.generateUploadUrl:1751 nema granice, a odbijen blob se
   NE BRISE (zapisano u chat.ts:833-836). Zatvori: ili proveri pre izdavanja URL-a,
   ili obrisi blob kad resolveAttachment odbije.
"@
    },
    @{
        k = "p4"; effort = "xhigh"; model = $Slab
        n = "P4 - Ideje i misli: doslednost i kanvas prikaz"
        cilj = "Ideje imaju sve sto imaju misli, a kanvas prikazuje boju i oznaku veze koje korisnik unosi."
        telo = @"
FAZA P4 - IDEJE I MISLI (revizija: C3, C4, C5, C6, C8, C16 i sitno)

Sistemski nalaz: ideje su siromasnije od misli na ISTOJ arhitekturi. To nije
platforma, to je propusten posao, i najjeftinije je za zatvaranje.

1. BOJA KARTICE IDEJE (C3). Web ideas-view.tsx:768-791 nudi 6 boja pri kreiranju i
   izmeni. Mobilni: idea-create-sheet.tsx:56 bez boje, ideja/[id].tsx:102-106
   prosledjuje staru vrednost uz komentar "mobilni jos nema piker boje ideje".
   Misli boju IMAJU (thought-node-sheet.tsx:182) - iskoristi taj isti ColorRow.

2. DUPLIRANJE IDEJE (C4). Web ideas-canvas-view.tsx:1291. Misli imaju
   (thought-actions-sheet.tsx:259), ideje nemaju.

3. OZNAKA VEZE SE NE VIDI (C5). Korisnik je moze upisati
   (idea-edge-sheet.tsx:145), ali je embed ne renderuje
   (canvas-embed.tsx:1353-1357 za ideje, :1723-1727 za misli).
   Pise nesto sto nikad ne vidi - to je gore nego da funkcije nema.

4. BOJA CVORA SE NE VIDI NA KANVASU (C6). Podatak stize do klijenta i crta se u
   native listi (misli.tsx:335), ali embed-node.tsx:186-187 crta samo tekst.

5. FILTER I PRETRAGA unutar ideja i misli (C8). Web ideas-view.tsx:415-424 filtrira
   uzivo i tabelu i kanvas.

6. STATUS ODOBRENJA IDEJE (C16). isApproved je skriven uslov za "Pretvori"
   (idea-actions-sheet.tsx:269), pa se stavka pojavljuje i nestaje bez objasnjenja.
   Prikazi status.

7. Sitno: datum kreiranja u listi ideja; "nova grana ideje" u jednom potezu
   (create sheet ne salje parentIdeaId); "nova povezana misao".
"@
    },
    @{
        k = "p5"; effort = "high";  model = $Jak
        n = "P5 - Struktura: ugnjezdavanje, premestanje, putanja, doprinosi"
        cilj = "Sa telefona se stranica moze smestiti bilo gde u stablu, a iz putanje se moze skociti na roditelja."
        telo = @"
FAZA P5 - STRUKTURA I NAVIGACIJA (revizija: C7, C9, C10, C11, C13, C14)

1. UGNJEZDAVANJE DUBLJE OD KORENA (C9). page-actions-sheet.tsx:94-100 nudi kao
   kandidate ISKLJUCIVO stranice sa parentPageId: null. Web prevlacenjem u stablu
   (page-tree.tsx:186-235) ume bilo koju dubinu.

2. PREMESTANJE U OBLAST POD ODREDJENU STRANICU (C10). page-actions-sheet.tsx:129-140
   uvek salje targetParentPageId: null, pa stranica sleti u koren. Web to radi u
   jednom potezu (workspace-shell.tsx:488-500).

3. BREADCRUMBS KAO DUGMAD (C11). breadcrumbs-eyebrow.tsx:74-84 je cist Text,
   nedodirljiv, uz komentar da je to svesna odluka. Posle dubokog linka nema puta
   ka roditelju - to tu odluku obara. Web: page-editor-view.tsx:1607-1637.

4. FILTER PO TIPU U OBLASTI (C7). Web area-view.tsx:337-356 filtrira Sve/Beleska/
   Zadatak/Tabela/Prilozi. Mobilni prostor.tsx nema nijedan filter.

5. NIT DOPRINOSA NA CHECKPOINTU (C13). Web task-checkpoint-list.tsx:569-584 i sa
   liste i sa kanvasa. Mobilni ContributionThread se montira samo za idea i page.

6. POTPISANI DOPRINOSI NA NIVOU OBLASTI (C14). Web area-signed-contributions.tsx
   montiran u area-view.tsx:312. Mobilni prostor.tsx ima samo brifing.
"@
    },
    @{
        k = "p6"; effort = "xhigh"; model = $Slab
        n = "P6 - Pamcenje stanja, undo/redo, kontrola push-a"
        cilj = "Tema i aktivan startup prezive restart, ponistavanje ide vise koraka unazad, i push se moze iskljuciti sa uredjaja."
        telo = @"
FAZA P6 - POSTOJANOST I KONTROLA (revizija: C1, C2, C12, C15)

1. TEMA NE PREZIVLJAVA RESTART (C1). apps/mobile/src/theme/theme-provider.tsx:35 je
   useState('system') bez ikakvog cuvanja. Web koristi localStorage
   (theme-provider.tsx:57-91). Koristi AsyncStorage ili SecureStore - sto je vec u
   projektu, ne dodaji nov paket ako ne moras.

2. AKTIVAN STARTUP NE PREZIVLJAVA RESTART (C2). context/active-startup.tsx:17 uvek
   pada na startups[0]. Web ga drzi u URL-u. Zapamti poslednji izbor po korisniku.
   PAZI: ako korisnik vise nije clan zapamcenog startupa, mora da padne na prvi
   dostupan, ne na belo.

3. UNDO DUBLJI OD JEDNOG KORAKA I REDO (C12). lib/undo.ts:210 pushUndo PREGAZI
   prethodnu stavku - stek je dubine jedan, a traka nestaje za 8 s. Web ima
   neogranicen stek i Ctrl+Y (workspace-history.tsx:47-114).
   Na telefonu precice nema, pa redo mora da ima svoje mesto u UI-ju. Odluci gde i
   obrazlozi. Ako procenis da redo na telefonu nema smisla, NE radi ga - ali onda
   to zapisi kao odluku sa razlogom, ne kao propust.

4. ISKLJUCITI PUSH NA OVOM UREDJAJU (C15). Web notifications-panel.tsx:396-406.
   Backend expoPushTokens.remove POSTOJI (:102) i mobilni ga NE ZOVE. Dodaj dugme u
   podesavanja-obavestenja.tsx, uz jasno objasnjenje sta se gubi.
"@
    },
    @{
        k = "p7"; effort = "xhigh"; model = $Jak
        n = "P7 - Ostatak sitnog, revizija cele liste, zatvaranje"
        cilj = "Svaka stavka iz sekcija B, C i D je ili uradjena ili zapisana kao odluka sa razlogom - nijedna necuta."
        telo = @"
FAZA P7 - ZATVARANJE

1. Prodji sekciju D (sitno) iz docs/mobile/PARITET-REVIZIJA-12-08.md i uradi sve
   sto prethodne faze nisu pokupile: ikonica i naziv oblasti u zaglavlju kanala,
   pregled videa i "Preuzmi" u pregledacu priloga, kanban "Tabla" za zadatke,
   "Sastav nedelje" na Pulsu, spisak tima za ne-admina, poruka da je lista zahteva
   odsecena na 100, rok kao pun kalendar pri kreiranju, sadrzaj beleske i izbor
   oblasti u dijalogu kreiranja, vise priloga odjednom na stranici.

2. Za SVAKU stavku iz sekcija B, C i D napisi ishod: URADJENO (fajl i linija) ili
   NIJE URADJENO (razlog). Nijedna stavka ne sme da ostane necutana - tabela mora
   imati onoliko redova koliko revizija ima stavki.

3. LOV NA MRTAV KOD. Za svaku komponentu, hook i helper dodat u ovom lancu napisi
   lanac uvoza do ekrana koji korisnik otvara. Ako neki lanac ne postoji - to je
   posao, ne napomena. Ovo je pravilo zbog kog faza K4 lanca 4 nije prosla.

4. Sve kapije moraju da prodju:
   cd apps/mobile && npx tsc --noEmit
   cd apps/web    && npx tsc --noEmit
   npm run lint
   npm test
   npm run build

5. Napisi docs/mobile/lanac6/BRIEF.md: sta je uradjeno po fazi, sta nije i zasto,
   sta trazi native build (vidi NATIVE-BUILD.md), i sta covek MORA sam da proveri
   na fizickom telefonu.

6. Azuriraj docs/mobile/PARITET.md i docs/mobile/PARITET-REVIZIJA-12-08.md tako da
   odrazavaju novo stanje. Ne brisi istoriju - dopisi ishod uz svaku stavku.
"@
    }
)

if (Test-Path $Izvestaj) { Remove-Item $Izvestaj -Force }
Zapisi "# Devotion - lanac 6: potpun funkcionalni paritet"
Zapisi ""
Zapisi "- Pocetak: $((Get-Date).ToString('s'))"
Zapisi "- Grana: ``$Grana``"
Zapisi "- Jak model (plan, revizija, teske faze): ``$Jak``"
Zapisi "- Slabiji model (mehanicke faze): ``$Slab``"
Zapisi "- Zastavica za effort: ``$FLAG_EFFORT``"
Zapisi "- Osnova: ``docs/mobile/PARITET-REVIZIJA-12-08.md``"
Zapisi ""

Write-Host ""
Write-Host "LANAC 6 - PARITET - grana $Grana" -ForegroundColor Cyan
Write-Host "Jak: $Jak   Slab: $Slab   Effort zastavica: $FLAG_EFFORT" -ForegroundColor Cyan
Write-Host ""

$preskoci = ($Od -ne "")

foreach ($f in $Faze) {
    $kljuc = $f.k; $naziv = $f.n; $cilj = $f.cilj; $telo = $f.telo; $eff = $f.effort; $ModelFaze = $f.model

    if ($preskoci) {
        if ($kljuc -eq $Od) { $preskoci = $false }
        else { Write-Host "(preskacem $kljuc)" -ForegroundColor DarkGray; continue }
    }

    $log = "$LogDir\$kljuc.log"
    $planFajl = "$PlanDir\$kljuc.md"
    $t0 = Get-Date

    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host "==> $naziv   ($(Get-Date -Format 'HH:mm'))" -ForegroundColor Cyan
    Write-Host "    CILJ: $cilj" -ForegroundColor White
    Write-Host "======================================================================" -ForegroundColor Cyan

    Zapisi ""
    Zapisi "## $naziv"
    Zapisi ""
    Zapisi "**Cilj:** $cilj"
    Zapisi ""
    Zapisi "| Korak | Model | Effort |"
    Zapisi "|---|---|---|"
    Zapisi "| PLAN | ``$Jak`` | ``max`` |"
    Zapisi "| IZVRSI | ``$ModelFaze`` | ``$eff`` |"
    Zapisi "| REVIZIJA | ``$Jak`` | ``max`` |"
    Zapisi ""
    Zapisi "- Start: $((Get-Date).ToString('s'))"

    $shaPre = (git rev-parse --short HEAD).Trim()

    Write-Host "--> [1/3] PLAN" -ForegroundColor Magenta
    ZapisiFajl "$PromptDir\$kljuc-plan.txt" ("ultrathink`n`n" + $Zaglavlje + $telo + @"

=====================================================================
KORAK PLANIRANJA. NE MENJAJ NIJEDAN FAJL SA KODOM.
=====================================================================
CILJ FAZE: $cilj

Napisi plan u $planFajl. Mora da sadrzi:
1. Sta si procitao i sta si zatekao - imena fajlova i linije. Ako je nesto vec
   uradjeno, reci to i izbaci iz plana.
2. Redosled izmena, jedna po jedna, sa fajlom i razlogom.
3. Za svaku: LANAC UVOZA do ekrana koji korisnik otvara. Bez toga je mrtav kod.
4. Sta moze da pukne i sta ces uraditi ako pukne.
5. Sta NECES raditi i zasto.
6. Kako ces dokazati da svaka stavka radi - konkretan test, ne tvrdnja.

Kratko i konkretno. Drugi agent ce ovo sprovesti doslovno.
"@)
    PustiKlod -PromptFajl "$PromptDir\$kljuc-plan.txt" -Log $log -Rok $RokPlan -ModelKorak $Jak -Effort "max" | Out-Null
    if (Test-Path $planFajl) { Zapisi "- PLAN: napisan" } else { Zapisi "- PLAN: **nije napisan**" }
    git add -A 2>&1 | Out-Null
    git commit -q -m "Plan: $naziv" 2>&1 | Out-Null

    Write-Host "--> [2/3] IZVRSI" -ForegroundColor Magenta
    ZapisiFajl "$PromptDir\$kljuc.txt" ("ultrathink`n`n" + $Zaglavlje + $telo + @"

=====================================================================
CILJ FAZE: $cilj
=====================================================================
Plan je u $planFajl - procitaj ga PRVO i sprovedi. Ako odstupis, dopisi u plan
sta si promenio i zasto.

Faza je gotova tek kad je cilj ispunjen, a ne kad si prosao kroz spisak.
"@ + $Kraj)
    $rc = PustiKlod -PromptFajl "$PromptDir\$kljuc.txt" -Log $log -Rok $RokFaza -ModelKorak $ModelFaze -Effort $eff
    if ($rc -eq 124)      { Zapisi "- IZVRSI: **PREKINUTO** - istekao rok" }
    elseif ($rc -ne 0)    { Zapisi "- IZVRSI: **PAO** (kod $rc)" }
    else                  { Zapisi "- IZVRSI: proslo" }

    Write-Host "--> provere" -ForegroundColor DarkGray
    $provere = @(
        @{ ime = "tsc mobilni"; cmd = "cd apps\mobile && npx tsc --noEmit" },
        @{ ime = "tsc web";     cmd = "cd apps\web && npx tsc --noEmit" },
        @{ ime = "lint";        cmd = "npm run lint" },
        @{ ime = "test";        cmd = "npm test" }
    )
    $palo = @()
    foreach ($p in $provere) {
        if ((PokreniSaRokom $p.cmd $log $RokProvera) -eq 0) { Zapisi "- ``$($p.ime)``: prolazi" }
        else { Zapisi "- ``$($p.ime)``: **PADA**"; $palo += $p.ime }
    }

    if ($palo.Count -gt 0) {
        $spisak = $palo -join ", "
        for ($i = 1; $i -le $MaxPopravki; $i++) {
            Write-Host "--> popravka $i - $spisak" -ForegroundColor Yellow
            ZapisiFajl "$PromptDir\popravka.txt" @"
think harder

Posle faze "$naziv" padaju: $spisak

Pokreni svaku, procitaj greske i popravi ih. Ne ucutkuj pravilo da bi proslo -
popravi pravi uzrok. Ako je greska zatecena i van opsega faze, zapisi je u
docs/mobile/ZA-POPRAVKU.md sa objasnjenjem.

  cd apps/mobile && npx tsc --noEmit
  cd apps/web    && npx tsc --noEmit
  npm run lint
  npm test
"@
            PustiKlod -PromptFajl "$PromptDir\popravka.txt" -Log $log -Rok $RokProvera -ModelKorak $Jak -Effort "high" | Out-Null
            $jos = @()
            foreach ($p in $provere) {
                if ((PokreniSaRokom $p.cmd $log $RokProvera) -ne 0) { $jos += $p.ime }
            }
            if ($jos.Count -eq 0) { Zapisi "- popravka ${i}: sve kapije prolaze"; break }
            $spisak = $jos -join ", "
            Zapisi "- popravka ${i}: jos pada $spisak"
        }
    }

    git add -A 2>&1 | Out-Null
    git commit -q -m "$naziv" 2>&1 | Out-Null

    Write-Host "--> [3/3] REVIZIJA" -ForegroundColor Magenta
    ZapisiFajl "$PromptDir\$kljuc-revizija.txt" ("ultrathink`n`n" + @"
Ti si revizor, ne izvrsilac. Faza koja je upravo zavrsena:

  $naziv
  CILJ: $cilj

Pogledaj sta je stvarno promenjeno:
  git diff $shaPre..HEAD --stat
  git diff $shaPre..HEAD

Odgovori kratko i bez ulepsavanja:
1. Je li CILJ ispunjen? DA / NE / DELIMICNO - i zasto tako mislis.
2. MRTAV KOD: za svaku novu komponentu, hook i helper napisi lanac uvoza do
   ekrana koji korisnik otvara. Ako lanac ne postoji, to je NEUSPEH faze, bez
   obzira sto se kod kompajlira. Ovo je najvazniji deo tvog posla - dva puta se
   vec desilo da je posao napisan pa nedostupan.
3. Za svaki kvadratic cekiran u ovoj fazi: postoji li stvarni dokaz u kodu?
   Fajl i linija. Ako je cekiran a koda nema, odcekiraj.
4. Ima li dodirne mete manje od 44pt u onome sto je dodato?
5. Je li nesto na WEBU pokvareno da bi mobilni prosao? To je najveci rizik.
6. Sta je NAJSLABIJE u ovoj fazi i sta bi sledeca morala da popravi?

Ne popravljaj kod. Rezultat upisi u $planFajl na kraj, pod naslovom "REVIZIJA".
"@)
    PustiKlod -PromptFajl "$PromptDir\$kljuc-revizija.txt" -Log $log -Rok $RokProvera -ModelKorak $Jak -Effort "max" | Out-Null

    git add -A 2>&1 | Out-Null
    git commit -q -m "Revizija: $naziv" 2>&1 | Out-Null

    $trajanje = [int]((Get-Date) - $t0).TotalMinutes
    Zapisi "- Trajanje: $trajanje min"
    Write-Host "    gotovo za $trajanje min" -ForegroundColor Green
}

Zapisi ""
Zapisi "---"
Zapisi ""
Zapisi "- Kraj: $((Get-Date).ToString('s'))"
Zapisi "- Grana: ``$Grana`` - nista nije gurnuto na remote."

Write-Host ""
Write-Host "LANAC ZAVRSEN. Izvestaj: $Izvestaj" -ForegroundColor Green
Write-Host "Grana: $Grana (nije gurnuta na remote)" -ForegroundColor Green
