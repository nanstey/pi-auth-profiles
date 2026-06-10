# @nanstey/pi-auth-profiles

Per-project auth profiles for [pi](https://pi.dev). Keep separate OAuth/API-key
credentials per account (work, personal, client) and have `/login`, `/logout`,
and token refresh operate on the right one automatically based on the repo
you're in — no restart required.

## Install

```bash
pi install npm:@nanstey/pi-auth-profiles
```

## Usage

```
/profile                 show the active profile, its file, and providers
/profile list            list all profiles and their providers
/profile use <name>      set this project's profile (writes .pi/settings.json)
/profile default <name>  set the global fallback profile
/profile clear           remove this project's profile setting
```

Typical setup:

```
cd ~/work/some-repo
/profile use work        # this repo now uses the "work" profile
/login                   # credentials are saved to the work profile
```

## How it works

Each profile is a separate credential file:

| Profile   | File                                  |
| --------- | ------------------------------------- |
| `default` | `~/.pi/agent/auth.json`               |
| `<name>`  | `~/.pi/agent/auth-profiles/<name>.json` |

The active profile is resolved per session, first match wins:

1. `"authProfile"` in `<project>/.pi/settings.json` — only when the project is trusted
2. `"defaultProfile"` in `~/.pi/agent/auth-profiles.json`
3. `default` (plain `auth.json`, identical to pi without this extension)

The extension rebinds pi's live credential storage at `session_start` (after
project trust is resolved) and again whenever you run `/profile use`, so the
built-in `/login`, `/logout`, and OAuth token refresh all read and write the
active profile's file immediately.

`.pi/settings.json` is committable, so a team repo can pin which profile name
it expects without sharing any credentials.

## Notes

- Profiles are isolated on purpose: a profile does **not** fall back to
  `auth.json` for providers it lacks — log in once per profile instead.
  Sharing OAuth credentials across files breaks when providers rotate refresh
  tokens. Environment variables (`ANTHROPIC_API_KEY`, …) and `models.json`
  keys still apply in every profile.
- Profile names may contain letters, numbers, dots, underscores, and dashes.

## License

MIT
