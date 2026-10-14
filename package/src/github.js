import { $ } from 'bun';
import { appendFileSync } from 'fs';

export const repo = process.env.GITHUB_REPOSITORY;
export const event = process.env.GITHUB_EVENT_PATH ? await Bun.file(process.env.GITHUB_EVENT_PATH).json() : {};
export const runUrl = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;

const fields = 'number,state,title,body,url,headRefName,headRefOid,baseRefName,isDraft,isCrossRepository';

export const pull = (n) => $`gh pr view ${n} --json ${fields}`.json();
export const pullsOf = async (branch) => (await $`gh pr list --state open --head ${branch} --json number,isCrossRepository`.json()).filter((pr) => !pr.isCrossRepository).map((pr) => pr.number);
export const openPulls = () => $`gh pr list --state open --limit 200 --json ${fields}`.json();
export const setBody = (n, body) => $`gh api -X PATCH repos/${repo}/pulls/${n} -f body=${body}`.quiet();

export const openPull = async ({ base, head, title, body }) =>
  Number((await $`gh pr create --base ${base} --head ${head} --title ${title} --body ${body}`.text()).trim().split('/').pop());

// The workflow's token can't read the repo's Actions settings (that takes
// Administration), so this asks for a PR from the default branch into itself.
// GitHub turns that down either way, and its reason says whether Actions may
// open PRs here at all.
const probe = 'mutation($repo: ID!, $ref: String!) { createPullRequest(input: { repositoryId: $repo, baseRefName: $ref, headRefName: $ref, title: "Underlens" }) { clientMutationId } }';

export const pullsAllowed = async () => {
  const { id, defaultBranchRef } = await $`gh repo view ${repo} --json id,defaultBranchRef`.json();
  const { stderr } = await $`gh api graphql -f query=${probe} -f repo=${id} -f ref=${defaultBranchRef.name}`.nothrow().quiet();
  return !stderr.toString().includes('not permitted to create or approve pull requests');
};

export const pullsForbidden = `GitHub Actions may not open pull requests in ${repo}, and every Underlens fix arrives as one. Turn on Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests" (an organization may have to allow it first), or run: gh api -X PUT repos/${repo}/actions/permissions/workflow -F can_approve_pull_request_reviews=true`;

// A fix that conflicts with one merged before it is an outcome, not a crash.
export const merge = async (n) => !(await $`gh pr merge ${n} --squash --delete-branch`.nothrow().quiet()).exitCode;
export const close = (n) => $`gh pr close ${n} --delete-branch`.quiet();
export const deleteBranch = (branch) => $`git push -q origin --delete ${branch}`.quiet();

export const summary = (markdown) => appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n\n`);
