import { ClipboardList, ShieldCheck } from 'lucide-react'

export type WorkspaceView = 'tasks' | 'actions'

export function WorkspaceSwitcher({
  actionCount,
  onChange,
  value,
}: {
  actionCount: number
  onChange: (view: WorkspaceView) => void
  value: WorkspaceView
}) {
  return (
    <div className="workspace-tabs" role="tablist" aria-label="工作区">
      <button
        aria-selected={value === 'tasks'}
        className={value === 'tasks' ? 'workspace-tab active' : 'workspace-tab'}
        onClick={() => onChange('tasks')}
        role="tab"
        type="button"
      >
        <ClipboardList aria-hidden="true" size={15} />
        任务
      </button>
      <button
        aria-selected={value === 'actions'}
        className={value === 'actions' ? 'workspace-tab active' : 'workspace-tab'}
        onClick={() => onChange('actions')}
        role="tab"
        type="button"
      >
        <ShieldCheck aria-hidden="true" size={15} />
        动作
        {actionCount > 0 && <span className="workspace-count">{actionCount}</span>}
      </button>
    </div>
  )
}
