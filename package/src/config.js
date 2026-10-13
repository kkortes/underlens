import { resolve } from 'path';

import harnesses, { agent, label } from './harnesses.js';

const ids = Object.keys(harnesses);

// Read from the workflow's own checkout, before any pull request is checked
// out, so a pull request can't rewrite the rules it's reviewed by.
const load = async () => {
  const config = { reviewers: ['claude'], judge: 'claude', ...(await import(resolve('underlens.config.js'))).default };
  const unknown = [...config.reviewers, config.judge].filter((spec) => !agent(spec));
  if (unknown.length) throw new Error(`underlens.config.js: no harness for ${unknown.map((spec) => `'${spec}'`).join(', ')} — start each with ${ids.join(', ')}, alone for its CLI's default model or followed by -model: https://underlens.korte.kim/#models`);
  const twice = config.reviewers.filter((spec, i) => config.reviewers.indexOf(spec) !== i);
  if (twice.length) throw new Error(`underlens.config.js: reviewer ${twice.map((spec) => `'${spec}'`).join(', ')} is listed twice — each reviewer needs a harness or model of its own`);
  // The workflow's triggers decide when reviews run, and the reviewer and judge
  // strings name the model; a leftover option would silently stop meaning what
  // it says.
  if ('when' in config) throw new Error('underlens.config.js: `when` is gone — remove it and pick triggers in .github/workflows/underlens.yml: https://underlens.korte.kim/#setup');
  if ('models' in config) throw new Error("underlens.config.js: `models` is gone — name the model in the reviewer or judge string itself, like 'claude-opus-5-5': https://underlens.korte.kim/#models");
  return {
    ...config,
    agents: [...new Set([...config.reviewers, config.judge])],
    rules: await Bun.file('underlens-quality-control.md').text(),
  };
};

let loaded;
export default () => (loaded ??= load());

export const names = (list) => new Intl.ListFormat('en').format(list.map((spec) => label(spec)));
