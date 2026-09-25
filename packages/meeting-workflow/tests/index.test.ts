import { describe, expect, it, vi } from 'vitest'
import type { ExecutionInput, TaskExecutor } from '@lumi/assistant-core'
import { createTaskRequest, type Principal } from '@lumi/contracts'
import { SqliteTaskLedger } from '@lumi/task-ledger'
import {
  MEETING_BRIEF_END_MARKER,
  MEETING_BRIEF_SECTIONS,
  MEETING_BRIEF_START_MARKER,
  MEETING_WORKFLOW_REFERENCE,
  MeetingBriefExecutor,
  MeetingBriefSubmissionSchema,
  MeetingBriefWorkflow,
  meetingBriefVerificationFailure,
} from '../src/index.ts'

const principal: Principal = {
  authStrength: 'local_process',
  id: 'meeting-owner',
  kind: 'owner',
  ownerId: 'owner-one',
}

describe('meeting brief workflow', () => {
  it('normalizes structured input into a server-owned workflow task', async () => {
    const submit = vi.fn(async request => ({
      ...request,
      capabilityId: null,
      dshSessionId: null,
      error: null,
      result: null,
      state: 'queued' as const,
      updatedAt: request.createdAt,
    }))
    const workflow = new MeetingBriefWorkflow({ submit })

    await workflow.submit(principal, {
      agenda: [' Review options ', 'Choose owner'],
      background: 'Budget is fixed.',
      id: 'meeting-one',
      objective: 'Choose the implementation path.',
      participants: [' Product lead ', 'Engineering lead'],
      schemaVersion: 'lumi.meeting-brief/v1',
      topic: ' Quarterly planning ',
    })

    const request = submit.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      actorId: principal.id,
      channel: 'meeting-brief',
      contextRefs: [MEETING_WORKFLOW_REFERENCE],
      id: 'meeting-one',
    })
    expect(request?.content).toContain('Prepare a meeting brief for: Quarterly planning')
    expect(request?.content).toContain('- Product lead')
    expect(request?.content).toContain('1. Review options')
  })

  it('rejects duplicate participants and empty agenda before task submission', async () => {
    const submit = vi.fn()
    const workflow = new MeetingBriefWorkflow({ submit })

    expect(() => workflow.submit(principal, {
      agenda: [],
      objective: 'Align',
      participants: ['Product', ' product '],
      topic: 'Planning',
    })).toThrow()
    expect(submit).not.toHaveBeenCalled()
  })

  it('rejects service principals', async () => {
    const workflow = new MeetingBriefWorkflow({ submit: vi.fn() })

    expect(() => workflow.submit({
      ...principal,
      kind: 'service',
    }, {
      agenda: ['Review'],
      objective: 'Align',
      participants: ['Product'],
      topic: 'Planning',
    })).toThrow('Only the configured owner')
  })

  it('bounds every structured field', () => {
    expect(() => MeetingBriefSubmissionSchema.parse({
      agenda: ['Review'],
      background: 'x'.repeat(6_001),
      objective: 'Align',
      participants: ['Product'],
      topic: 'Planning',
    })).toThrow()
    expect(() => MeetingBriefSubmissionSchema.parse({
      agenda: Array.from({ length: 21 }, (_, index) => `Item ${index}`),
      objective: 'Align',
      participants: ['Product'],
      topic: 'Planning',
    })).toThrow()
  })
})

describe('meeting brief verification', () => {
  it('accepts one ordered non-empty body for every required section', () => {
    expect(meetingBriefVerificationFailure(validBrief())).toBeUndefined()
  })

  it.each([
    ['missing start marker', validBrief().replace(`${MEETING_BRIEF_START_MARKER}\n`, '')],
    ['missing end marker', validBrief().replace(`\n${MEETING_BRIEF_END_MARKER}`, '')],
    ['missing section', validBrief().replace('## Follow-ups\nBody 6\n', '')],
    [
      'repeated section',
      validBrief().replace('## Agenda\nBody 3', '## Agenda\nBody 3\n## Agenda\nAgain'),
    ],
    [
      'out of order sections',
      validBrief()
        .replace('## Agenda', '## TEMP')
        .replace('## Decisions and Questions', '## Agenda')
        .replace('## TEMP', '## Decisions and Questions'),
    ],
    ['empty section', validBrief().replace('## Agenda\nBody 3\n', '## Agenda\n\n')],
  ])('rejects %s', (_label, output) => {
    expect(meetingBriefVerificationFailure(output)).toBeTruthy()
  })

  it('records passed verification without copying meeting background to audit', async () => {
    const ledger = new SqliteTaskLedger({ filename: ':memory:' })
    const task = meetingTask('meeting-verified')
    ledger.createTask(task)
    const delegate: TaskExecutor = {
      execute: async () => ({ output: validBrief(), sessionId: 'meeting-session' }),
    }
    const executor = new MeetingBriefExecutor(delegate, ledger)

    await expect(executor.execute(executionInput(task))).resolves.toEqual({
      output: validBrief(),
      sessionId: 'meeting-session',
    })
    expect(ledger.listEvents(task.id)).toContainEqual(expect.objectContaining({
      payload: expect.objectContaining({
        status: 'passed',
        verifierVersion: 'meeting-brief-structure/1',
      }),
      type: 'verification.completed',
    }))
    expect(JSON.stringify(ledger.listAudit(task.id))).not.toContain('Confidential background')
    ledger.close()
  })

  it('fails the execution when a required section is empty', async () => {
    const ledger = new SqliteTaskLedger({ filename: ':memory:' })
    const task = meetingTask('meeting-invalid')
    ledger.createTask(task)
    const delegate: TaskExecutor = {
      execute: async () => ({
        output: validBrief().replace('## Agenda\nBody 3\n', '## Agenda\n\n'),
      }),
    }
    const executor = new MeetingBriefExecutor(delegate, ledger)

    await expect(executor.execute(executionInput(task)))
      .rejects.toThrow('Meeting brief section is empty: ## Agenda')
    expect(ledger.listAudit(task.id)).toContainEqual(expect.objectContaining({
      action: 'meeting.verify',
      outcome: 'failed',
    }))
    ledger.close()
  })
})

function validBrief(): string {
  return [
    MEETING_BRIEF_START_MARKER,
    ...MEETING_BRIEF_SECTIONS.flatMap((section, index) => [
      section,
      `Body ${index + 1}`,
    ]),
    MEETING_BRIEF_END_MARKER,
  ].join('\n')
}

function meetingTask(id: string) {
  return createTaskRequest({
    actorId: principal.id,
    channel: 'meeting-brief',
    content: 'Confidential background',
    contextRefs: [MEETING_WORKFLOW_REFERENCE],
    id,
  })
}

function executionInput(task: ReturnType<typeof meetingTask>): ExecutionInput {
  return {
    capability: {
      description: 'Meeting preparation',
      id: 'meeting-agent',
      kind: 'agent',
      operations: ['synthesize_meeting_brief'],
      riskLevel: 'read',
    },
    emit: () => undefined,
    signal: new AbortController().signal,
    task,
  }
}
