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
/profile set <name>      set this project's profile for the next Pi process
/profile use <name>      deprecated alias for `set`
/profile default <name>  set the global fallback profile for the next Pi process
/profile clear           remove this project's profile setting for the next Pi process
```

`/profile set`, `/profile use`, and `/profile clear` require the current project to be trusted.

Typical setup:

Start pi tui:
```
cd ~/work/some-repo
pi
```

Configure auth profile:
```
/profile set work        # configure the "work" profile
# exit Pi and start a new process
/login                   # credentials are saved to the work profile
```

## How it works

Each profile is a separate credential file:

| Profile   | File                                  |
| --------- | ------------------------------------- |
| `default` | `~/.pi/agent/auth.json`               |
| `<name>`  | `~/.pi/agent/auth-profiles/<name>.json` |

The active profile is resolved at full Pi process startup, then reused for fresh sessions in that process. The first match wins:

1. `"authProfile"` in the nearest eligible `.pi/settings.json` at or above the working directory — trusted sessions always consider cwd; ancestors require an unbroken persisted-trust chain
2. `"defaultProfile"` in `~/.pi/agent/auth-profiles.json`
3. `default` (plain `auth.json`, identical to pi without this extension)

This supports account-based repository roots without repeating the setting in every repository:

```text
~/
  .pi/agent/auth-profiles.json   # { "defaultProfile": "personal" }
  code/
    scratch/                     # personal (no setting found, so defaultProfile applies)
    work/
      .pi/settings.json          # { "authProfile": "work" }
      api/                       # work (inherited from work/)
      web/
        .pi/settings.json        # { "authProfile": "client-a" }
                                 # client-a (nearest setting wins)
        packages/ui/             # client-a (inherited from web/)
    oss/
      .pi/settings.json          # { "authProfile": "default" }
      cli-tool/                  # default (plain auth.json)
```

- A setting applies to every repository beneath it. The nearest one wins (`web/` over `work/`).
- `"authProfile": "default"` is explicit: it selects plain `auth.json` and ignores `defaultProfile`.
- With no setting in the tree, `defaultProfile` applies, then `default`.

### Linked worktrees

A linked worktree outside the parent folder (for example Orca's `~/orca/workspaces/<repo>/<branch>`) never walks through the parent. When cwd has no setting, the extension finds the main checkout with `git rev-parse --git-common-dir` and runs the same lookup from there. So `~/code/work/api` and every worktree of it share the `work` profile. The main checkout must be covered by persisted trust.

### Trust

- Trusted sessions always read `cwd/.pi/settings.json`, however trust was granted (`--approve`, `defaultProjectTrust`, session-only grant).
- Ancestor settings apply only across an unbroken chain of persisted `true` decisions in `~/.pi/agent/trust.json`. The search stops at the first missing or `false` decision.
- Pi loads project resources only from the current directory's `.pi`. This extension also walks parent directories, only to select the auth profile.

### Session startup

Credential storage resolves its profile and file path only during a full Pi process startup, after trust is resolved. Fresh runtimes from `/new`, `/resume`, and `/fork` reuse that original binding without reading changed configuration. `/profile set`, `/profile default`, and `/profile clear` only save configuration, so exit Pi and start a new process before `/login`, `/logout`, and OAuth refresh use the changed profile. `/profile use` remains a deprecated alias for `/profile set`. `/reload` retains its runtime and does not activate profile changes; `/profile show` continues to report the process-start binding and any configuration that will apply after restart.

`.pi/settings.json` is committable, so a team repo can pin a profile name without sharing credentials. For personal use in a shared repo, you should prefer using the parent folder method.

## Notes

- Profiles are isolated: a profile does **not** fall back to `auth.json` for
  providers it lacks, so log in once per profile. Shared OAuth credentials break
  when providers rotate refresh tokens. Environment variables
  (`ANTHROPIC_API_KEY`, …) and `models.json` keys apply in every profile.
- Profile names may contain letters, numbers, dots, underscores, and dashes.
- Pi chooses its initial model before extensions receive `session_start`. If `auth.json` and the selected profile differ, explicitly select the model after startup. Automatic initial-model profile authentication requires upstream lifecycle support.

## License

MIT
