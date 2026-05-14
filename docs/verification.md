# Verification behavior

`--verify` is best-effort. After a successful mutating request, the CLI performs a `devices get` status query and inspects common Shelly status shapes. Verification respects the normal one-request-per-second rate limiter.

Verification never claims success for unrecognized response shapes. It returns `verified: null` with `status: "unknown_shape"` or a warning instead.

## Switches

For `switches set`, the CLI checks:

- `status["switch:<channel>"].output`

Example match:

```json
{
  "switch:0": { "output": true }
}
```

## Covers

For `covers set`, the CLI checks:

- Numeric position: `status["cover:<channel>"].current_pos`
- String movement state: `status["cover:<channel>"].state`

`--position stop` expects upstream state `stopped` when that shape is present.

## Lights

For `lights set`, the CLI checks common fields when present:

- `--on` against `status["light:<channel>"].output`
- `--brightness` against `status["light:<channel>"].brightness`

Color, temperature, gain, effect, and white-channel verification are not asserted until real-device fixtures confirm stable upstream shapes.

## Failure modes

- `verified: true`: inspected fields match the requested command.
- `verified: false`: inspected fields are present and do not match.
- `verified: null`: fields are absent, shape is unknown, or the verification query failed.
