# @nanstey/pi-auth-profiles

Configure multiple auth profiles for [pi](https://pi.dev). 

Keep separate OAuth/API-key credentials per profile (default, work, personal, client) 
and have `/login`, `/logout`, and token refresh operate based on the repo.

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

Start pi tui:
```
cd ~/work/some-repo
pi
```

Configure auth profile:
```
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

1. `"authProfile"` in the nearest `.pi/settings.json` at or above the working directory — only when the session is trusted under a persisted trusted ancestor
2. `"defaultProfile"` in `~/.pi/agent/auth-profiles.json`
3. `default` (plain `auth.json`, identical to pi without this extension)

This supports account-based repository roots without repeating the setting in every repository:

```text
~/Code/
  noelcf/
    .pi/settings.json       # { "authProfile": "work" }
    expedition/
    tiger-team-sync/
  nanstey/
    .pi/settings.json       # { "authProfile": "default" }
    skills/
    bandbrain/
```

The closest setting wins, so a repository can still override its group when necessary. Pi's trust store applies the nearest `true` or `false` decision in `~/.pi/agent/trust.json` to a directory and its descendants. This extension requires the session cwd to be trusted and to inherit a persisted `true` trust entry; it only searches from cwd up to that entry's directory. It never applies a setting outside that trusted tree, including one above a cwd-only or session-only trust grant. Pi itself only loads project resources from the current directory's `.pi`; this extension additionally walks parent directories **only** to select the auth profile.

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
