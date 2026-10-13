import { $ } from 'bun';
import { appendFileSync } from 'fs';

export const repo = process.env.GITHUB_REPOSITORY;
export const event = process.env.GITHUB_EVENT_PATH ? await Bun.file(process.env.GITHUB_EVENT_PATH).json() : {};
export const runUrl = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;

const fields = 'number,state,title,body,url,headRefName,headRefOid,baseRefName,isDraft,isCrossRepository';

export const pull = (n) => $`gh pr view ${n} --json ${fields}`.json();
export const openPulls = () => $`gh pr list --state open --limit 200 --json ${fields}`.json();
export const setBody = (n, body) => $`gh api -X PATCH repos/${repo}/pulls/${n} -f body=${body}`.quiet();

export const openPull = async ({ base, head, title, body }) =>
  Number((await $`gh pr create --base ${base} --head ${head} --title ${title} --body ${body}`.text()).trim().split('/').pop());

// A fix that conflicts with one merged before it is an outcome, not a crash.
export const merge = async (n) => !(await $`gh pr merge ${n} --squash --delete-branch`.nothrow().quiet()).exitCode;
export const close = (n) => $`gh pr close ${n} --delete-branch`.quiet();
export const deleteBranch = (branch) => $`git push -q origin --delete ${branch}`.quiet();

export const summary = (markdown) => appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n\n`);
