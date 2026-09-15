# Lightlab — by Audiolab

Local-first show editor and Three.js simulator for the defined ADJ, Stairville and Varytec fixture inventory.

**Werkvolgorde:** Overzicht → Setup → Ontwerpen → Live. Audio heeft een eigen Setup-pagina; Verbindingen, showinstellingen en WING-hulpmiddelen openen rechts. Zie [de huidige interface en bewaarregels](docs/UX_WORKFLOW.md).

**DMX bedienen:** configureer nodeadres, protocol en universes in Setup → Patch & netwerk. Kies Live → Naar DMX-bediening, start/verbind de livesessie en open **DMX-uitvoer** in de vaste balk. Controleer de bestemmingen en bevestig fysieke uitvoer. Sluiten van dit zijpaneel stopt geen stream; gebruik de expliciete uitschakelknop of Stop runtimesessie. Zie [sACN/Art-Net-uitvoer](docs/NETWORK_OUTPUT.md).

**Productstatus:** de lokale ontwerper/simulator en expliciet inschakelbare netwerkuitvoer werken; echte audio/Dante-synchronisatie en WING/MIDI-transport zijn nog niet aangesloten. De oorspronkelijke volledige productdoelstelling blijft open. Zie [kritische review en ontbrekende onderdelen](docs/REVIEW_2026-09-14.md).

**Architectuur en bijdragen:** zie de [compacte systeemkaart](docs/ARCHITECTURE.md), [projectregels](AGENTS.md) en het [volledige projectcontext](.project/PROJECT_CONTEXT.md).

**WAV-kicktest en Live:** audiotest, browsersimulatie en lokale runtime delen één WAV-speler. Volg een stabiel tempo of reageer per groep op losse kicks. Via **Live → Lokale runtime → Koppel WAV aan runtime**, gevolgd door expliciete fysieke inschakeling, stuurt dit ook sACN/Art-Net aan. Klokverlies schakelt die uitvoer uit. Zie [gebruik en beperkingen](docs/AUDIO_KICK_TEST.md).

Continue fysieke sACN-/Art-Net-uitvoer vanuit de runtime is nu toegevoegd met expliciete inschakeling. Audio/Dante, fysieke WING/MIDI en hardwareacceptatie blijven open; dit maakt de volledige applicatie nog niet af. Zie [netwerkuitvoer en gebruik](docs/NETWORK_OUTPUT.md) en [creatieve scope](docs/CREATIVE_DAILY_USE.md).

The interface follows Audiolab's restrained charcoal/white visual direction with blue action accents. Design separates Looks, animations, palettes and AI generation. Existing `lightflow-*` storage keys and the `.lightflow.json` package format deliberately remain compatible; renaming the product does not reset saved shows.

## Starten

```bash
npm ci
npm run dev
```

Open vervolgens de lokale URL die Vite toont. Voor een controleerbare productiebuild:

```bash
npm run verify
```

## Wat werkt lokaal

- **Dagelijks starten:** `npm run package:local` maakt een zelfstandige distributiemap voor het huidige systeem, inclusief Node en .NET. Start daarin `Start Lightlab.command`/`.cmd`/`.sh`; Ctrl+C sluit beide processen. De ontwikkelroute blijft `npm run build:local` gevolgd door `npm run start:local`. Ollama/modellen zijn apart nodig; fysieke output blijft uit. Geen bewezen Windows/Linux-release of ondertekende installer: zie [distributie, vereisten en rollback](docs/LOCAL_DISTRIBUTION.md).
- **Showregie:** onder Ontwerp kies je minimumlichtdekking, de actieve kleurrollen en veiligheidslichtgroepen. Dekking telt lichtpunten boven een instelbare intensiteitsdrempel na masters, niet lux. Off/zero masters, kleurlimieten, blackout en veiligheidslicht gaan voor; de preview meldt een onhaalbaar doel. Oude shows zonder instelling blijven identiek spelen.
- **Showbibliotheek & versies:** bewaar benoemde snapshots met geschiedenis in deze browser; openen en versieherstel beschermen eerst de actieve show. De opslag heeft32 normale shows en een afzonderlijke herstelplaats; de capaciteitsfix en browseracceptatie van deze ronde staan in de [voortgang](docs/CREATIVE_DAILY_USE.md). Exporteer voor een back-up buiten deze browser.
- **AI-inzage:** optionele, aanvraaglokale diagnose toont daadwerkelijk geserialiseerde providerberichten en ruwe antwoorden, inclusief de automatische correctiepoging. Begrenzing en redactie worden vermeld. Inzage wordt niet met shows bewaard; een expliciete download kan privé-showtekst bevatten. [Contract en privacy](docs/AI_DIAGNOSTICS.md).
- **AI als ideeëngenerator:** vink na het uitproberen alleen de gewenste paletten, patronen en Looks aan en kies **Voeg selectie toe aan collectie**. Benodigde nieuwe patronen/paletten worden zichtbaar meegeselecteerd; deselecteer de afhankelijke Look om die vrij te geven. Bestaande collectie en knopkoppelingen blijven behouden, met maximaal32 items per soort. Ook uit een vervangingsvoorstel kun je een selectie toevoegen; **Vervang volledige collectie** blijft een afzonderlijke actie die de selectie negeert. Bij verfijnen worden alleen geselecteerde wijzigingen bewaard. De volledige bestaande creatieve collectie gaat als context mee naar AI, met instructies om inhoudelijke herhaling te vermijden en bestaande verwijzingen te hergebruiken. Dit garandeert geen visuele originaliteit: recepten worden op duplicaten gevalideerd, vergelijkbare kleuren en Looks beoordeel je zelf.

- **Uitlijnen:** ‘Zelfde X-positie’ zet geselecteerde lampen op dezelfde links–rechtspositie; ‘Zelfde Y-positie (bovenaanzicht)’ op dezelfde voor–achterpositie. Beide gebruiken het gemiddelde van de selectie en behouden de hoogte. Dit verschilt van gelijke afstanden verdelen. Intern gebruikt de 3D-scène Z voor voor–achter en Y voor hoogte.

- **Verdelen en zijdelings richten:** bij drie of meer geselecteerde lampen kies je gelijke afstand links–rechts of voor–achter. Buitenste lampen blijven staan; hoogte en de andere positie-as blijven behouden. Kies bij Richting eerst de zijde: publiek, achterwand, links, rechts of verticaal. Links en rechts hebben elk rechtdoor, omhoog en omlaag, gezien vanuit de zaal. De zijde kiezen wijzigt niets; een richtknop past de hele lampselectie aan. Elke toepassing kan met Ongedaan worden teruggedraaid.

- **Podium bewerken:** begin zonder selectie en klik één lamp, meerdere lampen of een bandlid. Alleen de bijbehorende eigenschappen verschijnen. Shift-klik, selectiekader en de expliciete multiselectmodus ondersteunen groepsbewerkingen; de optionele objectlijst heeft zoeken en groepsselectie. Hoogte, richting en groep tonen gemengde waarden waar nodig. Alle acht richtingen blijven beschikbaar; hazers hebben geen richtbediening.
- **Gerichte tools:** Toevoegen opent het bandlidformulier (geen nieuwe fixture-import); Selecteren opent de objectlijst; Weergave kiest de camera voor de simulatie; Groepen beheren toont alleen groepsbeheer. Richt op bandlid bewaart de gekozen lampen als bron; Escape of Annuleren stopt het kiezen. Gewoon een bandlid selecteren vervangt de lampselectie. Uitlijnen en verdelen staan bij meervoudige selectie.
- **Herstel:** Ongedaan/Ctrl–Cmd+Z bewaart maximaal twintig podiumstappen gedurende het verblijf in Setup. Eén sleepbeweging is één stap; Escape/pointercancel herstelt het begin van die beweging. Bij verlaten van Setup vervalt deze tijdelijke geschiedenis. Patchadressen, groepsmasters en creatieve collecties worden niet teruggedraaid. Op mobiel verbinden ‘Bewerk selectie’ en ‘Terug naar podium’ de kaart en het eigenschappenpaneel.

- Animaties kunnen nu echte patroonrecepten bevatten: opeenvolgende selecties van alle, afwisselende, bewegende of willekeurige lichtpunten, met richting, breedte, uitlopende staart en een helderheidsverloop. Binnen/buiten gebruikt spiegelparen; heen-en-weer keert de richting om. Recepten werken binnen elke Lookgroep en zijn reproduceerbaar. De acht oudere effecten blijven leesbaar. TRI-bars werken per head uitsluitend in de 14-kanaalsmodus; in 3-kanaalsmodus blijven de heads samen.
- Zonder showregie blijven hoofdkleur en accent actief. Via Actieve kleurrollen kunnen ook nevenkleur en wittint meedoen (één tot vier rollen); vaste warmwitte spots behouden hun eigen kleur. Looks tonen hun combinatie van animatie en kleurprofiel. Dubbele animatierecepten worden geweigerd; dubbele Looks, weinig variatie en bewegingsnamen bij kleurprofielen leveren ontwerpfeedback op.

- Zaalzicht-simulator met Looks, pulse/chase, groepsmasters, static, safety look en blackout.
- De preview versterkt spotbelichting en bundels, met weinig neutraal omgevingslicht en een kleurreflecterende vloer, zodat belicht/onbelicht duidelijker verschilt. Dit is visueel presentatiecontrast, geen wijziging aan groepsmasters of fysieke DMX-intensiteiten; vaste warmwitte spots behouden hun kleur.
- **Ontwerp & repetitie → Looks:** kies één Look en bewerk de groepen naast de directe podiumpreview. Repetitietempo is instelbaar van 30–240 BPM (standaard120), zonder de patroonfase opnieuw te starten. Lookwijzigingen worden opgeslagen; previewtempo en Lookselectie zijn tijdelijk en wijzigen de livebediening niet.
- **Losse animaties en kleuren uitproberen:** secundaire proefruimte voor elke opgeslagen animatie en elk kleurprofiel, ook zonder gekoppelde Look. Een nieuwe keuze hervat de animatie; de andere keuze blijft behouden. **Volg gekozen Look** herstelt de combinatie van die Look. Deze proefkeuzes en groepsniveaus wijzigen geen Looks of exports. **Herstel groepsniveaus** zet de previewmasters terug op de showwaarden. **Terug naar Look bewerken** opent de gecombineerde studio.
- Bewerkbare kleurprofielen, automatisatieprogramma's en Look-koppelingen.
- Podiumeditor: selectiekader, Shift-klik, groepsselectie en selectievakjes; sleep meerdere lampen samen. Kies vloer, 1/2/3 meter of truss en richt via een podiumdoelpunt, publiek of achterwand.
- Groepen aanmaken, hernoemen en lampen toewijzen in Setup; kies bij Ontwerp welke groepen een animatie gebruikt. Groepsmasters staan bij Repetitie.
- Onder **Richt je selectie** kies je één richting voor alle geselecteerde lampen: recht vooruit, schuin omhoog, recht omhoog, schuin/recht omlaag of achteruit (ook omhoog en omlaag). **Achteruit omlaag** richt schuin naar beneden, richting achterwand. Vooruit is naar publiek. Presets blijven behouden bij verplaatsen en wijzigen van montagehoogte. Een exact gezamenlijk vloerpunt staat onder Geavanceerd.
- Voeg bij Setup bandleden toe, geef ze een naam en sleep ze op het podium. Ze verschijnen als neutrale, lichtgevoelige 3D-personen in Repetitie, Live en de ontwerpvoorstelpreview. Je kunt meerdere geselecteerde spots tegelijk op de borsthoogte van een bandlid richten. Dit zet een vast richtpunt: na verplaatsen van een persoon opnieuw richten indien gewenst.
- **Patch & netwerk:** gegroepeerde fixturelijst (podiumgroep of universe), zoekfilter en aandachtspunten. Selecteer een fixture voor model/modus, kanaalbereik en adresbewerking; sla expliciet op. Overlap en kanaaloverschrijding blokkeren opslaan. Universes & netwerk toont uniek bezette/vrije kanalen, ontbrekende routes en bewerkbare bestemmingen. Nieuwe routes staan uit; instellingen zijn geen netwerk- of live-outputstatus. Bewaar drafts voordat je deze setup verlaat.
- **DMX-proef zonder lampen:** open de disclosure in Patch & netwerk, kies een Look/beat en bereken de runtime-kanaalwaarden per fixture en universe. Een momentopname, geen output of verbindingstest. Verouderde resultaten verdwijnen bij wijzigingen. Zie [uitvoerfundament en API](docs/OUTPUT_FOUNDATION.md).
- **Hz-200-correctie:** nieuwe shows gebruiken twee kanalen (haze + ventilator). Bestaande `1ch`-patches blijven intact maar moeten expliciet naar `2ch` worden gecorrigeerd, met overlapcontrole. De DMX-proef weigert de oude onjuiste modus; fanregeling blijft nog onvolledig.
- Configureerbare audience camera, showversies en import/export van showpakketten.
- Visuele bedieningspaneel-editor: lokale knop-/draaiknoptoewijzingen per bank, met WING Rack/Full en Compact USER-profielen. Audio-/syncvoorkeuren blijven apart; fysieke WING-upload en MIDI-bediening zijn nog niet aangesloten.

## Hardwareveiligheid

Deze browserapp opent geen DMX- of MIDI-poorten en stuurt geen netwerkverkeer naar fixtures. De interfaces in `src/adapters.ts` zijn het contract voor een toekomstige lokale companion runtime. Alleen die runtime mag, na expliciet armen en opnieuw valideren, Art-Net/sACN, native MIDI en OS-audio/Dante Virtual Soundcard gebruiken.

## Fixtureprofielen

De meegeleverde profielen zijn bewust niet als live-geverifieerd gemarkeerd. Bevestig altijd de fysieke DMX-modus en kanaaltabel op locatie vóór een toekomstige runtime output mag armen.

## Lokale companion runtime

Open bovenaan Lightlab **Verbindingen** om de verbinding te controleren, de runtime te starten en recente meldingen te bekijken. Dit werkt via de lokale Lightlab-webserver (`npm run dev` of de zelfstandige launcher); een los gehoste webpagina kan geen programma op je computer starten. Na deze update moet een eerder gestarte webserver eenmaal opnieuw gestart worden.

**Start runtime** start alleen als er nog geen runtime draait. Een bestaande sessie wordt niet herstart of overgenomen; fysieke uitvoer wordt niet automatisch ingeschakeld. Bij een runtimefout blijft de interface beschikbaar voor controle en opnieuw starten. Ollama zelf moet nog apart draaien.

Het paneel toont maximaal 200 recente, veilige status- en foutmeldingen uit deze startsessie, niet de volledige technische console. Ruwe procesuitvoer, sleutels en AI-aanvragen worden niet naar dit logboek doorgestuurd. De meldingen staan alleen in geheugen en verdwijnen bij het sluiten van de lokale webserver. Voor inhoudelijke AI-aanvragen en antwoorden blijft de afzonderlijke AI-diagnoseweergave beschikbaar.

Handmatig starten blijft mogelijk:

```bash
dotnet run --project runtime/Lightflow.Runtime.csproj
```

De runtime luistert uitsluitend op `127.0.0.1:5188`. Hij start altijd ongewapend. De webapp gebruikt hem voor AI-voorstellen en de runtime beheert later hardwareuitvoer. Beschikbare controles:

- `GET /health` — veilige status.
- `/playback/start`, `/playback/status`, `/playback/command`, `/playback/frame` — autonome runtimeklok en multi-universeframes in geheugen, zonder UDP. Build eerst `npm run build:engine`; Node22+ vereist. De geladen show blijft draaien als de browser sluit, tot expliciete Stop, fout of runtime-afsluiting. [Installatie, API en beperkingen](docs/AUTONOMOUS_PLAYBACK.md).
- `/playback/show` en `/playback/preview` — geladen show en atomair runtimebeeld voor de Live-bronkeuze. Groepsbediening, links, masters en kleurvergrendeling zijn in deze bron alleen sessie-instellingen; ze wijzigen de editorshow niet. [Live-contract en versieconflicten](docs/RUNTIME_LIVE.md#runtime-live-api).
- `POST /output/inspect` — stateless gevalideerde DMX-proef, zonder verzending. Geen showinstallatie/arming; [contract, grenzen en voorbeelden](docs/OUTPUT_FOUNDATION.md).
- `GET /devices/audio` — macOS audio-device discovery.
- `POST /fixture-test/plan` — veilig inspecteerbaar testplan, zonder output.
- `POST /output/arm` — vereist bevestiging, geldige host, universe 1–32768 voor `artnet` of 1–63999 voor `sacn`. Dit lage-niveau endpoint valideert nog geen show/fixturepatch.
- `POST /output/frame` — handmatig ruw frame, maximaal512 waarden; kortere frames worden met nul aangevuld, waarden begrensd tot0–255. Geen browser-showkoppeling.
- `POST /output/disarm` — voorkomt volgende sends en wacht op een lopende send (senddeadline5s). Geen fysieke blackout of sACN stream termination.

De runtime weigert vreemde Host/Origin-headers met403. Browsertoegang is beperkt tot `http://localhost:5173` en `http://127.0.0.1:5173`; native loopbackclients zonder Origin blijven toegestaan. Dit is geen authenticatie van lokale processen. Een ontbrekende capabilitieslijst of lege naam/modus bij het fixturetestplan geeft400.

Bij WebGL-problemen blijven show en bediening beschikbaar met een herstelknop waar voorzien. De simulator weigert vóór GPU-allocatie meer dan256 lichtpunten/1024 fixtures, zonder de geïmporteerde show te wijzigen. Deze grens is geen FPS-garantie. Geblokkeerde browseropslag wordt gemeld; exporteer je werk. Een mislukte versieopslag wordt niet meer als succes getoond.

## Ontwerpvoorstellen

### Lokaal met Ollama, zonder API-sleutel

Laat Ollama draaien en start de companion runtime met het meegeleverde profiel:

```bash
dotnet run --project runtime --launch-profile Ollama
```

Het profiel gebruikt het reeds lokaal geïnstalleerde `gpt-oss:20b` op `127.0.0.1:11434`. Lightflow downloadt geen modellen en valt niet terug op een cloudprovider. Onder Ontwerp zie je **Lokale AI · Ollama · gpt-oss:20b**. Start voor een snelle controle met 2 profielen, 2 animaties en 2 Looks. Laden/genereren kan even duren; de aanvraag is annuleerbaar.

Onder **Ontwerp → Ollama-model** kies je een geïnstalleerd model voor de volgende aanvraag. **Ververs modellen** leest de lokale modellenlijst opnieuw. De keuze wordt als browservoorkeur onthouden, buiten je showpakket. Tijdens genereren staat de keuze vast; een verdwenen model blokkeert de aanvraag met uitleg, zonder stille terugval. De runtime-omgevingsvariabele blijft de standaard voor nieuwe browsers.

Runtimecontract: `GET /ai/models` levert `{provider, defaultModel, models}`; `POST /ai/propose` accepteert optioneel top-level `model` en retourneert de gebruikte `model` bij Ollama. Niet-geïnstalleerde/cloudmodellen worden geweigerd (400), onbereikbare Ollama geeft 502. Oudere aanvragen zonder model blijven de runtime-standaard gebruiken.

Voor een ander reeds geïnstalleerd lokaal model:

```bash
LIGHTFLOW_AI_PROVIDER=ollama LIGHTFLOW_OLLAMA_MODEL=llama3.2:3b dotnet run --project runtime --no-launch-profile
```

Gebruik op Windows dezelfde twee omgevingsvariabelen via PowerShell of een eigen .NET-launchprofiel. Een ontbrekend model geeft een foutmelding, geen automatische download. De koppeling gebruikt Ollama's [gestructureerde antwoorden](https://docs.ollama.com/capabilities/structured-outputs); ontvangen inhoud wordt gecontroleerd voordat ze toegepast kan worden.

### Looks per groep

Ga naar **Ontwerp → Looks**, open een Look en kies een groep. Stel voor die groep **Vast licht**, **Animatie** of **Uit** in, met een eigen niveau. Een animatie beschrijft alleen het patroon; de groep bepaalt beatduur en offset. Nieuwe receptnamen beschrijven de werkelijke beweging, niet de groep of het kleurprofiel.

De **Lookkleur** geldt voor alle volgende lagen. Kies bij een groep een vast kleurprofiel als die niet mag meegaan met algemene kleurwissels. Zo kunnen fronts stabiel blijven terwijl wash en back bewegen. Varytec-fronts blijven altijd fysiek warmwit, ongeacht het profiel. Het uiteindelijke niveau vermenigvuldigt patroon × Lookniveau × groepsmaster × profiellimiet; het percentage is geen gemeten lichtopbrengst in lux.

Dezelfde animatie op meerdere groepen deelt één beat en één ruimtelijke reeks; een pulse loopt gelijk, een looplicht loopt over hun gezamenlijke lichtpunten. Verschillende animaties delen de beat maar gebruiken hun eigen duur. Static bevriest alle lagen op hetzelfde moment. Front only en Blackout blijven overrides.

De podiumpreview naast de Look-editor speelt altijd de volledige opgeslagen groepsindeling af, inclusief timing en offsets. Losse proeven staan apart: een losse animatie vervangt tijdelijk alle lichtgroepen, niet de hazer. Alleen een kleur kiezen behoudt vaste groepskleuren. **Volg gekozen Look** herstelt de originele lagen. AI-voorstellen gebruiken dezelfde simulatorlogica; een losse kleurproef kan alle lichtgroepen statisch tonen zonder de Look te wijzigen.

Oude Looks blijven hetzelfde afspelen. Bij de eerste groepsbewerking wordt hun bestaande indeling expliciet opgeslagen; niet-aangestuurde en later toegevoegde groepen staan uit tot je ze instelt. Nieuwe AI-Looks bevatten daarentegen meteen alle groepen. De AI ontvangt de groepsniveaus, fixturecapaciteiten, posities/richtingen en bandopstelling, maar geen outputroutes of fysieke patchadressen.

In schema 1 heeft een Look optioneel `layers: [{groupId, mode, programId, colorProfileId, intensity}]`. `mode` is `animation`, `static` of `off`; alleen animation vereist een programma-ID, anders is die `null`. Een `null` kleur volgt de Look, een profiel-ID is vast. Niveaus liggen tussen 0 en 1. De oude Look-/programmavelden blijven voor compatibiliteit; programma-doelgroepen bepalen geen layered Look. Nieuwe `/ai/propose`-antwoorden vereisen exact één laag per huidige groep. Herstart de runtime samen met de bijgewerkte webapp; antwoorden van een oude runtime zonder lagen worden niet geaccepteerd.

### Bedieningspaneel indelen

Ga naar **Setup → Bediening & audio**. Kies je tafelprofiel en een bank. Zoek een Look, kleurprofiel of showfunctie in de bibliotheek en sleep die naar een knop; groepsintensiteiten horen op draaiknoppen. Je kunt ook eerst een bibliotheekfunctie aanklikken en daarna een positie kiezen. Een bestaande positie selecteren en **Verplaats / verwissel** kiezen biedt dezelfde klikbediening, ook naar een andere bank. Selecteren of toewijzen start geen Look en verandert de live-output niet. **Bekijk Look in repetitie** opent de afzonderlijke Look-preview.

**Banken automatisch vullen** neemt alle Looks mee naar de banken die je aanvinkt (ook niet-aaneengesloten banken). Kies de huidige volgorde of **per karakter**: Rustig, In beweging, Energiek. Elke categorie begint op een nieuwe bank; resterende knoppen kunnen daardoor vrij blijven. De lokale inschatting gebruikt actieve lichtgroepen, patronen en groepssnelheden, niet de naam of een AI-aanvraag. Via **Karakterindeling nakijken** kun je iedere Look anders indelen voor dit voorstel.

Kies per draaiknop een vaste groep: dezelfde positie regelt die groep op elke geselecteerde bank, ook als die bank geen nieuwe Looks krijgt. **Niet wijzigen** behoudt die rotarypositie. Standaard blijven bezette posities behouden; al geplaatste Looks in de doelbanken worden niet gedupliceerd of opnieuw gegroepeerd. Kies **Alle knoppen opnieuw indelen** voor een nieuwe verdeling: dit herverdeelt alle knopacties in de geselecteerde banken en geeft gebruikte banken een naam. Verdrongen acties blijven onder Niet geplaatst. Rotaries worden alleen vervangen waar je expliciet een groep koos. Buiten de selectie en buiten de capaciteit van het huidige tafelprofiel blijft alles behouden.

**Bekijk bankindeling** toont eerst het complete voorstel. Bij ruimtegebrek of conflicten wordt niets gedeeltelijk toegepast. Na **Pas bankindeling toe** kun je de gehele wijziging met één **Ongedaan maken** herstellen zolang de editorsessie open is. Handmatig slepen blijft mogelijk; de toegepaste indeling wordt met de show bewaard en verschijnt in de Live-schermbediening. Er wordt niets naar de fysieke WING verstuurd.

WING Full/Rack tonen 16 banken met elk vier draaiknoppen en een 4×2-knoppenmatrix. Compact toont alleen de 16 USER-knoppen, zonder eigen draaiknoppenrij. De extra Compact M/M- en optionele DCA-customcontrols zijn nog niet als profiel opgenomen. De hardwareverschillen staan in de [officiële WING-handleiding, §4.8](https://cdn.mediavalet.com/aunsw/musictribe/m6Gtew1v9UCRK22GG4TxhA/3ZFYMKP0sESuAFkHeBx8UA/Original/Manual_WING%2C%20WING%20RACK%2C%20WING%20Compact.pdf); de editor is een logische indeling, geen garantie op fysieke synchronisatie.

Een bestaande toewijzing naar een bezette positie slepen verwisselt de posities wanneer beide passen. Een nieuwe bibliotheekfunctie op een bezette positie zet de vorige functie bij **Niet geplaatst**. **Maak positie vrij** verwijdert alleen de plaatsing, nooit de Look zelf. **Ongedaan maken** herstelt maximaal twintig lokale indelingsstappen zonder andere showinstellingen terug te zetten. Oude en buiten het gekozen profiel vallende toewijzingen blijven bewaard en staan bij Niet geplaatst. Banknamen zijn optioneel; de indeling wordt met de show opgeslagen en geëxporteerd.

**Banken naar de WING:** via **Synchroniseren met WING** lees je de tafel op een instelbaar IP-adres uit (beginwaarde `10.0.0.10`), selecteer je banken en bekijk je het wijzigingsvoorstel. Alleen na bevestiging worden toegewezen Full/Rack-posities via OSC geconfigureerd en teruggelezen. Lege posities, overige banken en globale MIDI-routering blijven behouden. Bewaar eerst de voorconfiguratie; bij een gedeeltelijke overdracht controleer je de tafel voordat je opnieuw plant. Gewoon slepen of automatisch indelen verstuurt niets. Zie [WING-bankconfiguratie](docs/WING_BANK_SYNC.md).

De overdracht configureert labels en MIDI-toewijzingen; Looks en animaties blijven in Lightlab. **Daadwerkelijke MIDI-ontvangst van de WING is nog een aparte, ontbrekende koppeling.** Compact-bankoverdracht wordt nog niet ondersteund. De secundaire sectie **Audio & synchronisatie** bewaart bronvoorkeuren maar start geen native audio-opname. Oude taptempo-/followbindings blijven behouden zonder ze als werkende paneelacties te presenteren.

### Live per groep en gelinkte bediening

Onder **Live → Groepen apart bedienen / koppelen** kies je een groep en pas je tijdelijk kleur, animatie/vast/uit of Lookniveau aan. Een groeps-Look neemt alleen de overeenkomstige groepslaag uit die Look over, inclusief de bronkleur. De overige groepsinstellingen blijven behouden. De opgeslagen Looks, versies en repetitie veranderen niet. Onderstaande bewaarregels gelden voor de browserbron; de runtimebron gebruikt haar eigen geladen show en sessiestaat.

Selecteer meerdere groepen bij **Linken**. Linken zelf verandert het lichtbeeld niet; volgende wijzigingen gelden voor alle genoemde groepen. Een kleur- of animatiewijziging verandert alleen dat onderdeel. Bij een Lookkeuze krijgt elke gelinkte groep haar eigen laag uit de bron-Look. Ontlinken laat de huidige instellingen staan. De bestaande groepsmasters volgen links ook, maar blijven — anders dan tijdelijke Lookniveaus — in de show opgeslagen.

Terug naar de algemene Look kan per bedieningsset of voor alle groepen. Een algemene Lookknop wist alle tijdelijke groepsafwijkingen en behoudt de links. Blackout, Front only en Static blijven boven groepswijzigingen staan tot je weer hervat. Links en overrides blijven tijdens navigatie behouden, maar niet na herladen of een show importeren/herstellen; een volledige collectie vervangen wist de overrides.

Het delen van één ruimtelijke animatie betekent één gezamenlijke reeks over alle toegewezen groepen. Als een groep die reeks verlaat, verandert ook de verdeling van de overblijvende lichtpunten. Linken betekent samen bedienen, niet automatisch alle bestaande lagen gelijkmaken.

Bij de **runtimebron** rendert Live de ontvangen frames en volgt bediening de geladen snapshot. Ook groepsmasters blijven daar tijdelijk: alleen Stop/fout/runtime-afsluiting verwijdert de sessie, niet een browserreload. Editorwijzigingen vereisen expliciet opnieuw laden via Stop/Start. Een versieconflict vergt verversen en opnieuw kiezen, zonder stille overschrijving. De beeldhelderheid/camera blijven presentatieweergave en sturen geen lichtoutput.

### Timing en offset per groep

Bij een groep in **Ontwerp & repetitie → Looks** of **Live → Groepen apart bedienen / koppelen** stel je een eigen beatduur in. Animaties bevatten alleen het patroon; er is geen optie ‘Volgt animatie’ meer. Hetzelfde patroon kan op wash4beats en back8beats lopen. Grotere waarden zijn trager. De duur betekent een volledige cyclus bij pulse/golf/looplicht/opbouw, een wisselinterval bij afwisselend/random/twinkeling.

**Offset** verschuift de patroonfase: positief betekent later, negatief eerder. Voorbeeld: pulse van 8 beats op wash en back, met offset +2 op back. Back loopt dan twee beats achter wash. Offset 0 speelt zonder verschuiving. Dit is geen wachttijd na het kiezen van een Look: de patronen blijven aan dezelfde lopende beat gekoppeld. De globale audio-offset in milliseconden staat hier los van.

Look-timing wordt met de show en versies bewaard; live-timing is tijdelijk en volgt bestaande groepslinks. Een timingwijziging raakt niet de kleur, het niveau of de animatie van andere niet-gelinkte groepen. Vast/uit negeert timing maar bewaart de instellingen voor een volgende animatie. Blackout/front-only blijven voorrang houden; Static gebruikt de vastgehouden beat. De huidige appbeat is nog een simulatieklok, geen bewijs van Dante-synchronisatie.

Geldige exacte offsets worden meteen tijdens invoer toegepast, zonder eerst buiten het veld te klikken. Ongeldige/onvolledige invoer vervangt de laatst geldige waarde niet. In Repetitie gebruikt **Volg gekozen Look** de opgeslagen groepstiming. Een losse animatie vervangt tijdelijk ook die timing; de preview meldt dit expliciet. Live-afwijkingen worden niet meegenomen naar Repetitie.

Bij het laden/importeren wordt de effectieve oude beatduur in elke Lookgroep vastgelegd. IDs en oude versies blijven intact; oudere dubbele animaties worden niet automatisch samengevoegd, omdat dit ruimtelijke patronen kan veranderen. Schema1 en oude programvelden blijven leesbaar. Nieuwe AI-programs gebruiken `rateBeats:1` uitsluitend als compatibiliteitsveld; nieuwe Looklagen vereisen een expliciete `rateBeats` van0.125–64 en offset−64–64. Geldige oude durations0.01–1024 blijven verliesloos behouden.

Bij AI is **Maximaal animaties** een bovengrens, geen verplicht aantal. Er kunnen maximaal 32 verschillende patroonrecepten in de collectie staan; er is geen limiet van acht recepten meer. Ollama kan selecties, richtingen, helderheidsverlopen en opeenvolgende stappen combineren. Een andere naam, timing, kleur of een veld zonder effect maakt een gelijk recept niet uniek. Toevoegen vermijdt bestaande recepten; bij minder geleverde recepten volgt een melding. Nul nieuwe recepten is alleen toegestaan wanneer er geen vrije plaatsen of geen te verfijnen animaties zijn. Kleuren en Looks behouden hun gevraagde aantallen.

Een recept bevat 1–16 stappen. Het **gewicht** van een stap bepaalt zijn relatieve aandeel in één cyclus: gewichten 1:2 geven een derde en twee derde van de groepsduur, niet 1 en 2 beats. De ondergrens (`floor`) houdt een minimum patroonniveau aan; dit is geen gekalibreerde podiumlichtopbrengst en wordt nog vermenigvuldigd met Lookniveau, groepsmaster en profiellimiet. De AI levert uitsluitend begrensde JSON-data, geen uitvoerbare code.

Nieuwe AI-antwoorden vereisen `program.pattern: {version:1, floor, steps}` en expliciete groepstiming. Oude opgeslagen programma's zonder recept blijven hun oude effect afspelen. Webapp en runtime moeten samen bijgewerkt/herstart worden; een oudere runtime die alleen effectnamen teruggeeft voldoet niet aan het nieuwe generatiecontract. De offlineoptie maakt herkenbaar gelabelde deterministische sjablonen en gebruikt geen AI-model.

### Bandprofiel voor AI-ontwerpen

Bij de AI-ontwerpstudio kun je bandnaam, genres en karakter van de show bewaren. Onder **Sfeer en beweging sturen** kies je optioneel kleurgevoel, energie, complexiteit, bewegingstempo en maximaal vier voorkeurskleuren. Dit profiel reist met de show mee en wordt met de ontwerpvraag, opstelling en bestaande ontwerpen aan het geselecteerde model doorgegeven. De contextsamenvatting toont het bandgedeelte; de aparte AI-diagnose toont de echte provideruitwisseling wanneer ingeschakeld. Het model doet geen internetonderzoek naar de band en mag geen repertoire of stijl uit alleen de naam afleiden.

Expliciete voorkeuren gaan vóór genre-associaties. Complexiteit begrenst nieuwe recepten: eenvoudig maximaal 2 stappen, gelaagd 4, rijk 8; **AI kiest** maximaal 16. Bewegingstempo begrenst de duur van nieuwe geanimeerde Lookgroepen: langzaam 8–32 beats, gemiddeld 2–8, snel 0,25–2; **AI kiest** 0,125–64. Meer beats betekent trager. Deze grenzen gelden alleen voor nieuwe voorstellen; opgeslagen Looks worden niet automatisch herschreven. Wie alleen kleuren of patronen aanvraagt, verandert daarmee geen bestaande groepsduur. Een afwijkende vrije ontwerpvraag heft expliciete grenzen niet op: kies eerst **AI kiest** of pas de voorkeur aan.

Kleurgevoel, energie, genres en karakter zijn ontwerpaanwijzingen, geen meetbare outputgaranties. Voorkeurskleuren zijn inspiratie, geen opdracht om ze allemaal tegelijk te gebruiken; de actieve showkleurrollen bepalen welke profielrollen verschijnen, vaste warmwitte spots blijven warmwit. Energiek betekent niet automatisch snel of donker. Het model wordt gevraagd de geleverde palette-, patroon- en timingkeuzes toe te lichten. Offline sjablonen volgen expliciete kleur-/tempokeuzes en blijven binnen complexiteitsgrenzen, maar interpreteren geen bandnaam, genres of vrije tekst.

### Collecties via AI

Bij dubbele animatierecepten vraagt Lightlab Ollama automatisch één keer om een gecorrigeerd voorstel, met hetzelfde model en dezelfde instellingen. Beide pogingen delen de ingestelde tijdslimiet (standaard 15 minuten, instelbaar van 1 tot 60 minuten); alle controles blijven gelden. Als ook dat niet lukt, verschijnt **Opnieuw met correctie**. Je kunt eventueel het maximum aan animaties verlagen; kleuren en Looks hoeven niet verminderd te worden. Je huidige show verandert pas na acceptatie van een geldig voorstel. Met diagnose ingeschakeld zijn beide providerpogingen zichtbaar, binnen de aangegeven grenzen/redactie.

Kies bij **Werkwijze → Volledige reeks vervangen** om een nieuwe complete collectie te maken: 1–32 kleurprofielen, animaties en Looks per soort, onafhankelijk van de bestaande aantallen. Bekijk het voorstel en kies **Vervang collectie en bewaar versies**. Eerst wordt de oude show veilig als versie opgeslagen; ook de nieuwe show krijgt een versie (twee vrije versieplaatsen nodig). Bij mislukte opslag gaat vervangen niet door. Versies zitten mee in het geëxporteerde showpakket. Podium, patch, groepen en audio blijven behouden. Verwijderde Look-/kleurkoppelingen worden vooraf met knopnaam gemeld en losgekoppeld; modus- en groepsbediening blijven behouden. Toevoegen en verfijnen blijven aparte werkwijzen.

Bij **Ontwerp** kies je een complete collectie, alleen kleurprofielen, animaties of Looks. Standaardaantallen zijn 8/8/16; maximaal 32 items per collectie in de show. Nieuwe voorstellen voegen items toe. Verfijnen wijzigt bestaande items binnen de gekozen scope. Een kleurprofiel heeft momenteel vier vaste kleurrollen.

Bekijk het voorstel in de afzonderlijke simulator voordat je accepteert. Acceptatie past de inhoud toe en maakt een versie. Verwerpen laat de huidige show intact. Als de show ondertussen is gewijzigd, moet je een nieuw voorstel aanvragen.

De standaardprovider maakt **offline sjablonen, geen AI**: hij interpreteert je vrije ontwerpvraag niet. Voor echte OpenAI-generatie zet je uitsluitend lokaal de volgende omgevingsvariabelen, nooit in een showpakket of bronbestand, en herstart je de runtime:

```bash
export LIGHTFLOW_AI_PROVIDER=openai
export LIGHTFLOW_OPENAI_API_KEY='...'
export LIGHTFLOW_OPENAI_MODEL='gpt-4.1-mini'
```

Providergebruik vereist je eigen API-toegang en kan kosten veroorzaken. Lokale tests gebruiken offline voorstellen en foutgevallen; een succesvolle lokale test bewijst geen werkende cloudaccountconfiguratie.

De provideradapter kan zonder API-kosten getest worden met `dotnet run --project runtime-tests`. De browserflow is lokaal gecontroleerd op aanvragen, preview, accepteren, verwerpen, verouderde voorstellen en herladen. De actuele acceptatiecriteria en open punten staan in `docs/ACCEPTANCE.md`.

## Opslag en simulatie

Showpakketten controleren geneste data en verwijzingen vóór import. Limieten: 32 items per ontwerptype, 100 versies, 1024 fixtures, 256 groepen/routes; maximaal 20 miljoen tekens per pakket. Geldige schema-1-shows blijven ondersteund.

Varytec 3000K gebruikt een vaste warmwitte emitter, onafhankelijk van kleurprofielen. Bundels volgen het ingestelde doelpunt. De simulator is een conceptweergave: schermkleur, bundelhoek en lichtsterkte zijn niet fotometrisch gekalibreerd.

Onder **Simulatieweergave → Rook / haze** regel je de gesimuleerde lucht van 0% (geen bundelverstrooiing) tot 100% (dichte haze). De standaard is 35%. Langzaam opstijgende, golvende rookstructuren worden zichtbaar in de lichtbundels, ook bij een stilstaande Look. Meer haze maakt bundels zichtbaar en verzacht het zicht op afstand; de beeldhelderheid blijft apart instelbaar. Deze lokale voorkeur geldt voor alle previews en blijft na herladen behouden, ook zonder hazer in de show. De regelaar verandert geen showdata of fysieke rookmachine. De beweging bevriest bij de systeemvoorkeur voor verminderde beweging. Dit is een visuele benadering, geen fysieke stromingssimulatie of rookuitstoot vanuit de hazerpositie. **Herstel simulatieweergave** herstelt helderheid, haze en zichtbare groepen.
