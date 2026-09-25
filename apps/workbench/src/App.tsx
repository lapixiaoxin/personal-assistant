import {
  Activity,
  AlertTriangle,
  Ban,
  Bot,
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  FileCheck2,
  ListChecks,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActionInbox } from './ActionInbox.tsx'
import {
  ApiError,
  createTaskId,
  isActionAwaitingUser,
  isTaskActive,
  LumiApi,
  type LumiApiClient,
} from './api.ts'
import type {
  ApprovalRecord,
  AuditRecord,
  CapabilityDescriptor,
  HealthStatus,
  TaskDetail,
  TaskEvent,
  TaskRecord,
  TaskState,
} from './types.ts'
import { WorkspaceSwitcher, type WorkspaceView } from './WorkspaceSwitcher.tsx'

const defaultApi = new LumiApi()

interface AppProps {
  api?: LumiApiClient
}

type DetailTab = 'events' | 'audit'
type TaskFilter = 'all' | 'active' | 'done'

const stateLabels: Record<TaskState, string> = {
  cancelled: '已取消',
  completed: '已完成',
  failed: '失败',
  queued: '排队中',
  running: '运行中',
  waiting_approval: '待确认',
}

export function App({ api = defaultApi }: AppProps) {
  const [workspace, setWorkspace] = useState<WorkspaceView>('tasks')
  const [actionCount, setActionCount] = useState(0)

  useEffect(() => {
    let active = true
    void api.listActions()
      .then(actions => {
        if (active) {
          setActionCount(actions.filter(item => isActionAwaitingUser(item.action)).length)
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [api])

  if (workspace === 'actions') {
    return (
      <ActionInbox
        actionCount={actionCount}
        api={api}
        onActionCountChange={setActionCount}
        onWorkspaceChange={setWorkspace}
      />
    )
  }

  return (
    <TaskWorkspace
      actionCount={actionCount}
      api={api}
      onWorkspaceChange={setWorkspace}
    />
  )
}

function TaskWorkspace({
  actionCount,
  api,
  onWorkspaceChange,
}: {
  actionCount: number
  api: LumiApiClient
  onWorkspaceChange: (view: WorkspaceView) => void
}) {
  const [health, setHealth] = useState<HealthStatus>()
  const [capabilities, setCapabilities] = useState<CapabilityDescriptor[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [detail, setDetail] = useState<TaskDetail>()
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [audit, setAudit] = useState<AuditRecord[]>([])
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [tab, setTab] = useState<DetailTab>('events')
  const [draft, setDraft] = useState('')
  const [pendingTaskId, setPendingTaskId] = useState<string>()
  const [pendingAction, setPendingAction] = useState<string>()
  const [error, setError] = useState<string>()
  const [initializing, setInitializing] = useState(true)

  const refreshTasks = useCallback(async () => {
    const nextTasks = await api.listTasks()
    setTasks(nextTasks)
    setSelectedId(current => current ?? nextTasks[0]?.id)
    return nextTasks
  }, [api])

  const refreshDetail = useCallback(async (taskId: string, tolerateMissing = false) => {
    try {
      const [nextDetail, nextEvents, nextAudit] = await Promise.all([
        api.getTask(taskId),
        api.getEvents(taskId),
        api.getAudit(taskId),
      ])
      setDetail(nextDetail)
      setEvents(nextEvents)
      setAudit(nextAudit)
    } catch (cause) {
      if (tolerateMissing && cause instanceof ApiError && cause.status === 404) return
      throw cause
    }
  }, [api])

  const refresh = useCallback(async (showError = true) => {
    try {
      const [nextHealth, nextCapabilities, nextTasks] = await Promise.all([
        api.health(),
        api.capabilities(),
        refreshTasks(),
      ])
      setHealth(nextHealth)
      setCapabilities(nextCapabilities)
      if (selectedId && nextTasks.some(task => task.id === selectedId)) {
        await refreshDetail(selectedId)
      }
      setError(undefined)
    } catch (cause) {
      if (showError) setError(errorMessage(cause))
    } finally {
      setInitializing(false)
    }
  }, [api, refreshDetail, refreshTasks, selectedId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined)
      setEvents([])
      setAudit([])
      return
    }
    void refreshDetail(selectedId, selectedId === pendingTaskId)
      .catch(cause => setError(errorMessage(cause)))
  }, [pendingTaskId, refreshDetail, selectedId])

  const selectedTask = detail && detail.task.id === selectedId
    ? detail.task
    : tasks.find(task => task.id === selectedId)
  const shouldPoll = pendingTaskId !== undefined || (selectedTask && isTaskActive(selectedTask))

  useEffect(() => {
    if (!shouldPoll) return
    const timer = window.setInterval(() => {
      void refreshTasks()
        .then(async (nextTasks) => {
          if (selectedId && nextTasks.some(task => task.id === selectedId)) {
            await refreshDetail(selectedId, true)
          }
        })
        .catch(cause => setError(errorMessage(cause)))
    }, 1_200)
    return () => window.clearInterval(timer)
  }, [refreshDetail, refreshTasks, selectedId, shouldPoll])

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    if (filter === 'active') return isTaskActive(task)
    if (filter === 'done') return !isTaskActive(task)
    return true
  }), [filter, tasks])

  const submit = (): void => {
    const content = draft.trim()
    if (!content || pendingTaskId) return
    const taskId = createTaskId()
    setDraft('')
    setError(undefined)
    setSelectedId(taskId)
    setPendingTaskId(taskId)
    void api.submitTask(content, taskId)
      .then(async (created) => {
        setDetail(created)
        await refreshTasks()
        await refreshDetail(taskId)
      })
      .catch(cause => setError(errorMessage(cause)))
      .finally(() => setPendingTaskId(undefined))
  }

  const decide = (decision: 'approve' | 'cancel' | 'reject'): void => {
    if (!selectedId || pendingAction) return
    setPendingAction(decision)
    setError(undefined)
    void api[decision](selectedId)
      .then(async () => {
        await refreshTasks()
        await refreshDetail(selectedId)
      })
      .catch(cause => setError(errorMessage(cause)))
      .finally(() => setPendingAction(undefined))
  }

  return (
    <div className="app-shell">
      <aside className="task-sidebar" aria-label="任务导航">
        <header className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>lumi</span>
        </header>

        <WorkspaceSwitcher
          actionCount={actionCount}
          onChange={onWorkspaceChange}
          value="tasks"
        />

        <button className="new-task-button" type="button" onClick={() => {
          setSelectedId(undefined)
          setDetail(undefined)
          setDraft('')
        }}>
          <Plus aria-hidden="true" size={17} />
          新任务
        </button>

        <div className="filter-tabs" role="tablist" aria-label="任务筛选">
          {([
            ['all', '全部'],
            ['active', '进行中'],
            ['done', '已结束'],
          ] as const).map(([value, label]) => (
            <button
              aria-selected={filter === value}
              className={filter === value ? 'filter-tab active' : 'filter-tab'}
              key={value}
              onClick={() => setFilter(value)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="task-list">
          {initializing && <div className="quiet-state">正在连接 lumi…</div>}
          {!initializing && filteredTasks.length === 0 && (
            <div className="quiet-state">还没有符合条件的任务</div>
          )}
          {filteredTasks.map(task => (
            <button
              className={task.id === selectedId ? 'task-row selected' : 'task-row'}
              key={task.id}
              onClick={() => setSelectedId(task.id)}
              type="button"
            >
              <span className={`state-dot state-${task.state}`} />
              <span className="task-row-copy">
                <strong>{task.content}</strong>
                <small>{stateLabels[task.state]} · {formatRelativeTime(task.updatedAt)}</small>
              </span>
            </button>
          ))}
        </div>

        <footer className="connection">
          {health?.status === 'ok'
            ? <Wifi aria-hidden="true" size={15} />
            : <WifiOff aria-hidden="true" size={15} />}
          <span>{health?.status === 'ok' ? `${health.executor} 已连接` : '未连接'}</span>
          <span className="capability-count">{capabilities.length} 项能力</span>
        </footer>
      </aside>

      <main className="conversation">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">{selectedTask?.capabilityId ?? '个人工作台'}</p>
            <h1>{selectedTask ? taskTitle(selectedTask.content) : '今天想完成什么？'}</h1>
          </div>
          {selectedTask && (
            <span className={`state-badge state-${selectedTask.state}`}>
              {stateIcon(selectedTask.state)}
              {stateLabels[selectedTask.state]}
            </span>
          )}
        </header>

        <section className="conversation-body" aria-live="polite">
          {!selectedTask && !pendingTaskId && (
            <div className="empty-view">
              <span className="empty-mark"><Bot aria-hidden="true" size={25} /></span>
              <h2>把工作交给 lumi</h2>
              <p>任务会经过同一套记录、审批和执行流程。</p>
              <div className="suggestions">
                {[
                  '总结今天需要处理的工作',
                  '梳理这个仓库并给出改进建议',
                  '整理一份会议准备清单',
                ].map(suggestion => (
                  <button key={suggestion} onClick={() => setDraft(suggestion)} type="button">
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {pendingTaskId && !selectedTask && (
            <div className="empty-view">
              <CircleDashed className="spin" aria-hidden="true" size={25} />
              <h2>正在接收任务</h2>
              <p>任务建立后，这里会持续显示执行状态。</p>
            </div>
          )}

          {selectedTask && (
            <div className="message-stack">
              <article className="message user-message">
                <div className="message-author"><UserRound aria-hidden="true" size={15} />你</div>
                <p>{selectedTask.content}</p>
              </article>

              <article className="message assistant-message">
                <div className="message-author"><Bot aria-hidden="true" size={15} />lumi</div>
                {selectedTask.result
                  ? <p className="result-copy">{selectedTask.result}</p>
                  : selectedTask.error
                    ? <p className="error-copy">{selectedTask.error}</p>
                    : <p>{progressCopy(selectedTask.state)}</p>}
              </article>
            </div>
          )}
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <AlertTriangle aria-hidden="true" size={16} />
            <span>{error}</span>
            <button aria-label="关闭错误" onClick={() => setError(undefined)} title="关闭" type="button">
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        )}

        <form className="composer" onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}>
          <textarea
            aria-label="任务内容"
            maxLength={50_000}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder="交代一个需要完成的任务"
            rows={2}
            value={draft}
          />
          <button
            aria-label="提交任务"
            className="icon-button primary"
            disabled={!draft.trim() || pendingTaskId !== undefined}
            title="提交任务"
            type="submit"
          >
            {pendingTaskId ? <CircleDashed className="spin" aria-hidden="true" size={18} /> : <Send aria-hidden="true" size={18} />}
          </button>
        </form>
      </main>

      <aside className="details-panel" aria-label="任务详情">
        <div className="details-heading">
          <div>
            <p className="eyebrow">任务详情</p>
            <h2>执行记录</h2>
          </div>
          <button
            aria-label="刷新"
            className="icon-button"
            onClick={() => void refresh()}
            title="刷新"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={17} />
          </button>
        </div>

        {detail?.approval?.status === 'pending' && (
          <ApprovalPanel
            approval={detail.approval}
            busy={pendingAction !== undefined}
            onApprove={() => decide('approve')}
            onReject={() => decide('reject')}
          />
        )}

        {selectedTask && isTaskActive(selectedTask) && selectedTask.state !== 'waiting_approval' && (
          <button
            className="cancel-button"
            disabled={pendingAction !== undefined}
            onClick={() => decide('cancel')}
            type="button"
          >
            <Ban aria-hidden="true" size={16} />
            取消任务
          </button>
        )}

        <div className="detail-tabs" role="tablist" aria-label="详情类型">
          <button
            aria-selected={tab === 'events'}
            className={tab === 'events' ? 'detail-tab active' : 'detail-tab'}
            onClick={() => setTab('events')}
            role="tab"
            type="button"
          >
            <Activity aria-hidden="true" size={15} />事件
          </button>
          <button
            aria-selected={tab === 'audit'}
            className={tab === 'audit' ? 'detail-tab active' : 'detail-tab'}
            onClick={() => setTab('audit')}
            role="tab"
            type="button"
          >
            <ListChecks aria-hidden="true" size={15} />审计
          </button>
        </div>

        <div className="timeline">
          {!selectedTask && <div className="quiet-state">选择任务后查看详情</div>}
          {selectedTask && tab === 'events' && events.length === 0 && (
            <div className="quiet-state">暂无执行事件</div>
          )}
          {tab === 'events' && events.map(event => (
            <TimelineItem
              key={event.id}
              label={eventLabel(event)}
              meta={formatTime(event.occurredAt)}
              terminal={event.type === 'execution.completed'}
            />
          ))}
          {selectedTask && tab === 'audit' && audit.length === 0 && (
            <div className="quiet-state">暂无审计记录</div>
          )}
          {tab === 'audit' && audit.map(record => (
            <TimelineItem
              key={record.id}
              label={record.action}
              meta={`${record.outcome} · ${formatTime(record.createdAt)}`}
              terminal={record.outcome === 'succeeded'}
            />
          ))}
        </div>
      </aside>
    </div>
  )
}

function ApprovalPanel({
  approval,
  busy,
  onApprove,
  onReject,
}: {
  approval: ApprovalRecord
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <section className="approval-panel">
      <div className="approval-title">
        <ShieldCheck aria-hidden="true" size={17} />
        需要确认
      </div>
      <p>{approval.reason}</p>
      <span className="risk-label">风险级别：{approval.riskLevel}</span>
      <div className="approval-actions">
        <button disabled={busy} onClick={onApprove} type="button">
          <Check aria-hidden="true" size={16} />允许
        </button>
        <button className="secondary-button" disabled={busy} onClick={onReject} type="button">
          <X aria-hidden="true" size={16} />拒绝
        </button>
      </div>
    </section>
  )
}

function TimelineItem({
  label,
  meta,
  terminal,
}: {
  label: string
  meta: string
  terminal: boolean
}) {
  return (
    <div className="timeline-item">
      <span className={terminal ? 'timeline-icon terminal' : 'timeline-icon'}>
        {terminal
          ? <FileCheck2 aria-hidden="true" size={14} />
          : <ClipboardList aria-hidden="true" size={14} />}
      </span>
      <div>
        <div className="timeline-label">{label}</div>
        <div className="timeline-meta">{meta}</div>
      </div>
    </div>
  )
}

function stateIcon(state: TaskState) {
  if (state === 'completed') return <CheckCircle2 aria-hidden="true" size={14} />
  if (state === 'failed') return <AlertTriangle aria-hidden="true" size={14} />
  if (state === 'cancelled') return <Ban aria-hidden="true" size={14} />
  return <CircleDashed className={state === 'running' ? 'spin' : ''} aria-hidden="true" size={14} />
}

function progressCopy(state: TaskState): string {
  if (state === 'waiting_approval') return '这项任务需要你的确认后才能继续。'
  if (state === 'queued') return '任务已进入队列。'
  if (state === 'running') return '正在调用 DSH 完成任务，执行进度会显示在右侧。'
  if (state === 'cancelled') return '任务已取消。'
  if (state === 'failed') return '任务执行失败。'
  return '任务已完成。'
}

function eventLabel(event: TaskEvent): string {
  if (event.type === 'tool.called' && typeof event.payload.name === 'string') {
    return `调用工具 ${event.payload.name}`
  }
  if (event.type === 'tool.completed' && typeof event.payload.name === 'string') {
    return `工具完成 ${event.payload.name}`
  }
  if (event.type === 'execution.progress' && typeof event.payload.message === 'string') {
    return event.payload.message
  }
  return event.type.replaceAll('.', ' / ')
}

function taskTitle(content: string): string {
  return content.length > 34 ? `${content.slice(0, 34)}…` : content
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date)
}

function formatRelativeTime(value: string): string {
  const milliseconds = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return formatTime(value)
  const minutes = Math.floor(milliseconds / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
