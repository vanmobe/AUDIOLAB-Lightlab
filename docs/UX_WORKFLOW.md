# Lightlab: werkvolgorde

De interface heeft vier hoofdonderdelen:

- **Overzicht:** show, inventaris, aandachtspunten en volgende stap.
- **Setup:** Podium, Patch & netwerk, Bedieningspaneel en Audio. Audio bevat de gedeelde WAV-speler, detectie en lichtreacties. Native audio/Dante/MIDI-ingangen zijn nog niet beschikbaar; de voorbereidende instellingen vermelden dit expliciet.
- **Ontwerpen:** Looks, Animaties, Kleuren en Maak met AI. AI doorloopt Aanvraag, Idee en Voorstel; wisselen tussen stappen behoudt de invoer. Modelinstellingen en diagnostiek zijn secundair. Genereren of accepteren blijft een expliciete actie. Showinstellingen openen rechts.
- **Live:** kies bewust Simulatie of Livesessie. De vaste balk bevat de afspeelmodus en Blackout; Looks en WING-banken zijn alternatieve bedieningsvlakken. De gekozen bank blijft behouden bij wisselen. Groepsbediening en beeldinstellingen zijn uitklapbaar. De compacte WAV-speler gebruikt dezelfde opname als Setup → Audio.

## Hulpmiddelen zonder verschuivend podium

In Live opent **Naar DMX-bediening** de runtimebediening. De vaste balk bevat **DMX-uitvoer**, met bestemmingen, bevestiging, verzendstatus en uitschakelen in een rechterpaneel. Dit blijft gescheiden van de optionele WAV-koppeling. Navigeren of sluiten schakelt geen uitvoer in of uit.

Na een show openen toont Live vóór het starten de naam en aantallen fixtures, Looks, animaties en kleuren uit de editor. De show is dan aanwezig, maar nog niet als livesessie gestart. **Start huidige show in runtime** laadt die inhoud; bij een bestaande sessie kies je bewust verbinden. Een export bevat showinhoud, geen actieve runtimeverbinding of toestemming om DMX uit te sturen.

**Verbindingen** bovenaan toont de lokale runtimestatus en opent rechts de bediening, recente meldingen en links naar de relevante Setup-pagina. Starten schakelt geen fysieke uitvoer in. De WING-acties voor automatisch vullen en synchroniseren openen eveneens rechts; matrix en ingevulde keuzes blijven behouden. Sluiten is geblokkeerd tijdens een kritieke synchronisatieactie.

## Wat wordt bewaard?

- Podium, patch, Looks, groepsmasters in de browserbron en showinstellingen horen bij de opgeslagen show.
- Camera, rook en beeldhelderheid zijn alleen weergavevoorkeuren, geen fysieke lichtoutput.
- Runtimegroepsbediening verandert uitsluitend de geladen livesessie, niet de editorshow.
- Een WAV blijft beschikbaar tijdens navigeren, niet na pagina verversen. Buiten Audio en Live pauzeert de speler.
- Het verlaten van de runtimebediening vraagt bevestiging: een zelfstandige sessie kan blijven uitzenden; een gekoppelde WAV wordt ontkoppeld en de bijbehorende uitvoer uitgeschakeld. Een terugkeerwaarschuwing voorkomt dat simulatie-Blackout wordt verward met runtime-Blackout. Gebruik Stop in de livesessie om die sessie te beëindigen.

Op smallere schermen stapelen de werkvlakken. Op brede schermen combineert de Lookstudio selectie, preview en editor naast elkaar. Sluiten van een zijpaneel wist geen concepten; Escape gebruikt dezelfde sluitbeveiliging als de knop.
# Runtime als eigen werkruimte

Technische proefpanelen zijn niet meer in de applicatie gemonteerd: DMX-inspectie en de autonome runtimeproef blijven interne ontwikkel-/testhulpmiddelen. Gewone bediening gebruikt de livesessie. Runtime toont één ingeklapte sectie **Probleem oplossen** voor lifecyclelogging en versie-informatie. Handmatige statuscontroles verschijnen alleen als **Opnieuw proberen** bij fouten; de bestaande polling blijft automatisch. Live toont geen ruwe beat-/frametellers. Patch, DMX-bestemmingen, starten/stoppen, WING en foutmeldingen blijven toegankelijk; de AI-aanvraag/antwoordinspectie blijft afzonderlijk behouden.

De hoofdnavigatie bevat **Runtime**, naast Live. Hier staan Start runtime / Stop runtime, de geladen livesessie, DMX-uitvoer, WING-synchronisatie en audio-instellingen. Versie-informatie en de maximaal200 recente lifecycleberichten zijn inklapbaar. De status wordt automatisch opgehaald; openen van de pagina start of verstuurt niets.

Runtime starten is niet hetzelfde als een show starten. Een show stoppen laat de runtime beschikbaar voor AI en WING. Stop runtime beëindigt het eigen runtimeproces inclusief eventuele show; extern gestarte runtimes worden niet gestopt. De starttijd en bouwinformatie verduidelijken waarom alleen de browser verversen geen nieuwe runtimecode laadt.

Live ↔ Runtime behoudt dezelfde controller, WAV-koppeling en sessie. De DMX-keuze blijft in de runtime bewaard gedurende die sessie. Eén expliciete klik schakelt DMX aan/uit; er is geen extra aanvinkbevestiging. Ongeldige patchgegevens en onbekende status worden automatisch afgehandeld. Bestemmingen en transportdetails blijven onder Geavanceerd. Verzendt bevestigt UDP-uitvoer, geen ontvangst door lampen.
