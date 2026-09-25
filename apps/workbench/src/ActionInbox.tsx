import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  Fingerprint,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Target,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isActionAwaitingUser, type LumiApiClient } from './api.ts'
import type {
  ActionDetail,
  ActionStatus,
  CapabilityDescriptor,
  HealthStatus,
} from './types.ts'
import { WorkspaceSwitcher, type WorkspaceView } from './WorkspaceSwitcher.tsx'

type ActionFilter = 'all' | 'attention' | 'done'
type ActionCommand = 'authorize' | 'cancel' | 'execute' | 'reconcile'

const actionStatusLabels: Record<ActionStatus, string> = {
  authorized: '已授权',
  cancelled: '已取消',
  executing: '执行中',
  failed: '失败',
  outcome_unknown: '结果待确认',
  prepared: '待授权',
  succeeded: '已验证',
}

export function ActionInbox({
  actionCount,
  api,
  onActionCountChange,
  onWorkspaceChange,
}: {
  actionCount: number
  api: LumiApiClient
  onActionCountChange: (count: number) => void
  onWorkspaceChange: (view: WorkspaceView) => void
}) {
  const [health, setHealth] = useState<HealthStatus>()
  const [capabilities, setCapabilities] = useState<CapabilityDescriptor[]>([])
  const [actions, setActions] = useState<ActionDetail[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [detail, setDetail] = useState<ActionDetail>()
  const [filter, setFilter] = useState<ActionFilter>('all')
  const [pendingCommand, setPendingCommand] = useState<ActionCommand>()
  const [error, setError] = useState<string>()
  const [initializing, setInitializing] = useState(true)

  const refreshActions = useCallback(async () => {
    const nextActions = await api.listActions()
    setActions(nextActions)
    onActionCountChange(nextActions.filter(item => isActionAwaitingUser(item.action)).length)
    setSelectedId(current => (
      current && nextActions.some(item => item.action.id === current)
        ? current
        : nextActions[0]?.action.id
    ))
    return nextActions
  }, [api, onActionCountChange])

  const refreshDetail = useCallback(async (actionId: string) => {
    const nextDetail = await api.getAction(actionId)
    setDetail(nextDetail)
    return nextDetail
  }, [api])

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextCapabilities, nextActions] = await Promise.all([
        api.health(),
        api.capabilities(),
        refreshActions(),
      ])
      setHealth(nextHealth)
      setCapabilities(nextCapabilities)
      if (selectedId && nextActions.some(item => item.action.id === selectedId)) {
        await refreshDetail(selectedId)
      }
      setError(undefined)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setInitializing(false)
    }
  }, [api, refreshActions, refreshDetail, selectedId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined)
      return
    }
    void refreshDetail(selectedId).catch(cause => setError(errorMessage(cause)))
  }, [refreshDetail, selectedId])

  const selectedDetail = detail?.action.id === selectedId
    ? detail
    : actions.find(item => item.action.id === selectedId)
  const shouldPoll = selectedDetail?.action.status === 'executing'

  useEffect(() => {
    if (!shouldPoll || !selectedId) return
    const timer = window.setInterval(() => {
      void Promise.all([refreshActions(), refreshDetail(selectedId)])
        .catch(cause => setError(errorMessage(cause)))
    }, 1_200)
    return () => window.clearInterval(timer)
  }, [refreshActions, refreshDetail, selectedId, shouldPoll])

  const filteredActions = useMemo(() => actions.filter(({ action }) => {
    if (filter === 'attention') return !isActionTerminal(action.status)
    if (filter === 'done') return isActionTerminal(action.status)
    return true
  }), [actions, filter])

  const runCommand = (command: ActionCommand): void => {
    if (!selectedId || pendingCommand) return
    setPendingCommand(command)
    setError(undefined)

    const request = command === 'authorize'
      ? api.authorizeAction(selectedId)
      : command === 'execute'
        ? api.executeAction(selectedId)
        : command === 'reconcile'
          ? api.reconcileAction(selectedId)
          : api.cancelAction(selectedId)

    void request
      .then(async () => {
        await Promise.all([refreshActions(), refreshDetail(selectedId)])
      })
      .catch(cause => setError(errorMessage(cause)))
      .finally(() => setPendingCommand(undefined))
  }

  return (
    <div className="app-shell">
      <aside className="task-sidebar action-sidebar" aria-label="动作导航">
        <header className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>lumi</span>
        </header>

        <WorkspaceSwitcher
          actionCount={actionCount}
          onChange={onWorkspaceChange}
          value="actions"
        />

        <div className="sidebar-section-title">
          <ShieldCheck aria-hidden="true" size={16} />
          <span>动作收件箱</span>
        </div>

        <div className="filter-tabs" role="tablist" aria-label="动作筛选">
          {([
            ['all', '全部'],
            ['attention', '待处理'],
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
          {initializing && <div className="quiet-state">正在读取动作…</div>}
          {!initializing && filteredActions.length === 0 && (
            <div className="quiet-state">没有符合条件的动作</div>
          )}
          {filteredActions.map(({ action }) => (
            <button
              className={action.id === selectedId ? 'task-row selected' : 'task-row'}
              key={action.id}
              onClick={() => setSelectedId(action.id)}
              type="button"
            >
              <span className={`state-dot action-${action.status}`} />
              <span className="task-row-copy">
                <strong>{action.target.artifactId}</strong>
                <small>
                  {actionStatusLabels[action.status]} · {formatRelativeTime(action.updatedAt)}
                </small>
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

      <main className="conversation action-conversation">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">
              {selectedDetail
                ? `${selectedDetail.action.capability.id} · ${selectedDetail.action.capability.version}`
                : '可信动作'}
            </p>
            <h1>{selectedDetail?.action.target.artifactId ?? '动作收件箱'}</h1>
          </div>
          {selectedDetail && (
            <span className={`state-badge action-${selectedDetail.action.status}`}>
              {actionStatusIcon(selectedDetail.action.status)}
              {actionStatusLabels[selectedDetail.action.status]}
            </span>
          )}
        </header>

        <section className="conversation-body" aria-live="polite">
          {!selectedDetail && (
            <div className="empty-view">
              <span className="empty-mark"><ShieldCheck aria-hidden="true" size={25} /></span>
              <h2>暂无动作</h2>
              <p>DSH 提议的受控动作会显示在这里。</p>
            </div>
          )}

          {selectedDetail && (
            <div className="action-detail-view">
              <section className="action-overview">
                <div className="action-section-heading">
                  <Target aria-hidden="true" size={17} />
                  <div>
                    <p className="eyebrow">动作目标</p>
                    <h2>{selectedDetail.action.target.artifactId}</h2>
                  </div>
                </div>
                <dl className="action-facts">
                  <Fact label="操作" value={operationLabel(selectedDetail.action.operation)} />
                  <Fact label="影响范围" value={selectedDetail.action.effect} />
                  <Fact label="来源任务" value={<code>{selectedDetail.action.taskId}</code>} />
                  <Fact
                    label="期限"
                    value={selectedDetail.action.deadline
                      ? formatDateTime(selectedDetail.action.deadline)
                      : '未设置'}
                  />
                  <Fact label="输入引用" value={<code>{selectedDetail.action.inputRef}</code>} />
                  <Fact label="幂等键" value={<code>{selectedDetail.action.idempotencyKey}</code>} />
                </dl>
              </section>

              <section className="digest-section">
                <div className="action-section-heading">
                  <Fingerprint aria-hidden="true" size={17} />
                  <div>
                    <p className="eyebrow">绑定摘要</p>
                    <h2>请求指纹</h2>
                  </div>
                </div>
                <Digest label="Action digest" value={selectedDetail.action.actionDigest} />
                <Digest label="Input digest" value={selectedDetail.action.inputDigest} />
              </section>
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
      </main>

      <aside className="details-panel action-details-panel" aria-label="动作详情">
        <div className="details-heading">
          <div>
            <p className="eyebrow">动作详情</p>
            <h2>授权与证明</h2>
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

        {selectedDetail && (
          <>
            <ActionControls
              busy={pendingCommand !== undefined}
              onCommand={runCommand}
              status={selectedDetail.action.status}
            />
            <EvidenceDetails detail={selectedDetail} />
          </>
        )}
        {!selectedDetail && <div className="quiet-state detail-empty">选择动作后查看详情</div>}
      </aside>
    </div>
  )
}

function ActionControls({
  busy,
  onCommand,
  status,
}: {
  busy: boolean
  onCommand: (command: ActionCommand) => void
  status: ActionStatus
}) {
  if (status === 'prepared') {
    return (
      <section className="approval-panel action-control-panel">
        <div className="approval-title">
          <ShieldCheck aria-hidden="true" size={17} />
          待授权
        </div>
        <div className="approval-actions">
          <button disabled={busy} onClick={() => onCommand('authorize')} type="button">
            <Check aria-hidden="true" size={16} />授权动作
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => onCommand('cancel')}
            type="button"
          >
            <Ban aria-hidden="true" size={16} />取消动作
          </button>
        </div>
      </section>
    )
  }

  if (status === 'authorized') {
    return (
      <section className="approval-panel action-control-panel">
        <div className="approval-title">
          <CheckCircle2 aria-hidden="true" size={17} />
          已授权
        </div>
        <div className="approval-actions">
          <button disabled={busy} onClick={() => onCommand('execute')} type="button">
            <Play aria-hidden="true" size={16} />执行动作
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => onCommand('cancel')}
            type="button"
          >
            <Ban aria-hidden="true" size={16} />取消动作
          </button>
        </div>
      </section>
    )
  }

  if (status === 'outcome_unknown') {
    return (
      <section className="approval-panel action-control-panel warning">
        <div className="approval-title">
          <AlertTriangle aria-hidden="true" size={17} />
          结果待确认
        </div>
        <div className="approval-actions single-action">
          <button disabled={busy} onClick={() => onCommand('reconcile')} type="button">
            <RotateCcw aria-hidden="true" size={16} />对账结果
          </button>
        </div>
      </section>
    )
  }

  if (status === 'executing') {
    return (
      <section className="approval-panel action-control-panel">
        <div className="approval-title">
          <CircleDashed className="spin" aria-hidden="true" size={17} />
          正在执行
        </div>
      </section>
    )
  }

  return null
}

function EvidenceDetails({ detail }: { detail: ActionDetail }) {
  return (
    <div className="evidence-stack">
      {detail.authorization && (
        <section className="evidence-group">
          <div className="evidence-heading">
            <ShieldCheck aria-hidden="true" size={15} />
            <h3>授权</h3>
            <span>{authorizationStatusLabel(detail.authorization.status)}</span>
          </div>
          <dl className="record-grid">
            <Fact label="授权 ID" value={<code>{detail.authorization.id}</code>} />
            <Fact label="有效期至" value={formatDateTime(detail.authorization.expiresAt)} />
            <Fact
              label="使用次数"
              value={`${detail.authorization.remainingUses} / ${detail.authorization.maxUses}`}
            />
            <Fact label="策略版本" value={detail.authorization.policyVersion} />
          </dl>
        </section>
      )}

      {detail.receipt && (
        <section className="evidence-group">
          <div className="evidence-heading">
            <FileCheck2 aria-hidden="true" size={15} />
            <h3>执行回执</h3>
            <span>成功</span>
          </div>
          <dl className="record-grid">
            <Fact label="回执 ID" value={<code>{detail.receipt.id}</code>} />
            <Fact label="产物引用" value={<code>{detail.receipt.artifactRef}</code>} />
            <Fact label="内容摘要" value={<code>{detail.receipt.contentDigest}</code>} />
            <Fact label="Provider" value={detail.receipt.providerVersion} />
            <Fact label="恢复所得" value={detail.receipt.recovered ? '是' : '否'} />
          </dl>
        </section>
      )}

      {detail.verification && (
        <section className="evidence-group">
          <div className="evidence-heading">
            {detail.verification.status === 'passed'
              ? <CheckCircle2 aria-hidden="true" size={15} />
              : <AlertTriangle aria-hidden="true" size={15} />}
            <h3>结果验证</h3>
            <span>{detail.verification.status === 'passed' ? '通过' : '失败'}</span>
          </div>
          <dl className="record-grid">
            <Fact label="结论" value={detail.verification.reason} />
            <Fact label="期望摘要" value={<code>{detail.verification.expectedDigest}</code>} />
            <Fact
              label="观测摘要"
              value={<code>{detail.verification.observedDigest ?? '未观测'}</code>}
            />
            <Fact label="验证器" value={detail.verification.verifierVersion} />
          </dl>
          {detail.verification.evidenceRefs.length > 0 && (
            <div className="evidence-refs">
              {detail.verification.evidenceRefs.map(reference => (
                <code key={reference}>{reference}</code>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fact-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Digest({ label, value }: { label: string; value: string }) {
  return (
    <div className="digest-block">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  )
}

function actionStatusIcon(status: ActionStatus) {
  if (status === 'succeeded') return <CheckCircle2 aria-hidden="true" size={14} />
  if (status === 'failed' || status === 'outcome_unknown') {
    return <AlertTriangle aria-hidden="true" size={14} />
  }
  if (status === 'cancelled') return <Ban aria-hidden="true" size={14} />
  if (status === 'authorized') return <ShieldCheck aria-hidden="true" size={14} />
  return (
    <CircleDashed
      className={status === 'executing' ? 'spin' : ''}
      aria-hidden="true"
      size={14}
    />
  )
}

function authorizationStatusLabel(status: NonNullable<ActionDetail['authorization']>['status']): string {
  if (status === 'active') return '有效'
  if (status === 'consumed') return '已使用'
  if (status === 'expired') return '已过期'
  return '已撤销'
}

function operationLabel(operation: string): string {
  return operation === 'artifact.write' ? '写入本地产物' : operation
}

function isActionTerminal(status: ActionStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled'
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(date)
}

function formatRelativeTime(value: string): string {
  const milliseconds = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return formatDateTime(value)
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
