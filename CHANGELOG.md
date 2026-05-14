# Changelog

## 0.1.8 - 2026-05-14

First fully successful automated release.

Highlights:

- GitHub Actions release workflow succeeded end-to-end.
- GitHub release artifacts were created and uploaded.
- npm publish succeeded through Trusted Publishing / OIDC.
- Homebrew tap pull request was created automatically and merged.
- Homebrew install/upgrade path verified for `jvm/tap/shelly-cloud-cli`.
- Release workflow uses Node 24-capable action revisions.
- Homebrew tap PR creation now uses `gh pr create` instead of a third-party PR action.
- npm `bin` path was cleaned up for future publishes.

## Next

The next routine development release can target `0.1.9`.
