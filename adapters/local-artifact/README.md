# @lumi/local-artifact

`@lumi/local-artifact` implements the `ArtifactProvider` port from `@lumi/action-runtime` for one owner-controlled local directory.

The adapter accepts only validated artifact IDs, resolves a server-owned target path, rejects symlink roots and targets, writes through an exclusive temporary file/link, and supports independent digest read-back. It does not own authorization, Task state or verification decisions.

The three provider types remain re-exported from this package for source compatibility, but new consumers should import the port from `@lumi/action-runtime`. Composition belongs in `apps/runtime`.
