# Aanvullende acceptatiecriteria bij het volledige productdoel

## Actuele afronding — creatieve functies en dagelijks gebruik

De vervolgronde implementeert gedeelde fades en beatgrenzen, instelbare Ollama-limiet (standaard15,1–60minuten), compactere aanvragen, atomaire actieve show/versieopslag, portable fixturedefinities en een zelfstandige host-native distributie. [Actueel bewijs en resterende platformvoorwaarden](FINISH_CREATIVE_DAILY.md). Het volledige product blijft fysieke DMX/WING/Dante vereisen; die onderdelen zijn expliciet uitgesteld.

## Eerdere funderingsronde — creatieve regie en dagelijks gebruik

Fysieke output, WING/MIDI en audio/Dante zijn op gebruikersverzoek voorlopig uitgesteld. De huidige ronde voegt gedeelde minimumlichtdekking, één tot vier actieve kleurrollen, veiligheidslichtgroepen, aanvraaglokale AI-diagnose, benoemde showbibliotheek/versieherstel en een lokale launcher toe. Optionele schema1-instellingen behouden oude shows en vaste emitters.

599 Vitesttests, één Node-launchertest, web-/worker-/Release-runtimebuild en het .NET-harnas slagen. Echte browser-/IndexedDB-acceptatie controleert instellingen, opslaan/openen/hernoemen/herladen, versieherstel/verwijderen en desktop/mobiel/focus. De runtimeproef bewijst 20/24 lichtpunten bij80%, vier kleurrollen, vaste warmwitte emitters en blackout/off-voorrang met exacte workerpariteit. Echte Ollama-diagnose met `llama3.2:3b` slaagt; `gpt-oss:20b` liep in deze proef tegen de vijfminutengrens. De launcher start en stopt beide eigen processen op macOS; Windows/Linux en duurtests blijven onbewezen. Zie [contract, reviewfixes en bewijs](CREATIVE_DAILY_USE.md).

Deze ronde ging vooraf aan de afronding hierboven. De onderstaande aantallen beschrijven eerdere rondes en bewijzen nieuwere functies niet.

## Runtime als bron voor Live

Onder **3 · Live → Lokale runtime** volgen preview, Looks, WING-schermknoppen, kleuren, gekoppelde groepsmasters en groepspatronen/timing dezelfde autonome sessie. Preview toont ontvangen frames, zonder eigen vervangende klok. Tijdelijke bediening wijzigt de editorshow niet. Verbindingsverlies verwijdert het verouderde beeld en vereist expliciet opnieuw verbinden; sluiten stopt de runtime niet.

571 tests in53 bestanden, web-/workerbuild, runtimebuild en contractharnas slagen. Echte browser-/procesketen gecontroleerd op framepariteit, twee universes, blackoutprioriteit, links/offsets, continue rotarydrag met één eindopdracht, revisieconflicten, ongeldige verwijzingen, opslagbehoud, no-store, verbindingsverlies/herstel, herladen en desktop1440/mobiel390. Zie [Live-contract, bediening en bewijs](RUNTIME_LIVE.md). Testsessie gestopt; fysieke output ongewapend. Geen fysieke WING/Dante/DMX- of platformacceptatie; volledige productscope blijft open.

## Autonome afspeelproef

G1 vervolgstap: de .NET-runtime beheert een monotone klok en één showsnapshot; een afzonderlijk Node-proces gebruikt dezelfde patroonengine als de browser. De runtime compileert zelfstandig meerdere universes naar geheugen. Setup → Patch & netwerk → Autonome runtimeproef biedt expliciet starten, Look/BPM wijzigen, vasthouden, frontlicht, blackout en stoppen. Herladen of sluiten van de browser stopt een gestarte sessie niet. Oude sessiecommando's kunnen een vervangende sessie niet bedienen.

546 tests in 48 bestanden, web-/workerbuild, .NET-build en runtimeharnas slagen. `scripts/check-playback-session.mjs` bewijst de echte procesketen met twee universes, fasecontinuïteit, static, blackout, ongeldige opdrachten, stop en sessiewissel. `scripts/check-playback-ui.js` controleert echte browserbediening, herladen, stoppen met ongeldige BPM en desktop1440/mobiel390 zonder overflow of browserfouten. Testsessie gestopt; fysieke uitvoer bleef uit. Zie [contract en beperkingen](AUTONOMOUS_PLAYBACK.md).

Dit was nog geen fysieke livecontroller. Runtimegroepsbediening en koppeling van de livepreview zijn inmiddels afzonderlijk gebouwd zoals hierboven beschreven. Transport, audio/Dante en WING/MIDI ontbreken nog. Geen hardware- of Windows/Linux-acceptatie geclaimd.

## Uitvoerfundament — DMX-proef

Eerste G1/G4-deel gebouwd: expliciete Look/beat-momentopname naar runtime-gevalideerde kanaalwaarden per fixture/universe, zonder transport. Alle zes manual-backed modi getest; foutieve oude Hz-2001ch wordt niet gecodeerd of stil gemigreerd. Nieuwe shows2ch; bestaande patch vereist expliciete overlapveilige correctie. 527 webtests, beide builds, runtimeharnas, onafhankelijke echte HTTP-golden-tests en echte browserflow inclusief patroonsegments/blackout/dirty/stale/mobiel slagen. Runtime blijft ongewapend. Zie [bouwplan, API en bewijs](OUTPUT_FOUNDATION.md). Geen volledige G1/G4-voltooiing: liveverzending, fanbeleid en hardwareverificatie blijven open; autonome timing is inmiddels afzonderlijk gebouwd zoals hierboven beschreven.

## Kritische audit — 14 september 2026

Zie [reviewrapport](REVIEW_2026-09-14.md) voor fixes en open productdoelen G1–G8. 508 webtests, productiebuild, runtimecontractharnas en runtimebuild slagen. Dependency-audits melden geen bekende kwetsbare pakketten. Browserregressie dekt zeven werkruimtes op desktop/mobiel plus echte opslagweigering, WebGL-failure en herstel. Veilige HTTP-controles dekken toegestane/vreemde Host/Origin en malformed fixturetestplannen. Geen hardware-output of nieuwe modelgeneratie uitgevoerd.

De outputbugfixes maken de runtime niet tot een volledige livecontroller. Audio/Dante, fysieke WING/MIDI, show-naar-kanaalencoding, meer-universeplanning, minimumpercentage actieve lampen en de overige open doelen moeten nog gebouwd en afzonderlijk geaccepteerd worden. Eerdere testtotalen hieronder zijn historische controles, geen voltooiingsclaims.

Herstel dubbele AI-recepten: regressie reproduceert de exacte runtimefout vóór de fix. Ollama probeert maximaal één gerichte correctie binnen hetzelfde model/schema/deadline; geen deduplicatie of versoepeling van validators. Tests dekken herhaald falen, andere fouten zonder retry, annuleren, revisie-IDs, volledige vervanging en ongewijzigde show. UI biedt daarna expliciete correctieherhaling. Websuite488 tests, runtimecontractharnas en beide builds slagen; modeltransport voor deze fout is deterministisch nagebootst, geen garantie op artistieke modelkwaliteit.

Simulatieweergave: gedeelde beeldhelderheid10–200% (lokaal onthouden), tijdelijke groepslicht-aan/uit met herstelknop en zes vaste camera's. Geen wijziging aan geëvalueerde lichtoutput, Looks of groepsmasters. Groepsmaskering omvat losse LED-heads en haze; behuizingen blijven zichtbaar. AI-preview krijgt helderheid/groepen zonder camerawijziging of animatieherstart. Volledige suite487 tests en build slagen. Browsercontrole: vaste standpunten, stabiele canvasmaat, mobiel390px, gedeelde voorkeuren/herladen en daadwerkelijke GPU-pixels die donkerder worden bij lagere helderheid. Subjectieve visuele afstemming, geen fotometrische kalibratie.

Camera-aanduiding setup: camera-icoon en kijkrichtingspijl volgen de simulatiecamera; hoogte en standpunt staan onder de kaart. Camera buiten het podium wordt expliciet schematisch aan de rand weergegeven. Klikken/toetsenbord opent Weergave zonder selectie of lampdoelpunten te veranderen. Vijf regressietests, volledige suite (482 tests), build en browsercontrole op desktop1440px/mobiel390px slagen. Geen wijzigingen aan DMX of showschema.

Deze criteria zijn onderdeel van het bestaande end-to-end doel, niet een verkleining daarvan. De eerdere status 'blocked' bewijst geen softwarevoltooiing.

### Patch- en netwerkoverzicht

Groepering per podiumgroep/universe, zoeken, detailinspector en expliciete draft-opslag vervangen de inline lijst. Beide partijen van overlap worden benoemd. Gebruik telt unieke bezette DMX-adressen, niet het hoogste startadres. Route-aanmaak is begrensd tot 256 en staat standaard uit. Art-Net-routes gebruiken app-universe 1–32768 (runtime encodeert universe minus één), gebaseerd op de 15-bit Port-Address in de [officiële specificatie](https://art-net.org.uk/downloads/art-net.pdf). sACN behoudt de bestaande schema-grens 63999. Geen schemawijziging of outputaanroep.

458 webtests en productiebuild slagen. `playwright-cli run-code --filename scripts/check-patch-workspace.js` controleert in een geïsoleerde browser overlap/overflowblokkering, afbreken van draftverlies, groepering, patch-/routepersistentie, responsive layout en afwezigheid van `/output/`-aanroepen. Screenshots op desktop en 390px visueel gecontroleerd. Geen fysieke netwerk-/fixturetest; runtime-armvalidatie valt buiten deze UI-wijziging.

### Rijkere realtime podiumsimulatie

De gedeelde simulator bevat nu een podiumplatform, geplooid gordijn, zijdoeken, buistruss en fysieke fixturebehuizingen. Lichtreactieve bandleden hebben schaduwen; maximaal vier spots (fronts eerst) gebruiken gecachte 1024px-schaduwkaarten. Zachte bundeldoorsnede/uiteinden, bescheiden HDR-bloom, ACES-tonemapping en multisample anti-aliasing vervangen de harde transparante kegelweergave. Bundels stoppen bij benaderde podiumoppervlakken, niet bij een willekeurig richtpunt. Kleuren/intensiteiten uit de show en fysieke output blijven ongewijzigd.

464 tests en productiebuild slagen. `scripts/check-realistic-simulator.js` controleert echte WebGL/shadercompilatie, 19 fixtures met 24 lichtpunten en 3 bandleden, blackout/herstel, RGB, haze, drie camera's, 1000×650→600×350→350×260-resize bij gesimuleerde DPR2, en vier mount/dispose-cycli. Rendertextures zijn na dispose nul; geen achtergebleven canvassen. Lokale steekproef van 60 frames: mediaan/p95 16,7 ms, geen hardware-onafhankelijke FPS-garantie. Tekeningbuffer begrensd op DPR1,5 en twee miljoen pixels. Screenshots visueel beoordeeld.

Beperkingen: geen gekalibreerde lux/IES-optiek, geen volledige volumetrische schaduwberekening of lichtreflecties tussen oppervlakken; maximaal vier directe schaduwbronnen. Personen blijven gestileerde modellen. Blackout laat alleen zwak oriëntatie-omgevingslicht staan. Geen fysieke DMX-/hazer-test. Dit vervangt de eerdere beperking dat helemaal geen schaduwen ondersteund waren.

### Typekleuren op de podiumkaart

PARs zijn mintgroen, TRI-bars blauw, theaterspots amber en hazer lila. Legenda en tooltips koppelen kleuren aan catalogusmodellen; nummers/namen blijven behouden. Selectie behoudt de kleur en voegt een witte ring toe. Alleen editorpresentatie: geen wijzigingen in fixturedata, DMX of uitgestraalde kleuren. `scripts/check-stage-type-colors.js` controleert vier onderscheiden kleuren, consistentie per type, behoud bij selectie en mobiele overflow. Desktop visueel gecontroleerd; 459 webtests en build slagen.

### Podiumgereedschap in de zijbalk

Toevoegen, Selecteren, Weergave en Groepen beheren openen bovenaan de rechter inspector, niet boven de podiumkaart. Sluiten behoudt de selectie en herstelt de lege hulptekst waar nodig. Op smalle schermen staat de inspector onder de kaart; de gereserveerde springlink voorkomt verschuiven bij openen. `playwright-cli run-code --filename scripts/check-stage-sidebar.js` controleert de geometrie bij alle vier panelen op 1584/1024/800/390px, overflow en behoud van batchselectie bij sluiten. Desktop en mobiel worden ook als screenshot gecontroleerd.

### Uitlijning ontwerpstudio

Invoervelden delen een titel-, invoer- en hulptekstrij, zodat meerregelige tekst geen verschuiving veroorzaakt. Modelkeuze en verversknop delen dezelfde invoerrij; op mobiel staat de knop eronder. Browserregressie: `playwright-cli run-code --filename scripts/check-design-alignment.js` met Vite op 5173 en de Ollama-companion. Controleert echte veldgeometrie en horizontale overflow op 1584, 1280, 900, 760 en 390 pixels, zonder generatie of showwijziging. Alle vijf breedtes gecontroleerd; desktop en mobiel ook visueel. 440 webtests en productiebuild slagen.

### Bandkarakter in AI-ontwerpen

- Optioneel bandprofiel bij Maak met AI: naam, genres, karakter, kleurgevoel, energie, complexiteit, bewegingstempo en maximaal vier voorkeurskleuren. Bewaard in schema-1-show en versies; oude shows zonder profiel blijven geldig. Uitklapbare inzage toont het bandgedeelte van de modelcontext, niet de volledige prompt. Geen automatische artiestlookup.
- Profiel gaat via dezelfde gevalideerde context naar Ollama en OpenAI. Expliciete complexiteit begrenst nieuwe recepten (2/4/8 stappen); expliciet tempo begrenst nieuwe geanimeerde Lookgroepen (langzaam 8–32, gemiddeld 2–8, snel 0,25–2 beats). AI kiest behoudt de normale grenzen. Bestaande ontwerpen worden niet automatisch gewijzigd. Genre, karakter, kleurgevoel en energie zijn artistieke richtlijnen, geen garanties.
- 440 webtests, productiebuild en runtimecontracttests slagen. Tests omvatten ongeldige/oversized profielen, bewaarcompatibiliteit, kwalitatieve keuzes, kleurbeheer, eerste invoer zonder inklappen, begrensde nieuwe output, stale voorstellen en gedeelde providercontext. Bestaande bundlewaarschuwing blijft.
- Echte lokale Ollama-test met fictieve akoestische soulband: warm/rustig/eenvoudig/langzaam. Eerste aanvraag werd veilig afgewezen met toen nog generieke foutmelding; exacte oorzaak niet gereproduceerd. Contractafwijzingen geven nu een lokale, gerichte reden zonder ruwe modeltekst/parserdetails. Volgende aanvraag leverde amber #ff6a00 met accent #fff1c1, twee patroonstappen, wash/back 8 beats, stabiele fronts en haze uit. Preview en vergelijking visueel gecontroleerd; accepteren en heropenen behield profiel, voorkeuren en het extra ontwerp. Geen fysieke output. Deze ronde bevat geen nieuwe mobiele visuele of echte cloudtest.

### WING-bankeditor

- Setup → Bediening & audio toont voor Rack/Full 16 banken met 4 draaiknoppen en 8 knoppen in een 4×2-matrix. Looks, kleuren en modi gaan op knoppen; groepsmasters op draaiknoppen. Compact heeft een apart USER-profiel met 16 knoppen; overige Compact-controlsecties vallen buiten dit profiel. Geen fysieke WING-upload of MIDI-adressering wordt verondersteld.
- Oude bindings blijven ongeplaatst; profielwissels bewaren onzichtbare slots. Slepen of bron→positie klikken kopieert catalogusacties, bestaande posities wisselen via slepen of Verplaats / verwissel. Vrijmaken behoudt de binding; ongeplaatste bindings kunnen expliciet verwijderd en via Undo teruggehaald worden. Undo bewaart andere showvelden. Indelen activeert geen Live-acties of groepsmasters.
- 395 webtests en productiebuild slagen, evenals runtimecontracttests. Gerichte regressies dekken slots/bankgrenzen, import, dubbele posities, ontbrekende targets, profielwissels, native-drag permissies, callbackflows, banknamen en Undo. Bestaande bundlewaarschuwing blijft.
- Browser: twee Looks daadwerkelijk via native drag toegewezen en daarna tussen bezette posities verwisseld. Herladen behoudt de twee posities. Klikroute, groepsmastertoewijzing, bank16 en Compact-overgang met behouden verborgen bindings gecontroleerd in een afzonderlijke testbrowser. Mobiele 390×844-weergave visueel gecontroleerd: documentbreedte390, vier matrixkolommen zonder horizontale overflow. Runtime blijft armed:false; geen fysieke apparaten bediend.

### Samengestelde AI-patronen

- Ollama kan declaratieve recepten met 1–16 gewogen stappen voorstellen: alle lampen, even/oneven, bewegende vensters, gespiegelde bewegingen en deterministische willekeurige selecties, met lichtverloop, staart en basisniveau. Maximaal 32 patronen; minder leveren mag zonder duplicaten als opvulling. Geen gegenereerde code wordt uitgevoerd.
- Nieuwe recepten spelen per groep; beatduur en offset blijven bij de Looklaag. Bestaande effecten en opgeslagen timing blijven behouden. Schema en grenzen worden zowel in runtime als webapp gecontroleerd. Identieke recepten worden herkend ondanks andere metadata, genegeerde velden, proportionele gewichten of volledig verborgen beweging onder een vast basisniveau.
- Echte lokale Ollama-browsertest met `gpt-oss:20b`: drie recepten van twee stappen, waaronder gespiegelde punten met 60% lichtstaart, willekeurige accenten en een heen-en-weer venster, alle met 35% basisniveau. Uitklapbare uitleg, patroonkeuze, vergelijking en gecentreerde simulator visueel gecontroleerd. Accepteren verhoogde de geïsoleerde testshow van vijf naar acht animaties en bewaarde één extra versie. Heropenen behield het recept op wash met 8 beats en offset +2; front en back bleven vast. Repetitietempo 90 BPM werkte zonder consolefouten.
- Code onafhankelijk gereviewd. Webtests, productiebuild en runtimecontracttests dekken validatie, unieke recepten, groepstiming, legacygedrag, blackout en warmwitte fixtures. De bestaande waarschuwing voor de grote frontendbundle blijft. Deze ronde bevat geen nieuwe mobiele visuele controle of fysieke DMX/WING/Dante-test. Runtime blijft ongewapend.
- Artistieke diversiteit blijft te beoordelen in de preview: validatie bewijst geen esthetische kwaliteit of zichtbare verschillen op elke mogelijke kleine opstelling. Het basisniveau is een relatieve patroonintensiteit vóór groeps-/kleurmasters, geen gemeten podiumlichtopbrengst. Webapp en runtime moeten samen worden bijgewerkt.

Live-schaling: gereproduceerd met zeven Looks, waarbij het paneel tot 865px groeide op een 720px viewport. Live en Repetitie delen nu begrensde paneelhoogte; canvas beïnvloedt de flexhoogte niet. Browsercontrole: paneel504px, canvas882×420, Retina-buffer1764×840; overgang Repetitie→Live en resize naar390px zonder canvasoverflow gecontroleerd. Desktopbeeld visueel gecontroleerd. 110 tests en build slagen.

Patronen/modelkeuze: engine ondersteunt acht effecten met behoud van bestaande static/pulse/chase. Echte Ollama-aanvraag (gpt-oss:20b) genereerde twee benoemde kleurprofielen en vijf verschillende nieuwe patronen: sequence/random/sparkle/wave/build, correct gekoppeld aan vijf Looks. Acceptatie en herladen gecontroleerd. Evaluatie van de werkelijk gegenereerde data bevestigde verandering over beats en maximaal twee RGB-kleuren tegelijk. Individuele TRI-heads alleen bij 14ch; 3ch blijft gegroepeerd. Modelkiezer toont geïnstalleerde modellen, onthoudt browservoorkeur en geeft die per aanvraag mee; modelkeuze en mobiele layout gecontroleerd. 110 webtests en runtime-contracttests slagen, productiebuild slaagt (bestaande bundelgroottewaarschuwing). Kwaliteitswaarschuwingen zijn advies, geen garantie van artistieke kwaliteit; fysieke uitvoer van nieuwe patronen blijft niet hardwaregeverifieerd.

Retina-previewregressie: bij DPR 2 reproduceerde een 600×300 voorstelvak een foutief zichtbaar canvas van 1200×600. Na gedeelde canvas-CSS-sizing is de zichtbare maat 600×300 en de renderbuffer 1200×600. Gekleurde podiumpreview visueel gecontroleerd; aanpassen naar 350×260 blijft correct. 76 tests en webbuild slagen. Deze controle gebruikt de echte WebGL-simulator in een voorstelpreview-host, zonder Ollama opnieuw aan te roepen of de show te wijzigen.

- Varytec 3000K blijft een vaste warmwitte emitter in alle animaties; geen paletkleur op de emitter.
- Groepen aanmaken, hernoemen, lampen toewijzen, intensiteit regelen.
- Meerdere lampen selecteren en batch verplaatsen, hoogte en richting aanpassen.
- Vloer, 1 m, 2 m, 3 m, truss; zichtbare feedback en behoud in export/import.
- Voorwaarts, achterwaarts en podiumdoel richten; zichtbare bundel volgt aim.
- Richtingspresets voor een volledige selectie: horizontaal vooruit/achteruit, schuin omhoog/omlaag en verticaal omhoog/omlaag. Groepsselectie bovenaan; precieze doelpunten zijn optioneel. Richting blijft behouden bij verplaatsen en montagehoogte wijzigen, ook voor TRI-bar-heads.
- Bandleden toevoegen, benoemen en verslepen in Setup; neutrale personen in alle 3D-previews ontvangen de spotbelichting. Meerdere spots tegelijk op een bandlid richten, zonder automatische tracking. Behoud in opslag, versies en export/import; oude shows zonder bandleden blijven geldig.
- AI genereert toepasbare kleurprofielen, animaties en Looks met instelbare aantallen (8/8/16 standaard, elk maximaal 32).
- AI stelt concrete showwijzigingen voor; preview, verschillen, accepteren/verwerpen, scope locks en feedback na drie afwijzingen.
- Geaccepteerde voorstellen wijzigen de inhoud en maken een versie. Alleen ongewijzigde show kopiëren telt niet.
- Werkende providerconfiguratie met duidelijke foutstatus; regelsuggesties niet als modelgeneratie presenteren.
- Lokale functionele en browsertests, code-review; hardwarebenchtests apart benoemen zonder softwaregaten als hardwareblokkade te bestempelen.

## Werkverdeling en verificatie

- Vereist: implementatie, regressietests en browsercontrole voor podiumbediening, vaste emitterkleur en toepasbare AI-voorstellen.
- Vereist: UX/code-review, invoervalidatie, foutfeedback en bescherming tegen verouderde AI-voorstellen; ontvangen modeldata is onbetrouwbare invoer.
- Licht: architectuur/onderhoud via aparte podiumoperaties, renderer en voorstelmodule; documentatie van gebruik en resterende beperkingen.
- Licht: performance en lifecycle — WebGL-resources opruimen bij herbouw, kleine begrensde ontwerpbibliotheken.
- Git/release: geen branches, commits of publicatie gevraagd; bestaande gebruikerswijzigingen blijven intact.
- Hardwareactivering en betaalde provideroproepen zijn geen onderdeel van de lokale regressietests. Niet uitgevoerde integratietests blijven expliciet open.

## Lokale verificatie — 13 september 2026

### Patronen zonder tempo en unieke AI-animaties

- Animatielabels/editor bevatten geen beatduur. Groepen bewaren expliciete timing; laden/importeren materialiseert oude effectieve durations zonder IDs samen te voegen of historische snapshots te herschrijven. Nieuwe AI-patronen hebben compatibiliteitsrate1; groepslagen verplicht eigen duration. Nieuwe duplicaten worden op effect geweigerd, onafhankelijk van naam, tempo, groepen of kleur.
- ProgramCount is een maximum. Toevoegen biedt het model alleen ontbrekende effecten; bij beschikbare patronen is minstens één resultaat vereist, bij uitgeputte mogelijkheden nul. Geen wijziging betekent geen acceptatie/lege versie. Kleuren/Looks behouden exacte aantallen en verwijzingen naar daadwerkelijk teruggegeven programma’s.
- 287 webtests, webbuild, runtime-tests en .NET-build geslaagd. Migratie beschermt alle acht effecten over oude grenswaarden en modi. Onafhankelijke review vond en liet herstellen dat AI-revisies gematerialiseerde timing weer konden overschrijven met ruwe oude lagen; regressietest toegevoegd. Bestaande bundelwaarschuwing blijft.
- Echte Ollama-test gpt-oss:20b: eerste poging gaf nul met onjuiste beschrijving; schema en nulmelding daarop aangescherpt. Tweede aanvraag maximaal32 bij vier aanwezige effecten gaf precies de vier ontbrekende effecten sequence/random/sparkle/build, zonder duplicaten. Geldig voorstel in browser bekeken, niet geaccepteerd. Bestaande Back8beats/+2 behouden; patroonselector toont Pulse zonder tempo, groepsduur heeft geen overerving meer. Runtime herstart, fysieke output blijft uit. Oude dubbele programma’s bewust niet verwijderd.

### Gecombineerde Lookstudio en previewtempo

- Ontwerp & repetitie combineert één geselecteerde Look, opgeslagen groepsinstellingen en een directe sticky podiumpreview. Losse animatie-/kleurproeven blijven apart bereikbaar. Eigen previewklok:30–240 BPM, standaard120; tempo wijzigen behoudt fase en wijzigt geen livebediening. Ongeldige invoer houdt het laatst geldige tempo.
- 272 tests en productiebuild geslaagd. Kloktests beschermen BPM-snelheid, fasecontinuïteit, framecadans en invoergrenzen; SSR-tests beschermen embedded editor, lege toestand en tempo-interface. Bestaande bundelgroottewaarschuwing blijft.
- Desktopbrowser: Lookselectie,90→150 BPM, afwijzing0 BPM met behoud90, offset direct+2, backgroep uit met direct zichtbaar verdwenen licht en weer animatie. Preview blijft naast timing zichtbaar bij scrollen. Navigatie Live→Ontwerp behoudt geselecteerde Look en150 BPM; console bevat geen fouten. Onafhankelijke review leidde tot volledige gridbreedte en compacte sticky mobiele preview. Mobiele viewport kon deze ronde niet via de beschikbare browsercapability worden ingesteld en is niet visueel geverifieerd. Geen hardware/runtimewijzigingen of outputactivering.

### Timing en fase-offset per groep

- Correctie exacte invoer: browserreproductie toonde veldwaarde1.25 terwijl de Look nog+2 gebruikte (alleen blur sloeg op). Geldige invoer wordt nu direct toegepast, met behoud van de decimale invoer tijdens typen. Browserasserties bevestigen direct+1.75 zonder blur, gebruik in Repetitie en behoud na opnieuw openen. Losse animatie meldt expliciet dat Looktiming niet geldt; Volg gekozen Look herstelt die. 262 tests en webbuild slagen; nieuwe regressies dekken inputcallback zonder blur en opgeslagen timing→repetitie→berekende frames. Runtime/hardware zijn ongewijzigd en niet opnieuw getest. Onafhankelijke review zonder blockers; bestaande bundelgroottewaarschuwing blijft.
- Looklagen bewaren optionele eigen beatduur (.125–64, null/omitted = animatieduur) en offset (−64–64, omitted0). Positief vertraagt fase, negatief vervroegt: `(beat-offset)/duur`, zonder eenmalige startvertraging. Alle patronen gebruiken dezelfde formule, met behoud van gezamenlijke ruimtelijke targets. Live-overrides volgen links en wijzigen alleen timing; source-Lookkopie neemt ook null/0-defaults expliciet over. Static/off bewaren maar negeren timing; freeze/safety/blackout blijven behouden.
- 250 webtests, webbuild, runtimecontracttests en .NET-build geslaagd. Nieuwe tests beschermen vier effectfamilies met onafhankelijke tijdreferenties, negatieve fase, legacy-omissie, gekoppelde edits, ongeldigepresentwaarden, reset/source-defaultleak en showpakket/versie-roundtrip. Bestaande frontendbundelwaarschuwing blijft open.
- Browser: opgeslagen backoffset +2 op8beats; exacte−1.25 geaccepteerd, +65 geweigerd zonder verlies vorige waarde; Timing herstellen wist ook invoerfout. Offsetinvoer en meteen een andere groep kiezen schrijft naar de oorspronkelijke groep. Live gekoppelde wash/back toont Gemengd en accepteert gezamenlijke16beats/+1offset tijdensblackout zonder hervatten. Opnieuw openen behoudt opgeslagen8/+2, niet de tijdelijke16/+1. Mobiel390px zonder horizontale overflow; geen consolefouten.
- Code-/UX-review zonder blokkerende bevindingen. Runtime voor nieuwe schema herstart; geen hardware-output of nieuwe echte AI-generatie tijdens deze timingcontrole. Beatklok blijft de huidige simulatieklok; geen claim van geverifieerde Dante-sync.

### Live-groepsbediening en links

- Tijdelijke Look-/kleur-/animatie-/niveau-overrides per groep, met expliciete gekoppelde bedieningssets. Opgeslagen Looks/repetitie blijven intact. Linken verandert alleen volgende handelingen; groeps-Lookkeuze kopieert elke eigen groepslaag met bronpalet. Ontkoppelen behoudt actuele instellingen. Gemengde waarden en de volledige toekomstige linkset zijn zichtbaar.
- 201 webtests en productiebuild slagen (bestaande bundelgroottewaarschuwing). Nieuwe tests dekken onafhankelijke velden, transitieve links, unlink/reset zonder outputsprong, source-palette capture, verwijderde references, vaste emitters, safety/blackout/freeze, invoerimmutabiliteit en UI-mengwaarden/lege shows.
- Browser: wash+back koppelen, gezamenlijke Pulse 8 beats, groeps-Look laden tijdens blackout (blijft actief), gezamenlijke kleurwissel, ontkoppelen en alleen wash naar Pulse 1 beat terwijl back Golf 8 beats behoudt. Algemene Look wist overrides met links behouden. Masterwijziging naar60% stuurt beide groepen; testmasters daarna naar oorspronkelijke waarden hersteld. Mobiel390px zonder horizontale overflow en 312px brede selectors; geen consolefouten. Runtime blijft armed:false.
- UX-review: standaard ingeklapt groepspaneel voorkomt dat algemene Lookknoppen achter alle groepsformulieren verdwijnen; voorspelde link-unie voorkomt verborgen extra targets. Links/overrides zijn sessie-only en niet naar WING hardware gerouteerd. Geen nieuwe API, dependencies of outputactivering; runtime ongewijzigd, dus geen nieuwe runtimecontracttest nodig.

### Gelaagde Looks

- Looks verdelen gedrag per groep: static/animation/off, eigen niveau en vaste of volgende kleur. Animaties krijgen patroon-/beatnamen en geen groepstoewijzing in hun editor. Gedeelde animaties lopen op dezelfde beat en gebruiken gezamenlijke ruimtelijke targets.
- 180 webtests en productiebuild slagen; runtimecontracttests en .NET-build slagen. Regressies dekken alle acht legacy-effectconversies, vaste kleuren versus globale lock, static-front/pulse-wash, groepsmastervermenigvuldiging, freeze/safety/blackout, voorstelreferenties en volledige groepsdekking, betekenisloze revisies na naamnormalisatie, repetitie zonder Looks en groepsreferenties bij stage-undo.
- Reviewbevindingen verwerkt: animatiekeuze start niet ongemerkt met een statisch programma; kleur-only AI-voorstellen bieden een expliciete statische kleurproef zodat vaste Looklagen het voorgestelde profiel niet verbergen.
- Bestaande opgeslagen Looks behouden hun gedrag; eerste groepsbewerking materialiseert equivalente lagen. Nieuwe groepen staan standaard uit. Browserpreview en Live gebruiken dezelfde composer; tijdelijke losse animatie-/kleurproeven wijzigen geen opgeslagen Look.
- Runtime deelt de nieuwe schema's en fysieke context met Ollama/OpenAI. Webapp en runtime samen bijwerken; oude runtime-antwoorden zonder lagen worden afgewezen. Cloudprovider/hardware niet live getest; minimum-lichtopbrengstparameter en WING-configurator blijven buiten deze wijziging.
- Echte Ollama-browsertest (`gpt-oss:20b`): 2 profielen/2 animaties/2 Looks gegenereerd. Eerste Look heeft front static 80% met vast Warm amber, wash Pulse 8 beats, back Golf 8 beats en haze uit; tweede gebruikt dezelfde Pulse op wash/back. Preview, Lookwissel, vergelijking met oorspronkelijke show en statische kleurproef gecontroleerd. Acceptatie voegt de collectie en één versie toe; opnieuw openen behoudt de lagen en namen. Live speelt de bewaarde Look en blackout/front-only/play-switches werken. Geen consolefouten. Smalle preview 316×260 binnen 390px viewport, groepseditor zonder horizontale overflow; desktop-Livecanvas 858×416.5 gelijk aan zijn hosthoogte. Alle controles in geïsoleerde testbrowser, fysieke output niet geactiveerd.

### Selectiegestuurde podiumeditor

- Aanvulling zijwaarts richten/verdelen: 131 webtests en productiebuild slagen. Zes nieuwe zijrichtingen worden door de parametrische batchtests afgedekt; asverdeling test behoud van hoogte, andere as, bundelrichting, patch, eindpunten en niet-geselecteerde fixtures. Browser bevestigt dat categoriekeuze Undo niet activeert, Links omhoog op drie lampen toepast, en voor–achterverdeling de kaartposities 25/25/75% naar 25/50/75% verandert met ongewijzigde horizontale posities. Geen hardware-output geactiveerd.

- 122 webtests en productiebuild slagen, inclusief lege-startweergave, stage-only undo, behoud van patch/masters/creatieve verwijzingen en batch-uitlijning. Bestaande bundlegroottewaarschuwing blijft open.
- Browser gecontroleerd: geen automatische selectie; enkel/multi via Shift en expliciete multiselect; gemengde hoogte/richting; batchvloer en achteruit-omlaag; groepstoewijzing; herstel in losse stappen; bandlid toevoegen en exclusieve context; op bandlid richten met behouden lampbron; Escape annuleert richtkeuze; hazer zonder richtinstellingen.
- Regressie gecontroleerd: lampnaam wijzigen en meteen slepen behoudt naam; eerste Undo herstelt alleen verplaatsing, tweede Undo herstelt naam. Mobiel 390×844 zonder horizontale overflow, selectie bereikbaar via ankerlink. Desktop podium begint aanzienlijk hoger doordat de grote introductie en permanente formulieren verdwenen zijn.
- Pointercancel tijdens drag is in code gereviewd maar niet als echte touch-interruptie op hardware uitgevoerd. De WING-configurator, AI-aanvraaginzage en minimum-podiumlichtparameter zijn geen onderdeel van deze podiumwijziging; volledige productacceptatie blijft open.

- 47 webtests slagen; webbuild en .NET-runtimebuild slagen.
- `dotnet run --project runtime-tests` verifieert de OpenAI-adapter met nagebootste HTTP-antwoorden, het JSON-contract, minimale providercontext, weigering en offline aantallen.
- Browser: selectie per vakje/groep/kader, batchhoogte, richten, groep aanmaken/hernoemen/toewijzen en slepen met behoud van onderlinge afstand gecontroleerd. Podiumeditor op 390 px zonder horizontale overflow.
- Browser: voorstel van 2 profielen, 2 animaties en 3 Looks verandert opgeslagen aantallen pas na accepteren van 2/3/3 naar 4/5/6. Eén versie bevat de nieuwe inhoud; herladen behoudt alles.
- Browser: Look-preview koppelt de juiste kleur en animatie; verwerpen bewaart 4/5/6 en één versie. Een wijziging na aanvragen maakt het voorstel onbruikbaar en toont uitleg.
- Browser: ontwerpflow inclusief voorstelpreview heeft op 390 px geen horizontale overflow; geen consolefouten in deze controles.
- Runtime na herstart: health ready, armed false. Geen fysieke output geactiveerd.

Open: echte cloudgeneratie met eigen providerconfiguratie; fysieke WING/Dante/DMX-validatie; overige volledige-productcriteria buiten deze herstelronde. Deze resultaten betekenen niet dat het volledige productdoel bereikt is. Kleurprofielen hebben momenteel vier vaste rollen; vrij instelbaar aantal kleurrollen is nog niet geïmplementeerd.

Aanvulling bandleden: 66 tests en webbuild slagen. Browserbeelden bevestigen warm frontlicht en gekleurde spill op het 3D-personage; blackout schakelt spots uit maar laat het conceptuele omgevingslicht zichtbaar. Geen schaduw-/occlusie- of fotometrische simulatie.

Aanvulling Ollama: echte lokale generatie met het reeds geïnstalleerde `gpt-oss:20b`, zonder sleutel, modeldownload of cloudfallback. Twee profielen, twee animaties en twee Looks doorlopen aanvraag, preview, afwijzen met feedback, accepteren en herladen; opgeslagen aantallen worden 4/5/5 met één versie. Feedback voor animatieduur 8/16 beats wordt na verduidelijking van het schema correct gevolgd. Annuleren toont herstelbare feedback zonder showwijziging. Alle 66 webtests, webbuild en runtime-contracttests slagen; runtime blijft ongewapend.

Kwaliteitsbeperking: correcte JSON en aantallen garanderen niet dat iedere artistieke instructie klopt. Afzonderlijke stabiele frontlagen naast bewegende wash/back zijn inmiddels ondersteund via Looklagen (zie Gelaagde Looks), niet door kleur of groep aan een animatierecept te binden.

Aanvulling Repetitie: losse selectors tonen alle opgeslagen animaties en kleurprofielen, onafhankelijk van Looks. Tijdelijke combinaties en groepsniveaus wijzigen geen opgeslagen show of livebediening. 71 webtests slagen, inclusief combinaties zonder Look, terugval bij verwijderde items en hervatten na blackout/static. Browser: alle 5 animaties/4 profielen in de testshow bereikbaar, selecteren na blackout, terug naar Look, herstel masters en Repetitie → Live → Repetitie gecontroleerd. Live behield de oorspronkelijke Look en 75% wash terwijl repetitie een andere combinatie en 0% wash gebruikte; opgeslagen show bleef identiek. Desktop en 390px visueel gecontroleerd zonder horizontale overflow.

Aanvulling collectie vervangen: aparte werkwijze vervangt alle drie collecties met 1–32 nieuwe items per soort; geen toevoeging of revisie. Echte Ollama-browsertest: 4/5/5 werd 2/2/2, uitsluitend na expliciet accepteren. De oude show werd identiek als extra versie bewaard; podium, groepen, patch, camera en sync bleven gelijk. Ongeldige oude Look-/kleurknoppen worden vooraf benoemd en verwijderd; modus-/masterbindings blijven behouden. Contracttests controleren 32/32/32, oude requestcompatibiliteit en geen verwijzingen naar verwijderde items. 75 webtests en beide builds slagen. Reviewversterking: herstelversies worden vóór showmutatie opgeslagen; opslagfout blokkeert vervangen.

# Live WING-schermbediening

De opgeslagen Setup-indeling is bedienbaar onder de livepreview. Bankkeuze voert geen actie uit; lege/ongeldige slots zijn uitgeschakeld. Look-, modus- en kleurknoppen hergebruiken livegedrag; rotaries regelen opgeslagen groepsmasters en volgen groepslinks. “Volg Lookkleur” wist alleen de kleurvergrendeling. Geen fysieke WING-synchronisatie of DMX-output toegevoegd.

Validatie: 468 tests en productiebuild slagen. `scripts/check-live-wing.js` controleert in een geïsoleerde browser Lookselectie, behoud van blackout bij kleur/masterwijziging, kleur loslaten, bank 16, stabiele canvasafmetingen, gekoppelde masters, opslag na herladen en mobiele overflow. Desktop (1584px) en mobiel (390px) visueel gecontroleerd. Bestaande bundlegroottewaarschuwing blijft.

# Groepsringen op het podium

Podiumfixtures hebben een buitenring voor hun groep, naast hun bestaande typekleur. De legenda toont groepsnamen en aantallen: aanwijzen/focussen benadrukt de ringen, klikken of Enter selecteert de hele groep. Witte binnenrand plus selectiestip blijft onderscheiden van de groepskleur. Lege groepen zijn niet selecteerbaar. Bij Weergave kan ‘Groepsringen tonen’ uit; dit verandert de selectie of opgeslagen show niet. De voorkeur geldt zolang de podiumeditor open blijft.

Validatie: 477 tests en productiebuild slagen. Vier nieuwe tests beschermen type-/groepsidentiteit, hover/focus/selectie, de schakelaar en hernoemen/toevoegen/herindelen van groepen. `scripts/check-stage-group-rings.js` verifieert de gerenderde ringen, keyboardselectie, behoud van typekleuren en witte selectie, geen showmutatie, stabiele kaart bij Weergave en batchverplaatsing. Desktop1440px en mobiel390px visueel gecontroleerd, zonder horizontale pagina-overflow. Onafhankelijke UX-review zonder blokkerende bevindingen. Geen wijzigingen aan lichtberekening, DMX of showschema.
