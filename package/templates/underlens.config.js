// Underlens reads this from your default branch: https://underlens.korte.kim
export default {
  // Who reviews, each in parallel. A string names the harness and the model:
  // 'claude', 'gpt', 'glm', 'gemini' or 'grok' alone runs that CLI's default
  // model, and a model ID like 'claude-opus-5-5' or 'gpt-6.1-sol' picks one.
  // Every model each harness takes: https://underlens.korte.kim/#models
  // Each harness needs its secret — check them all with
  // Actions → Underlens → Run workflow, PR left empty.
  reviewers: ['claude'],
  // Who folds the reviews into points and writes a fix PR for each.
  judge: 'claude',
};
