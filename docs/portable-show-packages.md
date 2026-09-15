# Draagbare showpakketten

Exporteer een show via het Showmenu om op een andere computer verder te werken. Het JSON-bestand bevat de actieve show, maximaal 100 historische versies, podium- en bandposities, Looks, kleuren, animaties, patch en bedieningsinstellingen. Er zijn geen externe podiumafbeeldingen of downloads nodig voor deze ingebouwde scèneobjecten.

Nieuwe exports bevatten ook `fixtureCatalog`: versie 1, een deterministische fingerprint en een snapshot van de ingebouwde fixtureprofielen waarnaar de show **of een historische versie** verwijst. Deze catalogus omvat onder meer modi, kanaalaantallen, mogelijkheden en de vaste warmwitte Varytec-kleur. Zij is geen DMX-encoder en maakt een fysiek ongeverifieerd profiel niet geverifieerd.

Bij import vergelijkt Lightlab de volledige definities met zijn geïnstalleerde catalogus. Een afwijkende of onbekende definitie wordt expliciet geweigerd in plaats van stil anders weergegeven. Gebruik bij zo'n fout de oorspronkelijke compatibele Lightlab-versie. Er wordt geen code uitgevoerd, plug-in geïnstalleerd of nieuw fixturetype toegevoegd vanuit een showbestand. De fingerprint is een wijzigingskenmerk, geen digitale handtekening; ook de volledige inhoud wordt vergeleken.

Oude `lightflow-show`-bestanden met pakketversie 1 en zonder fixturecatalogus blijven geldig. Hun fixture-ID's worden zoals voorheen tegen de ingebouwde catalogus gevalideerd; zonder historische catalogus kan Lightlab niet bewijzen dat een oudere installatie exact dezelfde definities gebruikte. Bij opnieuw exporteren worden de huidige bekende definities toegevoegd. Catalogi zijn begrensd tot 64 profielen en 128 KiB tekst, binnen de totale pakketlimiet van 20 miljoen tekens.

De actieve editor schrijft show en geschiedenis samen naar één `localStorage`-sleutel. Een mislukte quota-write vervangt geen helft van een pakket. Dit beschermt tegen onderbroken updates, maar browseropslag blijft apparaat- en browsergebonden en is geen externe back-up. Bewaar exports buiten de browser, zeker vóór updates, downgrades of het wissen van browsergegevens.
