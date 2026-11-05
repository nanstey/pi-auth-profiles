# Auth profile ancestor resolution

- Status: building
- Summary: Resolve project auth profiles from the nearest trusted ancestor settings file.

## Design
| Stage | Doc | Status |
| --- | --- | --- |
| Proposal | [proposal](./proposal.md) | done |

## Slices
| # | Slice | Spec | PR | Status |
| --- | --- | --- | --- | --- |
| 1 | Trusted ancestor profile resolution | [01-trusted-ancestor-resolution](./specs/01-trusted-ancestor-resolution.md) | | building |

## Decision log

- 2026-07-07 — Use a single slice. The installed Pi trust store resolves the nearest true/false ancestor entry, so settings lookup stops at the persisted trusted root for cwd.
