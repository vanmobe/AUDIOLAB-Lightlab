import type { ShowDocument } from './domain'
import { assertShowDocument } from './show-validation'
import {
  createPackageFixtureCatalog,
  validatePackageFixtureCatalog,
  type PackageFixtureCatalog,
} from './package-fixtures'

export interface ShowVersion {
  id: string
  createdAt: string
  note: string
  show: ShowDocument
}

export interface ShowPackage {
  format: 'lightflow-show'
  version: 1
  show: ShowDocument
  versions: ShowVersion[]
  fixtureCatalog?: PackageFixtureCatalog
}

export function createVersion(show: ShowDocument, note: string, now = new Date()): ShowVersion {
  return { id: crypto.randomUUID(), createdAt: now.toISOString(), note, show: structuredClone(show) }
}

export function createShowPackage(show: ShowDocument, versions: ShowVersion[]): ShowPackage {
  return {
    format: 'lightflow-show',
    version: 1,
    show: structuredClone(show),
    versions: structuredClone(versions),
    fixtureCatalog: createPackageFixtureCatalog([show, ...versions.map((version) => version.show)]),
  }
}

export function parseShowPackage(raw: string): ShowPackage {
  if (raw.length > 20_000_000) throw new Error('Dit showbestand is te groot (maximaal 20 miljoen tekens).')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Dit is geen geldig JSON-showbestand.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Dit is geen geldig Lightlab-showbestand.')
  const candidate = value as Partial<ShowPackage>
  if (
    candidate.format !== 'lightflow-show' ||
    candidate.version !== 1 ||
    !Array.isArray(candidate.versions) ||
    candidate.versions.length > 100
  ) {
    throw new Error('Dit is geen geldig Lightlab-showbestand.')
  }
  assertShowDocument(candidate.show)
  const ids = new Set<string>()
  for (const version of candidate.versions) {
    if (
      !version ||
      typeof version !== 'object' ||
      typeof version.id !== 'string' ||
      !version.id.trim() ||
      version.id.length > 1024 ||
      ids.has(version.id) ||
      typeof version.note !== 'string' ||
      version.note.length > 4096 ||
      typeof version.createdAt !== 'string' ||
      version.createdAt.length > 64 ||
      !Number.isFinite(Date.parse(version.createdAt))
    ) {
      throw new Error('Het showbestand bevat een ongeldige versie.')
    }
    ids.add(version.id)
    assertShowDocument(version.show)
  }
  if (candidate.fixtureCatalog !== undefined)
    validatePackageFixtureCatalog(candidate.fixtureCatalog, [
      candidate.show,
      ...candidate.versions.map((version) => version.show),
    ])
  return candidate as ShowPackage
}
