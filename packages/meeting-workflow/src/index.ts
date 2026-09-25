import type {
  ExecutionInput,
  ExecutionResult,
  TaskExecutor,
} from '@lumi/assistant-core'
import {
  createTaskRequest,
  type Principal,
  type TaskRecord,
  type TaskRequest,
} from '@lumi/contracts'
import type { TaskLedger } from '@lumi/task-ledger'
import { z } from 'zod'

export const MEETING_WORKFLOW_REFERENCE = 'lumi-workflow:meeting-brief/v1'
export const MEETING_BRIEF_START_MARKER = '<!-- lumi.meeting-brief/v1 -->'
export const MEETING_BRIEF_END_MARKER = '<!-- /lumi.meeting-brief/v1 -->'
export const MEETING_BRIEF_SECTIONS = [
  '## Objective',
  '## Participant Considerations',
  '## Agenda',
  '## Decisions and Questions',
  '## Risks and Preparation',
  '## Follow-ups',
] as const

const IdentifierSchema = z.string().trim().min(1).max(128)
const SingleLineSchema = (maxLength: number) => z.string()
  .transform(value => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(maxLength))
const MultilineSchema = (maxLength: number) => z.string()
  .transform(value => value.trim())
  .pipe(z.string().min(1).max(maxLength))

export const MeetingBriefSubmissionSchema = z.object({
  agenda: z.array(SingleLineSchema(500)).min(1).max(20),
  background: z.string().trim().max(6_000).optional(),
  id: IdentifierSchema.optional(),
  objective: MultilineSchema(2_000),
  participants: z.array(SingleLineSchema(200)).min(1).max(30),
  schemaVersion: z.literal('lumi.meeting-brief/v1').default('lumi.meeting-brief/v1'),
  topic: SingleLineSchema(300),
}).superRefine((value, context) => {
  const normalized = value.participants.map(participant => participant.toLowerCase())
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({
      code: 'custom',
      message: 'Meeting participants must be unique after normalization',
      path: ['participants'],
    })
  }
})
export type MeetingBriefSubmission = z.input<typeof MeetingBriefSubmissionSchema>
export type MeetingBrief = z.output<typeof MeetingBriefSubmissionSchema>

export interface MeetingTaskPort {
  submit(request: TaskRequest): Promise<TaskRecord>
}

export class MeetingWorkflowError extends Error {
  constructor(
    readonly code: 'PERMISSION_DENIED' | 'VERIFICATION_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'MeetingWorkflowError'
  }
}

export class MeetingBriefWorkflow {
  constructor(private readonly tasks: MeetingTaskPort) {}

  submit(principal: Principal, input: MeetingBriefSubmission): Promise<TaskRecord> {
    if (principal.kind !== 'owner') {
      throw new MeetingWorkflowError(
        'PERMISSION_DENIED',
        'Only the configured owner may submit a meeting brief',
      )
    }
    const brief = MeetingBriefSubmissionSchema.parse(input)
    return this.tasks.submit(createTaskRequest({
      actorId: principal.id,
      channel: 'meeting-brief',
      content: formatMeetingTaskContent(brief),
      contextRefs: [MEETING_WORKFLOW_REFERENCE],
      ...(brief.id ? { id: brief.id } : {}),
    }))
  }
}

export class MeetingBriefExecutor implements TaskExecutor {
  constructor(
    private readonly delegate: TaskExecutor,
    private readonly ledger: TaskLedger,
  ) {}

  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    const result = await this.delegate.execute(input)
    if (input.capability.id !== 'meeting-agent') return result

    const failure = meetingBriefVerificationFailure(result.output)
    if (failure) {
      this.#recordVerification(input, 'failed', failure)
      throw new MeetingWorkflowError('VERIFICATION_FAILED', failure)
    }
    this.#recordVerification(
      input,
      'passed',
      `Meeting brief contains all ${MEETING_BRIEF_SECTIONS.length} required sections`,
    )
    return result
  }

  async close(): Promise<void> {
    await this.delegate.close?.()
  }

  #recordVerification(
    input: ExecutionInput,
    status: 'failed' | 'passed',
    reason: string,
  ): void {
    this.ledger.appendEvent(input.task.id, 'verification.completed', {
      reason,
      sectionCount: MEETING_BRIEF_SECTIONS.length,
      status,
      verifierVersion: 'meeting-brief-structure/1',
      workflow: 'meeting-brief',
    })
    this.ledger.appendAudit({
      action: 'meeting.verify',
      actorId: input.task.actorId,
      detail: {
        reason,
        sectionCount: MEETING_BRIEF_SECTIONS.length,
        verifierVersion: 'meeting-brief-structure/1',
      },
      outcome: status === 'passed' ? 'succeeded' : 'failed',
      targetId: input.task.id,
    })
  }
}

export function formatMeetingTaskContent(brief: MeetingBrief): string {
  return [
    `Prepare a meeting brief for: ${brief.topic}`,
    '',
    'Meeting objective:',
    brief.objective,
    '',
    'Participants:',
    ...brief.participants.map(participant => `- ${participant}`),
    '',
    'Proposed agenda:',
    ...brief.agenda.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Background:',
    brief.background || 'No additional background was provided.',
  ].join('\n')
}

export function isMeetingWorkflowRequest(request: TaskRequest): boolean {
  return request.contextRefs.includes(MEETING_WORKFLOW_REFERENCE)
}

export function meetingBriefVerificationFailure(output: string): string | undefined {
  const lines = output.trim().split(/\r?\n/)
  if (lines[0]?.trim() !== MEETING_BRIEF_START_MARKER) {
    return `Meeting brief must start with ${MEETING_BRIEF_START_MARKER}`
  }
  if (lines.at(-1)?.trim() !== MEETING_BRIEF_END_MARKER) {
    return `Meeting brief must end with ${MEETING_BRIEF_END_MARKER}`
  }
  if (occurrences(lines, MEETING_BRIEF_START_MARKER) !== 1) {
    return 'Meeting brief contains a duplicate start marker'
  }
  if (occurrences(lines, MEETING_BRIEF_END_MARKER) !== 1) {
    return 'Meeting brief contains a duplicate end marker'
  }

  const sectionIndexes: number[] = []
  for (const section of MEETING_BRIEF_SECTIONS) {
    const indexes = lines.flatMap((line, index) => line.trim() === section ? [index] : [])
    if (indexes.length === 0) return `Meeting brief is missing required section: ${section}`
    if (indexes.length > 1) return `Meeting brief repeats required section: ${section}`
    sectionIndexes.push(indexes[0] ?? -1)
  }
  for (let index = 1; index < sectionIndexes.length; index++) {
    if ((sectionIndexes[index] ?? -1) <= (sectionIndexes[index - 1] ?? -1)) {
      return 'Meeting brief sections are out of order'
    }
  }
  for (let index = 0; index < sectionIndexes.length; index++) {
    const start = (sectionIndexes[index] ?? 0) + 1
    const end = index + 1 < sectionIndexes.length
      ? sectionIndexes[index + 1]
      : lines.length - 1
    if (lines.slice(start, end).join('\n').trim() === '') {
      return `Meeting brief section is empty: ${MEETING_BRIEF_SECTIONS[index]}`
    }
  }
  return undefined
}

function occurrences(lines: readonly string[], value: string): number {
  return lines.filter(line => line.trim() === value).length
}
