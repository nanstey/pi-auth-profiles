# Auth profile ancestor resolution

## Purpose

A shared account folder such as `~/Code/noelcf` can select an auth profile for all nested repositories. The extension currently reads only `cwd/.pi/settings.json`. It must use the closest ancestor settings file with a non-empty `authProfile`, without accepting profile settings from untrusted locations.

## User story and scenarios

- Given `~/Code/noelcf/.pi/settings.json` selects `work` and a session runs in `~/Code/noelcf/expedition-2`, the active profile is `work` when the session and the settings directory are trusted.
- Given both an ancestor and cwd settings file select profiles, the cwd profile wins.
- Given a candidate settings directory is untrusted, its profile is ignored and normal global/default resolution continues.
- Given `/profile show`, it identifies the settings file supplying the profile. `/profile use` and `/profile clear` continue to write only `cwd/.pi/settings.json`.

## Behaviour

Pi's `ProjectTrustStore` canonicalizes a path, then walks its ancestors in `~/.pi/agent/trust.json` for the nearest `true` or `false` decision. A `true` trust entry applies to descendants and a nearer `false` overrides it. The extension will require both `ctx.isProjectTrusted()` and a persisted nearest `true` trust entry for the cwd. It searches only from cwd to that trusted entry's directory. This prevents settings above a cwd-only or session-only trust grant from supplying a profile.

Malformed settings or trust JSON, empty `authProfile`, and invalid profile names retain existing safe behaviour: no project profile is selected or the existing error is reported for an invalid selected name.

## QA

- Run the repository's available package validation. There is no test script, test directory, lockfile, or local dependencies in the baseline.
- Exercise the pure resolution helpers through a temporary copy of `trust.json` and nested settings directories: ancestor selection, cwd override, untrusted candidate rejection, and fallback.
- Inspect the final diff and type-check/syntax-check using available Pi/TypeScript tooling.

## Architecture

Use Pi's public `ProjectTrustStore` export together with `ctx.isProjectTrusted()`. The store returns the persisted canonical trusted root for cwd; a local helper bounds the ancestor settings walk to that root. Do not import Pi's internal trust-manager module or duplicate its trust-file parsing.

## Affected areas

- `extensions/auth-profiles.ts`: ancestor lookup, trust gating, source reporting, header comment.
- `README.md`: describe precedence and trusted ancestor behaviour.

## Implementation phases

1. Add trusted ancestor settings resolution and preserve cwd writes. Validate with isolated filesystem scenarios.
2. Update documentation, run available checks, review the diff, then commit and open a review-ready PR.
