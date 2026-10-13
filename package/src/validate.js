import { existsSync } from 'fs';
import { homedir } from 'os';

import config from './config.js';
import harnesses from './harnesses.js';
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

const check = async (id, cfg) => {
  const { name, secret, subscription } = harnesses[id];
  const roles = [cfg.reviewers.includes(id) && 'reviewer', cfg.judge === id && 'judge'].filter(Boolean).join(' + ');
  const row = { name, roles, auth: subscription ? 'subscription' : 'API key' };
  if (!process.env[secret]) return { ...row, ready: false, note: `secret \`${secret}\` is missing` };
  const spent = stale(id);
  if (spent) return { ...row, ready: false, note: spent };
  // Validation's whole job is to report each harness's failure side by side.
  const answer = await ping(id, cfg.models[id]).catch((error) => error.message);
  const ready = /\bREADY\b/.test(answer);
  return { ...row, ready, note: ready ? 'answered' : answer.trim().slice(0, 400).replaceAll('\n', ' ') };
};

export default async () => {
  const cfg = await config();
  const rows = await Promise.all(cfg.harnesses.map((id) => check(id, cfg)));
  const waiting = (await openPulls()).filter((pr) => !pr.headRefName.startsWith('underlens/') && !pr.isDraft && !pr.body?.includes('<!-- underlens:state'));

  rows.forEach((row) => console.info(`${row.ready ? '✓' : '✗'} ${row.name} (${row.roles}, ${row.auth}): ${row.note}`));
  summary(
    [
      '## Underlens · harnesses',
      '',
      '| | Harness | Role | Signs in with | |',
      '| --- | --- | --- | --- | --- |',
      ...rows.map((row) => `| ${row.ready ? '✅' : '❌'} | ${row.name} | ${row.roles} | ${row.auth} | ${row.note} |`),
      '',
      rows.every((row) => row.ready)
        ? `Ready. ${waiting.length} open PR${waiting.length === 1 ? '' : 's'} wait${waiting.length === 1 ? 's' : ''} for review.`
        : 'Not ready: fix the rows above, then run this again. Setup for each harness: https://underlens.korte.kim/#harnesses',
    ].join('\n'),
  );
  if (!rows.every((row) => row.ready)) process.exit(1);
};
