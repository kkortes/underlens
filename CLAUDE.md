# CLAUDE.md

Underlens is nightly PR review held to a human-curated quality document, run
on the developer's own harness subscriptions from a GitHub workflow. This
folder holds two things: the presentational site
(https://underlens.korte.kim), which only explains how it works and how to add
it, and the npm package `@ape-egg/underlens` in [package/](package/), which is
the action itself.

## Commands

- `bun dev` — Vite with `@ape-egg/vite-plugin-vibe` (HMR) behind `../dev.sh`
  (`https://underlens.localhost`, honors `$PORT`). [vite.config.js](vite.config.js)
  serves `/` from `pages/index.html` and `/templates/*` from `package/templates/`.
- `bun run build` — `vibe compile` in SPA mode to `compiled/`, then copies
  `package/templates` to `compiled/templates` (what Vercel runs).
- `cd package && npm publish` — publishes the package. Only on the developer's
  word.

## Site

vibe + vibe-compiler (`spa: true`, one route) + stylecheat (vendored hybrid
build, `<body stylecheat dark>`) + codie. `pages/index.html` boots vibe with
`harness` (the selected harness tab) and `demo` ([js/demo.js](js/demo.js), the
sample PR the flow walks through). Sections are components: Hero, Flow (seven
steps, each with an HTML/CSS mock as its visual), Why, Harnesses, Setup.
[js/code.js](js/code.js) highlights every `<codie>`; one with `data-src` loads
that file from `/templates/` — the package's own templates, so the guide shows
exactly what `underlens init` writes.

## Package

Runs as `bunx @ape-egg/underlens@1` from the consumer's workflow, under bun,
with `gh` and git from the hosted runner. [bin/underlens.js](package/bin/underlens.js)
dispatches on `GITHUB_EVENT_NAME` (or `init` / `validate` by name).

- [config.js](package/src/config.js) — loads `underlens.config.js` and the
  quality document from the workflow's checkout (default branch on schedule and
  dispatch). The workflow's triggers alone decide when reviews run, and each
  `reviewers` / `judge` string alone picks harness and model; a config that
  still sets `when` or `models` throws, and so does a string whose prefix
  names no harness.
- Reviewer / judge strings: a bare harness id (`'claude'`) runs its CLI's
  default model; `<id>-…` (`'claude-opus-5-5'`, `'gpt-6.1-sol'`,
  `'glm-5.3-flash'`) passes through whole as the model flag, since every
  vendor's model IDs start with the harness id. Everything downstream is keyed
  by the string, not the harness, so one harness can review on two models.
  The accepted strings per CLI are listed on the site (`#models`).
- [harnesses.js](package/src/harnesses.js) — `agent(spec)` resolves a
  config string to harness and model; one adapter per harness: its
  secret, whether that's a subscription, and the headless CLI command for
  read-only review and write-mode fixes. Prompts go in on stdin (Grok: a
  prompt file). Verified locally against Claude Code 2.1.280, Codex 0.159.1
  and Grok 1.0.50: Grok's `dontAsk` cancels the turn on any denied tool, so it
  gets an explicit `--tools` list, and its plain output stops at the first
  message, so it runs with `--output-format json`.
- [validate.js](package/src/validate.js) — dispatch without a PR number: one
  row per configured string, each pinged on that exact harness and model.
- [agents.js](package/src/agents.js) — spawn, JSON extraction and the
  review / judge / fix prompts.
- [review.js](package/src/review.js) — opened, scheduled, review. A review
  checks out the PR head as `underlens/pr-N`, runs reviewers in parallel and
  each settles on its own, then the judge on whichever answered. Only then
  does it retire leftovers of the last review, and writes one fix per point on
  `underlens/pr-N-rule-R-i` with a PR into `underlens/pr-N`. Reports land in
  the job summary; the PR section is rewritten last and names each failed
  reviewer on one line. No reviewer answering, or the judge failing, fails
  that PR: an earlier review stays, a PR without one gets a stateless failure
  note. The scheduled loop moves on past a failed PR and throws at the end, so
  any failure ends the run red.
- [section.js](package/src/section.js) — the PR section between
  `<!-- underlens -->` markers; its state rides in a base64 comment. A section
  with state means reviewed: the scheduled run skips it.
- [sync.js](package/src/sync.js) — `edited` acts on ticked
  `- [x] Agree <!-- fix -->` boxes; `closed` maps a fix merged or closed by
  hand onto Agree / Disagree and retires everything when the original closes.
  The umbrella PR opens on the first agreed fix (GitHub refuses an empty PR).

Events from the workflow's own `GITHUB_TOKEN` trigger nothing, so the engine's
edits never loop. Fork PRs are skipped: their umbrella would need a branch in
the fork.

## Harness sign-in (researched October 2026)

- Claude: `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`, one year,
  documented for CI.
- GPT: `~/.codex/auth.json` with `cli_auth_credentials_store = "file"` →
  `CODEX_AUTH_JSON`. OpenAI: private repos and trusted runners only. Codex
  rotates the token at 8 days or on a 401 and a hosted runner can't persist it,
  so validate flags a seed 8+ days old.
- GLM: Z.ai Coding Plan key via Claude Code at `https://api.z.ai/api/anthropic`;
  plan terms limit it to supported tools, silent on CI.
- Gemini: Login with Google shut down for Gemini CLI on 2026-06-18 → API key.
- Grok: no documented subscription sign-in for CI → xAI API key.

## Deploy

Vercel project on this folder: [vercel.json](vercel.json) builds with
`bun run build` and rewrites every path to the SPA shell. Domain
`underlens.korte.kim`.
