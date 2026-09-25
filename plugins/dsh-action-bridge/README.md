# @lumi/dsh-action-bridge-plugin

Cordis plugin for the protected lumi `personal-assistant` DSH profile.

It conditionally registers these model-facing tools:

- `lumi_artifact_prepare`: sends an `artifact.write` proposal to the per-Run Host bridge.
- `lumi_action_execute`: executes only an authorized Action explicitly referenced by the current Task.
- `lumi_public_web_fetch`: fetches only an exact public HTTPS source declared by a structured research Task.

The Host enables only the tools needed by a Run. The protected personal profile receives Action tools; the research profile receives the public-source tool and no Action tools; the meeting profile receives no Host tools and uses the bridge only for guard installation and the startup handshake. The plugin also installs a global, monotonic DSH tool guard. The allowlist contains read-only workspace discovery, DSH-internal coordination tools and the three possible Host tools; every unknown tool fails closed. This is intentional so a DSH upgrade cannot silently add a new executable surface.

The Host injects `LUMI_ACTION_BRIDGE_URL` and `LUMI_ACTION_BRIDGE_TOKEN` for one Run, plus explicit action/research enable flags. The plugin accepts only an HTTP loopback origin and performs a startup handshake before the adapter sends a model prompt. It does not receive the Gateway token, ActionService, SQLite handle, artifact path, research storage path or Connector credentials.

This is trusted profile composition, not an OS sandbox. Do not load unreviewed plugins into the same DSH process or place production secrets in its workspace/environment.
