# @lumi/action-runtime

`@lumi/action-runtime` owns the deterministic Action service and the provider port used to perform and read back an approved effect.

## Boundary

- `ActionService` coordinates policy, ledger state, provider execution, reconciliation and verification.
- `ArtifactProvider` is defined in this package because the application service consumes it.
- Concrete filesystem or external-system implementations belong under `adapters/`.
- Provider failures expose only the bounded `CONFLICT` or `INVALID_INPUT` code needed by the service; the service does not import adapter error classes.

The package may depend on contracts, policy and ledger ports. It must not depend on an adapter, app or plugin. `apps/runtime` selects and injects the concrete provider.
