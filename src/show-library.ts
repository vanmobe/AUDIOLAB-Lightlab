import { createShowPackage, parseShowPackage, type ShowPackage } from './show-package'

export const libraryLimits = { shows: 32, bytesPerShow: 20_000_000 }
export interface LibraryEntry {
  id: string
  name: string
  updatedAt: string
  byteLength: number
  versionCount: number
}
export const recoveryEntryId = '__lightlab_recovery__'
export interface LibraryListing {
  entries: LibraryEntry[]
  damagedCount: number
  recovery?: LibraryEntry
  damagedIds?: string[]
}
export interface ShowLibraryStore {
  list(): Promise<LibraryListing>
  load(id: string): Promise<ShowPackage>
  save(name: string, bundle: ShowPackage, id?: string): Promise<LibraryEntry>
  rename(id: string, name: string): Promise<LibraryEntry>
  remove(id: string): Promise<void>
  saveRecovery(name: string, bundle: ShowPackage): Promise<LibraryEntry>
}
const databaseName = 'lightlab-show-library-v1'
const metadataStore = 'metadata',
  packageStore = 'packages'
export function libraryName(value: string): string {
  const name = value.trim()
  if (!name || name.length > 120) throw new Error('Kies een shownaam van 1 tot 120 tekens.')
  return name
}
function validId(id: string) {
  if (!id || id.length > 128) throw new Error('Ongeldige bibliotheekverwijzing.')
}
export function libraryPayload(name: string, bundle: ShowPackage) {
  const nextName = libraryName(name)
  let raw = JSON.stringify({ ...bundle, show: { ...bundle.show, name: nextName } })
  let byteLength = new TextEncoder().encode(raw).length
  if (byteLength > libraryLimits.bytesPerShow)
    throw new Error(
      'Deze show met versies is te groot voor de bibliotheek (maximaal 20 MB). Exporteer een back-up en verwijder eerst oude versies.',
    )
  const parsed = parseShowPackage(raw)
  raw = JSON.stringify(createShowPackage(parsed.show, parsed.versions))
  byteLength = new TextEncoder().encode(raw).length
  if (byteLength > libraryLimits.bytesPerShow)
    throw new Error('Dit pakket met fixturecatalogus is te groot voor de bibliotheek (maximaal 20 MB).')
  return { raw, byteLength, name: nextName, versionCount: parsed.versions.length }
}
export function libraryListing(values: unknown[]): LibraryListing {
  const entries: LibraryEntry[] = [],
    seen = new Set<string>(),
    damagedIds: string[] = []
  let recovery: LibraryEntry | undefined
  let damagedCount = Math.max(0, values.length - libraryLimits.shows - 1)
  for (const value of values.slice(0, libraryLimits.shows + 1)) {
    const item = value && typeof value === 'object' ? (value as Partial<LibraryEntry>) : undefined
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.length > 128 ||
      seen.has(item.id) ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 120 ||
      typeof item.updatedAt !== 'string' ||
      item.updatedAt.length > 64 ||
      !Number.isFinite(Date.parse(item.updatedAt)) ||
      typeof item.byteLength !== 'number' ||
      !Number.isInteger(item.byteLength) ||
      item.byteLength < 1 ||
      item.byteLength > libraryLimits.bytesPerShow ||
      typeof item.versionCount !== 'number' ||
      !Number.isInteger(item.versionCount) ||
      item.versionCount < 0 ||
      item.versionCount > 100
    ) {
      damagedCount++
      if (typeof item?.id === 'string' && item.id.length > 0 && item.id.length <= 128) damagedIds.push(item.id)
      continue
    }
    seen.add(item.id)
    if (item.id === recoveryEntryId) recovery = item as LibraryEntry
    else entries.push(item as LibraryEntry)
  }
  return { entries: entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), damagedCount, recovery, damagedIds }
}
function storageError(error: unknown): Error {
  if (error instanceof Error && !(error instanceof DOMException)) return error
  return new Error(
    error instanceof DOMException && error.name === 'QuotaExceededError'
      ? 'Bibliotheekopslag is vol. Exporteer een back-up voordat je shows verwijdert. Je actieve show is niet gewijzigd.'
      : 'Showbibliotheek is niet beschikbaar. Je actieve show blijft intact; gebruik exporteren als back-up.',
  )
}

/** Two stores in one transaction: metadata lists never decode complete shows or version histories. */
export function createShowLibrary(factory?: IDBFactory): ShowLibraryStore {
  async function open(): Promise<IDBDatabase> {
    let storageFactory: IDBFactory | undefined
    try {
      storageFactory = factory ?? globalThis.indexedDB
    } catch (error) {
      throw storageError(error)
    }
    if (!storageFactory) throw storageError(undefined)
    return new Promise((resolve, reject) => {
      let settled = false
      const request = storageFactory.open(databaseName, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(metadataStore)) db.createObjectStore(metadataStore, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(packageStore)) db.createObjectStore(packageStore, { keyPath: 'id' })
      }
      request.onerror = () => {
        settled = true
        reject(storageError(request.error))
      }
      request.onblocked = () => {
        settled = true
        reject(new Error('Sluit andere Lightlab-tabbladen en open de bibliotheek opnieuw.'))
      }
      request.onsuccess = () => {
        if (settled) {
          request.result.close()
          return
        }
        resolve(request.result)
      }
    })
  }
  async function transaction<T>(
    mode: IDBTransactionMode,
    action: (tx: IDBTransaction, done: (value: T) => void, fail: (error: unknown) => void) => void,
  ): Promise<T> {
    const db = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction([metadataStore, packageStore], mode)
        let result: T, failure: unknown
        tx.oncomplete = () => resolve(result)
        tx.onabort = () => reject(storageError(failure ?? tx.error))
        tx.onerror = () => {
          /* abort reports the final transaction failure */
        }
        const fail = (error: unknown) => {
          failure = error
          tx.abort()
        }
        try {
          action(
            tx,
            (value) => {
              result = value
            },
            fail,
          )
        } catch (error) {
          fail(error)
        }
      })
    } catch (error) {
      throw storageError(error)
    } finally {
      db.close()
    }
  }
  function payloadRecord(value: unknown): string {
    if (
      !value ||
      typeof value !== 'object' ||
      !('raw' in value) ||
      typeof value.raw !== 'string' ||
      value.raw.length > libraryLimits.bytesPerShow
    )
      throw new Error(
        'Deze bibliotheekshow ontbreekt of is beschadigd. Andere shows en je actieve show blijven intact.',
      )
    if (new TextEncoder().encode(value.raw).length > libraryLimits.bytesPerShow)
      throw new Error('Deze bibliotheekshow overschrijdt de opslaglimiet.')
    return value.raw
  }
  function write(tx: IDBTransaction, id: string, payload: ReturnType<typeof libraryPayload>) {
    const entry = {
      id,
      name: payload.name,
      byteLength: payload.byteLength,
      versionCount: payload.versionCount,
      updatedAt: new Date().toISOString(),
    }
    tx.objectStore(packageStore).put({ id, raw: payload.raw })
    tx.objectStore(metadataStore).put(entry)
    return entry
  }
  return {
    list: () =>
      transaction('readonly', (tx, done) => {
        const request = tx.objectStore(metadataStore).getAll(undefined, libraryLimits.shows + 2)
        request.onsuccess = () => done(libraryListing(request.result))
      }),
    load: (id) => {
      validId(id)
      return transaction('readonly', (tx, done, fail) => {
        const request = tx.objectStore(packageStore).get(id)
        request.onsuccess = () => {
          try {
            const parsed = parseShowPackage(payloadRecord(request.result))
            done(createShowPackage(parsed.show, parsed.versions))
          } catch (error) {
            fail(error)
          }
        }
      })
    },
    save: (name, bundle, existingId) => {
      const payload = libraryPayload(name, bundle),
        id = existingId ?? crypto.randomUUID()
      validId(id)
      if (existingId === recoveryEntryId)
        throw new Error('De herstelplaats wordt alleen bij wisselen van show bijgewerkt.')
      return transaction('readwrite', (tx, done, fail) => {
        const request = existingId
          ? tx.objectStore(metadataStore).get(existingId)
          : tx.objectStore(metadataStore).getAll(undefined, libraryLimits.shows + 2)
        request.onsuccess = () => {
          try {
            if (existingId && !request.result)
              throw new Error('Deze bibliotheekshow bestaat niet meer. Bewaar als een nieuwe show.')
            if (
              !existingId &&
              request.result.filter((item: { id?: string }) => item?.id !== recoveryEntryId).length >=
                libraryLimits.shows
            )
              throw new Error('Maximum van 32 bibliotheekshows bereikt. Exporteer voordat je een oude show verwijdert.')
            done(write(tx, id, payload))
          } catch (error) {
            fail(error)
          }
        }
      })
    },
    saveRecovery: (name, bundle) => {
      const payload = libraryPayload(name, bundle)
      return transaction('readwrite', (tx, done) => done(write(tx, recoveryEntryId, payload)))
    },
    rename: (id, name) => {
      validId(id)
      const nextName = libraryName(name)
      return transaction('readwrite', (tx, done, fail) => {
        const request = tx.objectStore(packageStore).get(id)
        request.onsuccess = () => {
          try {
            done(write(tx, id, libraryPayload(nextName, parseShowPackage(payloadRecord(request.result)))))
          } catch (error) {
            fail(error)
          }
        }
      })
    },
    remove: (id) => {
      validId(id)
      return transaction('readwrite', (tx, done) => {
        tx.objectStore(metadataStore).delete(id)
        tx.objectStore(packageStore).delete(id)
        done(undefined)
      })
    },
  }
}

/** Explicit backup entry point for the parent-owned active-show replacement transaction. */
export const saveLibraryShow = (name: string, bundle: ShowPackage) => createShowLibrary().save(name, bundle)
export const saveLibraryRecovery = (name: string, bundle: ShowPackage) => createShowLibrary().saveRecovery(name, bundle)
