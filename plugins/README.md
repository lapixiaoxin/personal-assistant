# Plugins

Each folder is one independently replaceable personal context or capability extension.

- `src/plugin.*` adapts the capability to DSH or another owned runtime.
- `src/domain/` contains portable data and rules; it must not import DSH or platform SDKs.
- `tests/` stays with the plugin.

Prefer a native DSH Skill, MCP service, Agent, or Cordis extension, then add only the personal configuration and thin adapter needed by lumi. A plugin does not inherit owner identity, action authority, retry permission, or completion evidence from the model or the calling Channel.
