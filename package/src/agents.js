import { tmpdir } from 'os';

import { agent } from './harnesses.js';

const minutes = (n) => n * 60_000;

// `spec` is a reviewer or judge string from the config: it names the harness
// and the model both.
export const run = async (spec, prompt, { write = false, timeout = minutes(30) } = {}) => {
  const { id, harness, model } = agent(spec);
  await harness.prepare?.();
  const out = `${process.env.RUNNER_TEMP ?? tmpdir()}/underlens-${id}-${crypto.randomUUID()}.txt`;
  const start = Date.now();
  const proc = Bun.spawn(harness.command({ write, model, out, prompt }), {
    stdin: new Blob([prompt]),
    stdout: 'pipe',
    stderr: 'pipe',
    env: harness.env?.(process.env, model) ?? process.env,
    timeout,
  });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const ended = Date.now() - start >= timeout ? `timed out after ${timeout / minutes(1)} minutes` : `exited ${code ?? proc.signalCode}`;
  if (code || proc.signalCode) throw new Error(`${spec} ${ended}:\n${(stderr || stdout).trim().slice(-2000)}`);
  return harness.output ? harness.output(stdout, out) : stdout;
};

// Agents wrap their JSON in prose or a fence often enough that the answer is
// read as the outermost object in whatever they said.
export const json = (text) => JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));

export const ping = (spec) => run(spec, 'Reply with the single word READY and nothing else.', { timeout: minutes(4) });

const context = ({ pr, rules }) => `Pull request #${pr.number} "${pr.title}" in this repository. The working directory is the pull request's head.

The quality document below is curated by a human and is the only standard this review holds the code to. Its rules are numbered.

<quality-document>
${rules}
</quality-document>`;

// Drift that was already in the codebase is worked down a few points per
// review, so the first review of an old codebase doesn't open a fix PR for
// every line of it. What the pull request brings in is always reported.
export const backlog = 10;

const diffBlock = (diff) => `<pull-request-diff>
${diff}
</pull-request-diff>`;

const origins = `- "pr": the pull request introduces it: the code that breaks the rule is in the diff.
- "combined": the pull request together with existing code breaks it: the change and code it leaves alone break the rule only together, or the change makes drift that was already there worse.
- "existing": it was there before the pull request, which doesn't make it worse.`;

export const reviewPrompt = ({ pr, rules, diff }) => `You are an Underlens reviewer. ${context({ pr, rules })}

${diffBlock(diff)}

The quality document holds the whole codebase, not only this pull request: review the code at the pull request's head against it. Do not edit any file.

Work rule by rule. Search the codebase for what each rule forbids or demands, and read only what the search turns up and what a rule needs read whole. Start with the files the diff touches and the code they reach, then sweep the rest. Skip what no person here writes: dependencies, vendored and generated files, lock files and build output.

The diff is what this pull request changes against its base; use it to say where each finding comes from:
${origins}

Report every "pr" and "combined" finding, and at most ${backlog} "existing" ones, those nearest the code this pull request touches first. Never report taste or anything no rule decides, and never mention a rule the code follows.

Answer with JSON only, nothing around it:
{"findings":[{"rule":4,"origin":"pr","file":"src/app.js","line":12,"detail":"what breaks the rule, in one or two sentences","fix":"the concrete change that satisfies the rule"}]}
An empty findings list is a valid answer.`;

export const judgePrompt = ({ pr, rules, diff, reports }) => `You are the Underlens judge. ${context({ pr, rules })}

${diffBlock(diff)}

Reviewers on different harnesses each reported where the code at this pull request's head breaks the quality document, and where each break comes from:
${origins}

<reports>
${JSON.stringify(reports, null, 2)}
</reports>

Consolidate them into points. Do not edit any file.
- One point per problem: findings about the same rule at the same place are one point, however differently they are worded.
- Check every finding against the code yourself. Drop it when the rule it cites doesn't exist or the code doesn't actually break it.
- Check every point's origin against the diff, and correct it where the reviewers got it wrong or disagree.
- Title each point after its rule and its place, plainly, so the same drift reads the same on every review.
- Give each point its rule's statement: the rule's own wording from the quality document, its heading or its line as written there, not a description of this point.

Answer with JSON only, nothing around it:
{"points":[{"rule":4,"origin":"pr","statement":"No defensive checks.","title":"No defensive checks in src/app.js","file":"src/app.js","line":12,"detail":"one or two sentences","fix":"the concrete change","raisedBy":["claude-opus-5-5","gpt"]}]}
An empty points list is a valid answer.`;

export const fixPrompt = ({ pr, rules, point }) => `You are applying one Underlens fix. ${context({ pr, rules })}

<point>
${JSON.stringify(point, null, 2)}
</point>

Make the smallest change that brings the code in line with rule ${point.rule} for this point, and nothing else: no other rule, no unrelated cleanup, no new files unless the fix needs one. Don't commit — Underlens commits what you change. When done, answer with what you changed and how that satisfies the rule, in one to three plain sentences for someone who hasn't opened the diff: no preamble, no markdown, nothing else.`;
