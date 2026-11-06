# Preserve auth storage identity

## Purpose

Pi must bind its credential storage to the configured profile when a session starts without ever changing that binding during a running session.

## Scope

- Bind Pi's existing `RuntimeCredentials` facade to the resolved profile only for `session_start` with reason `startup`.
- Make `/profile use`, `/profile default`, and `/profile clear` persist configuration only and tell the user to exit Pi and start a new process. `/reload` does not activate profile changes.
- Exclude changes to `@gotgenes/pi-anthropic-auth`; this change is limited to the local auth-profiles extension and does not rely on a review of that external package's source.

## Behaviour

- Given a trusted project and `/profile use work`, the command writes `authProfile: "work"` to that project's `.pi/settings.json` and tells the user to exit Pi and start a new process.
- Given `/profile default work`, the command writes `defaultProfile: "work"` to `~/.pi/agent/auth-profiles.json` and tells the user to exit Pi and start a new process.
- Given a trusted project and `/profile clear`, the command removes that project's profile setting and tells the user to exit Pi and start a new process.
- The active credential binding does not change during the current process. Only `session_start` with reason `startup` resolves and binds the configured profile. `/reload` retains the runtime and does not activate profile changes.
- After `/reload`, `/profile show` reports the active profile as unavailable until process restart and still shows the configured-after-restart profile.
- Pi chooses its initial model before extension `session_start`. If `auth.json` and the selected profile differ, explicit model selection after startup may be required until upstream lifecycle support is available.
- Existing input validation and trust gates remain unchanged.

## Implementation

`RuntimeCredentials` is the stable facade Pi gives to login, logout, and OAuth flows. Its mutable backing store is replaced once only when `session_start.reason` is `startup`, after profile resolution and trust checks. Pi's provider-auth status is refreshed at that time. Other `session_start` reasons, including `reload`, do not rebind or refresh because they retain the running model runtime.

Command handlers only update their respective JSON settings file. They do not wait for idle, rebind the credential store, or refresh the model registry. Pi cache warming can retain credential references after `ctx.waitForIdle()` resolves, so live rebinding cannot preserve credential-profile isolation. A reloaded extension cannot safely inspect the retained runtime binding, so it leaves the active profile unavailable until a full process restart.

## Validation

In an isolated Pi agent directory:

1. Start Pi in a project configured for `default` and log in to Anthropic.
2. Run `/profile use work` and confirm the command reports that a full Pi process restart is required.
3. Run `/reload` and confirm it does not rebind or refresh credentials. Confirm `/profile show` reports the active profile as unavailable until process restart and shows `work` as configured after restart.
4. Before restarting, confirm `/login` still uses the `default` profile.
5. Exit Pi and start a new process. Confirm `work` is active, then log in and confirm the credential is written to `~/.pi/agent/auth-profiles/work.json`.
6. Repeat with `/profile default` and `/profile clear` to confirm each changes only after a full process restart.

## Risks

The profile extension still depends on Pi's internal `modelRegistry.runtime.credentials.store` shape to change the file-backed store at full process startup. A future Pi runtime change can make the private binding incompatible; the extension reports that incompatibility instead of silently using the wrong file. Pi also selects the initial model before extensions can bind the profile, so a user may need to explicitly select a model after startup when `auth.json` and the selected profile differ.
