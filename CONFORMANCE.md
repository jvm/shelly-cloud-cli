# Conformance audit

Status: post-release audit snapshot. Automated release `v0.1.8` successfully created GitHub release assets, published to npm via OIDC trusted publishing, and opened the Homebrew tap PR which was then merged and installed locally.

## MUST / required behavior traceability

| Spec area | Requirement summary | Status | Evidence / notes |
| --- | --- | --- | --- |
| Binary/package identity | Expose `shelly-cloud`; package metadata targets `github.com/jvm/shelly-cloud-cli` | Done | `package.json`, `README.md` |
| TypeScript/Bun stack | Strict TypeScript, Bun-first dev workflows, lockfile | Done | `tsconfig.json`, `bun.lock`, `package.json` scripts |
| Node-compatible artifact | npm package runs with Node >=20, no Bun runtime requirement | Done | `package.json` `engines`, `bin`, `bun run install:check` |
| No host default | API commands require explicit host from flag/env/profile | Done | `src/config/config.ts`, CLI tests |
| Env-only auth key | `SHELLY_CLOUD_KEY` required for API calls; no `--auth-key` | Done | `src/config/config.ts`, parser flags |
| Host validation | Normalize HTTPS origin; reject HTTP/invalid host | Done | `normalizeHost`, config tests via CLI |
| Secret redaction | Redact `auth_key`, env key values, key-like fields | Done | `src/util/redact.ts`, API tests |
| Profiles | Store host/aliases/defaults without secrets; atomic writes and 0600 mode where supported | Done | `src/profiles/store.ts` |
| Local aliases | `devices save/list/delete`; alias resolution for API commands | Done | `src/cli.ts` |
| Command tree | Required top-level families implemented | Done | `src/cli.ts`, `src/command-schema.ts`, CLI tests |
| JSON output | Result envelope on stdout; error envelope on stderr | Done | `src/output/render.ts`, CLI tests |
| Exit codes | 0..8 taxonomy for success, validation, config, API, rate, timeout, partial | Done | `CliError`, command/API handlers |
| Non-interactive behavior | No implicit stdin reads except `groups set --input -` | Done | parser/handlers, CLI tests |
| `--agent` behavior | Implies JSON/no-input/no-color | Done | parser logic and tests |
| API endpoints | v2 get/switch/cover/light/groups endpoints via URL API | Done | `src/shelly/client.ts`, API tests |
| Transport safety | POST JSON, timeout, redirect manual, no TLS disablement | Done | `src/shelly/client.ts`, API tests |
| API errors | Upstream error mapping, non-JSON body preservation, malformed JSON handling | Done | `src/shelly/client.ts`, API tests |
| Rate limiting | In-process and local ledger interval enforcement | Done | `src/shelly/client.ts`, API tests |
| Device normalization | IDs as strings, online 0/1 to boolean, unknown fields preserved in status/settings | Done | `normalizeDevice`, API tests |
| Dry-run | Mutating commands produce redacted request plan and avoid network/rate ledger | Done | command handlers, CLI tests |
| Safety validation | Switch/covers/lights/groups validate required fields, ranges, exclusivity, force threshold | Done | command handlers, CLI tests |
| Group partial failures | Non-empty `failedCommands` exits 8 unless `--allow-partial` | Done | `groupsSet`; direct mocked test still desirable |
| Verification | Best-effort state query and common-shape inspection | Done/limited | `src/shelly/verify.ts`, `docs/verification.md`, fixture tests |
| Agent introspection | Versioned `agent-context --json`, exit codes, env vars, command tree, capabilities | Done | `src/cli.ts`, tests |
| Skill manifest | Packaged `skills/SKILL.md` and `skill-path` | Done | `skills/SKILL.md`, tests, package files |
| Feedback | Local redacted feedback; send reports not configured | Done | `src/cli.ts` |
| Packaging content | Exclude tests/env/local state/cache; include docs/spec/skill | Done | `package.json` files, `bun run pack:check` |
| Install modes | npm/Bun/pnpm local tarball install smoke; npm-exec one-shot local equivalent | Done/limited | `bun run install:check`; published `npx` and explicit-version `bunx` checks pass; plain `bunx` may serve stale local cache |
| CI gates | install, typecheck, lint, format, test, build, smoke, package/install check | Done | `.github/workflows/ci.yml` |
| Security gates | audit, dependency review, secret scan, Semgrep, CodeQL, actionlint, zizmor, ShellCheck | Done locally / CI configured | workflows; `actionlint` and `zizmor --min-severity high` pass locally |
| Release workflow | Protected release env, npm OIDC, GitHub release artifacts/checksums, Homebrew PR | Done | `.github/workflows/release.yml`; validated by `v0.1.8` |
| Homebrew tap | Formula renderer and PR workflow target `jvm/homebrew-tap` | Done | tap PR created/merged for `0.1.8`; local `brew upgrade` verified |
| Live integration | Opt-in live read; mutation gated by explicit env var | Done/limited | `test/integration.test.ts`; live read passed locally, mutation remains intentionally gated |

## External checks and remaining operational follow-up

- Published `npx --yes shelly-cloud-cli@0.1.8 --version` passes.
- Explicit-version `bunx --package shelly-cloud-cli@0.1.8 shelly-cloud --version` passes.
- Plain `bunx shelly-cloud-cli` may need cache refresh on individual machines.
- Live `bun run test:integration` read path has passed locally with valid environment variables; mutation remains intentionally gated behind `SHELLY_TEST_ENABLE_MUTATION=1`.
- Branch/tag/release protections should be reviewed periodically as GitHub platform defaults evolve.

## Accepted limitations / deferred items

- OAuth remote discovery is unsupported in core auth-key mode.
- Standalone binaries are deferred; v1 Homebrew uses a Node/npm formula.
- Upstream feedback submission is not configured; local feedback capture is implemented.
- Verification covers common switch, cover, and light status shapes only. Additional real-device fixture coverage should be added over time.
- Some SHOULD-level observability features (`--verbose` request timing and retry diagnostics) are minimal and can be improved after core release.
