import { close, merge, openPull, pull, setBody } from './github.js';
import { report, state, ticks, write } from './section.js';
import { own, retire } from './review.js';

// The umbrella PR can only open once a fix is in it: GitHub refuses a PR
// with no commits between its branches.
const settle = async (pr, data) => {
  if (data.points.some((point) => point.outcome === 'agreed') && !data.umbrella.pr)
    data.umbrella.pr = await openPull({
      base: pr.headRefName,
      head: data.umbrella.branch,
      title: `Underlens fixes for #${pr.number}`,
      body: `The fixes agreed on in #${pr.number}'s Underlens section. Merge this to take them into #${pr.number}.`,
    });
  await setBody(pr.number, write(pr.body, report(pr, data), data));
};

// Ticking a box edits the description, which is the only event a checkbox
// fires — every tick in the body is acted on, so ticks made while an earlier
// run was busy are caught up by the next.
export const ticked = async (n) => {
  const pr = await pull(n);
  const data = state(pr.body);
  const choices = ticks(pr.body);
  const pending = data?.points.filter((point) => point.outcome === 'open' && choices[point.fix]) ?? [];
  if (!pending.length) return;
  for (const point of pending) {
    if (choices[point.fix] === 'Disagree') await close(point.fix);
    point.outcome = choices[point.fix] === 'Disagree' ? 'disagreed' : (await merge(point.fix)) ? 'agreed' : 'conflict';
  }
  await settle(pr, data);
};

// A fix PR merged or closed by hand counts as Agree or Disagree; the original
// PR closing takes everything Underlens opened for it along.
export const closed = async (n) => {
  const pr = await pull(n);
  const original = pr.headRefName.match(/^underlens-pr-(\d+)-/)?.[1];
  if (!original) return own(pr) || retire(n);
  const target = await pull(original);
  const data = state(target.body);
  const point = data?.points.find((p) => p.fix === n && ['open', 'conflict'].includes(p.outcome));
  if (!point) return;
  point.outcome = pr.state === 'MERGED' ? 'agreed' : 'disagreed';
  await settle(target, data);
};
