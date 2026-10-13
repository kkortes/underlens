import { $ } from 'bun';

import config, { names } from './config.js';
import harnesses from './harnesses.js';
import { fixPrompt, judgePrompt, json, reviewPrompt, run } from './agents.js';
import { close, deleteBranch, openPull, openPulls, pull, runUrl, setBody, summary } from './github.js';
import { announced, announcement, report, state, write } from './section.js';

export const umbrellaOf = (n) => `underlens/pr-${n}`;
const own = (pr) => pr.headRefName.startsWith('underlens/');

// Umbrella and fixes live on the base repo and target the PR's own branch,
// which a fork's PR doesn't have — forks aren't reviewed.
const reviewable = (pr) => !pr.isCrossRepository && !own(pr);

export const announce = async (n) => {
  const [cfg, pr] = await Promise.all([config(), pull(n)]);
  if (!reviewable(pr) || announced(pr.body)) return;
  await setBody(n, write(pr.body, announcement(pr, cfg)));
  if (cfg.when === 'opened') await review(n);
};

export const nightly = async () => {
  const cfg = await config();
  if (cfg.when !== 'nightly') return console.info(`underlens.config.js says when: '${cfg.when}' — nothing to do at night`);
  const due = (await openPulls()).filter((pr) => reviewable(pr) && !pr.isDraft && !state(pr.body));
  console.info(due.length ? `Reviewing ${due.map((pr) => `#${pr.number}`).join(', ')}` : 'No open PR waits for a review');
  for (const pr of due) await review(pr.number);
};

// A review starts from scratch: whatever an earlier review left open goes.
export const retire = async (n) => {
  const umbrella = umbrellaOf(n);
  const leftovers = (await openPulls()).filter((pr) => pr.headRefName.startsWith(`${umbrella}-`) || pr.headRefName === umbrella);
  for (const pr of leftovers.sort((a, b) => (a.headRefName === umbrella) - (b.headRefName === umbrella))) await close(pr.number);
  if ((await $`git ls-remote origin refs/heads/${umbrella}`.text()).trim()) await deleteBranch(umbrella);
};

const fix = async (pr, point, i, cfg) => {
  const umbrella = umbrellaOf(pr.number);
  const branch = `${umbrella}-rule-${point.rule}-${i + 1}`;
  await $`git reset -q --hard && git clean -qfd && git checkout -q -B ${branch} ${umbrella}`;
  await run(cfg.judge, fixPrompt({ pr, rules: cfg.rules, point }), { write: true, model: cfg.models[cfg.judge] });
  await $`git add -A`;
  if (!(await $`git diff --cached --quiet`.nothrow()).exitCode) return { ...point, fix: null, outcome: 'nofix' };
  await $`git commit -qm ${`Rule ${point.rule}: ${point.title}`} && git push -qf origin ${branch}`;
  const number = await openPull({
    base: umbrella,
    head: branch,
    title: `Underlens · ${point.title}`,
    body: `Underlens fix for #${pr.number}, rule ${point.rule} of \`underlens-quality-control.md\`.\n\n${point.detail}\n\nAgree or disagree in #${pr.number}'s Underlens section — merging or closing this PR does the same.`,
  });
  return { ...point, fix: number, outcome: 'open' };
};

const findings = (id, list) =>
  `<details><summary>${harnesses[id].name}: ${list.length} finding${list.length === 1 ? '' : 's'}</summary>\n\n\`\`\`json\n${JSON.stringify(list, null, 2)}\n\`\`\`\n</details>`;

export const review = async (n) => {
  const [cfg, pr] = await Promise.all([config(), pull(n)]);
  if (!reviewable(pr)) throw new Error(`#${n} comes from a fork or from Underlens itself — Underlens reviews branches of this repository`);
  await retire(n);
  await $`git config user.name "github-actions[bot]" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com"`;
  await $`git fetch -q origin ${pr.baseRefName} pull/${n}/head && git reset -q --hard && git clean -qfd && git checkout -q -B ${umbrellaOf(n)} ${pr.headRefOid}`;
  const diff = await $`git diff ${`origin/${pr.baseRefName}...HEAD`}`.text();

  summary(`## #${n} ${pr.title}`);
  const reports = Object.fromEntries(
    await Promise.all(cfg.reviewers.map(async (id) => [id, json(await run(id, reviewPrompt({ pr, rules: cfg.rules, diff }), { model: cfg.models[id] })).findings])),
  );
  Object.entries(reports).forEach(([id, list]) => summary(findings(id, list)));

  const { points } = json(await run(cfg.judge, judgePrompt({ pr, rules: cfg.rules, reports }), { model: cfg.models[cfg.judge] }));
  summary(`Judged by ${names([cfg.judge])}: ${points.length} point${points.length === 1 ? '' : 's'}`);

  const data = { sha: pr.headRefOid, run: runUrl, reviewers: cfg.reviewers, judge: cfg.judge, umbrella: { branch: umbrellaOf(n), pr: null }, points: [] };
  if (points.length) await $`git push -qf origin ${umbrellaOf(n)}`;
  for (const [i, point] of points.entries()) data.points.push(await fix(pr, point, i, cfg));

  // Re-read: the author may have edited the description during the run.
  await setBody(n, write((await pull(n)).body, report(pr, data), data));
};
