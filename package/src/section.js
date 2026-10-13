import { names } from './config.js';
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

export const write = (body, content, data) =>
  `${(body ?? '').replace(fence, '').trimEnd()}\n\n<!-- underlens -->\n### Underlens\n\n${content}\n${data ? `<!-- underlens:state ${Buffer.from(JSON.stringify(data)).toString('base64')} -->\n` : ''}<!-- /underlens -->`.trimStart();

export const ticks = (body) =>
  Object.fromEntries([...(body ?? '').matchAll(/- \[[xX]\] (Agree|Disagree) <!-- (\d+) -->/g)].reverse().map(([, choice, fix]) => [fix, choice]));

const rulesLink = (pr) => `[\`underlens-quality-control.md\`](${process.env.GITHUB_SERVER_URL}/${repo}/blob/${pr.baseRefName}/underlens-quality-control.md)`;
const team = (config) => `with ${names(config.reviewers)}, judged by ${names([config.judge])}`;

export const announcement = (pr, config) => `Underlens is reviewing this PR now ${team(config)}, against ${rulesLink(pr)}. [Follow the run](${runUrl}).`;

const outcome = (point, data) =>
  ({
    open: `\n   - [ ] Agree <!-- ${point.fix} -->\n   - [ ] Disagree <!-- ${point.fix} -->`,
    agreed: ` — **Agreed**, merged into ${data.umbrella.pr ? `#${data.umbrella.pr}` : `\`${data.umbrella.branch}\``}.`,
    disagreed: ' — **Disagreed**, fix closed. It comes back next review while its rule stands.',
    conflict: ` — **Agreed**, but it conflicts with a fix merged before it: resolve #${point.fix} by hand.`,
    nofix: ' — no fix written; this one needs a person.',
  })[point.outcome];

export const report = (pr, data) => {
  const { points } = data;
  const head = `Reviewed \`${data.sha.slice(0, 7)}\` ${team(data)}, against ${rulesLink(pr)} · [run](${data.run})`;
  if (!points.length) return `${head}\n\nNothing in this PR breaks the quality document.`;
  const list = points
    .map((point, i) => `${i + 1}. **Rule ${point.rule} · ${point.title}**${point.line ? ` (\`${point.file}:${point.line}\`)` : ''} — ${point.detail}${point.fix ? ` Fix: #${point.fix}` : ''}${outcome(point, data)}`)
    .join('\n');
  return `${head}\n\n**Agree** merges a point's fix into \`${data.umbrella.branch}\`, which comes back to this PR as one PR of its own. **Disagree** closes the fix — the point returns on the next review for as long as its rule stands, so settle it for good by changing the quality document instead.\n\n${list}`;
};
