# Preserve auth storage identity

## Purpose

After `/profile use work`, Pi login and OAuth refresh must write credentials to `auth-profiles/work.json`, including paths that captured the credential store before extension lifecycle hooks ran.

## Scope

- Preserve Pi's existing `RuntimeCredentials` facade while rebinding its backing store to the selected profile.
- Refresh the public model registry so built-in `/login` reflects the selected profile immediately.
- Exclude changes to `@gotgenes/pi-anthropic-auth`; source review confirms it does not mutate credential storage.

## Behaviour

- Given a trusted project and `/profile use work`, when a previously captured credential store writes an Anthropic OAuth credential, then the credential is written to `~/.pi/agent/auth-profiles/work.json`.
- Given the same flow, then `~/.pi/agent/auth.json` does not receive that credential.
- Existing profile selection and availability refresh behavior remain unchanged.

## Implementation

`RuntimeCredentials` is the stable facade Pi gives to login, logout, and OAuth flows. Its mutable backing store is replaced only after `ctx.waitForIdle()` completes. This keeps existing credential-facade references on the selected profile.

After rebinding, call the public `ctx.modelRegistry.refresh({ allowNetwork: false })`. It rebuilds Pi's cached provider-auth snapshot from the selected store without a network model-catalog refresh, so `/login` does not display credentials from the previous profile.

## Validation

In an isolated Pi agent directory:

1. Log in to Anthropic under `default`.
2. Run `/profile use work`.
3. Confirm `/login` shows Anthropic unconfigured and log in.
4. Switch between `default` and `work` and confirm each profile shows only its own credential state.

## Risks

The profile extension still depends on Pi's internal `modelRegistry.runtime.credentials.store` shape to change the file-backed store. The model-registry refresh is public, but a future Pi runtime change can make the private rebind incompatible; the extension reports that incompatibility instead of silently using the wrong file.
