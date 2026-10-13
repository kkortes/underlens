import { resolve } from 'path';

import harnesses from './harnesses.js';

const ids = Object.keys(harnesses);

// Read from the workflow's own checkout, before any pull request is checked
// out, so a pull request can't rewrite the rules it's reviewed by.
const load = async () => {
  const config = { reviewers: ['claude'], judge: 'claude', models: {}, ...(await import(resolve('underlens.config.js'))).default };
  const unknown = [...config.reviewers, config.judge].filter((id) => !ids.includes(id));
  if (unknown.length) throw new Error(`underlens.config.js: unknown harness ${unknown.join(', ')} — pick from ${ids.join(', ')}`);
  // The workflow's triggers decide when reviews run; a leftover `when` would
  // silently stop meaning what it says.
  if ('when' in config) throw new Error('underlens.config.js: `when` is gone — remove it and pick triggers in .github/workflows/underlens.yml: https://underlens.korte.kim/#setup');
  return {
    ...config,
    harnesses: [...new Set([...config.reviewers, config.judge])],
    rules: await Bun.file('underlens-quality-control.md').text(),
  };
};

let loaded;
export default () => (loaded ??= load());

export const names = (list) => new Intl.ListFormat('en').format(list.map((id) => harnesses[id].name));
