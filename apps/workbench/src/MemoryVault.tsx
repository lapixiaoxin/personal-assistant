import {
  Brain,
  Check,
  CircleDashed,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Wifi,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  LumiApiClient,
  MemoryInput,
} from './api.ts'
import type {
  MemoryClassification,
  MemoryKind,
  MemoryPurpose,
  MemoryScope,
  MemoryStatus,
  PersonalMemory,
} from './types.ts'
import { WorkspaceSwitcher, type WorkspaceView } from './WorkspaceSwitcher.tsx'

type MemoryFilter = 'all' | MemoryStatus
type EditorMode = 'create' | 'correct'

const statusLabels: Record<MemoryStatus, string> = {
  candidate: '候选',
  confirmed: '已确认',
  retracted: '已撤回',
}

const kindLabels: Record<MemoryKind, string> = {
  experience: '经历',
  fact: '事实',
  preference: '偏好',
  relationship: '关系',
}

const scopeLabels: Record<MemoryScope, string> = {
  coding: '编程',
  general: '日常',
  global: '全局',
  meeting: '会议',
  research: '研究',
}

const classificationLabels: Record<MemoryClassification, string> = {
  personal: '个人',
  public: '公开',
  secret: '秘密',
  sensitive: '敏感',
}

const purposeLabels: Record<MemoryPurpose, string> = {
  coding: '编程',
  general_assistance: '日常助手',
  meeting: '会议',
  research: '研究',
}

const allPurposes = Object.keys(purposeLabels) as MemoryPurpose[]

interface MemoryVaultProps {
  actionCount: number
  api: LumiApiClient
  onWorkspaceChange: (view: WorkspaceView) => void
}

export function MemoryVault({
  actionCount,
  api,
  onWorkspaceChange,
}: MemoryVaultProps) {
  const [memories, setMemories] = useState<PersonalMemory[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [filter, setFilter] = useState<MemoryFilter>('all')
  const [editorMode, setEditorMode] = useState<EditorMode>()
  const [content, setContent] = useState('')
  const [kind, setKind] = useState<MemoryKind>('preference')
  const [scope, setScope] = useState<MemoryScope>('global')
  const [classification, setClassification] = useState<MemoryClassification>('personal')
  const [purposes, setPurposes] = useState<MemoryPurpose[]>(['general_assistance'])
  const [createStatus, setCreateStatus] = useState<Extract<MemoryStatus, 'candidate' | 'confirmed'>>(
    'confirmed',
  )
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [confirmForget, setConfirmForget] = useState(false)

  const refresh = useCallback(async () => {
    const next = await api.listMemories()
    setMemories(next)
    setSelectedId(current => current && next.some(memory => memory.id === current)
      ? current
      : next[0]?.id)
    return next
  }, [api])

  useEffect(() => {
    void refresh()
      .catch(cause => setError(errorMessage(cause)))
      .finally(() => setLoading(false))
  }, [refresh])

  const selected = memories.find(memory => memory.id === selectedId)
  const filtered = useMemo(
    () => memories.filter(memory => filter === 'all' || memory.status === filter),
    [filter, memories],
  )

  const startCreate = (): void => {
    setSelectedId(undefined)
    setEditorMode('create')
    setContent('')
    setKind('preference')
    setScope('global')
    setClassification('personal')
    setPurposes(['general_assistance'])
    setCreateStatus('confirmed')
    setConfirmForget(false)
    setError(undefined)
  }

  const startCorrection = (): void => {
    if (!selected || selected.status === 'retracted') return
    setEditorMode('correct')
    setContent(selected.content)
    setKind(selected.kind)
    setScope(selected.scope)
    setClassification(selected.classification)
    setPurposes(selected.allowedPurposes)
    setConfirmForget(false)
    setError(undefined)
  }

  const selectMemory = (memoryId: string): void => {
    setSelectedId(memoryId)
    setEditorMode(undefined)
    setConfirmForget(false)
    setError(undefined)
  }

  const save = (): void => {
    if (!content.trim() || purposes.length === 0 || busy) return
    setBusy('save')
    setError(undefined)
    const input: MemoryInput = {
      allowedPurposes: purposes,
      classification,
      content: content.trim(),
      kind,
      scope,
      status: createStatus,
    }
    const operation = editorMode === 'correct' && selected
      ? api.correctMemory(selected.id, {
          allowedPurposes: purposes,
          classification,
          content: content.trim(),
          kind,
          scope,
        })
      : api.createMemory(input)
    void operation
      .then(async memory => {
        await refresh()
        setSelectedId(memory.id)
        setEditorMode(undefined)
      })
      .catch(cause => setError(errorMessage(cause)))
      .finally(() => setBusy(undefined))
  }

  const command = (operation: 'confirm' | 'retract'): void => {
    if (!selected || busy) return
    setBusy(operation)
    setError(undefined)
    const request = operation === 'confirm'
      ? api.confirmMemory(selected.id)
      : api.retractMemory(selected.id)
    void request
      .then(async memory => {
        await refresh()
        setSelectedId(memory.id)
      })
      .catch(cause => setError(errorMessage(cause)))
      .finally(() => setBusy(undefined))
  }

  const forget = (): void => {
    if (!selected || busy) return
    if (!confirmForget) {
      setConfirmForget(true)
      return
    }
    setBusy('forget')
    setError(undefined)
    void api.forgetMemory(selected.id)
      .then(async () => {
        setSelectedId(undefined)
        setConfirmForget(false)
        await refresh()
      })
      .catch(cause => setError(errorMessage(cause)))
      .finally(() => setBusy(undefined))
  }

  return (
    <div className="app-shell memory-shell">
      <aside className="task-sidebar" aria-label="记忆导航">
        <header className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>lumi</span>
        </header>

        <WorkspaceSwitcher
          actionCount={actionCount}
          onChange={onWorkspaceChange}
          value="memories"
        />

        <button className="new-task-button" onClick={startCreate} type="button">
          <Plus aria-hidden="true" size={17} />
          新增记忆
        </button>

        <div className="memory-filter" role="tablist" aria-label="记忆筛选">
          {([
            ['all', '全部'],
            ['candidate', '候选'],
            ['confirmed', '确认'],
            ['retracted', '撤回'],
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
          {loading && <div className="quiet-state">正在读取记忆…</div>}
          {!loading && filtered.length === 0 && (
            <div className="quiet-state">暂无符合条件的记忆</div>
          )}
          {filtered.map(memory => (
            <button
              className={memory.id === selectedId ? 'task-row selected' : 'task-row'}
              key={memory.id}
              onClick={() => selectMemory(memory.id)}
              type="button"
            >
              <span className={`state-dot memory-${memory.status}`} />
              <span className="task-row-copy">
                <strong>{memory.content}</strong>
                <small>{statusLabels[memory.status]} · v{memory.revision}</small>
              </span>
            </button>
          ))}
        </div>

        <footer className="connection">
          <Wifi aria-hidden="true" size={15} />
          <span>本地记忆库</span>
          <span className="capability-count">{memories.length} 条</span>
        </footer>
      </aside>

      <main className="conversation memory-workspace">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">个人上下文</p>
            <h1>
              {editorMode === 'create'
                ? '新增记忆'
                : editorMode === 'correct'
                  ? '纠正记忆'
                  : selected
                    ? kindLabels[selected.kind]
                    : '记忆库'}
            </h1>
          </div>
          {selected && !editorMode && (
            <span className={`state-badge memory-${selected.status}`}>
              <Brain aria-hidden="true" size={14} />
              {statusLabels[selected.status]}
            </span>
          )}
        </header>

        <section className="conversation-body memory-body" aria-live="polite">
          {editorMode
            ? (
                <MemoryEditor
                  classification={classification}
                  content={content}
                  createStatus={createStatus}
                  kind={kind}
                  mode={editorMode}
                  onClassificationChange={setClassification}
                  onContentChange={setContent}
                  onKindChange={setKind}
                  onPurposeToggle={purpose => setPurposes(current =>
                    current.includes(purpose)
                      ? current.filter(value => value !== purpose)
                      : [...current, purpose],
                  )}
                  onScopeChange={setScope}
                  onStatusChange={setCreateStatus}
                  purposes={purposes}
                  scope={scope}
                />
              )
            : selected
              ? (
                  <article className="memory-record">
                    <div className="memory-record-icon">
                      {selected.classification === 'sensitive'
                        || selected.classification === 'secret'
                        ? <LockKeyhole aria-hidden="true" size={20} />
                        : <Brain aria-hidden="true" size={20} />}
                    </div>
                    <p>{selected.content}</p>
                    <div className="memory-tags">
                      <span>{kindLabels[selected.kind]}</span>
                      <span>{scopeLabels[selected.scope]}</span>
                      <span>{classificationLabels[selected.classification]}</span>
                      {selected.allowedPurposes.map(purpose => (
                        <span key={purpose}>{purposeLabels[purpose]}</span>
                      ))}
                    </div>
                  </article>
                )
              : (
                  <div className="empty-view">
                    <span className="empty-mark"><Brain aria-hidden="true" size={25} /></span>
                    <h2>个人记忆</h2>
                    <p>暂无已选择的记忆。</p>
                  </div>
                )}
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <ShieldCheck aria-hidden="true" size={16} />
            <span>{error}</span>
            <button aria-label="关闭错误" onClick={() => setError(undefined)} title="关闭" type="button">
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        )}

        {editorMode && (
          <div className="memory-save-bar">
            <button
              className="secondary-command"
              disabled={busy !== undefined}
              onClick={() => setEditorMode(undefined)}
              type="button"
            >
              <X aria-hidden="true" size={16} />
              取消
            </button>
            <button
              className="primary-command"
              disabled={!content.trim() || purposes.length === 0 || busy !== undefined}
              onClick={save}
              type="button"
            >
              {busy === 'save'
                ? <CircleDashed className="spin" aria-hidden="true" size={16} />
                : <Save aria-hidden="true" size={16} />}
              保存
            </button>
          </div>
        )}
      </main>

      <aside className="details-panel" aria-label="记忆详情">
        <div className="details-heading">
          <div>
            <p className="eyebrow">记忆详情</p>
            <h2>控制与范围</h2>
          </div>
          <button
            aria-label="刷新"
            className="icon-button"
            onClick={() => void refresh().catch(cause => setError(errorMessage(cause)))}
            title="刷新"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={17} />
          </button>
        </div>

        {selected && !editorMode
          ? (
              <>
                <dl className="memory-facts">
                  <Fact label="状态" value={statusLabels[selected.status]} />
                  <Fact label="版本" value={`v${selected.revision}`} />
                  <Fact label="类型" value={kindLabels[selected.kind]} />
                  <Fact label="范围" value={scopeLabels[selected.scope]} />
                  <Fact label="分级" value={classificationLabels[selected.classification]} />
                  <Fact
                    label="用途"
                    value={selected.allowedPurposes.map(value => purposeLabels[value]).join('、')}
                  />
                  <Fact label="来源" value={selected.source} />
                  <Fact label="更新时间" value={formatTime(selected.updatedAt)} />
                </dl>

                <div className="memory-commands">
                  {selected.status === 'candidate' && (
                    <button
                      className="primary-command"
                      disabled={busy !== undefined}
                      onClick={() => command('confirm')}
                      type="button"
                    >
                      <Check aria-hidden="true" size={16} />
                      确认记忆
                    </button>
                  )}
                  {selected.status !== 'retracted' && (
                    <>
                      <button
                        className="secondary-command"
                        disabled={busy !== undefined}
                        onClick={startCorrection}
                        type="button"
                      >
                        <Pencil aria-hidden="true" size={16} />
                        纠正
                      </button>
                      <button
                        className="secondary-command"
                        disabled={busy !== undefined}
                        onClick={() => command('retract')}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" size={16} />
                        撤回
                      </button>
                    </>
                  )}
                  <button
                    className={confirmForget ? 'danger-command armed' : 'danger-command'}
                    disabled={busy !== undefined}
                    onClick={forget}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                    {confirmForget ? '确认彻底遗忘' : '彻底遗忘'}
                  </button>
                </div>
              </>
            )
          : <div className="quiet-state detail-empty">选择记忆后查看控制项</div>}
      </aside>
    </div>
  )
}

function MemoryEditor({
  classification,
  content,
  createStatus,
  kind,
  mode,
  onClassificationChange,
  onContentChange,
  onKindChange,
  onPurposeToggle,
  onScopeChange,
  onStatusChange,
  purposes,
  scope,
}: {
  classification: MemoryClassification
  content: string
  createStatus: Extract<MemoryStatus, 'candidate' | 'confirmed'>
  kind: MemoryKind
  mode: EditorMode
  onClassificationChange: (value: MemoryClassification) => void
  onContentChange: (value: string) => void
  onKindChange: (value: MemoryKind) => void
  onPurposeToggle: (value: MemoryPurpose) => void
  onScopeChange: (value: MemoryScope) => void
  onStatusChange: (value: Extract<MemoryStatus, 'candidate' | 'confirmed'>) => void
  purposes: MemoryPurpose[]
  scope: MemoryScope
}) {
  return (
    <div className="memory-editor">
      <label className="memory-content-field">
        <span>记忆内容</span>
        <textarea
          aria-label="记忆内容"
          maxLength={4_000}
          onChange={event => onContentChange(event.target.value)}
          rows={7}
          value={content}
        />
      </label>

      <div className="memory-field-grid">
        <SelectField
          label="类型"
          onChange={value => onKindChange(value as MemoryKind)}
          options={kindLabels}
          value={kind}
        />
        <SelectField
          label="适用范围"
          onChange={value => onScopeChange(value as MemoryScope)}
          options={scopeLabels}
          value={scope}
        />
        <SelectField
          label="数据分级"
          onChange={value => onClassificationChange(value as MemoryClassification)}
          options={classificationLabels}
          value={classification}
        />
      </div>

      <fieldset className="memory-purpose-field">
        <legend>允许用途</legend>
        <div className="memory-purpose-options">
          {allPurposes.map(purpose => (
            <label key={purpose}>
              <input
                checked={purposes.includes(purpose)}
                onChange={() => onPurposeToggle(purpose)}
                type="checkbox"
              />
              <span>{purposeLabels[purpose]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === 'create' && (
        <fieldset className="memory-status-field">
          <legend>初始状态</legend>
          <div className="segmented-control">
            <button
              aria-pressed={createStatus === 'confirmed'}
              className={createStatus === 'confirmed' ? 'active' : ''}
              onClick={() => onStatusChange('confirmed')}
              type="button"
            >
              已确认
            </button>
            <button
              aria-pressed={createStatus === 'candidate'}
              className={createStatus === 'candidate' ? 'active' : ''}
              onClick={() => onStatusChange('candidate')}
              type="button"
            >
              候选
            </button>
          </div>
        </fieldset>
      )}
    </div>
  )
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: Record<string, string>
  value: string
}) {
  return (
    <label className="memory-select-field">
      <span>{label}</span>
      <select aria-label={label} onChange={event => onChange(event.target.value)} value={value}>
        {Object.entries(options).map(([option, labelText]) => (
          <option key={option} value={option}>{labelText}</option>
        ))}
      </select>
    </label>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
