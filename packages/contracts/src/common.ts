import { randomUUID } from 'node:crypto'
import { z } from 'zod'

export type JsonPrimitive = boolean | number | string | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.number(),
    z.string(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
)

export const IdentifierSchema = z.string().trim().min(1).max(128)
export const TimestampSchema = z.iso.datetime({ offset: true })
export const Sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const PrincipalSchema = z.object({
  authStrength: z.enum(['local_process', 'local_bearer']),
  id: IdentifierSchema,
  kind: z.enum(['owner', 'service']),
  ownerId: IdentifierSchema,
})
export type Principal = z.infer<typeof PrincipalSchema>

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}
