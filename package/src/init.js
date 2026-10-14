import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const files = {
  'underlens.config.js': 'underlens.config.js',
  'underlens-quality-control.md': 'underlens-quality-control.md',
  '.github/workflows/underlens.yml': 'underlens.yml',
};

export default () => {
  Object.entries(files).forEach(([target, template]) => {
    if (existsSync(target)) return console.info(`kept     ${target}`);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(new URL(`../templates/${template}`, import.meta.url), target);
    console.info(`created  ${target}`);
  });
  console.info(`
Next:
  1. Write your rules into underlens-quality-control.md
  2. claude setup-token, then: gh secret set CLAUDE_CODE_OAUTH_TOKEN
     (other harnesses: https://underlens.korte.kim/#harnesses)
  3. Let workflows open PRs: gh api -X PUT repos/{owner}/{repo}/actions/permissions/workflow -F can_approve_pull_request_reviews=true
  4. Commit the three files to your default branch, then: gh workflow run underlens.yml`);
};
