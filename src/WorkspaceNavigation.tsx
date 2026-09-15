export type Workspace = 'audition' | 'patch' | 'design' | 'control' | 'audio' | 'stage' | 'start' | 'live' | 'runtime'

interface WorkspaceNavigationProps {
  workspace: Workspace
  onWorkspaceChange: (workspace: Workspace) => void
}

const primaryWorkspaces: ReadonlyArray<readonly [Workspace, string]> = [
  ['start', 'Overzicht'],
  ['stage', 'Setup'],
  ['design', 'Ontwerpen'],
  ['live', 'Live'],
  ['runtime', 'Runtime'],
]

const setupWorkspaces: ReadonlyArray<readonly [Workspace, string]> = [
  ['stage', 'Podium'],
  ['patch', 'Patch & netwerk'],
  ['control', 'Bedieningspaneel'],
  ['audio', 'Audio'],
]

export function WorkspaceNavigation({ workspace, onWorkspaceChange }: WorkspaceNavigationProps) {
  const setupOpen = setupWorkspaces.some(([id]) => id === workspace)

  return (
    <>
      <nav className="workspace-nav" aria-label="Showworkflow">
        {primaryWorkspaces.map(([id, label]) => {
          const active =
            workspace === id || (id === 'stage' && setupOpen) || (id === 'design' && workspace === 'audition')
          return (
            <button
              key={id}
              data-workspace-target={id}
              aria-current={active ? 'step' : undefined}
              className={active ? 'active' : ''}
              onClick={() => onWorkspaceChange(id)}
            >
              {label}
            </button>
          )
        })}
      </nav>
      {setupOpen && (
        <nav className="workspace-nav setup-nav" aria-label="Setup">
          {setupWorkspaces.map(([id, label]) => (
            <button
              key={id}
              aria-current={workspace === id ? 'page' : undefined}
              className={workspace === id ? 'active' : ''}
              onClick={() => onWorkspaceChange(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
    </>
  )
}
