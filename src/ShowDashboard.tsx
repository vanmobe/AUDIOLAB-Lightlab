import type { ShowDocument } from './domain'
import { fixtureProfiles } from './fixtures'

export function ShowDashboard({
  show,
  versionCount,
  onSetup,
  onDesign,
  onLive,
  onImport,
  onExport,
}: {
  show: ShowDocument
  versionCount: number
  onSetup: () => void
  onDesign: () => void
  onLive: () => void
  onImport: () => void
  onExport: () => void
}) {
  const inventory = fixtureProfiles
    .map((profile) => ({ profile, count: show.fixtures.filter((fixture) => fixture.profileId === profile.id).length }))
    .filter((item) => item.count)
  return (
    <section className="show-dashboard" aria-label="Showoverzicht">
      <header className="dashboard-heading">
        <div>
          <p className="section-label">JOUW WERKRUIMTE</p>
          <h2>Een podium. Jouw signatuur.</h2>
          <p>Werk verder aan je show, van opstelling tot livebediening.</p>
        </div>
        <button className="lab-primary" onClick={onDesign}>
          Verder ontwerpen <span aria-hidden="true">→</span>
        </button>
      </header>
      <dl className="dashboard-stats">
        {[
          [show.fixtures.length, 'Fixtures'],
          [show.groups.length, 'Groepen'],
          [show.looks.length, 'Looks'],
          [show.colorProfiles.length, 'Kleurprofielen'],
          [show.programs.length, 'Patronen'],
        ].map(([count, label]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
      <div className="dashboard-paths">
        <button onClick={onSetup}>
          <span className="path-number">01</span>
          <strong>Richt je podium in</strong>
          <span>Lampen, bandleden, patch en je bedieningspaneel.</span>
          <small>
            Open Setup <span aria-hidden="true">↗</span>
          </small>
        </button>
        <button onClick={onDesign}>
          <span className="path-number">02</span>
          <strong>Maak het jouw show</strong>
          <span>Ontwerp Looks en patronen. Zie direct wat je wijzigt.</span>
          <small>
            Open ontwerpstudio <span aria-hidden="true">↗</span>
          </small>
        </button>
        <button onClick={onLive}>
          <span className="path-number">03</span>
          <strong>Speel met licht</strong>
          <span>Bedien je Looks, groepen en WING-banken in de simulatie.</span>
          <small>
            Open Live <span aria-hidden="true">↗</span>
          </small>
        </button>
      </div>
      <div className="dashboard-details">
        <section>
          <h3>Op je podium</h3>
          <ul className="dashboard-inventory">
            {inventory.map(({ profile, count }) => (
              <li key={profile.id}>
                <span>
                  {profile.manufacturer} {profile.model}
                </span>
                <strong>× {count}</strong>
              </li>
            ))}
          </ul>
          {!show.fixtures.length && <p>Je podium is nog leeg. Open een showpakket met fixtures om verder te werken.</p>}
          <p className="muted">
            {show.bandMembers?.length ?? 0} bandleden · {show.routes.length} netwerkroutes geconfigureerd. Controleer
            fysieke uitvoer afzonderlijk in de lokale runtime.
          </p>
        </section>
        <section>
          <h3>Je show bij de hand</h3>
          <p>
            Wijzigingen worden lokaal in deze browser bewaard. Exporteer een showpakket als back-up of om op een andere
            computer verder te werken.
          </p>
          <div className="dashboard-file-actions">
            <button onClick={onImport}>Show openen…</button>
            <button onClick={onExport}>Show exporteren</button>
          </div>
          <p className="muted">
            {versionCount} bewaarde versies worden meegenomen bij export. Via het menu ‘Show’ bovenaan bewaar je een
            nieuwe momentopname.
          </p>
        </section>
      </div>
    </section>
  )
}
