# @ape-egg/underlens

Nightly code review held to rules you wrote, run from a GitHub workflow on your own AI subscriptions. Guide: [underlens.korte.kim](https://underlens.korte.kim).

The workflow's triggers decide when a PR is reviewed. Then one reviewer per configured harness reads `underlens-quality-control.md`, the diff and the codebase, and reports where the PR breaks a numbered rule. A judge folds the reports into points and writes one fix PR per point, into an umbrella branch cut from the PR. The PR's section becomes a status report with **Agree** (merge the fix) and **Disagree** (close it) per point. A disagreed point returns on every review while its rule stands; only changing the code or the rule settles it.

## Setup

```sh
bunx @ape-egg/underlens init      # writes the three files below
claude setup-token                # then:
gh secret set CLAUDE_CODE_OAUTH_TOKEN
gh api -X PUT repos/{owner}/{repo}/actions/permissions/workflow -F can_approve_pull_request_reviews=true
git add -A && git commit -m "add underlens" && git push
gh workflow run underlens.yml     # checks every configured harness signs in
```

- `underlens.config.js`: `reviewers` and `judge`, one string each naming harness and model.
- `underlens-quality-control.md`: the numbered, human-curated rules.
- `.github/workflows/underlens.yml`: triggers, permissions and `bunx @ape-egg/underlens@1`. The triggers you list pick when reviews run.

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

Run the workflow with the PR number left empty (`gh workflow run underlens.yml`, or Actions → Underlens → Run workflow). It pings every configured string on its exact harness and model, writes one row per string to the job summary, and fails until every row is ready.

## Commands

The workflow runs `underlens` with no argument; it acts on the event, so the triggers you list decide when reviews run:

- `schedule`: reviews every open, non-draft PR that hasn't been reviewed yet.
- `workflow_dispatch`: with `pr`, reviews that PR now; without, validates every reviewer and the judge.
- `pull_request` `opened`/`reopened`: reviews that PR at once. The template leaves these out; add them to review each PR as it opens.
- `pull_request` `edited`: acts on ticked Agree / Disagree boxes.
- `pull_request` `closed`: a fix merged or closed by hand counts as Agree / Disagree, and a closed PR takes its Underlens branches and PRs with it.

`underlens init` and `underlens validate` also run by name.
