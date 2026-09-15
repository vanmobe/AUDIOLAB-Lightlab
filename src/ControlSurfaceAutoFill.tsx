import { useMemo, useState } from 'react'
import type { ControlSurfaceLayout, ShowDocument } from './domain'
import { bindingAtSlot, getControlSurfaceProfile } from './control-surface'
import { classifyLookCharacter, lookCharacterLabels, planControlSurfaceFill, type AutoFillOptions, type LookCharacter } from './control-surface-autofill'
import './ControlSurfaceAutoFill.css'

interface Props {
  show: ShowDocument
  initialBank: number
  onApply: (surface: ControlSurfaceLayout, firstBank: number) => boolean
  onClose: () => void
  hideCloseButton?: boolean
}

/** The proposal stays local until accepted; any intervening show edit invalidates it. */
export function ControlSurfaceAutoFill({ show, initialBank, onApply, onClose, hideCloseButton = false }: Props) {
  const profile = getControlSurfaceProfile(show.controlSurface.profileId)
  const [options, setOptions] = useState<AutoFillOptions>(() => ({
    banks: [initialBank], grouping: 'order', mode: 'empty',
    rotaryGroupIds: Array.from({ length: profile?.rotaries ?? 0 }, () => null),
  }))
  const [proposal, setProposal] = useState<{ base: ShowDocument; plan: ReturnType<typeof planControlSurfaceFill> } | null>(null)
  const [message, setMessage] = useState('')
  const automaticCharacters = useMemo(() => options.grouping === 'character'
    ? new Map(show.looks.map(look => [look.id, classifyLookCharacter(show, look)]))
    : new Map<string, LookCharacter>(), [show, options.grouping])
  if (!profile) return null
  const stale = proposal !== null && proposal.base !== show
  function change(update: Partial<AutoFillOptions>) {
    setOptions(current => ({ ...current, ...update }))
    setProposal(null); setMessage('')
  }
  function propose() {
    setMessage('')
    try { setProposal({ base: show, plan: planControlSurfaceFill(show, options) }) }
    catch { setMessage('De indeling kon niet worden gemaakt. Controleer de gekozen banken en groepen.') }
  }
  const plan = proposal?.plan
  return <section className="surface-autofill" aria-label="Banken automatisch vullen">
    <header><div><h3>Een plek voor elke Look</h3><p>Kies banken, verdeel je Looks en herhaal je favoriete groepsregelaars. Eerst bekijken, dan toepassen.</p></div>{!hideCloseButton && <button onClick={onClose}>Sluiten</button>}</header>
    <div className="autofill-settings">
      <fieldset><legend>1 · Welke banken?</legend>
        <div className="autofill-bank-actions"><button onClick={() => change({ banks: Array.from({ length: profile.banks }, (_, i) => i + 1) })}>Alle banken</button><button onClick={() => change({ banks: [] })}>Geen</button><button onClick={() => change({ banks: Array.from({ length: profile.banks }, (_, i) => i + 1).filter(bank => !show.controlSurface.bindings.some(binding => binding.slot?.bank === bank)) })}>Lege banken</button></div>
        <div className="autofill-banks">{Array.from({ length: profile.banks }, (_, i) => i + 1).map(bank => {
          const occupied = Array.from({ length: profile.buttons }, (_, i) => bindingAtSlot(show.controlSurface, { bank, kind: 'button', index: i + 1 })).filter(Boolean).length
          return <label key={bank} title={show.controlSurface.bankNames?.[bank]}><input type="checkbox" aria-label={`Vul bank ${bank}`} checked={options.banks.includes(bank)} onChange={event => change({ banks: event.target.checked ? [...options.banks, bank].sort((a, b) => a - b) : options.banks.filter(value => value !== bank) })} /><strong>{bank}</strong><small>{occupied}/{profile.buttons} bezet</small></label>
        })}</div>
        <small>{options.banks.length} {options.banks.length === 1 ? 'bank geselecteerd' : 'banken geselecteerd'} · maximaal {options.banks.length * profile.buttons} Look-knoppen. Niet-geselecteerde banken blijven intact.</small>
      </fieldset>
      <fieldset><legend>2 · Looks verdelen</legend>
        <label>Volgorde<select value={options.grouping} onChange={event => change({ grouping: event.target.value as AutoFillOptions['grouping'] })}><option value="order">Huidige Look-volgorde</option><option value="character">Per karakter: rustig → beweging → energiek</option></select></label>
        <label>Bestaande toewijzingen<select value={options.mode} onChange={event => change({ mode: event.target.value as AutoFillOptions['mode'] })}><option value="empty">Behouden · alleen vrije posities</option><option value="replace">Alle knoppen opnieuw indelen in gekozen banken</option></select></label>
        <small>{options.mode === 'empty' ? 'Bezet blijft bezet. Looks die al in de gekozen banken staan worden niet opnieuw toegevoegd.' : 'Alle knoppen in gekozen banken worden opnieuw ingedeeld en gebruikte banken krijgen een nieuwe naam. Verdrongen functies blijven bij Niet geplaatst. Rotaries veranderen alleen als je hieronder een groep kiest.'}</small>
        {options.grouping === 'character' && <details className="autofill-character"><summary>Karakterindeling nakijken · {show.looks.length} Looks</summary><p>Een inschatting uit patronen en groepssnelheden, niet uit de naam en niet door AI. Elke categorie begint op een nieuwe bank; er kan dus ruimte vrij blijven. Je kunt de inschatting hieronder aanpassen.</p>
          {show.looks.map(look => <label key={look.id}>{look.name}<select aria-label={`Karakter van ${look.name}`} value={options.characterOverrides?.[look.id] ?? ''} onChange={event => {
            const characterOverrides = { ...options.characterOverrides }
            if (event.target.value) characterOverrides[look.id] = event.target.value as LookCharacter
            else delete characterOverrides[look.id]
            change({ characterOverrides })
          }}><option value="">Automatisch · {lookCharacterLabels[automaticCharacters.get(look.id)!]}</option>{Object.entries(lookCharacterLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>)}
        </details>}
      </fieldset>
      <fieldset className="autofill-rotaries"><legend>3 · Dezelfde draaiknoppen op elke gekozen bank</legend>
        {profile.rotaries ? <><div>{Array.from({ length: profile.rotaries }, (_, i) => <label key={i}>R{i + 1} · Groepsintensiteit<select aria-label={`Vaste groep draaiknop ${i + 1}`} value={options.rotaryGroupIds[i] ?? ''} onChange={event => change({ rotaryGroupIds: options.rotaryGroupIds.map((group, index) => index === i ? event.target.value || null : group) })}><option value="">Niet wijzigen</option>{show.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>)}</div><small>Dezelfde positie regelt overal dezelfde groep, ook op geselecteerde banken zonder nieuwe Looks. ‘Niet wijzigen’ laat een bestaande toewijzing staan.</small></> : <p>Dit tafelprofiel heeft geen draaiknoppen. De Look-knoppen kunnen wel automatisch worden gevuld.</p>}
      </fieldset>
    </div>
    <div className="autofill-actions"><button className="primary" disabled={!options.banks.length || (!show.looks.length && !options.rotaryGroupIds.some(Boolean))} onClick={propose}>Bekijk bankindeling</button><span>{show.looks.length ? `Alle ${show.looks.length} Looks worden meegenomen.` : 'Nog geen Looks. Je kunt wel vaste groepsregelaars toewijzen.'}</span></div>
    {message && <p role="alert">{message}</p>}
    {proposal && <section className="autofill-proposal" aria-label="Voorgestelde bankindeling">
      <h4>Voorstel · nog niet toegepast</h4>
      {stale && <p role="alert">De show is intussen gewijzigd. Maak eerst een nieuw voorstel.</p>}
      {!!plan?.errors.length && <div role="alert"><strong>Deze indeling past nog niet.</strong><ul>{plan.errors.map((error, i) => <li key={i}>{error}</li>)}</ul><p>Er is niets aangepast. Kies meer banken of pas de indeling aan.</p></div>}
      {!!plan?.warnings.length && <ul className="autofill-notes">{plan.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
      {plan && !plan.errors.length && <>
        <p>{plan.placedLookCount} Looks in de gekozen banken · {plan.displacedCount} bestaande toewijzingen naar Niet geplaatst.</p>
        <div className="autofill-bank-preview">{plan.banks.map(bank => <article key={bank.bank}><h5>Bank {bank.bank}{bank.label && bank.label !== `Bank ${bank.bank}` && ` · ${bank.label}`}</h5>
          <ol>{Array.from({ length: profile.buttons }, (_, i) => {
            const binding = bindingAtSlot(plan.surface, { bank: bank.bank, kind: 'button', index: i + 1 })
            return <li key={i}><small>B{i + 1}</small><span>{binding?.label ?? 'Vrij'}</span></li>
          })}</ol>
          {!!profile.rotaries && <div className="autofill-rotary-preview">{Array.from({ length: profile.rotaries }, (_, i) => <span key={i}>R{i + 1} · {bindingAtSlot(plan.surface, { bank: bank.bank, kind: 'rotary', index: i + 1 })?.label ?? 'Vrij'}</span>)}</div>}
        </article>)}</div>
        <p className="muted">Dit wijzigt alleen de indeling in Lightlab. Er worden geen Looks gestart of instellingen naar de WING verstuurd. Ongedaan maken herstelt de volledige vorige indeling.</p>
        <button className="primary" disabled={stale} onClick={() => {
          if (proposal.base !== show) return
          if (onApply(plan.surface, options.banks[0])) onClose()
          else setMessage('De indeling kon niet worden toegepast. Controleer de melding bij het bedieningspaneel.')
        }}>Pas bankindeling toe</button>
      </>}
    </section>}
  </section>
}
