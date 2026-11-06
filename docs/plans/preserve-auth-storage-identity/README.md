# Preserve auth storage identity

- Status: testing
- Summary: Keep Pi's live credential facade bound to the selected auth profile after `/profile use`.

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
- 2026-11-06 — Rebind only after `ctx.waitForIdle()`, preserving Pi's `RuntimeCredentials` facade while replacing its backing file store.
- 2026-11-06 — Refresh `ctx.modelRegistry` after rebinding so `/login` reflects the selected profile's credentials.
