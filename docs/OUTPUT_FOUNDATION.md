# Uitvoerfundament — DMX-proef

## Doel en grens

Eerste bouwstap voor G1/G4 uit de productreview: een gekozen Look op een gekozen beat via de bestaande show-evaluator vertalen naar door de runtime gevalideerde DMX-kanaalwaarden. De operator kan zien welke kanalen een fixture krijgt, inclusief fouten in modus, patch en routes. Dit is een **momentopname zonder netwerkuitvoer**, geen verbindingstest of hardwareacceptatie.

De volledige scope blijft gelden. Daarna volgen de autonome runtimeklok, gevalideerde uitvoersessie, multi-universe verzending en hardwareacceptatie; vervolgens audio/Dante en WING/MIDI. De proef wordt niet als sluiproute gebruikt om browsertiming tot live timingautoriteit te maken.

## Bouwplan en reviewtracks

1. Controleer kanaaltabellen met primaire handleidingen. Behoud onderscheid tussen gedocumenteerde kanaalmap en fysiek geverifieerde fixture.
2. Bouw een pure compiler in de runtime: begrensde snapshot, trusted catalogus, volledige patch/framevalidatie, verse universebuffers. Geen sender, DNS, poorten of gedeelde uitvoerstatus.
3. Voeg een compacte proef toe aan Patch & netwerk: Look, beat, modus, expliciete berekening, gegroepeerde kanaalwaarden en bruikbare foutmeldingen. Ongeldige/verouderde resultaten worden niet getoond als actuele meting.
4. Test exacte bytes, meerdere universes, foutpaden, blackout en browserflow. Review implementatie onafhankelijk en documenteer beperkingen.

| Track                                     | Gewicht en aanpak                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementatie                             | Vereist: runtimecompiler, trusted mappings, expliciete inspectie-API en browserclient.                                                                                                 |
| Architectuur, onderhoud, codekwaliteit    | Vereist: pure compiler los van transport; geen tweede creatieve engine of ongebruikte sessielaag. Onafhankelijke review.                                                               |
| Security, API, compatibiliteit            | Vereist: loopback Origin/Host, body-/arraygrenzen, strikt contract, geen door client opgegeven kanaalmappen. Geen automatische wijziging van bestaande patches.                        |
| UX, gebruikersperspectief, visueel        | Vereist: dezelfde compacte disclosures/stijlen; duidelijke momentopname/geen output, dirty draft/stale/timeout/herstel. Desktop en mobiel controleren.                                 |
| Validatie, risico, testen                 | Vereist: golden channel vectors, grensadressen/overlap, tegengestelde blackout-input, complete fixturedekking, responsevalidatie, echte browser en HTTP zonder outputsends.            |
| Performance, observability, datalifecycle | Vereist: begrensde verwerking/resultaten, authored diagnostics, geen opslag/logging van snapshot/hosts, geen onbeperkte historie. Browserresultaat vervalt bij inputwijziging/unmount. |
| Documentatie                              | Vereist: kanaalbronnen, API, bedieningspad, projectcontext en acceptatiebewijs.                                                                                                        |
| Delivery/Git/release                      | Licht: bestaande workspace behouden; geen commits/branches/publicatie gevraagd. Webapp en runtime samen testen; oude runtime toont herstelbare fout.                                   |
| Dependencies/database/compliance          | N.v.t. voor nieuwe wijzigingen: geen nieuwe packages, database of gereguleerde gegevensstroom. Bestaande afhankelijkheden en lokale gegevensminimalisatie blijven gelden.              |

Parallel: kanaalbronnenonderzoek, runtimeimplementatie/API-review en frontendimplementatie. Hoofdagent integreert, bewaakt compatibiliteit, reviewt en test end-to-end. Fysieke uitvoer blijft uit tijdens deze ontwikkeling.

## Gebruiken

1. Open **Setup → Patch & netwerk → DMX-proef zonder lampen**. De proef staat ingeklapt vóór de fixturelijst.
2. Kies een opgeslagen Look, showstand en moment tussen 0 en 64 beats. Klik **Bereken DMX-proef**. Er wordt niets automatisch op de achtergrond verzonden naar fixtures.
3. Open een universe en fixture voor kanaaladressen, kanaalfuncties en berekende bytes. De proef gebruikt de opgeslagen groepsmasters; presentatiehelderheid en tijdelijk verborgen simulatiegroepen veranderen de bytes niet.
4. Los gemelde modus-/patchfouten op en bereken opnieuw. Niet-opgeslagen patchdrafts blokkeren de proef. Een wijziging aan show, Look, modus of beat maakt het vorige resultaat ongeldig. Annuleren en een timeout van tien seconden laten opnieuw proberen toe.

**Bestaande Hz-200-shows:** de oude `1ch`-modus blijft leesbaar met zijn oude footprint, maar wordt niet gecodeerd. Selecteer de hazer, kies **2 kanaal haze + ventilator**, controleer het extra adres en sla de patch expliciet op. Overlap blokkeert opslaan. Alleen nieuwe startshows gebruiken direct de gecorrigeerde modus; geen automatische migratie of verschoven adressen.

## API — `POST /output/inspect`

Loopback: `http://127.0.0.1:5188`. Bestaande Host/Origin-beveiliging blijft gelden. Uitsluitend `application/json` of een JSON-contenttype. Maximaal 1 MiB body, óók bij chunked verzending, vóór parsing. Geen DNS, transport, arm/disarm of mutatie van de bestaande uitvoersessie.

Request (alle getoonde velden verplicht; alleen `segments` is optioneel):

```json
{
  "version": 1,
  "requestId": "example",
  "patch": {
    "fixtures": [
      {
        "id": "front",
        "profileId": "varytec-theater-spot-100",
        "modeId": "2ch",
        "patch": { "universe": 1, "address": 1 }
      }
    ],
    "routes": []
  },
  "frame": {
    "atBeats": 0,
    "mode": "automation",
    "fixtures": [{ "fixtureId": "front", "intensity": 0.5, "color": "#fff1d6", "haze": 0 }]
  }
}
```

Dit voorbeeld geeft kanaal1=128, kanaal2=0 en alle overige universekanalen0. Er verschijnen waarschuwingen voor ontbrekende route en niet-fysiek geverifieerde modus. De kleur is voor deze vaste witte spot geen DMX-kleursturing.

Responsevelden:

- `version:1`, dezelfde `requestId`, `catalogVersion`, `dryRun:true`, `outputSent:false`.
- `issues`: maximaal256 `{severity:"error"|"warning",code,message,fixtureId:string|null}`; `issuesTruncated` signaleert afkapping. Fouten krijgen voorrang boven waarschuwingen.
- `universes`: maximaal256 `{universe,protocol:"artnet"|"sacn"|null,routeEnabled,channels,fixtures}`. `channels` bevat exact512 gehele bytes. Iedere fixturerij bevat `{fixtureId,address,channels,channelLabels}` met uitsluitend zijn kanaalbereik.
- Routegegevens zijn configuratie, geen gemeten bereikbaarheid. Een enkele uitgeschakelde route behoudt zijn protocol; zonder eenduidige route is dit null.

Grenzen en foutgedrag:

- Maximaal1024 deployments en framefixtures,256 routes; IDs maximaal1024 tekens, requestId120, host253. Exact één framefixture per deployment, geen dubbele/verweesde IDs. Patch is expliciet een adresobject of null.
- Tijdstip eindig0..1e9, modus automation/static/safety/blackout, intensiteit/haze eindig0..1, kleuren `#RRGGBB`. Adres1..512 inclusief footprint; universes1..63999 en protocolgrenzen voor routes. Kanaalmappen komen alleen uit de runtimecatalogus; extra clientvelden worden geweigerd.
- Ongeldige JSON, onbekende/ontbrekende velden, null waar niet toegestaan, duplicate properties en getallen als strings:400. Te grote body:413. Verkeerd contenttype:415. Vreemde Host/Origin:403.
- Semantische configuratie-/framefouten:200 met error-issues en **geen enkele universebuffer**, ook als andere fixtures wel geldig zijn. Geen gedeeltelijke compilatie bij fouten.
- Ongepatchte fixtures worden expliciet gemeld en overgeslagen. Ontbrekende/uitgeschakelde routes blokkeren inspectie niet. Een lege host is alleen toegestaan voor uitgeschakelde routes.
- Nieuwe nulgevulde buffers per aanvraag; onbezette adressen blijven0. Blackout zet iedere byte op0, zelfs als het aangeleverde frame niet-nulwaarden bevat.

Kanaalmappen en neutralewaarden staan in [de bronverantwoording](FIXTURE_CHANNEL_SOURCES.md). Aangeleverde segments zijn leidend: één segment bij een losse/gedeeld gestuurde RGB/witte personality, vier bij TRI14ch, geen bij haze. Zonder segments wordt de aggregate kleur/intensiteit gebruikt. De TRI14ch-master wordt niet nog eens met de gemiddelde headintensiteit vermenigvuldigd. UV blijft0; ADJ6ch gebruikt shutter32 voor continu licht. Hazerhoeveelheid wordt gecodeerd, maar ventilator blijft0 met waarschuwing: dit is nog geen bruikbare operationele fanregeling.

## Eigenaarschap en lifecycle

`src/domain.ts` evalueert de creatieve momentopname. `src/dmx-inspection.ts` maakt een minimale patch/frame-request en valideert de begrensd gelezen response (maximaal3 MiB), inclusief overeenkomst tussen fixturebytes en universebuffer. `DmxInspector` bewaart alleen het huidige tijdelijke resultaat; invoerwijziging/unmount wist het. Kanaaltabellen worden pas opgebouwd bij het openklappen van de fixture, niet voor alle lampen tegelijk. Geen nieuwe localStorage-resultaten, logs met bodies/hosts, database of historie.

`runtime/DmxInspection.cs` valideert en compileert stateless; `RuntimeDmxCatalog.cs` bezit gedocumenteerde layouts/afronding. Geen `OutputSession`- of senderafhankelijkheid. Deze inspectie blijft apart van toekomstige autonome timing en fysieke verzending. Webapp en runtime moeten beide bijgewerkt zijn; een oude runtime geeft een herstelbare melding in de inspector.

## Review en acceptatie

Geaccepteerde reviewcorrecties: uitgezette lege routes mogen inspectie niet blokkeren; late fouten mogen niet verdrinken in verificatiewaarschuwingen; echte patroonrecepten leveren ook voor losse lampen één segment, dat correct gecodeerd moet worden. Schema-compatibele oude hazerpatches blijven behouden, maar krijgen nu ook in het algemene validatieoverzicht een gerichte fout.

Afgewezen: kanaalmappen raden op basis van capabilities, automatische uitbreiding van oude hazeradressen, een aparte persistente patchesessie voor een momentopname, of de inspectie koppelen aan een arm/send-interface. Uitgesteld: autonome creatieve runtimeklok, fysieke fixtureverificatie, operational fanregeling, live sessies/meer-universeverzending en overige G1–G8-doelen. Geen onopgelost reviewerconflict.

Bewijs op14 september2026:

- 527 webtests/45 bestanden en productiebuild geslaagd; bestaande bundlewaarschuwing (~903KB JS) blijft zichtbaar.
- Runtimebuild zonder warnings/errors; volledig runtimecontractharnas inclusief alle kanaalvectoren geslaagd.
- `node scripts/check-dmx-inspection.mjs`: onafhankelijke echte HTTP-tests voor alle zes modi, meerdere universes, zero-fill, blackout, complete foutafwijzing, legacy1ch, strikte JSON en413/415 inclusief oversized chunked body.
- `scripts/check-dmx-recipe-contract.js`: echte browser-show-evaluator/patroonrequest/client/runtime met16 losse lampen en twee vier-headbars, zonder gebruikersopslag te wijzigen.
- `scripts/check-dmx-inspector-ui.js`: echte browserinterface/runtime,19 fixtures, blackout, stale resultaten, dirty draft, expliciete hazercorrectie met overlapbescherming, persistentie en1440/390px zonder overflow. Geen `/output/arm` of `/output/frame`-aanroep.
- Alle netwerkcontroles uitsluitend loopback; runtime voor/na ongewapend. Geen lampen, WING, Botex, Dante, modelgeneratie of betaalde provider getest/geactiveerd. Windows/Linux-build en fysieke manual/device-equivalentie nog niet bewezen.

Broncode op bestaande `main` in ongetrackte projectdirectory behouden. Geen commits, branches, PRs, publicatie of cleanup uitgevoerd.
