import { $ } from 'bun';

import config, { names } from './config.js';
import { label } from './harnesses.js';
import { backlog, fixPrompt, judgePrompt, json, reviewPrompt, run } from './agents.js';
import { close, deleteBranch, openPull, openPulls, pull, pullsAllowed, pullsForbidden, runUrl, setBody, summary } from './github.js';
import { announcement, description, failure, fixTitle, report, state, write, writing } from './section.js';

// Flat names: a slash would collide with a branch named plain `underlens`,
// since git can't hold both `underlens` and `underlens/…`.
export const umbrellaOf = (n) => `underlens-pr-${n}`;
export const own = (pr) => pr.headRefName.startsWith('underlens-pr-');

// Umbrella and fixes live on the base repo and target the PR's own branch,
// which a fork's PR doesn't have — forks aren't reviewed.
const reviewable = (pr) => !pr.isCrossRepository && !own(pr);

// Every fix becomes a PR, so a repo that won't let Actions open one fails
// before the review rather than after it.
const permitted = async () => {
  if (!(await pullsAllowed())) throw new Error(pullsForbidden);
};

export const opened = async (n) => {
  const [cfg, pr] = await Promise.all([config(), pull(n)]);
  if (!reviewable(pr)) return;
  await permitted();
  await setBody(n, write(pr.body, announcement(pr, cfg)));
  await attempt(n);
};

export const scheduled = async () => {
  const due = (await openPulls()).filter((pr) => reviewable(pr) && !pr.isDraft && !state(pr.body));
  console.info(due.length ? `Reviewing ${due.map((pr) => `#${pr.number}`).join(', ')}` : 'No open PR waits for a review');
  if (due.length) await permitted();
  // One PR failing leaves the rest to their own review; the run still ends red.
  const failed = [];
  for (const pr of due) await attempt(pr.number).catch((error) => failed.push(`#${pr.number}: ${error.message}`));
  if (failed.length) throw new Error(`Underlens failed on ${failed.length} of ${due.length} PRs:\n${failed.join('\n')}`);
};

// A review replaces the last one: whatever the earlier review left open goes.
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
  const change = (await run(cfg.judge, fixPrompt({ pr, rules: cfg.rules, point }), { write: true })).trim();
  await $`git add -A`;
  if (!(await $`git diff --cached --quiet`.nothrow()).exitCode) return { ...point, fix: null, outcome: 'nofix' };
  await $`git commit -qm ${`Rule ${point.rule}: ${point.title}`} && git push -qf origin ${branch}`;
  const fixed = { ...point, change };
  const number = await openPull({
    base: umbrella,
    head: branch,
    title: fixTitle(point),
    body: description(fixed, pr),
  });
  return { ...fixed, fix: number, outcome: 'open' };
};

// The pull request's own drift first, all of it; then at most `backlog`
// points of drift that was already in the codebase.
const triage = (points) => {
  const existing = points.filter((point) => point.origin === 'existing');
  const brought = points.filter((point) => point.origin !== 'existing').sort((a, b) => (a.origin === 'combined') - (b.origin === 'combined'));
  return { kept: [...brought, ...existing.slice(0, backlog)], held: Math.max(existing.length - backlog, 0) };
};

const findings = (spec, list) =>
  `<details><summary>${label(spec)}: ${list.length} finding${list.length === 1 ? '' : 's'}</summary>\n\n\`\`\`json\n${JSON.stringify(list, null, 2)}\n\`\`\`\n</details>`;

// One line per failure: how the agent ended, then the last thing it said.
const reason = ({ message }) => {
  const [head, ...said] = message.split('\n').map((line) => line.trim()).filter(Boolean);
  return said.length ? `${head} ${said.at(-1).slice(0, 240)}` : head;
};

const examine = async (pr, cfg) => {
  const n = pr.number;
  await $`git config user.name "github-actions[bot]" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com"`;
  // The three-dot diff needs the merge base, which a default shallow checkout lacks.
  const unshallow = (await $`git rev-parse --is-shallow-repository`.text()).trim() === 'true' ? ['--unshallow'] : [];
  await $`git fetch -q ${unshallow} origin ${pr.baseRefName} pull/${n}/head && git reset -q --hard && git clean -qfd && git checkout -q -B ${umbrellaOf(n)} ${pr.headRefOid}`;
  const diff = await $`git diff ${`origin/${pr.baseRefName}...HEAD`}`.text();

  summary(`## #${n} ${pr.title}`);
  // Each reviewer settles on its own: the judge works from whichever answered.
  const settled = (await Promise.allSettled(cfg.reviewers.map(async (spec) => json(await run(spec, reviewPrompt({ pr, rules: cfg.rules, diff }))).findings))).map(
    (result, i) => ({ spec: cfg.reviewers[i], ...result }),
  );
  const reports = Object.fromEntries(settled.filter((r) => r.status === 'fulfilled').map(({ spec, value }) => [spec, value]));
  const failed = settled.filter((r) => r.status === 'rejected').map(({ spec, reason: error }) => ({ spec, reason: reason(error).replace(`${spec} `, '') }));
  Object.entries(reports).forEach(([spec, list]) => summary(findings(spec, list)));
  failed.forEach(({ spec, reason }) => summary(`${label(spec)} failed: ${reason}`));
  if (failed.length === settled.length) throw new Error(`every reviewer failed, nothing was judged: ${failed.map(({ spec, reason }) => `${spec} (${reason})`).join('; ')}`);

  // The judge's `fix` is kept as `proposal`: a written fix's PR number takes `fix`.
  const judged = json(await run(cfg.judge, judgePrompt({ pr, rules: cfg.rules, diff, reports }))).points.map(({ fix, ...point }) => ({ ...point, proposal: fix }));
  const { kept: points, held } = triage(judged);
  summary(`Judged by ${names([cfg.judge])}: ${points.length} point${points.length === 1 ? '' : 's'}${held ? `, ${held} more already in the codebase held back` : ''}`);

  // Only now is there a review to replace the last one with: a run that fails
  // before this leaves the earlier review and its fixes standing. From here
  // the section is this run's, so it never speaks for fixes retire closed.
  // Re-read: the author may have edited the description during the run.
  const data = { sha: pr.headRefOid, run: runUrl, reviewers: Object.keys(reports), failed, judge: cfg.judge, umbrella: { branch: umbrellaOf(n), pr: null }, held, points: [] };
  if (points.length) await setBody(n, write((await pull(n)).body, writing(pr, data, points.length)));
  await retire(n);
  if (points.length) await $`git push -qf origin ${umbrellaOf(n)}`;
  for (const [i, point] of points.entries()) data.points.push(await fix(pr, point, i, cfg));

  await setBody(n, write((await pull(n)).body, report(pr, data), data));
  return failed;
};

const attempt = async (n) => {
  const [cfg, pr] = await Promise.all([config(), pull(n)]);
  if (!reviewable(pr)) throw new Error(`#${n} comes from a fork or from Underlens itself — Underlens reviews branches of this repository`);
  const failed = await examine(pr, cfg).catch(async (error) => {
    // A section still holding an earlier review keeps it, and the red run says
    // the rest; any other section says this run failed.
    const { body } = await pull(n);
    if (!state(body)) await setBody(n, write(body, failure(pr, reason(error))));
    throw error;
  });
  if (failed.length) throw new Error(`#${n} was judged without ${failed.map(({ spec, reason }) => `${spec} (${reason})`).join(', ')}`);
};

export const review = async (n) => {
  await permitted();
  await attempt(n);
};
