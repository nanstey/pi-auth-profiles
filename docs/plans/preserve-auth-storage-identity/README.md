# Preserve auth storage identity

- Status: testing
- Summary: Bind Pi's credential facade only at full process startup; profile changes require a full Pi process restart.

## Design
| Stage | Doc | Status |
| --- | --- | --- |
| Proposal | [proposal](./proposal.md) | done |

## Slices
| # | Slice | Spec | PR | Status |
| --- | --- | --- | --- | --- |
| 1 | Preserve credential-store identity | [proposal](./proposal.md#implementation) | — | testing |

## Decision log

- 2026-11-06 — Exclude `@gotgenes/pi-anthropic-auth`; this change is limited to the auth-profiles extension and does not rely on reviewing that package's source.
- 2026-11-06 — Do not rebind a running session. Pi cache warming can retain credential references after `ctx.waitForIdle()` resolves, so profile changes take effect only after restart.
- 2026-11-06 — Resolve and capture the profile and credential-file path at `session_start` with reason `startup`. Fresh-runtime reasons such as `new`, `resume`, and `fork` bind that captured path without re-reading configuration. `/reload` retains the runtime and does not activate profile changes; a reloaded extension reports the active profile as unavailable until process restart.
- 2026-11-06 — Pi chooses its initial model before extension `session_start`. When `auth.json` and the selected profile differ, users may need explicit model selection after startup until Pi provides an earlier lifecycle hook.
