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

// The rule as the quality document words it. Only drift that predates the PR
// is marked: the PR's own, alone or together with code it leaves alone, is
// what a review of it is about. State written before the judge quoted rules
// carries only its title, and state from diff-only reviews no origin.
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

// State written before proposals were kept carries what the fix changed, or
// the judge's detail where no fix was written.
const entry = (point, data) =>
  [
    `${headline(point)}\nProposed fix: ${point.fix ? pullLink(fixTitle(point), point.fix) : 'none written, this one needs a person.'}\n${point.proposal ?? point.change ?? point.detail}`,
    outcome(point, data),
  ]
    .filter(Boolean)
    .join('\n\n');

const proposals = (pr, data) =>
  `### Drifts from ${rulesLink(pr)} & proposed fixes\n\nFor each of these proposals you can either **agreed** (merges PR) or **disagreed** (closes PR) with the proposed changes.\n\nAll agreed changes are merged to a single PR, ${data.umbrella.pr ? pullLink(umbrellaTitle(pr), data.umbrella.pr) : `${umbrellaTitle(pr)} (it opens with the first agreed fix)`}, which you can decide to merge as a whole if you want.`;

// Written without state, so the PR still counts as unreviewed.
export const failure = (pr, reason) =>
  `Underlens couldn't review \`${pr.headRefOid.slice(0, 7)}\` · [run](${runUrl}): ${reason}\n\nA scheduled run tries again, or run the workflow with this PR's number.`;

const failures = (data) => (data.failed ?? []).map(({ spec, reason }) => `\n- ${label(spec)} failed: ${reason}`).join('');

const reviewed = (pr, data) => `Reviewed \`${data.sha.slice(0, 7)}\` ${team(data)}, against ${rulesLink(pr)} · [run](${data.run})${failures(data)}`;

// Written without state: its fixes aren't open yet, so there's nothing to tick.
export const writing = (pr, data, count) =>
  `${reviewed(pr, data)}\n\nJudged ${count} point${count === 1 ? '' : 's'}; their fixes are being written now, and the review lands here once the last one is open.`;

export const report = (pr, data) => {
  const { points } = data;
  const head = reviewed(pr, data);
  if (!points.length) return `${head}\n\nIt was judged that **nothing** in this PR and/or codebase is drifting from the quality control document.`;
  // In the quality document's order, which numbers its rules top to bottom.
  const list = points.toSorted((a, b) => a.rule - b.rule).map((point) => entry(point, data)).join('\n\n');
  return `${head}\n\n${proposals(pr, data)}\n\n${list}${data.held ? `\n\n${data.held} more point${data.held === 1 ? '' : 's'} already in the codebase ${data.held === 1 ? 'is' : 'are'} held back: a review takes on at most ${backlog} of those at a time.` : ''}`;
};
