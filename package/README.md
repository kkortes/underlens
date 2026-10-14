# @ape-egg/underlens

Nightly code review held to rules you wrote, run from a GitHub workflow on your own AI subscriptions. Guide: [underlens.korte.kim](https://underlens.korte.kim).

The workflow's triggers decide when a PR is reviewed. Then one reviewer per configured harness reads `underlens-quality-control.md`, the diff and the codebase, and reports where the PR breaks a numbered rule. A judge folds the reports into points and writes one fix PR per point, into an umbrella branch cut from the PR. The PR's section becomes a status report: per point, the rule in its own words, what the fix changed and a link to it, with **Agree** (merge the fix) and **Disagree** (close it). Each fix PR's description opens with the same rule and change. A disagreed point returns on every review while its rule stands; only changing the code or the rule settles it.

A reviewer that fails (its CLI won't start, exits with an error, runs past 30 minutes or answers without JSON) doesn't stop the review: the judge works from the reviewers that answered, and the PR's section names each one that failed and why, on one line each. If every reviewer fails, or the judge does, that PR isn't reviewed: an earlier review stays in place, and a PR without one gets a note saying it failed. A scheduled run moves on to the next PR either way. Any failure turns the run red.

## Setup

```sh
bunx @ape-egg/underlens init      # writes the three files below
claude setup-token                # then:
gh secret set CLAUDE_CODE_OAUTH_TOKEN
gh api -X PUT repos/{owner}/{repo}/actions/permissions/workflow -F can_approve_pull_request_reviews=true   # lets the workflow open fix PRs
git add -A && git commit -m "add underlens" && git push
gh workflow run underlens.yml     # checks every configured harness signs in
```

- `underlens.config.js`: `reviewers` and `judge`, one string each naming harness and model.
- `underlens-quality-control.md`: the numbered, human-curated rules.
- `.github/workflows/underlens.yml`: triggers, permissions, and one job that calls [`kkortes/underlens/.github/workflows/run.yml@v1`](https://github.com/kkortes/underlens/blob/main/.github/workflows/run.yml) with the harness secrets. The triggers you list pick when reviews run.

```yaml
name: Underlens

on:
  schedule:
    - cron: '0 3 * * *'
  pull_request:
    types: [edited, closed]
  workflow_dispatch:
    inputs:
      branch:
        description: Run workflow PR of branch (leave empty for harness check)

permissions:
  contents: write
  pull-requests: write

jobs:
  Underlens:
    uses: kkortes/underlens/.github/workflows/run.yml@v1
    secrets:
      CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      CODEX_AUTH_JSON: ${{ secrets.CODEX_AUTH_JSON }}
      GLM_API_KEY: ${{ secrets.GLM_API_KEY }}
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      XAI_API_KEY: ${{ secrets.XAI_API_KEY }}
```

The check reads **Underlens / Review and fix**. `runs-on` is the only input, and it defaults to `ubuntu-26.04`.

Three parts of that file stay in your repo because GitHub won't let them move: the triggers, the `permissions` (a called workflow can't widen its caller's token, and a new repo's token is read-only), and the `secrets` (`secrets: inherit` only reaches workflows of the same owner). Forward only the secrets of the harnesses you use, if you like; validate names any that's missing.

The called workflow is four steps, if you'd rather run them yourself: `actions/checkout@v7`, `oven-sh/setup-bun@v2`, then `bunx @ape-egg/underlens@1` with `GH_TOKEN: ${{ github.token }}` and each harness secret in its `env`. Check out the default branch (`ref: ${{ github.event.repository.default_branch }}`) so a PR can't rewrite the rules it's reviewed by. Underlens reads the `branch` input from the event and deepens a shallow checkout itself.

## Harnesses

| id | CLI | secret | signs in with |
| --- | --- | --- | --- |
| `claude` | Claude Code | `CLAUDE_CODE_OAUTH_TOKEN` | Pro/Max subscription (`claude setup-token`, one year) |
| `gpt` | Codex | `CODEX_AUTH_JSON` | ChatGPT subscription, `~/.codex/auth.json`; private repos only, refresh about weekly on hosted runners |
| `glm` | Claude Code → Z.ai | `GLM_API_KEY` | GLM Coding Plan key |
| `gemini` | Gemini CLI | `GEMINI_API_KEY` | API key: no subscription sign-in for CI exists |
| `grok` | Grok CLI | `XAI_API_KEY` | API key: no subscription sign-in for CI is documented |

## Picking a model

Each entry in `reviewers` and `judge` is one string. A harness id alone runs that CLI's default model; a model ID that starts with the harness id picks that model and reaches the CLI as written:

```js
export default {
  reviewers: ['claude-opus-5-5', 'gpt-6.1-sol', 'claude-sonnet-5'],
  judge: 'claude-fable-5-1',
};
```

The same harness can appear more than once on different models; each string runs as its own reviewer. A string whose prefix names no harness fails at config load. Every model string each CLI accepts: [underlens.korte.kim/#models](https://underlens.korte.kim/#models) — the CLI itself has the final say.

## Validate before a real run

Run the workflow with the branch left empty (`gh workflow run underlens.yml`, or Actions → Underlens → Run workflow). It pings every configured string on its exact harness and model, writes one row per string to the job summary, checks GitHub lets Actions open pull requests (Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"), and fails until all of it is ready. Every review checks that setting again before it starts.

## Commands

The workflow runs `underlens` with no argument; it acts on the event, so the triggers you list decide when reviews run:

- `schedule`: reviews every open, non-draft PR that hasn't been reviewed yet.
- `workflow_dispatch`: reviews the open PR of the branch named in "Run workflow PR of branch" now (`gh workflow run underlens.yml -f branch=<branch>`), and fails saying so when that branch has no open PR. With the branch left empty, it validates every reviewer and the judge instead.
- `pull_request` `opened`/`reopened`: reviews that PR at once. The template leaves these out; add them to review each PR as it opens.
- `pull_request` `edited`: acts on ticked Agree / Disagree boxes.
- `pull_request` `closed`: a fix merged or closed by hand counts as Agree / Disagree, and a closed PR takes its Underlens branches and PRs with it.

`underlens init` and `underlens validate` also run by name.
