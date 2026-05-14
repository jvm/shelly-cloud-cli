# Release checklist

This project publishes a Node-compatible npm artifact and a Homebrew formula for `jvm/tap`.

Status: validated through automated release `v0.1.8`.

## Before tagging

1. Run local checks:

   ```bash
   bun run typecheck
   bun run format:check
   bun test
   bun run build
   bun run smoke
   bun run pack:check
   bun run install:check
   ```

2. Run opt-in live read validation when credentials are available:

   ```bash
   bun run test:integration
   ```

3. Confirm npm Trusted Publishing is configured for `jvm/shelly-cloud-cli` and workflow filename `release.yml`.
4. Confirm protected release environment `release` exists.
5. Confirm `RELEASE_TOKEN` is set on the `release` environment for GitHub release creation if the default workflow token is insufficient.
6. Confirm `HOMEBREW_TAP_TOKEN` is scoped only to `jvm/homebrew-tap` if using automated tap updates.

## Tag and release

Create a protected `v*` tag. The release workflow:

- installs with `bun install --frozen-lockfile`
- typechecks, tests, builds, and packs
- generates `checksums.txt`
- uploads the npm tarball and checksums to GitHub Releases
- publishes to npm through Trusted Publishing/OIDC
- opens a Homebrew tap pull request when `HOMEBREW_TAP_TOKEN` is available

The release workflow now:

- uses `RELEASE_TOKEN` for GitHub release creation when present
- publishes to npm with OIDC-first `npm publish --provenance`
- creates or updates release assets idempotently
- opens the Homebrew PR with `gh pr create`

Current repository protection posture:

- `main` branch protection: no force-push, no deletion, linear history required
- tag ruleset: protects `refs/tags/v*` with maintainer bypass only
- workflow permissions default: `write`

## Homebrew formula mode

The v1 formula is Node-based. It installs the GitHub release npm tarball with Homebrew `std_npm_args` and symlinks the package bin entry as `shelly-cloud`. The tap-side renderer lives at `../homebrew-tap/scripts/render-shelly-cloud-cli-formula.sh`.

Generate a local formula preview:

```bash
node scripts/homebrew-formula.mjs 0.1.8 \
  https://github.com/jvm/shelly-cloud-cli/releases/download/v0.1.8/shelly-cloud-cli-0.1.8.tgz \
  <sha256>
```

Published install experience:

```bash
brew install jvm/tap/shelly-cloud-cli
shelly-cloud --help
```

## Post-publish smoke

After npm publish, verify one-shot execution:

```bash
npx shelly-cloud-cli --help
bunx shelly-cloud-cli --help
```

If Bun returns a stale cached version for the shorthand command, verify the exact published package version explicitly:

```bash
bunx --package shelly-cloud-cli@0.1.8 shelly-cloud --version
```

You can also clear or refresh Bun's package cache before retrying the shorthand form.
