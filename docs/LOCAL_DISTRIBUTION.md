# Zelfstandig Lightlab-pakket

`npm run package:local` bouwt een host-native distributiemap onder `output/releases` met de webapp, patroonworker, Node en een self-contained .NET-runtime. Op de doelcomputer hoef je Node, npm of .NET niet te installeren. Een browser blijft nodig. Ollama en modellen worden niet meegeleverd of gedownload.

## Gebruiken

1. Pak de volledige distributiemap lokaal uit en houd de bestanden samen.
2. Start `Start Lightlab.command` op macOS, `Start Lightlab.cmd` op Windows of `Start Lightlab.sh` op Linux.
3. De launcher opent `http://127.0.0.1:5173`. Houd het terminalvenster open; Ctrl+C sluit webapp en companion.

Het tabblad **Runtime** bevat status, **Start runtime**, **Stop runtime** en recente meldingen. Stop beëindigt het door deze starter beheerde companionproces, inclusief runtime-afspelen en verbindingen; de webapp blijft open. Tijdens stoppen zijn nieuwe starts geblokkeerd. Een handmatig of door een andere starter gestart proces is extern: deze app kan dat proces niet stoppen of overnemen. Na een fout in de companion blijft de webapp open; je kunt daar opnieuw starten zonder de hele app te sluiten. Fysieke uitvoer blijft een afzonderlijke, expliciete handeling. Een browser kan deze functie alleen gebruiken zolang de lokale webserver draait. Oudere distributies krijgen dit niet door alleen de browser te vernieuwen: bouw of open een bijgewerkt volledig pakket.

### Welke code draait?

De getoonde starttijd is het moment waarop deze starter het proces heeft gestart, geen buildtijd of garantie dat alle huidige broncode geladen is. Een draaiende runtime neemt latere codewijzigingen niet automatisch over.

- Bij `npm run dev` gebruikt **Start runtime** `dotnet run` met het Ollama-profiel. Dit bouwt de .NET-broncode voor die start (standaard Debug), inclusief wijzigingen aan de WING-adapter. De patroonengine wordt apart gebouwd met `npm run build:engine`.
- Bij `npm run start:local` wordt de eerder gebouwde Release-runtime gebruikt. Stop en Start bouwen die niet opnieuw. Werk eerst bij met `npm run build:local`; voor een zelfstandig pakket bouw/open je een nieuw volledig pakket.
- Voor een externe runtime zijn starttijd en geladen bronversie niet door deze starter vastgesteld. Stop die in zijn oorspronkelijke terminal of starter en start daarna de gewenste versie. Een versienummer of recente starttijd bewijst op zichzelf geen actuele broncode.

Het logboek bevat maximaal 200 zelf geformuleerde status-/foutmeldingen in het geheugen van de launcher. Ruwe console-uitvoer wordt niet getoond of op schijf bewaard; onbekende technische uitvoer levert hoogstens een algemene melding op. Zo worden geen sleutels, AI-teksten of showgegevens via de procesconsole blootgesteld. Externe, handmatig gestarte runtimes hebben hier geen proceslogboek. Sluiten van de launcher wist deze meldingen.

### Lokale start-API

De webserver op poort 5173 levert `GET /__lightlab/runtime`, `POST /__lightlab/runtime/start` en `POST /__lightlab/runtime/stop`. Antwoorden hebben `version: 1`, `state` (`stopped`, `starting`, `running`, `external`, `error`), `canStart`, `message` en maximaal 200 `logs` met `id`, `time`, `level`, `message`. De uitbreiding voegt `canStop`, `stopping`, `startedAt` (ISO-tijd of null), `launchMode` (`development`/`prebuilt`) en `buildMessage` toe; oudere clients kunnen die velden negeren. Bij oude starters zonder `canStop` blijft Stop uitgeschakeld. Start/Stop retourneren 202; dit bevestigt de aanvraag, niet de voltooiing. Lees de status tot `running` respectievelijk `stopped` of een fout; tijdens opruimen is `stopping: true`. Alleen de vaste runtime wordt beheerd; paden, commando's, PID's en instellingen zijn niet opvraagbaar of instelbaar via deze API.

Host moet exact `localhost:5173` of `127.0.0.1:5173` zijn. Start/Stop vereisen de bijpassende `http://` Origin, `X-Lightlab-Action: start` respectievelijk `stop` en een lege body. Afwijkende oorsprong geeft 403, inhoud 400, onbekend pad/query 404 en verkeerde methode 405. Antwoorden zijn `no-store`. De manager controleert uitsluitend de vaste lokale health-poort5188, nooit hardware. Gelijktijdige starts/stops worden samengevoegd; Stop annuleert ook een nog lopende startvoorbereiding. Een bezette poort wordt niet vrijgemaakt en externe processen worden nooit gestopt. Runtime-stop beëindigt wel een actieve show in het eigen proces; er is geen automatische herstart of herinschakeling van uitvoer.

De manager bewaakt eigen processen en probeert hun procesgroep bij netjes afsluiten binnen vijf seconden op te ruimen. Windows gebruikt een gerichte procesboomactie, maar dit is niet op Windows geverifieerd en kan na vroegtijdig verdwijnen van een ouderproces afwijken. Geforceerd beëindigen van de webserver of stroomuitval kan processen achterlaten; een volgende start behandelt die als extern en stopt ze niet.

De launcher weigert bezette poorten 5173/5188 zonder andere processen te stoppen. Hij controleert de gebundelde bestanden vóór het starten; verander de inhoud niet. Deze hashes detecteren schade, maar zijn geen uitgevershandtekening. Het pakket is nog niet met een externe uitgeversidentiteit ondertekend of genotariseerd. Schakel OS-beveiliging niet globaal uit.

Shows blijven browsergegevens. Gebruik dezelfde browser en het adres `127.0.0.1`; `localhost` is een andere opslaglocatie. Werk met één schrijvend tabblad en exporteer regelmatig een showpakket naar een externe back-up. Sluit Lightlab vóór een update, pak de nieuwe versie apart uit en bewaar de oude map voor rollback. Exporteer vóór terugkeer naar oudere software; oude versies kennen mogelijk de nieuwe opslagindeling niet. Verwijderen van de distributiemap wist geen browsergegevens.

## Bouwen en verifiëren

De bouwcomputer heeft Node22+, npm-afhankelijkheden en de .NET10 SDK nodig. Gebruik een officiële zelfstandige Node-binary, geen build met externe Homebrew-libraries. De macOS/Linux-preflight controleert dynamische afhankelijkheden; systeemlibraries blijven OS-voorwaarden. Node- en .NET-licenties en notices worden meegeleverd. Een afwijkende Node-installatie kan `LIGHTLAB_NODE_LICENSE` naar haar LICENSE-bestand laten wijzen.

Er wordt voor het huidige OS en x64/arm64 gebouwd, niet stilzwijgend voor een ander platform. Bouw en test Windows/Linux op die systemen. De scripts alleen bewijzen geen platformcompatibiliteit. De CLI-check gebruikt dezelfde pakketcontrole zonder processen te starten:

```sh
./bin/node ./scripts/start-local.mjs --check
```

Het manifest begrenst het aantal bestanden, diepte en totale grootte. Zowel feitelijke bestanden als gedeclareerde grootte worden gecontroleerd; ontbrekende/extra/beschadigde bestanden en symbolische links worden geweigerd. Bewaar een eventuele ZIP-checksum buiten de uitgepakte map. De actuele lokale start/stop- en duurtestresultaten staan in [de afrondingsnotitie](FINISH_CREATIVE_DAILY.md).
