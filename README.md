# Underlens

The site at [underlens.korte.kim](https://underlens.korte.kim) and the npm package [`@ape-egg/underlens`](package/) it explains.

- `bun dev` — the site at `https://underlens.localhost`.
- `bun run build` — the site to `compiled/`.
- `bun publish:check` — lists what `package/` would ship, with `npm pack --dry-run`.
- Pushing a `v<version>` tag publishes `package/` to npm with provenance, from [.github/workflows/publish.yml](.github/workflows/publish.yml).
