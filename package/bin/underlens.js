#!/usr/bin/env bun
import init from '../src/init.js';
import validate from '../src/validate.js';
import { opened, review, scheduled } from '../src/review.js';
import { closed, ticked } from '../src/sync.js';
import { event, pullsOf } from '../src/github.js';

const pullRequest = {
  opened,
  reopened: opened,
  edited: ticked,
  closed,
};

const dispatched = async (branch) => {
  const pulls = await pullsOf(branch);
  if (!pulls.length) throw new Error(`underlens: ${branch} has no open PR, and Underlens reviews PRs — open one from ${branch} and run again, or leave the branch empty to check the harnesses`);
  if (pulls.length > 1) throw new Error(`underlens: ${branch} heads ${pulls.map((n) => `#${n}`).join(' and ')} — review one by branch only when it has a single open PR`);
  return review(pulls[0]);
};

const ci = {
  schedule: scheduled,
  workflow_dispatch: () => (event.inputs?.branch ? dispatched(event.inputs.branch) : validate()),
  pull_request: () => pullRequest[event.action]?.(event.pull_request.number),
};

const [command] = process.argv.slice(2);
const commands = { init, validate };

await (commands[command] ?? ci[process.env.GITHUB_EVENT_NAME] ?? (() => {
  throw new Error(`underlens: run \`underlens init\` in a repo, or from the Underlens workflow (got "${command ?? process.env.GITHUB_EVENT_NAME ?? ''}")`);
}))();
