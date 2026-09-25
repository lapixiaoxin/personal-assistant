import {
  Activity,
  AlertTriangle,
  Ban,
  BookOpenText,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  FileCheck2,
  ListChecks,
  MessageSquareText,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActionInbox } from './ActionInbox.tsx'
import { MemoryVault } from './MemoryVault.tsx'
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
  RecoveryRecord,
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
type ComposerMode = 'meeting' | 'research' | 'task'
type TaskFilter = 'all' | 'active' | 'done'

const stateLabels: Record<TaskState, string> = {
  cancelled: '已取消',
  completed: '已完成',
  failed: '失败',
  interrupted: '已中断',
  queued: '排队中',
  reconciling: '待对账',
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
  if (workspace === 'memories') {
    return (
      <MemoryVault
        actionCount={actionCount}
        api={api}
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
  const [recovery, setRecovery] = useState<RecoveryRecord>()
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [tab, setTab] = useState<DetailTab>('events')
  const [composerMode, setComposerMode] = useState<ComposerMode>('task')
  const [draft, setDraft] = useState('')
  const [sourceDraft, setSourceDraft] = useState('')
  const [meetingObjective, setMeetingObjective] = useState('')
  const [participantDraft, setParticipantDraft] = useState('')
  const [agendaDraft, setAgendaDraft] = useState('')
  const [meetingBackground, setMeetingBackground] = useState('')
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
      const [nextDetail, nextEvents, nextAudit, nextRecovery] = await Promise.all([
        api.getTask(taskId),
        api.getEvents(taskId),
        api.getAudit(taskId),
        api.getTaskRecovery(taskId),
      ])
      setDetail(nextDetail)
      setEvents(nextEvents)
      setAudit(nextAudit)
      setRecovery(nextRecovery)
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
      setRecovery(undefined)
      return
    }
    void refreshDetail(selectedId, selectedId === pendingTaskId)
      .catch(cause => setError(errorMessage(cause)))
  }, [pendingTaskId, refreshDetail, selectedId])

  const selectedTask = detail && detail.task.id === selectedId
    ? detail.task
    : tasks.find(task => task.id === selectedId)
  const selectedResearchSources = selectedTask
    ? researchSourcesFromContextRefs(selectedTask.contextRefs)
    : []
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
    const sources = nonEmptyLines(sourceDraft)
    const participants = nonEmptyLines(participantDraft)
    const agenda = nonEmptyLines(agendaDraft)
    const meetingReady = meetingObjective.trim() !== ''
      && participants.length > 0
      && agenda.length > 0
    if (
      !content
      || pendingTaskId
      || (composerMode === 'research' && sources.length === 0)
      || (composerMode === 'meeting' && !meetingReady)
    ) return
    const taskId = createTaskId()
    setDraft('')
    setSourceDraft('')
    setMeetingObjective('')
    setParticipantDraft('')
    setAgendaDraft('')
    setMeetingBackground('')
    setError(undefined)
    setSelectedId(taskId)
    setPendingTaskId(taskId)
    const submission = composerMode === 'research'
      ? api.submitResearchBrief(content, sources, taskId)
      : composerMode === 'meeting'
        ? api.submitMeetingBrief({
            agenda,
            ...(meetingBackground.trim()
              ? { background: meetingBackground.trim() }
              : {}),
            objective: meetingObjective.trim(),
            participants,
            topic: content,
          }, taskId)
        : api.submitTask(content, taskId)
    void submission
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

  const resolveRecovery = (command: 'acknowledge' | 'retry'): void => {
    if (!recovery || pendingAction) return
    setPendingAction(command)
    setError(undefined)
    const operation = command === 'retry'
      ? api.retryRecovery(recovery.id)
      : api.acknowledgeRecovery(recovery.id)
    void operation
      .then(async (result) => {
        if ('task' in result) {
          setSelectedId(result.task.id)
          setDetail({
            approval: null,
            task: result.task,
          })
        } else {
          setRecovery(result)
        }
        await refreshTasks()
        if ('task' in result) await refreshDetail(result.task.id)
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
          setSourceDraft('')
          setMeetingObjective('')
          setParticipantDraft('')
          setAgendaDraft('')
          setMeetingBackground('')
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
                {selectedResearchSources.length > 0 && (
                  <div className="research-source-list">
                    <span><BookOpenText aria-hidden="true" size={14} />公开来源</span>
                    {selectedResearchSources.map(source => (
                      <a
                        href={source}
                        key={source}
                        referrerPolicy="no-referrer"
                        rel="noreferrer"
                        target="_blank"
                      >
                        {source}
                      </a>
                    ))}
                  </div>
                )}
              </article>

              <article className="message assistant-message">
                <div className="message-author"><Bot aria-hidden="true" size={15} />lumi</div>
                {selectedTask.result
                  ? <TaskResult task={selectedTask} />
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

        <form className={`composer ${composerMode}-composer`} onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}>
          <div className="composer-modes" role="tablist" aria-label="任务类型">
            <button
              aria-selected={composerMode === 'task'}
              className={composerMode === 'task' ? 'composer-mode active' : 'composer-mode'}
              onClick={() => setComposerMode('task')}
              role="tab"
              type="button"
            >
              <MessageSquareText aria-hidden="true" size={14} />
              普通任务
            </button>
            <button
              aria-selected={composerMode === 'research'}
              className={composerMode === 'research' ? 'composer-mode active' : 'composer-mode'}
              onClick={() => setComposerMode('research')}
              role="tab"
              type="button"
            >
              <BookOpenText aria-hidden="true" size={14} />
              研究简报
            </button>
            <button
              aria-selected={composerMode === 'meeting'}
              className={composerMode === 'meeting' ? 'composer-mode active' : 'composer-mode'}
              onClick={() => setComposerMode('meeting')}
              role="tab"
              type="button"
            >
              <CalendarDays aria-hidden="true" size={14} />
              会议准备
            </button>
          </div>
          <textarea
            aria-label={
              composerMode === 'research'
                ? '研究问题'
                : composerMode === 'meeting'
                  ? '会议主题'
                  : '任务内容'
            }
            maxLength={50_000}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder={
              composerMode === 'research'
                ? '输入要回答的研究问题'
                : composerMode === 'meeting'
                  ? '会议主题'
                  : '交代一个需要完成的任务'
            }
            rows={2}
            value={draft}
          />
          {composerMode === 'research' && (
            <textarea
              aria-label="公开来源"
              className="source-input"
              maxLength={16_384}
              onChange={event => setSourceDraft(event.target.value)}
              placeholder="每行一个 HTTPS 来源"
              rows={2}
              value={sourceDraft}
            />
          )}
          {composerMode === 'meeting' && (
            <div className="meeting-fields">
              <textarea
                aria-label="会议目标"
                className="meeting-objective-input"
                maxLength={2_000}
                onChange={event => setMeetingObjective(event.target.value)}
                placeholder="希望会议达成什么结果"
                rows={2}
                value={meetingObjective}
              />
              <textarea
                aria-label="参与者"
                maxLength={6_000}
                onChange={event => setParticipantDraft(event.target.value)}
                placeholder="参与者或角色，每行一个"
                rows={3}
                value={participantDraft}
              />
              <textarea
                aria-label="会议议程"
                maxLength={10_000}
                onChange={event => setAgendaDraft(event.target.value)}
                placeholder="议程项，每行一个"
                rows={3}
                value={agendaDraft}
              />
              <textarea
                aria-label="会议背景"
                className="meeting-background-input"
                maxLength={6_000}
                onChange={event => setMeetingBackground(event.target.value)}
                placeholder="补充背景（可选）"
                rows={2}
                value={meetingBackground}
              />
            </div>
          )}
          <button
            aria-label={
              composerMode === 'research'
                ? '提交研究简报'
                : composerMode === 'meeting'
                  ? '提交会议准备'
                  : '提交任务'
            }
            className="icon-button primary"
            disabled={
              !draft.trim()
              || pendingTaskId !== undefined
              || (composerMode === 'research' && !sourceDraft.trim())
              || (
                composerMode === 'meeting'
                && (
                  !meetingObjective.trim()
                  || !participantDraft.trim()
                  || !agendaDraft.trim()
                )
              )
            }
            title={
              composerMode === 'research'
                ? '提交研究简报'
                : composerMode === 'meeting'
                  ? '提交会议准备'
                  : '提交任务'
            }
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

        {recovery && recovery.status !== 'resolved' && (
          <RecoveryPanel
            busy={pendingAction !== undefined}
            onAcknowledge={() => resolveRecovery('acknowledge')}
            onOpenActions={() => onWorkspaceChange('actions')}
            onRetry={() => resolveRecovery('retry')}
            recovery={recovery}
          />
        )}

        {selectedTask && (
          selectedTask.state === 'queued' || selectedTask.state === 'running'
        ) && (
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

function TaskResult({ task }: { task: TaskRecord }) {
  const meetingSections = task.capabilityId === 'meeting-agent' && task.result
    ? parseMeetingBrief(task.result)
    : undefined
  if (!meetingSections) return <p className="result-copy">{task.result}</p>

  return (
    <div className="meeting-brief-result">
      {meetingSections.map(section => (
        <section key={section.heading}>
          <h3>{meetingSectionLabel(section.heading)}</h3>
          <p>{section.body}</p>
        </section>
      ))}
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

function RecoveryPanel({
  busy,
  onAcknowledge,
  onOpenActions,
  onRetry,
  recovery,
}: {
  busy: boolean
  onAcknowledge: () => void
  onOpenActions: () => void
  onRetry: () => void
  recovery: RecoveryRecord
}) {
  return (
    <section className="recovery-panel">
      <div className="approval-title">
        <RotateCcw aria-hidden="true" size={17} />
        需要恢复处理
      </div>
      <p>{recoveryCopy(recovery)}</p>
      <div className="approval-actions">
        {recovery.disposition === 'retry_available' && (
          <button disabled={busy} onClick={onRetry} type="button">
            <RotateCcw aria-hidden="true" size={16} />创建新任务
          </button>
        )}
        {recovery.disposition === 'manual_review' && (
          <button disabled={busy} onClick={onAcknowledge} type="button">
            <Check aria-hidden="true" size={16} />已了解
          </button>
        )}
        {recovery.disposition === 'reconcile_action' && (
          <button disabled={busy} onClick={onOpenActions} type="button">
            <ShieldCheck aria-hidden="true" size={16} />前往动作对账
          </button>
        )}
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
  if (state === 'failed' || state === 'interrupted') {
    return <AlertTriangle aria-hidden="true" size={14} />
  }
  if (state === 'cancelled') return <Ban aria-hidden="true" size={14} />
  return <CircleDashed className={state === 'running' ? 'spin' : ''} aria-hidden="true" size={14} />
}

function progressCopy(state: TaskState): string {
  if (state === 'waiting_approval') return '这项任务需要你的确认后才能继续。'
  if (state === 'queued') return '任务已进入队列。'
  if (state === 'running') return '正在调用 DSH 完成任务，执行进度会显示在右侧。'
  if (state === 'interrupted') return '上一次执行因 lumi 重启而中断，请按恢复判定处理。'
  if (state === 'reconciling') return '动作可能已经发生，需要先对账，不能重新执行。'
  if (state === 'cancelled') return '任务已取消。'
  if (state === 'failed') return '任务执行失败。'
  return '任务已完成。'
}

function recoveryCopy(recovery: RecoveryRecord): string {
  if (recovery.reasonCode === 'ACTION_VERIFICATION_PENDING') {
    return '动作已有回执但尚未完成独立验证，请在动作页读回对账。'
  }
  if (recovery.reasonCode === 'ACTION_OUTCOME_UNKNOWN') {
    return '动作结果未知，禁止重复执行；请在动作页读取实际结果。'
  }
  if (recovery.reasonCode === 'HOST_RESTART_EFFECT_MAY_HAVE_OCCURRED') {
    return '执行中观察到工具或宽权限能力，lumi 不会自动重跑。请检查实际影响。'
  }
  return '未观察到副作用，可由你明确创建一个新的重试任务。原任务记录会保留。'
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
  if (
    event.type === 'research.source_captured'
    && typeof event.payload.sourceId === 'string'
  ) {
    return `来源已留存 ${event.payload.sourceId}`
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

interface MeetingResultSection {
  body: string
  heading: string
}

const meetingResultHeadings = [
  '## Objective',
  '## Participant Considerations',
  '## Agenda',
  '## Decisions and Questions',
  '## Risks and Preparation',
  '## Follow-ups',
] as const

function parseMeetingBrief(value: string): MeetingResultSection[] | undefined {
  const lines = value.trim().split(/\r?\n/)
  if (
    lines[0]?.trim() !== '<!-- lumi.meeting-brief/v1 -->'
    || lines.at(-1)?.trim() !== '<!-- /lumi.meeting-brief/v1 -->'
  ) return undefined

  const indexes = meetingResultHeadings.map(heading =>
    lines.findIndex(line => line.trim() === heading),
  )
  if (indexes.some((index, position) =>
    index < 1 || (position > 0 && index <= (indexes[position - 1] ?? -1)),
  )) return undefined

  return meetingResultHeadings.map((heading, position) => {
    const start = (indexes[position] ?? 0) + 1
    const end = position + 1 < indexes.length
      ? indexes[position + 1] ?? lines.length - 1
      : lines.length - 1
    return {
      body: lines.slice(start, end).join('\n').trim(),
      heading,
    }
  })
}

function meetingSectionLabel(heading: string): string {
  return ({
    '## Agenda': '议程',
    '## Decisions and Questions': '决策与问题',
    '## Follow-ups': '跟进事项',
    '## Objective': '会议目标',
    '## Participant Considerations': '参与者关注点',
    '## Risks and Preparation': '风险与准备',
  } as Record<string, string>)[heading] ?? heading.replace(/^##\s+/, '')
}

function nonEmptyLines(value: string): string[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function researchSourcesFromContextRefs(references: readonly string[]): string[] {
  const prefix = 'lumi-public-source:'
  const sources = references.flatMap((reference) => {
    if (!reference.startsWith(prefix)) return []
    const encoded = reference.slice(prefix.length)
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return []
    try {
      const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/')
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
      const bytes = Uint8Array.from(window.atob(padded), character => character.charCodeAt(0))
      const decoded = new TextDecoder().decode(bytes)
      const url = new URL(decoded)
      return url.protocol === 'https:' ? [url.toString()] : []
    } catch {
      return []
    }
  })
  return [...new Set(sources)]
}
