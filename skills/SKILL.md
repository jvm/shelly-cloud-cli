# Shelly Cloud CLI Agent Skill

Use `shelly-cloud` non-interactively. Prefer `--json` or `--agent` and parse stdout only; diagnostics and errors are on stderr.

## Setup

Do not ask for or write secrets. Expect `SHELLY_CLOUD_KEY` and `SHELLY_CLOUD_HOST` to be present in the process environment.

```bash
shelly-cloud doctor --json
```

## Safe workflow

1. Query first: `shelly-cloud devices get --id <id> --json`.
2. For mutations, run `--dry-run --json` and inspect the redacted request plan.
3. Only then run `switches set`, `covers set`, `lights set`, or `groups set`.
4. Use `--force` for relative cover moves or groups above the safety threshold.

## Examples

```bash
shelly-cloud switches set --id <id> --on true --dry-run --json
shelly-cloud covers set --id <id> --position 50 --json
shelly-cloud lights set --id <id> --brightness 30 --json
shelly-cloud groups set --input group.json --dry-run --json
```

Respect the one request per second rate limit. If JSON error code is actionable (`missing_host`, `missing_auth_key`, `invalid_option`), fix inputs and retry. Never persist authorization keys in profiles, feedback, logs, or issue reports.
