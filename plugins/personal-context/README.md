# @lumi/personal-context-plugin

Lumi-owned personal memory, context projection, and DSH adapter.

The package has two explicit layers:

- `src/domain/` owns the Harness-neutral memory records, correction/forgetting rules, purpose-scoped snapshot projection, canonical digest, and safe rendering.
- `src/plugin.js` is the DSH adapter. It reads an explicitly configured `lumi.personal-context/v1` JSON snapshot and contributes it as model-visible runtime context.

The plugin validates owner, purpose, shape, and content digest on every prompt assembly. `lumi_context_status` exposes only schema, purpose, revision, generation time, and entry count. It does not authenticate users, automatically read a memory database, or grant action authority. Any model-visible context becomes part of the DSH Session history.

Domain API:

- `@lumi/personal-context-plugin/memory`
- `@lumi/personal-context-plugin/context`

DSH bundle:

The package adds a `lumi` Agent Preset when installed as an external DSH bundle. The bundle contains no workspace dependency and remains usable without the lumi Host.

Required environment when the bundle is active:

```text
LUMI_PERSONAL_CONTEXT_PATH=/absolute/path/to/snapshot.json
LUMI_OWNER_ID=stable-owner-id
```

The server profile may load this plugin only when `personalContextPath` is explicitly configured. Use a purpose-scoped snapshot, keep it private, and remember that injected content becomes part of DSH Session history.
