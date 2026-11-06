# Preserve auth storage identity

## Purpose

Pi must bind its credential storage to the configured profile when a session starts without ever changing that binding during a running session.

## Scope

- Bind Pi's existing `RuntimeCredentials` facade to the resolved profile at `session_start`.
- Make `/profile use`, `/profile default`, and `/profile clear` persist configuration only and tell the user to restart Pi.
- Exclude changes to `@gotgenes/pi-anthropic-auth`; this change is limited to the local auth-profiles extension and does not rely on a review of that external package's source.

## Behaviour

- Given a trusted project and `/profile use work`, the command writes `authProfile: "work"` to that project's `.pi/settings.json` and tells the user to restart Pi.
- Given `/profile default work`, the command writes `defaultProfile: "work"` to `~/.pi/agent/auth-profiles.json` and tells the user to restart Pi.
- Given a trusted project and `/profile clear`, the command removes that project's profile setting and tells the user to restart Pi.
- The active credential binding does not change during the current session. After restart, `session_start` resolves the configuration and binds login, logout, and OAuth refresh to the selected profile file.
- Existing input validation and trust gates remain unchanged.

## Implementation

`RuntimeCredentials` is the stable facade Pi gives to login, logout, and OAuth flows. Its mutable backing store is replaced once at `session_start`, after profile resolution and trust checks. Pi's provider-auth status is refreshed at that time.

Command handlers only update their respective JSON settings file. They do not wait for idle, rebind the credential store, or refresh the model registry. Pi cache warming can retain credential references after `ctx.waitForIdle()` resolves, so live rebinding cannot preserve credential-profile isolation.

## Validation

In an isolated Pi agent directory:

1. Start Pi in a project configured for `default` and log in to Anthropic.
2. Run `/profile use work` and confirm the command reports that a restart is required.
3. Before restarting, confirm `/login` still uses the `default` profile.
4. Restart Pi, confirm `work` is active, then log in and confirm the credential is written to `~/.pi/agent/auth-profiles/work.json`.
5. Repeat with `/profile default` and `/profile clear` to confirm each changes only after restart.

## Risks

The profile extension still depends on Pi's internal `modelRegistry.runtime.credentials.store` shape to change the file-backed store at session startup. A future Pi runtime change can make the private binding incompatible; the extension reports that incompatibility instead of silently using the wrong file.
