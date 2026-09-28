# @lumi/personal-context

Harness-neutral projection of lumi-owned personal memory.

The package selects model-eligible records through `PersonalMemoryService`, creates a versioned `lumi.personal-context/v1` snapshot, verifies its canonical SHA-256 revision, and renders the model-facing data block used by adapters.

It does not know about DSH, Task execution, HTTP, UI, devices or storage migrations. A Harness adapter may consume a snapshot, but the snapshot and underlying records remain lumi domain data.

Public API:

- `PersonalContextService.snapshot(request)`
- `PersonalContextSnapshotSchema`
- `parsePersonalContextSnapshot(input, expectations)`
- `renderPersonalContext(snapshot)`
- `appendPersonalContext(content, snapshot)`
- `computePersonalContextRevision(snapshot)`

Snapshots can contain personal content. Do not log them, commit them, or treat them as authorization.
