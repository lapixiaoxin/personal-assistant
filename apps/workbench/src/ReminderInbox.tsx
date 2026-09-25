import {
  Ban,
  Bell,
  BellRing,
  CalendarClock,
  Check,
  CircleDashed,
  Clock3,
  Plus,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LumiApiClient } from './api.ts'
import type {
  CapabilityDescriptor,
  HealthStatus,
  NotificationRecord,
  ReminderMisfirePolicy,
  ReminderRecord,
  ReminderStatus,
} from './types.ts'
import { WorkspaceSwitcher, type WorkspaceView } from './WorkspaceSwitcher.tsx'

type ReminderFilter = 'all' | 'scheduled' | 'terminal'

const reminderStatusLabels: Record<ReminderStatus, string> = {
  cancelled: '已取消',
  fired: '已触发',
  scheduled: '待提醒',
  skipped: '已跳过',
}

export function ReminderInbox({
  actionCount,
  api,
  notificationCount,
  onNotificationCountChange,
  onWorkspaceChange,
}: {
  actionCount: number
  api: LumiApiClient
  notificationCount: number
  onNotificationCountChange: (count: number) => void
  onWorkspaceChange: (view: WorkspaceView) => void
}) {
  const [health, setHealth] = useState<HealthStatus>()
  const [capabilities, setCapabilities] = useState<CapabilityDescriptor[]>([])
  const [reminders, setReminders] = useState<ReminderRecord[]>([])
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [filter, setFilter] = useState<ReminderFilter>('all')
  const [content, setContent] = useState('')
  const [fireAt, setFireAt] = useState(defaultReminderTime())
  const [misfirePolicy, setMisfirePolicy] = useState<ReminderMisfirePolicy>('latest')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)

  const refreshData = useCallback(async () => {
    const [nextReminders, nextNotifications] = await Promise.all([
      api.listReminders(),
      api.listNotifications(),
    ])
    setReminders(nextReminders)
    setNotifications(nextNotifications)
    onNotificationCountChange(
      nextNotifications.filter(notification => notification.status === 'unread').length,
    )
    setSelectedId(current => (
      current && nextReminders.some(reminder => reminder.id === current)
        ? current
        : nextReminders[0]?.id
    ))
    return nextReminders
  }, [api, onNotificationCountChange])

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextCapabilities] = await Promise.all([
        api.health(),
        api.capabilities(),
        refreshData(),
      ])
      setHealth(nextHealth)
      setCapabilities(nextCapabilities)
      setError(undefined)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [api, refreshData])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const hasScheduled = reminders.some(reminder => reminder.status === 'scheduled')
  useEffect(() => {
    if (!hasScheduled) return
    const timer = window.setInterval(() => {
      void refreshData().catch(cause => setError(errorMessage(cause)))
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [hasScheduled, refreshData])

  const filteredReminders = useMemo(() => reminders.filter((reminder) => {
    if (filter === 'scheduled') return reminder.status === 'scheduled'
    if (filter === 'terminal') return reminder.status !== 'scheduled'
    return true
  }), [filter, reminders])
  const selected = reminders.find(reminder => reminder.id === selectedId)

  const create = (): void => {
    if (!content.trim() || !fireAt || busy) return
    const parsedTime = new Date(fireAt)
    if (Number.isNaN(parsedTime.getTime())) {
      setError('提醒时间无效')
      return
    }
    setBusy('create')
    setError(undefined)
    void api.createReminder({
      content: content.trim(),
      fireAt: parsedTime.toISOString(),
      idempotencyKey: `reminder-${crypto.randomUUID()}`,
      misfirePolicy,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    })
      .then(async (created) => {
        setContent('')
        setFireAt(defaultReminderTime())
        setSelectedId(created.id)
        await refreshData()
      })
      .catch(cause => setError(errorMessage(cause)))
      .finally(() => setBusy(undefined))
  }

  const cancel = (): void => {
    if (!selected || selected.status !== 'scheduled' || busy) return
    setBusy('cancel')
    setError(undefined)
    void api.cancelReminder(selected.id)
      .then(() => refreshData())
      .catch(cause => setError(errorMessage(cause)))
      .finally(() => setBusy(undefined))
  }

  const acknowledge = (notificationId: string): void => {
    if (busy) return
    setBusy(notificationId)
    setError(undefined)
    void api.acknowledgeNotification(notificationId)
      .then(() => refreshData())
      .catch(cause => setError(errorMessage(cause)))
      .finally(() => setBusy(undefined))
  }

  return (
    <div className="app-shell reminder-shell">
      <aside className="task-sidebar reminder-sidebar" aria-label="提醒导航">
        <header className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>lumi</span>
        </header>

        <WorkspaceSwitcher
          actionCount={actionCount}
          notificationCount={notificationCount}
          onChange={onWorkspaceChange}
          value="reminders"
        />

        <div className="sidebar-section-title">
          <CalendarClock aria-hidden="true" size={16} />
          <span>提醒计划</span>
        </div>

        <div className="filter-tabs" role="tablist" aria-label="提醒筛选">
          {([
            ['all', '全部'],
            ['scheduled', '待提醒'],
            ['terminal', '已结束'],
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
          {loading && <div className="quiet-state">正在读取提醒…</div>}
          {!loading && filteredReminders.length === 0 && (
            <div className="quiet-state">没有符合条件的提醒</div>
          )}
          {filteredReminders.map(reminder => (
            <button
              className={reminder.id === selectedId ? 'task-row selected' : 'task-row'}
              key={reminder.id}
              onClick={() => setSelectedId(reminder.id)}
              type="button"
            >
              <span className={`state-dot reminder-${reminder.status}`} />
              <span className="task-row-copy">
                <strong>{reminder.content}</strong>
                <small>
                  {reminderStatusLabels[reminder.status]} · {formatDateTime(reminder.fireAt)}
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

      <main className="conversation reminder-conversation">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">主动提醒</p>
            <h1>提醒与通知</h1>
          </div>
          {notificationCount > 0 && (
            <span className="state-badge notification-unread">
              <BellRing aria-hidden="true" size={14} />
              {notificationCount} 条未读
            </span>
          )}
        </header>

        <section className="conversation-body reminder-body" aria-live="polite">
          <form className="reminder-editor" onSubmit={(event) => {
            event.preventDefault()
            create()
          }}>
            <label className="memory-content-field">
              <span>提醒内容</span>
              <textarea
                aria-label="提醒内容"
                maxLength={4_000}
                onChange={event => setContent(event.target.value)}
                placeholder="需要在什么时间提醒你"
                rows={3}
                value={content}
              />
            </label>
            <label className="reminder-time-field">
              <span>提醒时间</span>
              <input
                aria-label="提醒时间"
                min={localDateTimeValue(new Date())}
                onChange={event => setFireAt(event.target.value)}
                step="1"
                type="datetime-local"
                value={fireAt}
              />
            </label>
            <fieldset className="memory-status-field reminder-policy-field">
              <legend>错过时间</legend>
              <div className="segmented-control">
                <button
                  aria-pressed={misfirePolicy === 'latest'}
                  className={misfirePolicy === 'latest' ? 'active' : ''}
                  onClick={() => setMisfirePolicy('latest')}
                  type="button"
                >
                  下次启动提醒
                </button>
                <button
                  aria-pressed={misfirePolicy === 'skip'}
                  className={misfirePolicy === 'skip' ? 'active' : ''}
                  onClick={() => setMisfirePolicy('skip')}
                  type="button"
                >
                  过时跳过
                </button>
              </div>
            </fieldset>
            <button
              className="reminder-create-button"
              disabled={!content.trim() || !fireAt || busy !== undefined}
              type="submit"
            >
              {busy === 'create'
                ? <CircleDashed className="spin" aria-hidden="true" size={16} />
                : <Plus aria-hidden="true" size={16} />}
              创建提醒
            </button>
          </form>

          <section className="notification-section">
            <div className="action-section-heading">
              <Bell aria-hidden="true" size={16} />
              <h2>通知收件箱</h2>
            </div>
            {notifications.length === 0 && (
              <div className="quiet-state">暂无通知</div>
            )}
            <div className="notification-list">
              {notifications.map(notification => (
                <article
                  className={`notification-row notification-${notification.status}`}
                  key={notification.id}
                >
                  <span className="notification-icon">
                    {notification.status === 'unread'
                      ? <BellRing aria-hidden="true" size={17} />
                      : <Check aria-hidden="true" size={17} />}
                  </span>
                  <div>
                    <strong>{notification.content}</strong>
                    <small>{formatDateTime(notification.createdAt)}</small>
                  </div>
                  {notification.status === 'unread' && (
                    <button
                      aria-label={`确认通知 ${notification.content}`}
                      className="icon-button"
                      disabled={busy !== undefined}
                      onClick={() => acknowledge(notification.id)}
                      title="确认通知"
                      type="button"
                    >
                      <Check aria-hidden="true" size={16} />
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <X aria-hidden="true" size={16} />
            <span>{error}</span>
            <button aria-label="关闭错误" onClick={() => setError(undefined)} type="button">
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        )}
      </main>

      <aside className="details-panel reminder-details" aria-label="提醒详情">
        <div className="details-heading">
          <div>
            <p className="eyebrow">提醒详情</p>
            <h2>触发状态</h2>
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

        {!selected && <div className="quiet-state detail-empty">选择提醒后查看详情</div>}
        {selected && (
          <div className="reminder-detail-view">
            <span className={`state-badge reminder-${selected.status}`}>
              <Clock3 aria-hidden="true" size={14} />
              {reminderStatusLabels[selected.status]}
            </span>
            <h3>{selected.content}</h3>
            <dl className="action-facts reminder-facts">
              <Fact label="触发时间" value={formatDateTime(selected.fireAt)} />
              <Fact label="时区" value={selected.timezone} />
              <Fact
                label="错过时间"
                value={selected.misfirePolicy === 'latest' ? '下次启动提醒' : '过时跳过'}
              />
              <Fact label="提醒 ID" value={selected.id} mono />
            </dl>
            {selected.status === 'scheduled' && (
              <button
                className="cancel-button"
                disabled={busy !== undefined}
                onClick={cancel}
                type="button"
              >
                <Ban aria-hidden="true" size={16} />
                取消提醒
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function Fact({
  label,
  mono = false,
  value,
}: {
  label: string
  mono?: boolean
  value: string
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? 'mono-value' : undefined}>{value}</dd>
    </div>
  )
}

function defaultReminderTime(): string {
  return localDateTimeValue(new Date(Date.now() + 5 * 60_000))
}

function localDateTimeValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 19)
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
