import type { RunInTransaction, SqliteDatabase } from './types.ts'

const LATEST_SCHEMA_VERSION = 3

export function migrateTaskLedger(
  db: SqliteDatabase,
  now: () => string,
  transaction: RunInTransaction,
): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)
  const versionRow = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (versionRow.user_version > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${versionRow.user_version} is newer than supported version ${LATEST_SCHEMA_VERSION}`,
    )
  }
  if (versionRow.user_version < 1) {
    transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          actor_id TEXT NOT NULL,
          channel TEXT NOT NULL,
          content TEXT NOT NULL,
          context_refs TEXT NOT NULL,
          state TEXT NOT NULL,
          capability_id TEXT,
          result TEXT,
          error TEXT,
          dsh_session_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS task_events (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id),
          sequence INTEGER NOT NULL,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          UNIQUE(task_id, sequence)
        );

        CREATE INDEX IF NOT EXISTS task_events_task_idx
          ON task_events(task_id, sequence);

        CREATE TABLE IF NOT EXISTS audit_records (
          id TEXT PRIMARY KEY,
          actor_id TEXT NOT NULL,
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          outcome TEXT NOT NULL,
          detail TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS audit_target_idx
          ON audit_records(target_id, created_at);

        CREATE TABLE IF NOT EXISTS approvals (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id),
          risk_level TEXT NOT NULL,
          reason TEXT NOT NULL,
          status TEXT NOT NULL,
          requested_at TEXT NOT NULL,
          decided_at TEXT,
          decided_by TEXT
        );

        CREATE INDEX IF NOT EXISTS approvals_task_idx
          ON approvals(task_id, requested_at);

        PRAGMA user_version = 1;
      `)
    })
  }
  if (versionRow.user_version < 2) {
    transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS migration_history (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS actions (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),
          schema_version TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          target TEXT NOT NULL,
          input_digest TEXT NOT NULL,
          input_ref TEXT NOT NULL,
          action_digest TEXT NOT NULL,
          capability TEXT NOT NULL,
          effect TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          deadline TEXT,
          status TEXT NOT NULL,
          authorization_id TEXT,
          receipt_id TEXT,
          verification_id TEXT,
          cancellation_requested_at TEXT,
          revocation_epoch INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(owner_id, operation, idempotency_key)
        );

        CREATE INDEX IF NOT EXISTS actions_owner_idx
          ON actions(owner_id, created_at);

        CREATE TABLE IF NOT EXISTS action_inputs (
          action_id TEXT PRIMARY KEY REFERENCES actions(id),
          content TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS authorizations (
          id TEXT PRIMARY KEY,
          action_id TEXT NOT NULL UNIQUE REFERENCES actions(id),
          schema_version TEXT NOT NULL,
          action_digest TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          capability_version TEXT NOT NULL,
          max_uses INTEGER NOT NULL,
          remaining_uses INTEGER NOT NULL,
          expires_at TEXT NOT NULL,
          revocation_epoch INTEGER NOT NULL,
          policy_version TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS action_receipts (
          id TEXT PRIMARY KEY,
          action_id TEXT NOT NULL UNIQUE REFERENCES actions(id),
          schema_version TEXT NOT NULL,
          status TEXT NOT NULL,
          artifact_ref TEXT NOT NULL,
          content_digest TEXT NOT NULL,
          provider_version TEXT NOT NULL,
          recovered INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS verifications (
          id TEXT PRIMARY KEY,
          action_id TEXT NOT NULL UNIQUE REFERENCES actions(id),
          task_id TEXT NOT NULL REFERENCES tasks(id),
          schema_version TEXT NOT NULL,
          verifier_version TEXT NOT NULL,
          status TEXT NOT NULL,
          expected_digest TEXT NOT NULL,
          observed_digest TEXT,
          evidence_refs TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        PRAGMA user_version = 2;
      `)
      const appliedAt = now()
      db.prepare(`
        INSERT OR IGNORE INTO migration_history (version, name, applied_at)
        VALUES (1, 'initial-task-ledger', ?)
      `).run(appliedAt)
      db.prepare(`
        INSERT OR IGNORE INTO migration_history (version, name, applied_at)
        VALUES (2, 'action-boundary', ?)
      `).run(appliedAt)
    })
  }
  if (versionRow.user_version < 3) {
    transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_recoveries (
          id TEXT PRIMARY KEY,
          schema_version TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),
          action_id TEXT REFERENCES actions(id),
          disposition TEXT NOT NULL,
          reason_code TEXT NOT NULL,
          safe_to_retry INTEGER NOT NULL,
          status TEXT NOT NULL,
          replacement_task_id TEXT,
          replacement_created_at TEXT,
          resolution TEXT,
          detected_at TEXT NOT NULL,
          resolved_at TEXT
        );

        CREATE INDEX IF NOT EXISTS task_recoveries_owner_status_idx
          ON task_recoveries(owner_id, principal_id, status, detected_at);

        CREATE UNIQUE INDEX IF NOT EXISTS task_recoveries_action_idx
          ON task_recoveries(action_id)
          WHERE action_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS runtime_recovery_lease (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          runtime_id TEXT NOT NULL,
          pid INTEGER NOT NULL,
          started_at TEXT NOT NULL
        );

        PRAGMA user_version = 3;
      `)
      db.prepare(`
        INSERT OR IGNORE INTO migration_history (version, name, applied_at)
        VALUES (3, 'task-recovery', ?)
      `).run(now())
    })
  }
}
