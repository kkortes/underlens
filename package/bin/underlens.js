#!/usr/bin/env bun
import init from '../src/init.js';
import validate from '../src/validate.js';
import { opened, review, scheduled } from '../src/review.js';
import { closed, ticked } from '../src/sync.js';
import { event, pullOf } from '../src/github.js';

const pullRequest = {
  opened,
  reopened: opened,
  edited: ticked,
  closed,
};

const ci = {
  schedule: scheduled,
  workflow_dispatch: async () => {
    const branch = process.env.GITHUB_REF_NAME;
    const n = branch !== event.repository.default_branch && (await pullOf(branch));
    return n ? review(n) : validate();
  },
  pull_request: () => pullRequest[event.action]?.(event.pull_request.number),
};

const [command] = process.argv.slice(2);
const commands = { init, validate };

await (commands[command] ?? ci[process.env.GITHUB_EVENT_NAME] ?? (() => {
  throw new Error(`underlens: run \`underlens init\` in a repo, or from the Underlens workflow (got "${command ?? process.env.GITHUB_EVENT_NAME ?? ''}")`);
}))();
