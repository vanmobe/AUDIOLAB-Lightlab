import type { ShowDocument } from './domain'
import type { Workspace } from './WorkspaceNavigation'

export type DesignSection = 'ai' | 'colors' | 'programs' | 'looks'

interface DesignNavigationProps {
  workspace: Workspace
  section: DesignSection
  show: ShowDocument
  onWorkspaceChange: (workspace: Workspace) => void
  onSectionChange: (section: DesignSection) => void
  onOpenShowSettings: () => void
}

const designSections: ReadonlyArray<readonly [DesignSection, string]> = [
  ['ai', 'Maak met AI'],
  ['colors', 'Kleuren'],
  ['programs', 'Animaties'],
  ['looks', 'Looks'],
]

export function DesignNavigation({
  workspace,
  section,
  show,
  onWorkspaceChange,
  onSectionChange,
  onOpenShowSettings,
}: DesignNavigationProps) {
  return (
    <nav className="design-library-nav" aria-label="Ontwerpbibliotheek">
      {designSections.map(([id, label]) => {
        const count =
          id === 'colors' ? show.colorProfiles.length : id === 'programs' ? show.programs.length : show.looks.length
        const active = workspace === 'design' && section === id
        return (
          <button
            key={id}
            className={active ? 'active' : ''}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              onSectionChange(id)
              onWorkspaceChange('design')
            }}
          >
            {id === 'ai' ? label : `${label} · ${count}`}
          </button>
        )
      })}
      <button
        className={workspace === 'audition' ? 'active' : ''}
        aria-current={workspace === 'audition' ? 'page' : undefined}
        onClick={() => onWorkspaceChange('audition')}
      >
        Testlab
      </button>
      <button onClick={onOpenShowSettings}>Showinstellingen</button>
    </nav>
  )
}
