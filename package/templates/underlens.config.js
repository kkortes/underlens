// Underlens reads this from your default branch: https://underlens.korte.kim
export default {
  // Who reviews, each in parallel on its own harness: 'claude', 'gpt', 'glm',
  // 'gemini' or 'grok'. Each one needs its secret — check them all with
  // Actions → Underlens → Run workflow, PR left empty.
  reviewers: ['claude'],
  // Who folds the reviews into points and writes a fix PR for each.
  judge: 'claude',
  // 'nightly' runs at the cron in .github/workflows/underlens.yml,
  // 'opened' as soon as a PR opens, 'manual' only from Run workflow.
  when: 'nightly',
  // A model per harness, when its CLI's default won't do.
  // models: { claude: 'opus' },
};
