import { backlog } from './agents.js';
import { names, quality } from './config.js';
import { label } from './harnesses.js';
import { repo, runUrl } from './github.js';

// The section is fenced by hidden markers so it can be replaced wholesale
// without touching anything the author wrote around it. Its state rides along
// base64-encoded: agent prose can contain `-->`, which would end a comment.
const fence = /\s*<!-- underlens -->[\s\S]*?<!-- \/underlens -->/;
const stateTag = /<!-- underlens:state (\S+) -->/;

export const state = (body) => {
  const encoded = body?.match(fence)?.[0].match(stateTag)?.[1];
  return encoded && JSON.parse(Buffer.from(encoded, 'base64').toString());
};

const site = '[Underlens](https://underlens.korte.kim)';

// A section with state is a finished review; without, it's an announcement, a
// review still writing its fixes, or a failure note. An h2, so GitHub rules it
// off underneath like eave's footer.
export const write = (body, content, data) =>
  `${(body ?? '').replace(fence, '').trimEnd()}\n\n<!-- underlens -->\n## ${data ? `This PR was reviewed through ${site}` : site}\n\n${content}\n${data ? `<!-- underlens:state ${Buffer.from(JSON.stringify(data)).toString('base64')} -->\n` : ''}<!-- /underlens -->`.trimStart();

export const ticks = (body) =>
  Object.fromEntries([...(body ?? '').matchAll(/- \[[xX]\] (Agree|Disagree) <!-- (\d+) -->/g)].reverse().map(([, choice, fix]) => [fix, choice]));

const rulesLink = (pr) => `[\`${quality}\`](${process.env.GITHUB_SERVER_URL}/${repo}/blob/${pr.baseRefName}/${quality})`;
const team = (config) => `with ${names(config.reviewers)}, judged by ${names([config.judge])}`;

export const announcement = (pr, config) => `Underlens is reviewing this PR now ${team(config)}, against ${rulesLink(pr)}. [Follow the run](${runUrl}).`;

// The rule's headline, copied from the quality document when the review was
// judged. Only drift that predates the PR is marked: the PR's own, alone or
// together with code it leaves alone, is what a review of it is about. State
// written before rules were quoted carries only the judge's title, and state
// from diff-only reviews no origin.
const headline = (point) => `**${point.statement ?? point.title}**${point.origin === 'existing' ? ' · *Already in the codebase before this PR*' : ''}`;

export const fixTitle = (point) => `Underlens · ${point.title}`;
export const umbrellaTitle = (pr) => `Underlens fixes for #${pr.number}`;

// Explicit links: GitHub expands a bare #N into the PR's title without a way
// to tell it apart from the text around it.
const pullLink = (title, n) => `[#${n} ${title}](${process.env.GITHUB_SERVER_URL}/${repo}/pull/${n})`;

// The fix PR carries the long account: where the rule breaks, why, and what
// the fix changed. The section keeps the judge's one-line proposal.
export const description = (point, pr) =>
  `${headline(point)}\n\nIn \`${point.file}${point.line ? `:${point.line}` : ''}\`: ${point.detail}\n\n${point.change}\n\nAgree or disagree in #${pr.number}'s Underlens section — merging or closing this PR does the same.`;

const outcome = (point, data) =>
  ({
    open: `- [ ] Agree <!-- ${point.fix} -->\n- [ ] Disagree <!-- ${point.fix} -->`,
    agreed: `**Agreed**, merged into ${data.umbrella.pr ? `#${data.umbrella.pr}` : `\`${data.umbrella.branch}\``}.`,
    disagreed: '**Disagreed**, fix closed. It comes back next review while its rule stands.',
    conflict: `**Agreed**, but it conflicts with a fix merged before it: resolve #${point.fix} by hand.`,
  })[point.outcome];

// Each point is ruled off above, then its headline, the judge's one-line
// proposal and the fix PR to agree or disagree with. State written before
// proposals were kept carries what the fix changed, or the judge's detail
// where no fix was written.
const entry = (point, data) =>
  [
    '---',
    headline(point),
    point.proposal ?? point.change ?? point.detail,
    `**Proposed fix:**\n${point.fix ? pullLink(fixTitle(point), point.fix) : 'none written, this one needs a person.'}`,
    outcome(point, data),
  ]
    .filter(Boolean)
    .join('\n\n');

const intro = '### Report from Quality control\n\nFor each proposal underneath you can either *agree* (merges PR) or *disagree* (closes PR).';

// Written without state, so the PR still counts as unreviewed.
export const failure = (pr, reason) =>
  `Underlens couldn't review \`${pr.headRefOid.slice(0, 7)}\` · [run](${runUrl}): ${reason}\n\nA scheduled run tries again, or run the workflow with this PR's number.`;

const failures = (data) => (data.failed ?? []).map(({ spec, reason }) => `\n- ${label(spec)} failed: ${reason}`).join('');

// When the run finished, in UTC: a PR description can't show the reader's
// own time zone. A review still writing its fixes, or one from before, has none.
const finished = (data) => (data.finished ? ` finished ${data.finished.slice(0, 16).replace('T', ' ')} UTC` : '');

const reviewed = (pr, data) => `Reviewed \`${data.sha.slice(0, 7)}\` ${team(data)}, against ${rulesLink(pr)} · [run](${data.run})${finished(data)}${failures(data)}`;

// Written without state: its fixes aren't open yet, so there's nothing to tick.
export const writing = (pr, data, count) =>
  `${reviewed(pr, data)}\n\nJudged ${count} point${count === 1 ? '' : 's'}; their fixes are being written now, and the review lands here once the last one is open.`;

export const report = (pr, data) => {
  const { points } = data;
  const head = reviewed(pr, data);
  if (!points.length) return `${head}\n\nIt was judged that **nothing** in this PR and/or codebase is drifting from the quality control document.`;
  // In the quality document's order, which numbers its rules top to bottom.
  const list = points.toSorted((a, b) => a.rule - b.rule).map((point) => entry(point, data)).join('\n\n');
  return `${head}\n\n${intro}\n\n${list}${data.held ? `\n\n---\n\n${data.held} more point${data.held === 1 ? '' : 's'} already in the codebase ${data.held === 1 ? 'is' : 'are'} held back: a review takes on at most ${backlog} of those at a time.` : ''}`;
};
