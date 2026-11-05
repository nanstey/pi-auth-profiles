# Auth profile ancestor resolution

- Status: done
- Summary: Resolve project auth profiles from the nearest trusted ancestor settings file.

## Design
| Stage | Doc | Status |
| --- | --- | --- |
| Proposal | [proposal](./proposal.md) | done |

## Slices
| # | Slice | Spec | PR | Status |
| --- | --- | --- | --- | --- |
| 1 | Trusted ancestor profile resolution | [01-trusted-ancestor-resolution](./specs/01-trusted-ancestor-resolution.md) | [#3](https://github.com/nanstey/pi-auth-profiles/pull/3) | review-ready |

## Decision log

- 2026-07-07 — Use a single slice. The installed Pi trust store resolves the nearest true/false ancestor entry, so settings lookup stops at the persisted trusted root for cwd.
- 2026-07-07 — Validation passed with `bun /tmp/verify-auth-profiles-walk-up.mjs`; cross-model source review found no verified issues. PR #3 is open and ready for review.
