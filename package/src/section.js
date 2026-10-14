import { backlog } from './agents.js';
import { names } from './config.js';
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

const rulesLink = (pr) => `[\`underlens-quality-control.md\`](${process.env.GITHUB_SERVER_URL}/${repo}/blob/${pr.baseRefName}/underlens-quality-control.md)`;
const team = (config) => `with ${names(config.reviewers)}, judged by ${names([config.judge])}`;

export const announcement = (pr, config) => `Underlens is reviewing this PR now ${team(config)}, against ${rulesLink(pr)}. [Follow the run](${runUrl}).`;

const origins = {
  pr: 'Introduced by this PR.',
  combined: 'This PR together with existing code.',
  existing: 'Already in the codebase before this PR.',
};

// The rule in its own words, where the drift comes from, then what the fix
// changed. State written before fixes explained themselves carries only the
// judge's title and detail, and state from diff-only reviews no origin.
export const block = (point) => `**Rule ${point.rule}: ${point.statement ?? point.title}**\n*${origins[point.origin ?? 'pr']}*\n${point.change ?? point.detail}`;

const outcome = (point, data) =>
  ({
    open: `- [ ] Agree <!-- ${point.fix} -->\n- [ ] Disagree <!-- ${point.fix} -->`,
    agreed: `**Agreed**, merged into ${data.umbrella.pr ? `#${data.umbrella.pr}` : `\`${data.umbrella.branch}\``}.`,
    disagreed: '**Disagreed**, fix closed. It comes back next review while its rule stands.',
    conflict: `**Agreed**, but it conflicts with a fix merged before it: resolve #${point.fix} by hand.`,
    nofix: 'No fix written; this one needs a person.',
  })[point.outcome];

// An explicit link: GitHub expands a bare #N into the fix PR's whole title.
const fixLink = (point) => (point.fix ? `\nFix: [#${point.fix}](${process.env.GITHUB_SERVER_URL}/${repo}/pull/${point.fix})` : '');

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
  const list = points.map((point) => `${block(point)}${fixLink(point)}\n\n${outcome(point, data)}`).join('\n\n');
  return `${head}\n\n**Agree** merges a point's fix into \`${data.umbrella.branch}\`, which comes back to this PR as one PR of its own. **Disagree** closes the fix — the point returns on the next review for as long as its rule stands, so settle it for good by changing the quality document instead.\n\n${list}${data.held ? `\n\n${data.held} more point${data.held === 1 ? '' : 's'} already in the codebase ${data.held === 1 ? 'is' : 'are'} held back: a review takes on at most ${backlog} of those at a time.` : ''}`;
};
