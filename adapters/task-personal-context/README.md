# @lumi/task-personal-context

Compatibility adapter between the Harness-neutral personal-context port and the current lumi `TaskExecutor`.

For explicitly mapped capabilities, it requests a purpose-scoped snapshot, appends the shared model-facing data block to the transient execution input, and records a `memory.context_attached` event containing only IDs and revisions. It does not modify the persisted Task request.

This package owns the current Task / Ledger coupling. `@lumi/personal-memory` and `@lumi/personal-context` remain independent of Assistant Core and DSH so another Agent Harness or interaction surface can reuse them.
