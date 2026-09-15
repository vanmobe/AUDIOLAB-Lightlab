import { createShowPackage, parseShowPackage, type ShowPackage } from './show-package'
import type { ShowDocument } from './domain'

export const activePackageKey = 'lightlab-active-package-v1'
type PackageStorage = Pick<Storage, 'getItem' | 'setItem'>
export interface ActivePackageLoad { bundle: ShowPackage; blocked: boolean; message: string; source: 'canonical' | 'legacy' | 'empty' }

/** One setItem is the commit boundary; legacy keys remain untouched recovery material. */
export function persistActivePackage(storage: PackageStorage, bundle: ShowPackage) {
  // Validate an incoming catalog before refreshing it from the installed definitions.
  parseShowPackage(JSON.stringify(bundle))
  const raw = JSON.stringify(createShowPackage(bundle.show, bundle.versions))
  parseShowPackage(raw)
  try { storage.setItem(activePackageKey, raw) }
  catch { throw new Error('Actieve show kon niet worden opgeslagen. Je huidige show blijft intact; exporteer je werk als back-up.') }
}

export function loadActivePackage(storage: PackageStorage, fallbackShow: ShowDocument): ActivePackageLoad {
  const fallback = createShowPackage(fallbackShow, [])
  let source: ActivePackageLoad['source'] = 'canonical'
  try {
    const canonical = storage.getItem(activePackageKey)
    if (canonical !== null) return { bundle: parseShowPackage(canonical), blocked: false, message: '', source }
    source = 'legacy'
    const show = storage.getItem('lightflow-show-v1'), versions = storage.getItem('lightflow-versions-v1')
    if (show === null && versions === null) return { bundle: fallback, blocked: false, message: '', source: 'empty' }
    if ((show?.length ?? 0) + (versions?.length ?? 0) > 20_000_000) throw new Error('Legacy package too large')
    const bundle = parseShowPackage(JSON.stringify({ format: 'lightflow-show', version: 1, show: show === null ? fallbackShow : JSON.parse(show), versions: versions === null ? [] : JSON.parse(versions) }))
    try { persistActivePackage(storage, bundle) }
    catch { return { bundle, blocked: true, source, message: 'Migratie naar atomaire showopslag is mislukt. Oude gegevens zijn behouden; exporteer je werk. Automatisch bewaren is geblokkeerd.' } }
    return { bundle: createShowPackage(bundle.show, bundle.versions), blocked: false, source, message: '' }
  } catch {
    return { bundle: fallback, blocked: true, source, message: 'Lokale showopslag is ongeldig of ontoegankelijk. Oorspronkelijke gegevens blijven onaangeroerd; automatisch bewaren is geblokkeerd. Exporteer tijdelijk werk en herstel de opgeslagen gegevens voordat je verder bewaart.' }
  }
}
