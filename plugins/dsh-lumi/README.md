# @lumi/dsh-lumi-plugin

External DSH bundle for the portable lumi persona and personal-context adapter.

The bundle adds a `lumi` Agent Preset. Its plugin reads an explicitly configured `lumi.personal-context/v1` JSON snapshot, validates owner, purpose and content digest on every prompt assembly, and contributes the rendered snapshot as model-visible runtime context. `lumi_context_status` exposes only schema, purpose, revision, generation time and entry count.

This package does not own personal memory, authenticate users, read the lumi database or grant action authority. The snapshot is an adapter payload produced by a lumi-owned service. Any model-visible context becomes part of the DSH Session history.

Required environment when the bundle is active:

```text
LUMI_PERSONAL_CONTEXT_PATH=/absolute/path/to/snapshot.json
LUMI_OWNER_ID=stable-owner-id
```

The current P0 is for isolated validation only. Do not point it at a real personal-data export or a production profile.
