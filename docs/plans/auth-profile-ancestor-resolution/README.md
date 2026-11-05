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

- 2026-07-07 — Use a single slice. Trusted sessions always consider cwd; ancestor lookup follows the installed Pi trust store's unbroken persisted `true` chain and stops at the first missing or `false` decision.
- 2026-07-07 — Validation passed with focused isolated trust scenarios; source review corrected implicit-trust and persisted-chain handling. PR #3 is open and ready for review.
