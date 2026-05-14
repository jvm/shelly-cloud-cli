# shelly-cloud-cli

Agent-native CLI for querying and controlling known Shelly Cloud devices through the Shelly Cloud Control API v2.

⚠️ This tool can cause physical side effects in a home. Use `--dry-run` before mutating commands and be careful with covers, lights, switches, and groups.

## Install

```bash
npm install -g shelly-cloud-cli
pnpm add -g shelly-cloud-cli
bun add -g shelly-cloud-cli
npx shelly-cloud-cli --help
bunx shelly-cloud-cli --help
brew install jvm/tap/shelly-cloud-cli
```

## Configuration

There is no built-in host default. API commands require both:

- `SHELLY_CLOUD_HOST` or `--host https://...`
- `SHELLY_CLOUD_KEY` from the process environment

Set environment variables using your preferred secret manager or shell:

```bash
export SHELLY_CLOUD_KEY="<authorization-key>"
export SHELLY_CLOUD_HOST="https://shelly-143-eu.shelly.cloud"
shelly-cloud devices get --id b48a0a1cd978 --json
npx shelly-cloud-cli devices get --id b48a0a1cd978 --json
bunx shelly-cloud-cli devices get --id b48a0a1cd978 --json
```

## Examples

```bash
shelly-cloud doctor --json
shelly-cloud profiles save home --host https://shelly-143-eu.shelly.cloud
shelly-cloud profiles use home
shelly-cloud devices save kitchen-plug --id b48a0a1cd978 --type switch --channel 0
shelly-cloud devices get --device kitchen-plug --select status,settings --json
shelly-cloud switches set --device kitchen-plug --on true --dry-run --json
shelly-cloud covers set --id b48a0a1cd978 --relative -10 --dry-run --json
shelly-cloud lights set --id b48a0a1cd978 --mode white --temperature 3000 --brightness 25 --json
cat group-command.json | shelly-cloud groups set --input - --dry-run --json
```

JSON results use `{ "ok": true, "data": ..., "meta": ... }`. JSON errors are written to stderr as `{ "ok": false, "error": ... }`.

Exit codes: 0 success, 1 unexpected, 2 usage/validation, 3 configuration/authentication, 4 not found, 5 API, 6 rate limited, 7 timeout, 8 partial failure.

Verification with `--verify` is best-effort and inspects common status fields only. See [`docs/verification.md`](docs/verification.md).

Release and Homebrew details are in [`docs/release.md`](docs/release.md). Current pre-release conformance status is in [`CONFORMANCE.md`](CONFORMANCE.md).

Core auth-key mode does not support remote discovery. `devices list` shows local aliases only.

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
bun run smoke
bun run install:check
```

`bun run install:check` builds and packs the CLI, then installs the local tarball into temporary npm, pnpm, and Bun global prefixes, runs binary smoke checks, and uses `npm exec --package <tarball>` as the local `npx` equivalent. `bunx shelly-cloud-cli` is verified after publish because Bun does not reliably execute local npm tarballs through `bunx`. If Bun serves a stale cached version after publish, use `bunx --package shelly-cloud-cli@<version> shelly-cloud --version` to confirm the exact published package.

Implementation decisions: Node-compatible npm artifact (`dist/cli.js`) with `#!/usr/bin/env node`, Bun >=1.2 for development, zero runtime dependencies, HTTPS-only host policy, no redirects, 1 MiB group input limit, group `--force` threshold of 3 targets, local feedback only.
