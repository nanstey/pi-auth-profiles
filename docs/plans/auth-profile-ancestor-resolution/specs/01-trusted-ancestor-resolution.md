# Trusted ancestor profile resolution

## Implementation

- [x] Walk from `ctx.cwd` to the persisted trusted root and select the nearest `.pi/settings.json` with a non-empty `authProfile`.
- [x] Require the session cwd to be trusted and to inherit a persisted `true` trust entry, then stop the settings walk at that trusted root.
- [x] Include the selected settings path in the project profile source shown by `/profile`.
- [x] Keep `/profile use` and `/profile clear` scoped to `cwd/.pi/settings.json`.
- [x] Update the extension header and README with the actual lookup and trust rule.

## Test Scenarios

- [x] Given a trusted `~/Code/noelcf/.pi/settings.json` with `work`, when cwd is a nested repository without settings, then resolution selects `work` and reports that settings path. (`bun /tmp/verify-auth-profiles-walk-up.mjs`)
- [x] Given settings at cwd and a parent, when both contain a non-empty profile, then the cwd profile wins. (`bun /tmp/verify-auth-profiles-walk-up.mjs`)
- [x] Given a cwd with a nearest persisted trust decision of `false`, when an ancestor contains a profile, then resolution ignores it. (`bun /tmp/verify-auth-profiles-walk-up.mjs`)
- [x] Given no eligible project setting, when a global default exists, then global default resolution remains unchanged. (`bun /tmp/verify-auth-profiles-walk-up.mjs`)

## Risk Controls

- Use Pi's public `ProjectTrustStore` to preserve canonical path and nearest-decision behaviour.
- Do not apply a profile merely because an ancestor settings file exists.
- Do not change credential storage or profile-name validation.

## Out of Scope

- Changing Pi's own resource-loading trust policy.
- Adding a general test framework to this package.
