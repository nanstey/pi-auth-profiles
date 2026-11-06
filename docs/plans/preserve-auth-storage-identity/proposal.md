# Preserve auth storage identity

## Purpose

Pi must bind its credential storage to the configured profile when a session starts without ever changing that binding during a running session.

## Scope

- Resolve Pi's existing `RuntimeCredentials` profile and file path only for `session_start` with reason `startup`, then bind that captured path for every fresh runtime session start.
- Make `/profile use`, `/profile default`, and `/profile clear` persist configuration only and tell the user to exit Pi and start a new process. `/reload` does not activate profile changes.
- Exclude changes to `@gotgenes/pi-anthropic-auth`; this change is limited to the local auth-profiles extension and does not rely on a review of that external package's source.

## Behaviour

- Given a trusted project and `/profile use work`, the command writes `authProfile: "work"` to that project's `.pi/settings.json` and tells the user to exit Pi and start a new process.
- Given `/profile default work`, the command writes `defaultProfile: "work"` to `~/.pi/agent/auth-profiles.json` and tells the user to exit Pi and start a new process.
- Given a trusted project and `/profile clear`, the command removes that project's profile setting and tells the user to exit Pi and start a new process.
- The active credential binding does not change during the current process. Only `session_start` with reason `startup` resolves configuration; fresh-runtime reasons such as `new`, `resume`, and `fork` bind the profile and file path captured at startup. `/reload` retains the runtime and does not activate profile changes.
- After each fresh-runtime event and `/reload`, `/profile show` reports the original active profile and any configured-after-restart profile. It reports the active profile as unavailable only if Pi has not provided a process-start binding.
- Pi chooses its initial model before extension `session_start`. If `auth.json` and the selected profile differ, explicit model selection after startup may be required until upstream lifecycle support is available.
- Existing input validation and trust gates remain unchanged.

## Implementation

`RuntimeCredentials` is the stable facade Pi gives to login, logout, and OAuth flows. Module-scoped state captures the process-start profile, source, and credential-file path at `session_start.reason === "startup"`, then binds that path and refreshes Pi's provider-auth status. Pi recreates extension factories for fresh runtimes, so `new`, `resume`, and `fork` factories use the captured module-scoped binding without reading configuration. The same state lets a recreated factory report the active binding. `reload` does not rebind or refresh because it retains the running model runtime.

Command handlers only update their respective JSON settings file. They do not wait for idle, rebind the credential store, or refresh the model registry. Pi cache warming can retain credential references after `ctx.waitForIdle()` resolves, so live rebinding cannot preserve credential-profile isolation. `/profile show` reports unavailable only when no process-start binding is available.

## Validation

In an isolated Pi agent directory:

1. Start Pi in a project configured for `default` and log in to Anthropic.
2. Run `/profile use work` and confirm the command reports that a full Pi process restart is required.
3. Run `/new`, `/resume`, and `/fork` after changing the configured profile, and confirm each binds the original `default` profile without reading the changed configuration. Confirm `/profile show` reports `default` for each fresh runtime.
4. Run `/reload` and confirm it does not rebind or refresh credentials. Confirm `/profile show` still reports the original active profile and shows `work` as configured after restart.
5. Before restarting, confirm `/login` still uses the `default` profile.
6. Exit Pi and start a new process. Confirm `work` is active, then log in and confirm the credential is written to `~/.pi/agent/auth-profiles/work.json`.
7. Repeat with `/profile default` and `/profile clear` to confirm each changes only after a full process restart.

## Risks

The profile extension still depends on Pi's internal `modelRegistry.runtime.credentials.store` shape to change the file-backed store at full process startup. A future Pi runtime change can make the private binding incompatible; the extension reports that incompatibility instead of silently using the wrong file. Pi also selects the initial model before extensions can bind the profile, so a user may need to explicitly select a model after startup when `auth.json` and the selected profile differ.
