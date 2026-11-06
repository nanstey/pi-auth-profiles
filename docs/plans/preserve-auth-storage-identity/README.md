# Preserve auth storage identity

- Status: testing
- Summary: Bind Pi's credential facade to the configured auth profile at session startup; profile changes require a restart.

## Design
| Stage | Doc | Status |
| --- | --- | --- |
| Proposal | [proposal](./proposal.md) | done |

## Slices
| # | Slice | Spec | PR | Status |
| --- | --- | --- | --- | --- |
| 1 | Preserve credential-store identity | [proposal](./proposal.md#implementation) | — | testing |

## Decision log

- 2026-11-06 — `@gotgenes/pi-anthropic-auth` does not mutate credential storage. Fix the auth-profiles rebind path only.
- 2026-11-06 — Do not rebind a running session. Pi cache warming can retain credential references after `ctx.waitForIdle()` resolves, so profile changes take effect only after restart.
- 2026-11-06 — Bind and refresh `ctx.modelRegistry` only at `session_start` after resolving the configured profile.
