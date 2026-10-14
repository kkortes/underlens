# CLAUDE.md

Underlens is scheduled review of the codebase at each PR's head, held to a
human-curated quality document, run on the developer's own harness
subscriptions from a GitHub workflow. This folder holds two things: the presentational site
(https://underlens.korte.kim), which only explains how it works and how to add
it, and the npm package `@ape-egg/underlens` in [package/](package/), which is
the action itself.

## Commands

- `bun dev` — Vite with `@ape-egg/vite-plugin-vibe` (HMR) behind `../dev.sh`
  (`https://underlens.localhost`, honors `$PORT`). [vite.config.js](vite.config.js)
  serves `/` from `pages/index.html` and `/templates/*` from `package/templates/`.
- `bun run build` — `vibe compile` in SPA mode to `compiled/`, then copies
  `package/templates` to `compiled/templates` (what Vercel runs).
- `cd package && npm publish` — publishes the package. The developer's to run,
  never an agent's.

## Contributing and versioning

- Every branch made for underlens includes a version bump. It is a patch bump
  (`1.0.5` → `1.0.6`) unless the developer names a minor or a major, and then
  it is that one.
- The version lives in `package/package.json`. The root `package.json` is the
  private site and keeps its own.
- Publishing is done by hand by the developer once the branch is merged to
  `main`. An agent never publishes.

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

Runs as `bunx @ape-egg/underlens@1`, under bun, with `gh` and git from the
hosted runner. Consumers don't call it directly: their workflow (the template
[underlens.yml](package/templates/underlens.yml)) keeps only the triggers,
`permissions` and the harness `secrets`, and calls the reusable workflow
[.github/workflows/run.yml](.github/workflows/run.yml) at tag `v1`, which
checks out, sets up bun and runs the package with `GH_TOKEN`. Those three can't
move: a called workflow can't widen its caller's token, and `secrets: inherit`
stops at the owner. Move the floating `v1` tag when run.yml changes.
[bin/underlens.js](package/bin/underlens.js) dispatches on `GITHUB_EVENT_NAME`
(or `init` / `validate` by name). A dispatch with an empty `branch` input
validates; otherwise it reviews the open PR whose head is that branch, and
fails with a message when the branch heads no open PR, or more than one. run.yml checks out the default branch on every event; a
review unshallows it before it diffs.

- [config.js](package/src/config.js) — loads `underlens.config.js` and the
  quality document from the workflow's checkout, the default branch on every
  event. The workflow's triggers alone decide when reviews run, and each
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
- [validate.js](package/src/validate.js) — dispatch with the `branch` input left empty:
  one
  row per configured string, each pinged on that exact harness and model, and
  whether Actions may open PRs. Every review asks that too before it starts
  (`pullsAllowed` in [github.js](package/src/github.js)): the token can't read
  the setting, so it asks for a PR from the default branch into itself and
  reads why GitHub turned it down.
- [agents.js](package/src/agents.js) — spawn, JSON extraction and the
  review / judge / fix prompts. Reviewers hold the whole codebase at the PR
  head to the quality document, not only the diff; the diff rides along so
  each finding carries an `origin`: `pr` (the PR brings it in), `combined`
  (the PR together with code it leaves alone, or the PR worsening drift
  already there) or `existing` (there before the PR). The judge gets the diff
  too and corrects origins. Nothing of the codebase is pasted into a prompt:
  reviewers search it rule by rule with their read-only tools, starting from
  the files the diff touches, so a prompt grows with the diff and the rules,
  never the repo. `backlog` (10) caps `existing` findings per reviewer and
  `existing` points per review, so an old codebase is worked down a few fixes
  at a time. The judge quotes each point's rule as `statement`; the fix agent
  answers with a plain account of its change.
- [review.js](package/src/review.js) — opened, scheduled, review. A review
  checks out the PR head as `underlens-pr-N`, runs reviewers in parallel and
  each settles on its own, then the judge on whichever answered. Only then
  does it rank the points (`pr`, then `combined`, then at most `backlog`
  `existing`; the rest counts as `held`), replace the section with a stateless
  note that fixes are being written, retire leftovers of the last review, and
  write one fix per point on `underlens-pr-N-rule-R-i` with a PR into
  `underlens-pr-N`. Reports land in
  the job summary; the PR section is rewritten last and names each failed
  reviewer on one line. No reviewer answering, or the judge failing, fails
  that PR: an earlier review stays; a PR without one, or a run that fails
  while writing fixes, gets a stateless failure note. The scheduled loop moves
  on past a failed PR and throws at the end, so any failure ends the run red.
- [section.js](package/src/section.js) — the PR section between
  `<!-- underlens -->` markers; its state rides in a base64 comment. A section
  with state means reviewed: the scheduled run skips it, and its headline reads
  "This PR was reviewed through Underlens", linked to the site. Each point is
  one `block`: **Rule N: <statement>**, the rule's own wording as the judge
  quotes it, then its origin in a line of italics (state from before origins
  reads as the PR's), then `change`, what the fix agent says it changed (the
  judge's `detail` when no fix was written). Held-back points are counted
  under the list. The section adds `Fix: [#N](…)` and the
  Agree / Disagree boxes; the fix PR's description is the same block.
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
  `CODEX_AUTH_JSON`. The key must sit at the top of `config.toml`, before any
  table: appended after one, TOML reads it as part of that table. OpenAI:
  private repos and trusted runners only. Codex rotates the token at 8 days or
  on a 401 and a hosted runner can't persist it, so validate flags a seed 8+
  days old.
- GLM: Z.ai Coding Plan key via Claude Code at `https://api.z.ai/api/anthropic`;
  plan terms limit it to supported tools, silent on CI.
- Gemini: Login with Google shut down for Gemini CLI on 2026-06-18 → API key.
- Grok: no documented subscription sign-in for CI → xAI API key.

## Deploy

Vercel project on this folder: [vercel.json](vercel.json) builds with
`bun run build` and rewrites every path to the SPA shell. Domain
`underlens.korte.kim`.
