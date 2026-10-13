import { existsSync } from 'fs';
import { homedir } from 'os';

import config from './config.js';
import { own } from './review.js';
import { agent } from './harnesses.js';
import { ping } from './agents.js';
import { openPulls, summary } from './github.js';

const days = (since) => Math.floor((Date.now() - Date.parse(since)) / 86_400_000);

// Codex rotates its refresh token once auth.json is 8 days old, and a hosted
// runner can't save the rotated one back into the secret — past that age a
// seed signs in once and is spent. A runner that keeps ~/.codex is exempt.
const stale = (id) => {
  if (id !== 'gpt' || existsSync(`${homedir()}/.codex/auth.json`)) return;
  const age = days(JSON.parse(process.env.CODEX_AUTH_JSON).last_refresh);
  return age >= 8 && `auth.json was refreshed ${age} days ago: Codex rotates it on next use and this runner can't keep the new one. Run \`codex login\` and set CODEX_AUTH_JSON again.`;
};

// One row per reviewer and judge string, so two models on one harness are
// each pinged on their own.
const check = async (spec, cfg) => {
  const { id, harness: { name, secret, subscription }, model } = agent(spec);
  const roles = [cfg.reviewers.includes(spec) && 'reviewer', cfg.judge === spec && 'judge'].filter(Boolean).join(' + ');
  const row = { spec, name, model: model ?? 'CLI default', roles, auth: subscription ? 'subscription' : 'API key' };
  if (!process.env[secret]) return { ...row, ready: false, note: `secret \`${secret}\` is missing` };
  const spent = stale(id);
  if (spent) return { ...row, ready: false, note: spent };
  // Validation's whole job is to report each harness's failure side by side.
  const answer = await ping(spec).catch((error) => error.message);
  const ready = /\bREADY\b/.test(answer);
  return { ...row, ready, note: ready ? 'answered' : answer.trim().slice(0, 400).replaceAll('\n', ' ') };
};

export default async () => {
  const cfg = await config();
  const rows = await Promise.all(cfg.agents.map((spec) => check(spec, cfg)));
  const waiting = (await openPulls()).filter((pr) => !own(pr) && !pr.isDraft && !pr.body?.includes('<!-- underlens:state'));

  rows.forEach((row) => console.info(`${row.ready ? '✓' : '✗'} ${row.spec} (${row.roles}, ${row.auth}): ${row.note}`));
  summary(
    [
      '## Underlens · reviewers and judge',
      '',
      '| | Harness | Model | Role | Signs in with | |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows.map((row) => `| ${row.ready ? '✅' : '❌'} | ${row.name} | ${row.model} | ${row.roles} | ${row.auth} | ${row.note} |`),
      '',
      rows.every((row) => row.ready)
        ? `Ready. ${waiting.length} open PR${waiting.length === 1 ? '' : 's'} wait${waiting.length === 1 ? 's' : ''} for review.`
        : 'Not ready: fix the rows above, then run this again. Setup for each harness: https://underlens.korte.kim/#harnesses, model strings: https://underlens.korte.kim/#models',
    ].join('\n'),
  );
  if (!rows.every((row) => row.ready)) process.exit(1);
};
