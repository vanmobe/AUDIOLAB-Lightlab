# WAV & kicktest

Open **Ontwerp & repetitie → Audio & kicktest**, **Live → Browsersimulatie** of **Live → Lokale runtime**. Deze gebruiken één WAV-speler en analyse. Kies een WAV, wacht op de analyse en start de speler. Geluidsbestanden blijven in de browser. Na expliciet koppelen aan de runtime worden alleen kickanalyse, instellingen en afspeelpositie lokaal doorgestuurd. Wisselen naar een andere Live-bron behoudt de speler maar verbreekt een bestaande fysieke audiokoppeling; naar een andere sectie gaan pauzeert de audio zonder de opname te wissen. Terugkeren start niet automatisch. Vervangen van het bestand of sluiten/vernieuwen van de pagina ruimt de opname op; niets wordt op schijf opgeslagen.

## Live volgen

- **Live-simulatie volgt deze WAV** koppelt de gewone Live-weergave aan de mediaspeler. Zonder geladen analyse of met de koppeling uit gebruikt Live zijn vrije klok.
- **Stabiel tempo** laat de bestaande Lookpatronen lopen op de WAV-tijdlijn. Het geschatte kicktempo wordt aanvankelijk gebruikt als het betrouwbaar genoeg is; anders staat het handmatige tempo op 120 BPM. Het gebruikte tempo en de bron staan expliciet in het paneel. Look-overgangen blijven in deze modus werken.
- **Losse kicks** gebruikt de ingestelde reacties per groep: puls, een achtste patrooncyclus verder, vast licht of het bestaande patroon. Iedere gedetecteerde kick stuurt de puls/stap rechtstreeks, ook bij onregelmatige aanslagen. Kicks kiezen niet automatisch een andere Look. Veranderingen aan audioreacties volgen de gekoppelde Live-groepen.
- **Lookwissels** volgen in beide modi de opgeslagen Showregie → Overgang naar een andere Look. Bij losse kicks blijven beide Looks reageren tijdens de fade. De duur en eventuele startgrens volgen het ingestelde BPM-raster, niet een aantal echte kicks: 4 beats bij 120 BPM duurt 2 seconden. Een duur van nul beats betekent zonder fade wisselen op het gekozen startmoment. Na wijzigen van Showregie moet een reeds geladen runtimesnapshot opnieuw geladen worden.
- De gewone Live-Lookkeuze, WING-schermknoppen, kleurvergrendeling, groepsaanpassingen en masters blijven gelden. Blackout en veiligheidslicht gaan voor. Beeld vasthouden bevriest de mediafase en kickreactie (ook bij een BPM-wijziging), maar stopt het geluid niet. Pauzeren of zoeken doe je met de speler.
- Browserframes worden op de bestaande 20Hz-cadans bijgewerkt met de actuele mediapositie. Dit is een test/simulatiekoppeling, geen sample-nauwkeurige of latency-gekalibreerde live-audio-engine.

## Werkwijze

1. Exporteer bij voorkeur een geïsoleerd kickkanaal als gewone PCM-WAV (16/24/32-bit of float32). Maximaal 64 MiB, tien minuten, acht kanalen, 8–96 kHz; maximaal 32 miljoen gedecodeerde samples. RF64, compressed en WAVE_FORMAT_EXTENSIBLE worden expliciet afgewezen; converteer deze naar gewone PCM16 WAV. Bestandsnaam, laadstatus en fouten staan direct bij de bestandskeuze, ook wanneer een bestand wordt afgewezen.
2. Controleer golfvorm en groene kickmarkeringen. Bij meerkanaalsaudio kiest **Detectie afstellen** het te analyseren kanaal (standaard kanaal 1). De speler speelt wel het volledige bestand af, niet alleen dat kanaal.
3. Pas gevoeligheid en minimale afstand tussen triggers aan. **Analyseer opnieuw** pauzeert, behoudt de afspeelpositie en vervangt de detecties. Lagere minimumafstand laat snellere kicks toe, maar kan dubbeltriggering geven.
4. Kies een Look en per groep: bestaande Look op het ingestelde tempo, puls per kick, patroon ⅛ cyclus verder per kick, of vast licht. Off-lagen blijven uit; wit-only fixtures blijven wit. Groepsmasters en paletlimieten blijven geldig. Basislicht is een fractie van het bestaande niveau, niet een percentage ingeschakelde lampen. De bestaande podiumdekkingsregel blijft van toepassing binnen de aangepaste niveaulimieten.
5. Stel pulsuitloop en basislicht in. **Neem kicktempo over** kopieert de geschatte kickfrequentie naar het patroontempo (30–240 BPM); dit bewijst niet het muzikale tempo. Bij halve/dubbele kicks stel je zelf het tempo bij. Een statisch patroon blijft ook bij patroonstappen statisch.

De mediaklok bestuurt het previewbeeld: pauzeren bevriest patroonfase en fade; terugzoeken en herhalen wissen de lopende overgang en reconstrueren de kickpositie. In de losse-kickmodus beëindigt een BPM-wijziging of nieuwe analyse de overgang, omdat de audiobeat rechtstreeks uit positie × BPM wordt berekend. Een volgende Lookkeuze gebruikt het nieuwe tempo. Een nieuwe cue tijdens een fade start vanaf het actuele mengbeeld; dat onderbroken mengbeeld blijft als vaste bron bewaard. Beeld vasthouden bewaart ook het mengbeeld. Blackout, veiligheidslicht en groeps-/masterwijzigingen hebben onmiddellijke voorrang. Rookbeweging is een zelfstandig visueel effect.

## Grenzen en implementatie

WAV-gestuurde fysieke uitvoer werkt via **Live → Lokale runtime → Koppel WAV aan runtime**, gevolgd door expliciete sACN-/Art-Net-inschakeling. Zie [netwerkuitvoer en de audio-watchdog](NETWORK_OUTPUT.md). Dante/DVS, systeemloopback en microfoon/devicekeuze blijven vervolgwerk. Een WAV elders op de Mac afspelen wordt niet automatisch opgevangen. Gebruik hier het bestand rechtstreeks.

`kick-analysis.ts` bevat een platformonafhankelijke PCM-analyse: lagefrequentie-energie met adaptieve onsetdetectie, refractory interval en tempo/regelmaatdiagnose. Het is een heuristiek, geen getraind instrumentherkenningsmodel. Bastransiënten uit een volledige mix kunnen kicks lijken. Analyse loopt in `kick-analysis.worker.ts`, niet in de renderlus. De browser decodeert na strikte WAV-preflight; gelijktijdig laden is geblokkeerd. De worker stopt na de analyse. Decoded audio en object-URL blijven in de browsersessie tot vervangen of sluiten/vernieuwen van de pagina. Er worden geen opnamen of analyses opgeslagen.

`audio-reactivity.ts` maakt een afgeleide Look voor de gedeelde evaluator; de opgeslagen show blijft intact. `audio-live.ts` wordt zowel in de browsersimulatie als in de runtime-evaluator gebruikt, na toepassing van Live-groepsaanpassingen. De verborgen audiostudio heeft geen eigen 3D-renderlus; slechts één audiospeler blijft geladen. Geen nieuwe afhankelijkheden of showschemawijziging. Browserondersteuning vereist Web Audio-decodering en moduleworkers; de 3D-preview vereist WebGL.

## Validatie

- Unitchecks: WAV-grenzen/formats, silence/noise/bass, kicktrein, sensitiviteit, refractory, fase/seek, behoud off-groepen, kleur en show-immutabiliteit.
- Chromium: synthetische mono-PCM16-WAV van 6 seconden met 12 kicks op 120/min daadwerkelijk geladen, gedecodeerd, geanalyseerd en gedempt afgespeeld; zoeken naar 2,75s toont kick 6.
- Een echte mono PCM16/48kHz-kickopname van 378,655 seconden is geladen, geanalyseerd (766 detecties) en gedempt afgespeeld in Chromium. De detecties zijn nog niet tegen handmatig gelabelde kicks beoordeeld. Andere browsers/OS-audiodrivers blijven te testen. Er is geen fysieke uitgang ingeschakeld voor deze validatie.
