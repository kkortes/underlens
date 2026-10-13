import { resolve } from 'path';

import harnesses from './harnesses.js';

const modes = ['nightly', 'opened', 'manual'];
const ids = Object.keys(harnesses);

// GitHub only schedules from the workflow file, so the night's hour lives in
// its cron line — read it back so the announcement can say when.
const nightlyAt = async () => {
  const workflow = process.env.GITHUB_WORKFLOW_REF.split('@')[0].split('/').slice(2).join('/');
  const [minute, hour] = (await Bun.file(workflow).text()).match(/cron:\s*['"]([^'"]+)['"]/)?.[1].split(' ') ?? [];
  return /^\d+$/.test(`${minute}${hour}`) ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')} UTC` : 'its scheduled hour';
};

// Read from the workflow's own checkout, before any pull request is checked
// out, so a pull request can't rewrite the rules it's reviewed by.
const load = async () => {
  const config = { reviewers: ['claude'], judge: 'claude', when: 'nightly', models: {}, ...(await import(resolve('underlens.config.js'))).default };
  const unknown = [...config.reviewers, config.judge].filter((id) => !ids.includes(id));
  if (unknown.length) throw new Error(`underlens.config.js: unknown harness ${unknown.join(', ')} — pick from ${ids.join(', ')}`);
  if (!modes.includes(config.when)) throw new Error(`underlens.config.js: when must be one of ${modes.join(', ')}`);
  return {
    ...config,
    harnesses: [...new Set([...config.reviewers, config.judge])],
    rules: await Bun.file('underlens-quality-control.md').text(),
    nightlyAt: await nightlyAt(),
  };
};

let loaded;
export default () => (loaded ??= load());

export const names = (list) => new Intl.ListFormat('en').format(list.map((id) => harnesses[id].name));
