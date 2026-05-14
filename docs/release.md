# Release checklist

This project publishes a Node-compatible npm artifact and a Homebrew formula for `jvm/tap`.

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

3. Confirm npm Trusted Publishing is configured for `jvm/shelly-cloud-cli` and `.github/workflows/release.yml`.
4. Confirm protected release environment `release` exists.
5. Confirm `HOMEBREW_TAP_TOKEN` is scoped only to `jvm/homebrew-tap` if using automated tap updates.

## Tag and release

Create a protected `v*` tag. The release workflow:

- installs with `bun install --frozen-lockfile`
- typechecks, tests, builds, and packs
- generates `checksums.txt`
- uploads the npm tarball and checksums to GitHub Releases
- publishes to npm through Trusted Publishing/OIDC
- opens a Homebrew tap pull request when `HOMEBREW_TAP_TOKEN` is available

## Homebrew formula mode

The v1 formula is Node-based. It installs the GitHub release npm tarball with Homebrew `std_npm_args` and symlinks the package bin entry as `shelly-cloud`. The tap-side renderer lives at `../homebrew-tap/scripts/render-shelly-cloud-cli-formula.sh`.

Generate a local formula preview:

```bash
node scripts/homebrew-formula.mjs 0.1.5 \
  https://github.com/jvm/shelly-cloud-cli/releases/download/v0.1.5/shelly-cloud-cli-0.1.5.tgz \
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
