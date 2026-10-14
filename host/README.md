# Host

The Host is lumi's only persistent process and composition root.

- `server.js` starts and stops the DSH SDK process.
- `plugin.js` composes configured channels with native DSH Agents.
- `channel-host.js` maps the durable inbox to Agent create/resume/followup/cancel.
- `channel-store.js` owns input deduplication, session mappings, reply intent, and receipts.
- `config.js`, `main.js`, and `status.js` own local configuration and operations.

The Host may depend on a Channel package and DSH. It must not implement platform protocols, personal capability logic, planning, or a second Agent loop. Add a terminal under `channels/` and a capability under `plugins/`; only their composition belongs here.
