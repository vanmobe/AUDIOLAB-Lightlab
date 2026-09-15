# WING-bankconfiguratie

## Afbakening

Lightlab configureert geselecteerde, toegewezen custom controls via OSC op UDP-poort 2223. De Looks en patronen blijven in Lightlab; de tafel krijgt korte labels en MIDI-toewijzingen, geen lichtshow-engine. Een geslaagde bankoverdracht is dus geen bewijs dat fysieke knoppen Lightlab al bedienen. De MIDI-ontvangstkoppeling is afzonderlijk vervolgwerk.

Het IP-adres is een lokale verbindingsvoorkeur, geen onderdeel van het showbestand. De beginwaarde is `10.0.0.10`; alleen canonieke privé-IPv4-adressen worden toegelaten, geen hostnamen, multicast, loopback of adressen eindigend op 0/255. Er is geen automatische ontdekking, verbinding of overdracht. Full Size en Rack met firmware 3.1 gebruiken numerieke banken 1–16; Compact heeft een andere adressering en is voor deze overdracht nog niet ondersteund. Andere firmware kan wel worden herkend maar niet geconfigureerd.

## Werkwijze

1. Open Setup → Bedieningspaneel en de WING-synchronisatie.
2. Vul het IP-adres in en controleer de gevonden tafel en firmware.
3. Selecteer de banken die je wilt overdragen. Niet-toegewezen posities en niet-geselecteerde banken blijven behouden.
4. Lees het voorstel: bestaande functies kunnen bijvoorbeeld audio-DCA's of mutegroepen zijn. Controleer wat je vervangt, inclusief afgekorte tafellabels.
5. Download desgewenst een back-up van de voorconfiguratie; dit is optioneel. Bevestig de overdracht pas als het voorstel klopt en verstuur daarna de bevestigde wijzigingen.
6. Controleer de teruggelezen resultaten. Bij een gedeeltelijke overdracht zijn mogelijk al controls gewijzigd; lees opnieuw en controleer de tafel voordat je verdergaat. Er is geen automatische herhaalpoging of automatische rollback.

De globale MIDI-uitgang, actieve bank, gedeelde kolomkleuren/LED's en audiomixerinstellingen worden niet ingesteld door bankoverdracht. Bestaande functies op de geselecteerde controlposities worden na bevestiging wél vervangen. Rotarywaarden worden niet meegestuurd om niet onbedoeld MIDI-niveaus uit te sturen.

Banknamen blijven in Lightlab. Labels worden genormaliseerd naar maximaal 16 ASCII-tekens; het voorstel vermeldt wijzigingen. Knoppen gebruiken `MIDINP`, MIDI-kanaal = banknummer, noot = knopnummer − 1 en aanslagwaarde 127. Draaiknoppen gebruiken `MIDICC`, hetzelfde kanaal en CC = draaiknopnummer − 1. Controleer conflicten met andere MIDI-apparaten. Posities die deze instellingen al hebben worden niet opnieuw geschreven.

## Lokale API

Alle drie endpoints zijn expliciete POST-verzoeken onder `http://127.0.0.1:5188/controllers/wing/`, met bestaande Host-/Origin-controle. JSON heeft versie 1, verplichte velden en geen onbekende of dubbele sleutels. Verzoeklimiet 256 KiB, body-inleestijd 5 seconden; één operatie tegelijk, maximaal 90 seconden totaal en 2 seconden per OSC-query. Er is geen generieke OSC-proxy.

| Endpoint | Verzoek naast `version:1`                   | Resultaat                                                                  |
| -------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `probe`  | `address`                                   | Adres en apparaatnaam/model/firmware; geen serienummer                     |
| `plan`   | `address`, `profileId`, `banks`, `bindings` | `planId`, `expiresAt`, apparaat, `changes` en waarschuwingen               |
| `apply`  | `planId`, `confirm:true`                    | `state:applied\|partial`, `verifiedSlots`, `totalSlots`, `error`, `backup` |

Elke binding bevat uitsluitend `bank`, `kind:button|rotary`, `index`, `label`. Maximaal 16 unieke banken en 192 unieke toegewezen posities; geen pad, actiecode, doel-ID, rotarywaarde of show-inhoud. Een wijziging bevat die positie met `before` en `after` als veldwaarden. Foutcodes: 400 voor ongeldige invoer, 403 voor Host/Origin, 409 voor conflicten/model/firmware/verlopen plan, 413 voor te grote body, 503 voor netwerk/protocolproblemen en 504 voor timeout vóór schrijven. Na gestart schrijven wordt een gevangen netwerk-/timeoutfout als `partial` gerapporteerd; bij verlies van de HTTP-verbinding blijft het resultaat onzeker.

De runtime bewaart maximaal één plan en interne apparaatidentiteit in geheugen, vijf minuten geldig. Nieuwe planpoging, apply of runtime-afsluiting maakt het oude plan onbruikbaar; verlopen inhoud wordt bij de eerstvolgende opdracht opgeruimd. Apply verbruikt het plan ook bij preflightfouten. Alle te wijzigen posities én apparaatidentiteit worden opnieuw vergeleken vóór de eerste write. De voorconfiguratie wordt alleen op initiatief van de gebruiker gedownload; geen automatische herstelactie of opgeslagen consolehistoriek. Een waarschuwing voor onbevestigde verzending blijft binnen de browsertabsessie behouden bij navigeren/herladen.

## Protocol en grenzen

Bron: [WING Remote Protocols V3.1-03, Music Tribe](https://cdn-media.empowertribe.com/2106004e217b8eb2639d93672823eef5/WING_Remote-Protocols-3.1-03.pdf), met name gedrukte pagina's 19–23, 86–90 en 145–149.

Voor Full/Rack correspondeert een bank met `/$ctl/user/{bank}/{kolom}`. Bovenste knoppen gebruiken `bu`, onderste knoppen `bd`, draaiknoppen `enc`. Een nodequery levert de beschikbare velden; die veranderen bij een andere controlmodus. Writes krijgen geen bevestiging, dus afzonderlijk teruglezen is noodzakelijk. Dit is een reeks UDP-wijzigingen, geen atomaire consoletransactie. Labels zijn beperkt tot 16 tekens.

Er wordt geen OSC-eventsubscription geopend: de WING ondersteunt één dergelijke subscriber en een nieuwe subscription kan een andere bedieningsapp verdringen. Configuratiequeries vereisen geen subscription. MIDI-routing of netwerkmonitoring van fysieke events mag later alleen met afzonderlijke, zichtbare inschakeling worden toegevoegd.

## Verificatie

Op 15 september 2026 is alleen-lezen geverifieerd dat de tafel op `10.0.0.10` antwoordt als WING Full Size, firmware 3.1. De OSC-identiteitsquery `/?` antwoordde op adres `/*`. De eerste bank bevatte onder andere een DCA-rotary en mutegroepknoppen; de globale MIDI-uitgang stond op USB. Er zijn tijdens deze controle geen console-instellingen gewijzigd en geen subscriptions geopend.

- 740 Vitest-tests plus 10 launcher/distributietests geslaagd; volledige .NET-harness geslaagd inclusief nieuwe OSC-, bankmapping-, drift-, expiry-, single-use-, no-op- en gedeeltelijke-writechecks met testtransport.
- Webapp/worker- en runtimebuild geslaagd. Bestaande waarschuwing voor grote frontendbundel blijft bestaan.
- Echte lokale API op geïsoleerde testpoort herkende de tafel en las een voorstel met bestaande DCA/mutegroepwaarden uit. Onbekende aanvraagvelden/publiek IP geweigerd met 400; vreemde Origin met 403.
- Chromium: echte read-only probe/plan, instelbaar profiel/IP, back-updownload, bevestigingsblokkering en desktop/390px-layout gecontroleerd. Gedeeltelijke apply is uitsluitend met een onderschept testantwoord gesimuleerd; de waarschuwing bleef na navigatie zichtbaar. Alle fysieke apply-verzoeken waren in deze browser geblokkeerd/gesimuleerd.
- Eindcontrole las dezelfde DCA/mutegroepconfiguratie terug. Geen hardwarewrites, MIDI-events of OSC-subscriptions uitgevoerd. De tijdelijke browser en testruntime zijn daarna gesloten.

Een fysieke schrijfproef vereist een bewust gekozen testbank en expliciete bevestiging; alleen-lezen bereikbaarheid en testtransport bewijzen die schrijfproef niet. Hardwaregedrag van MIDI-knoppen/rotaries en MIDI-ontvangst in Lightlab zijn nog niet afgedekt.

## Correctie: overdracht stopt bij de eerste knop

Een latere alleen-lezen vergelijking met de export `nieuwe-lichtshow.lightflow.json` (32 Looks, toewijzingen in banken 12–16) bevestigde dat alleen bank 12, knop 1 gedeeltelijk was ingesteld: `MIDINP`, label `Openingsvuur`, kanaal 12, noot 0 en waarde 0. De overige posities in bank 12 en banken 13–14 stonden uit. Banken 15–16 bevatten nog bestaande monitor- en paginabedieningen. Dit vergelijkt de export, niet noodzakelijk de momenteel geopende editorsessie.

De oorzaak was een indexverschil in de kanaalterugmelding: `/$ctl/user/12/1/bu/ch` antwoordde met OSC `,sfi` en waarden `["12", 0.73333335, 11]`. Kanaal 12 wordt ééngebaseerd ingesteld en weergegeven, maar de integer in het antwoord is nulgebaseerd. Lightlab vergeleek daardoor 11 met 12 en stopte vóór het instellen van de waarde 127 en vóór de volgende knop. De correctie normaliseert alleen `ch` in de ondersteunde modi `MIDINP` en `MIDICC`; noot, CC en waarde blijven 0–127. Niet-MIDI-modussen behouden hun bestaande uitleesgedrag. Een fout noemt nu de bank, positie en het betreffende veld.

De regressietest faalde vóór de correctie met `partial, verified 0/36` en slaagt erna voor 36 posities in banken 12, 1 en 16, inclusief grenskanalen, no-op-hercontrole en het afwijzen van een werkelijk verkeerd kanaal. Tijdens diagnose zijn uitsluitend queries uitgevoerd: geen consolewrites, subscriptions, DMX-activering of runtimeherstart. Een fysieke heroverdracht met de correctie is nog niet getest. Herstart de lokale runtime op een veilig moment vóór een nieuw voorstel; een lopende show of fysieke uitvoer mag daarvoor niet ongevraagd worden onderbroken.
