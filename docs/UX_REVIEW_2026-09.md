# Lightlab — review en verfijning van de werkomgeving

14 september 2026. Scope: Start, podium, patch/netwerk, WING-setup, ontwerp/repetitie, AI-studio en Live. Review op basis van broncode en gerenderde schermen, met een onafhankelijke UX-review en parallelle formulierverfijning.

## Belangrijkste bevindingen en wijzigingen

| Bevinding                                                                   | Uitgewerkt                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start was een welkomstpagina, geen praktisch showoverzicht                  | Dashboard met actuele aantallen, inventaris, drie werkroutes en openen/exporteren. Geen hardcoded inventarisgegevens.                                                                      |
| Formulieren en knoppen gebruikten verschillende kleuren, gewichten en maten | Gedeelde charcoal/blauwe basistokens, lokale systeemtypografie, rustige hiërarchie, consistente velden, focusstaten en sliders. Podiumhandles behouden hun eigen geometrie en typekleuren. |
| Navigatie en grote koppen versprongen tussen ontwerptabs                    | Compactere applicatiekop en stabiele bibliotheeknavigatie; overbodige tussenkop verwijderd.                                                                                                |
| Showbeheer was alleen op bepaalde schermen bereikbaar                       | Menu Show op alle werkruimtes, met openen, exporteren, versie bewaren en expliciet startshow herstellen. Escape sluit het menu en herstelt focus.                                          |
| Startshow herstellen verving werk onmiddellijk                              | Bevestiging plus herstelversie vóór mutatie. Opslagfout of volle versiecollectie blokkeert herstel. Import vraagt expliciete bevestiging en adviseert eerst exporteren.                    |
| Patchconcepten verdwenen bij vertrek naar een andere werkruimte             | Centrale navigatie vraagt toestemming bij niet-opgeslagen patchvelden; annuleren bewaart het formulier.                                                                                    |
| Live Looks bevatten lange omschrijvingen per knop                           | Compacte knoppen met twee kleurstalen; zoeken bij grotere bibliotheken; volledige opbouw van actieve Look achter uitklapper.                                                               |
| Dubbele masters en uitgebreide uitleg drukten de livebediening weg          | Masters en groepsdetails achter uitklappers; persistentie blijft expliciet zichtbaar. WING en gewone masters blijven dezelfde waarden bedienen.                                            |
| Blackout had geen zichtbare actieve toestand                                | Alle showmodi hebben `aria-pressed`, consistente Nederlandse labels en een duidelijke actieve blackout.                                                                                    |
| AI- en WING-formulieren oogden als losse toepassingen                       | Gelijke tokens, kleinere koppen, consistente inputhoogten, uitgelijnde hints, rustige consolevlakken en mobiele stapeling.                                                                 |

Het vectorbeeldmerk in de kop verwijst naar een waaier lichtstralen. Het is een klein, lokaal UI-element; het eerder gegenereerde rasterlogoconcept wordt niet als achtergrond of groot beeld gebruikt.

## Validatie

- 473 tests / 34 testbestanden geslaagd; productiebuild geslaagd.
- Vijf nieuwe tests beschermen herstel/annuleren/opslagfout, patchvertrek, dynamische dashboardgegevens en zoeken/selecteren in 32 Looks.
- `scripts/check-professional-ui.js`: zeven werkruimtes op 1440 en 390 pixels; geen horizontale pagina-overflow, lange show-/Looknamen, Show-menu en Escape, blackoutfeedback, patchconcept behouden/verwerpen en zoeken in 32 Looks. Geen browserruntimefouten.
- `scripts/check-live-wing.js` opnieuw geslaagd: knoppen, kleuren, blackoutbehoud, lege banken, groepslinks, masters, opslag en stabiele canvasmaat.
- Screenshots in `output/playwright/pro-*.png`; gerenderde Start-, Live-, ontwerp-, AI-, WING- en podiumschermen visueel beoordeeld.
- Bestaande waarschuwing over de grote JavaScriptbundel blijft. Geen nieuwe dependencies, externe lettertypen of netwerkoutput toegevoegd.

## Afbakening en resterend werk

De verbeteringen zijn geen volledige toegankelijkheidscertificering: browser-QA is Chromium op deze Mac, geen fysieke touchscreen-, screenreader-, Windows- of Firefox-test. De bestaande lichtengine, showschema's, patchadressen en hardwareadapters zijn niet herontworpen.

Een opgeslagen versie kan nog niet in een eigen herstelkiezer worden teruggezet. Versies zitten in het geëxporteerde showpakket; import vervangt de huidige versiecollectie na bevestiging. Een browserreload kan nog niet-opgeslagen patchconcepten verliezen; de nieuwe guard beschermt werkruimtewissels, niet alle browservertrekpaden.

## Engineeringbeslissingen

Implementatie, UX/visueel ontwerp, validatie en tests: vereist. Documentatie, codekwaliteit, architectuur, onderhoudbaarheid, risico en beveiliging: lichte controle op bestaande componentgrenzen en veilige lokale wijzigingen. Git/delivery: bestaande werkboom behouden, geen branch/commit/deploy. Datalevenscyclus: alleen bestaande begrensde versieopslag gebruikt; geen nieuwe logging, telemetrie of opslagformaat.

Reviewerbevindingen over compacte Live-selectie, resetbescherming, patchvertrek, statusfeedback en eerlijke labels zijn overgenomen. Een volledige versieherstelinterface, fysieke hardwarebediening en een algemene CSS-herbouw zijn niet aan deze verfijningsronde toegevoegd.
