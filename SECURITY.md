# Security Policy

Report vulnerabilities privately through GitHub Security Advisories when available, or contact the maintainer directly.

The CLI never accepts an auth key flag. `SHELLY_CLOUD_KEY` is read only from the process environment and is redacted from errors, dry-runs, feedback, and diagnostics. Profiles and feedback must not contain secrets.

Release policy: npm publishing is intended to use Trusted Publishing/OIDC and provenance from `jvm/shelly-cloud-cli`; no long-lived npm token should be used. Homebrew tap updates should use a token scoped only to `jvm/homebrew-tap`.

Dependencies are kept minimal. New dependencies require review for maintenance, license, install scripts, transitive size, provenance, and known advisories.
