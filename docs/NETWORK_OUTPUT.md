# Continue sACN- en Art-Net-uitvoer

Lightlab kan de geladen showsnapshot vanuit de lokale runtime continu naar meerdere DMX-universes sturen. De browser ontwerpt/bedient; de gedeelde Node-evaluator berekent Looks, overgangen, patronen, kleuren en groepsmasters. De .NET-runtime encodeert en verzendt. Er is geen tweede creatieve engine.

## Gebruik

1. Bouw/start dezelfde versie van webapp, worker en runtime (`npm run build`, `dotnet run --project runtime`). Een bestaande runtimesessie neemt nieuwe code niet vanzelf over.
2. Stel in **Setup → Patch & netwerk** de juiste fixturemodus, universe en DMX-adressen in. Geef iedere gebruikte universe precies één ingeschakelde route met protocol en IPv4-nodeadres of hostnaam.
3. Kies **Live → Naar DMX-bediening** (of **Livesessie**) en start of verbind de huidige show. Als de runtime nog niet draait, start die eerst via **Verbindingen**. Dit verstuurt nog niets.
4. Open **DMX-uitvoer** en kies **DMX-uitvoer aan**. Deze expliciete klik bevestigt de API-opdracht; er is geen extra checkbox. De status toont **Uit**, **Verzendt**, **Fout** of **Onbekend**. Bestemmingen uit de geladen snapshot staan onder **Geavanceerd · bestemmingen & gedrag**.
5. Bedien de lokale runtimesessie in Live. Lookkeuzes, overgangen, kleurkeuzes, WING-schermknoppen en groepsmasters sturen nu dezelfde geëvalueerde output aan. Voor WAV-audio: laad de opname, kies **Koppel WAV aan runtime** terwijl uitvoer uit staat, en bevestig daarna fysieke uitvoer. Dit implementeert geen fysieke WING/MIDI-ingang of native audio/Dante-ingang.

Editorwijzigingen veranderen de actieve snapshot/patch niet. Stop en start een nieuwe snapshot om ze over te nemen; fysieke uitvoer moet opnieuw worden bevestigd. Zonder audiokoppeling stopt browser sluiten/herladen de runtime of netwerkuitvoer niet. Met gekoppelde WAV schakelt verlies van de browserklok de uitvoer uit. Er wordt niets automatisch ingeschakeld na een runtimeherstart.

Sluiten van het DMX-zijpaneel verandert de uitvoer niet en houdt de statuscontrole actief. **DMX-uitvoer uit** blijft bereikbaar tijdens een lopende inschakelopdracht; **Stop runtimesessie** blijft apart beschikbaar. De aparte sectie **WAV koppelen aan de livesessie** is optioneel: DMX werkt ook met de vrije runtimeklok, zonder audio.

**Inschakelen grijs?** Een bereikbare runtime is nog geen draaiende livesessie. Het DMX-paneel toont de ontbrekende stap: sessie starten, actuele status ophalen of patchfout oplossen. **Ga naar de livesessie** navigeert alleen; start of verbind daar de show. Kies daarna **DMX-uitvoer aan**. Oude bestemmingen kunnen ook na Stop nog zichtbaar zijn; dat betekent niet dat de show draait.

## WAV-audio naar DMX

De browser verzendt één begrensde kickanalyse bij expliciet koppelen, daarna circa tien kleine afspeelpositieberichten per seconde. Geen WAV-bestand, waveform of DMX-frames worden verstuurd. De runtime extrapoleert de positie met zijn monotone klok en blijft zelf frames evalueren, coderen en uitsturen. Pauzeren houdt de positie vast; zoeken/herhalen verplaatst de tijdlijn. In gekoppelde modus bepaalt het audiopaneel het tempo; de gewone runtime-BPM is alleen de vrije klok. Normale Live-bediening en blackout blijven gelden. In kick- en tempomodus werken de ingestelde Look-overgangen; bij losse kicks blijven de normale bron en het doel reageren tijdens de fade. De overgangstijd volgt BPM, niet het aantal kickaanslagen. Zie [audiogedrag en klokwijzigingen](AUDIO_KICK_TEST.md).

Geen heartbeat gedurende circa één seconde betekent **blackout en disarm**, ook bij gepauzeerde audio. Socket/DNS/evaluatiekosten kunnen de exacte reactietijd beïnvloeden; een tweede deadlinecheck na route-oplossing voorkomt uitsturen van een verouderd startframe. De UI bouwt geen berichtwachtrij op en herhaalt geen mislukte attach/sync. Herstel vereist opnieuw koppelen met uitvoer uit, expliciet een Look/automation kiezen als de sessie in blackout staat, en opnieuw fysieke uitvoer bevestigen. Sluiten/verlaten/ontkoppelen en vervangen of heranalyseren van de WAV verbreken de koppeling. Achtergrondtabs kunnen timers vertragen: houd de pagina actief. Dit is geen native/sample-nauwkeurige of latency-gekalibreerde audio-engine.

API: `GET /playback/audio?sessionId=...` geeft `{version:1, sessionId, audioId, state:"detached"|"following"|"lost", sequence, error}`. `POST /playback/audio` gebruikt dezelfde loopback/Origin-policy en strikte JSON-parser, maximaal 512 KiB:

- `attach`: `{version:1, sessionId, audioId, command:"attach", sequence:0, analysis, position}`. `audioId` is 32 hextekens. Analyse: `{duration, kicks:[{time,strength}], bpm, confidence}`; maximaal 600 seconden/7500 geordende kicks. De runtime bewaart één analyse in het evaluatorproces.
- `sync`: dezelfde identifiers, `command:"sync"`, strikt oplopend `sequence` en alleen `position`. Positie: `{seconds, playing, mode:"tempo"|"kicks", bpm, reactions, decayMs, floor}`. Reacties zijn bekende snapshotgroep-ID's met `look|pulse|step|static`; BPM 30–240, uitloop 100–1000 ms, basislicht 0–1.
- `detach`: alleen versie, sessie, audioId en command. Alleen de eigenaar kan ontkoppelen; dit zet blackout en schakelt uitvoer uit. Geen automatische overname van een bestaande audiobron.

Onbekende/ontbrekende/duplicaatvelden: 400; verkeerde of verlopen eigenaar/sessie/sequence of koppelen terwijl uitvoer actief is: 409; te groot: 413; geen JSON: 415. Analyse, positie en sockets worden bij stop/fout/opnieuw laden opgeruimd; geen persistente media of historie. Een beperkte laatste fout-/eigenaarstatus blijft tot nieuwe koppeling/sessie zichtbaar. Alleen frameCount/revision bepalen de volgorde van previewantwoorden: beatposities mogen door zoeken teruglopen.

Getest met een geïsoleerde runtime, echte Node-evaluator en twee sACN-loopbackuniverses: kickpiek/uitloop/seek op de wire, blackoutvoorrang, klokverlies en geen automatische hervatting. Art-Net deelt de encoder-/uitvoerketen en is met pakket- en transporttests gecontroleerd; echte Botex/lampen en Art-Net op de installatie blijven te verifiëren.

## Stoppen en fouten

- **Blackout** in de show houdt de uitvoer actief en blijft nulwaarden versturen.
- **DMX-uitvoer uit** probeert drie zwarte frames per universe te sturen, daarna drie sACN-stopframes per sACN-universe; de sender sluit vervolgens. De show blijft in geheugen spelen.
- **Stop runtimesessie**, evaluatorfout en normale runtimeafsluiting voeren dezelfde uitvoeropruiming uit en stoppen vervolgens de evaluator.
- Een verzendfout of deadline stopt alleen de netwerkuitvoer met een zichtbare fout. De show blijft in geheugen lopen; opnieuw inschakelen is altijd expliciet.
- UDP bevestigt geen ontvangst. `armed`, `framesSent` en `outputSent` betekenen geen werkende node of lamp. Een kabelbreuk, crash, stroomuitval, andere controller of failoverinstelling kan blackout verhinderen. Controleer failover en noodbediening fysiek.

Test de fixturemodi/adressen eerst met lage niveaus en zonder publiek. Alle catalogusprofielen blijven fysiek ongeverifieerd. Controleer de hazer afzonderlijk voordat je hem laat meespelen; de huidige encoder heeft geen operationeel fanbeleid.

## Grenzen en protocolgedrag

- Maximaal256 fixtures/zichtbare heads per runtimesessie; maximaal één route per gebruikte universe. Ongepatchte fixtures sturen niets. Ontbrekende of uitgeschakelde routes blokkeren inschakelen voor gebruikte universes.
- Geen stilzwijgende netwerkfallback. Hosts worden alleen tijdens inschakelen opgelost (gezamenlijk5s); IPv4-bestemmingen staan daarna vast voor deze inschakeling. De OS-routering kiest de netwerkinterface.
- Art-Net: handmatig geconfigureerde unicastbestemming, UDP6454 als bron- en doelpoort. App-universe1 correspondeert met Art-Net Port-Address0; maximum32768. Sequencing1..255, daarna1.
- sACN: UDP5568 als doelpoort, ephemeral bronpoort, prioriteit100, bronnaam `Lightlab Runtime`, proces-eigen CID. Universe1..63999; sequencing0..255. CID en protocol/universe-volgnummers blijven gedurende het proces behouden, ook na stop/start.
- Maximaal40 volledige verzendrondes per seconde, zonder achterstandswachtrij; evaluatie en verzending kunnen de werkelijke cadans verlagen. Een volledige ronde heeft500ms verzendbudget. Shutdown heeft een gezamenlijk1s budget; geen onbeperkte retries. Meerdere universes zijn niet wire-synchroon.
- Geen ArtPoll-discovery, ArtSync, sACN-universe-discovery/synchronisatie, interfacekiezer of instelbare prioriteit. Dit is een gerichte DMX-datastroom, geen claim van volledige protocolcertificering. Multicast en netwerkconfiguratie buiten de loopbacktests zijn niet geverifieerd.
- De oude losse `/output/*`-testsender en continue showuitvoer delen een exclusieve lease. Inschakelen terwijl de andere sender actief is geeft409; er is geen interleaving of automatische overname. De lease blijft tot na cleanup behouden.

Wirevelden zijn gecontroleerd tegen de officiële [Art-Net-specificatie](https://art-net.org.uk/downloads/art-net.pdf) en de [E1.31-2018-pakketbeschrijving](https://tsp.esta.org/tsp/documents/docs/E1-31-2018.pdf), waaronder de drie Stream_Terminated-pakketten. E1.31-2018 is inmiddels opgevolgd; zie [ESTA's huidige publicaties](https://tsp.esta.org/tsp/documents/published_docs.php). Dit document claimt geen volledige E1.31-2025-conformiteit.

## API en eigenaarschap

De bestaande loopback Host/Origin-policy geldt. `GET /playback/output?sessionId=...` is no-store en werkt voor de laatst bekende sessie, ook na stop. Stale sessies geven409. Status:

```json
{
  "version": 1,
  "sessionId": "...",
  "state": "disarmed",
  "routes": [{ "universe": 1, "protocol": "sacn", "host": "127.0.0.1" }],
  "framesSent": 0,
  "lastError": null,
  "armError": null
}
```

`state`: `disarmed`, `armed` of `faulted`. `routes` zijn kandidaatbestemmingen uit de snapshot, ook als uitvoer uit staat. `armError` beschrijft configuratieproblemen; null bewijst geen bereikbaarheid. `framesSent` telt volledig afgeronde universe-rondes, niet individuele pakketten of cleanup. Het reset bij een nieuwe sessie. `lastError` bevat uitsluitend authored diagnostiek.

`POST /playback/output`, strikt JSON, maximaal4096bytes, versie1, geen onbekende/duplicaatvelden:

```json
{ "version": 1, "sessionId": "...", "command": "arm", "confirmed": true }
```

Uitschakelen: `command:"disarm"`, zonder `confirmed`. Arm vereist een draaiende sessie en haalt routes uitsluitend uit de gevalideerde snapshot. Stale sessies/conflicterende producer409; ongeldige invoer400; te groot413; geen JSON415; armdeadline504; transport/startfout503. Een verzendfout na geldig arm kan een200-status `faulted` opleveren: controleer altijd de status. Een verloren HTTP-antwoord is geen toestemming om arm automatisch te herhalen.

`PlaybackStatus.outputSent` accepteert nu true/false: true betekent dat de actieve stream al succesvol een ronde heeft verzonden, ook als de huidige evaluatie door rate limiting nog niet opnieuw verzendt. False bij uitgeschakelde/gefaalde uitvoer. Oudere browsers die alleen false toelaten moeten worden bijgewerkt voordat fysieke uitvoer wordt ingeschakeld.

`PlaybackOutput` bezit routes, socketresources en begrensde processtatus; geen framehistorie, persistente uitvoerlogs of extra showmetadata. Stop sluit sockets en verwijdert opgeloste bestemmingen; de laatste routelijst/fout blijft zichtbaar tot de volgende sessie of procesafsluiting. Alleen het proces bewaart maximaal de eindige protocol/universe-sequencetabel. Er is geen retentiejob, backfill of externe diagnosetelemetrie.

## Validatie

- `npm test`: frontendcontracten, bevestiging, stale antwoorden, bereikbare uitschakelactie tijdens pending arm, onbekende status bij verbindingsverlies, bestaande suites.
- `dotnet run --project runtime-tests/Lightflow.AiContractTests.csproj`: wirevelden, beide protocollen/universes, lease-races, deadlines, route/DNS-fouten, sequence-wrap, stop/fout/shutdown en echte sACN UDP-loopback.
- `node --experimental-strip-types scripts/check-continuous-output.mjs`: eigen geïsoleerde companion met echte Node-show-engine, twee sACN-universes en lokale UDP-ontvanger; geen auto-arm, bevestiging, Origin/session-afwijzing, Lookwissels, blijvende blackout, disarm en Stop. Bouw eerst runtime en worker. De test vereist vrije lokale UDP5568; hij neemt geen bestaande listener of sessie over.
- Browsercontrole: bevestiging vóór arm, status/destinations, uitschakelen en desktop/mobilelayout. De UI-test gebruikt gemockte netwerkantwoorden; de aparte procesproef valideert de echte HTTP/UDP-keten.

De Art-Net UDP-loopbackproef met gescheiden127.0.0.1/127.0.0.2 wordt op deze Mac overgeslagen omdat het tweede adres niet bindbaar is. Geen netwerkaliases toegevoegd. Botex/fixture-hardwareacceptatie, langdurige belasting en Windows/Linux-sockets blijven open.

`LIGHTLAB_RUNTIME_PORT` kan voor geïsoleerde tests een poort1024..65535 kiezen, altijd op127.0.0.1. Productstandaard blijft5188; de webapp verwacht5188. Verander geen actieve gebruikersruntime voor een test.

## Reviewbesluiten

Hercontrole 2026-09-15 bij de directe DMX-bediening: 770 frontendtests + 22 launchertests, productiebuild, .NET-contractharnas en geïsoleerde HTTP/Node/twee-universe-sACN-proef geslaagd. Browsercontrole met onderschepte runtimeantwoorden op desktop en 390px: bevestiging vereist, inschakelen/uitschakelen en paneel sluiten/heropenen zonder uitvoermutatie. Reviewbevinding over een verdwijnende runtimewaarschuwing na show-open opgelost en regressietest toegevoegd. Geen gebruikersruntime of fysieke node aangestuurd. Een niet-blokkerende bestaande beperking blijft: bij trage DNS kan het eerste vrije-klokframe na inschakelen een oudere fase bevatten; daaropvolgende frames volgen de actuele klok. De audiodeadline wordt na DNS opnieuw gecontroleerd.

Geaccepteerd: één creatieve engine, expliciete opt-in, immutabele snapshotroutes, exclusieve producerlease, begrensde sends/cleanup, geen herinschakeling na fouten, en onderscheid tussen verzending en ontvangst. Geen per-frame browsertransport of onbeperkte retrywachtrij. Beperkte multicast/discovery/physicalacceptatie wordt expliciet vermeld, niet als bewezen functionaliteit gepresenteerd. Geen branch, commit of hardwareactivatie uitgevoerd.
