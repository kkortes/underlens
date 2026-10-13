import { $ } from 'bun';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';

const home = homedir();
const flag = (name, value) => (value ? [name, value] : []);

const claudeCode = ({ write, model }) => [
  'bunx',
  '@anthropic-ai/claude-code',
  '-p',
  '--output-format',
  'text',
  '--permission-mode',
  write ? 'acceptEdits' : 'dontAsk',
  ...flag('--model', model),
  '--allowedTools',
  write ? 'Read,Grep,Glob,Edit,Write' : 'Read,Grep,Glob',
];

// Every harness runs its own CLI headless, signed in from one repo secret.
// `subscription: false` marks the harnesses whose vendor offers no
// subscription sign-in for CI — they run on an API key, said plainly
// everywhere they show up.
export default {
  claude: {
    name: 'Claude',
    secret: 'CLAUDE_CODE_OAUTH_TOKEN',
    subscription: true,
    command: claudeCode,
  },
  gpt: {
    name: 'GPT',
    secret: 'CODEX_AUTH_JSON',
    subscription: true,
    // A self-hosted runner keeps ~/.codex between runs, and with it the token
    // Codex rotated last time — the secret only seeds a runner that has none.
    prepare: () => {
      if (existsSync(`${home}/.codex/auth.json`)) return;
      mkdirSync(`${home}/.codex`, { recursive: true });
      writeFileSync(`${home}/.codex/auth.json`, process.env.CODEX_AUTH_JSON, { mode: 0o600 });
    },
    command: ({ write, model, out }) => [
      'bunx',
      '@openai/codex',
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      write ? 'workspace-write' : 'read-only',
      ...flag('-m', model),
      '-o',
      out,
      '-',
    ],
    output: (stdout, out) => Bun.file(out).text(),
  },
  gemini: {
    name: 'Gemini',
    secret: 'GEMINI_API_KEY',
    subscription: false,
    command: ({ write, model }) => [
      'bunx',
      '@google/gemini-cli',
      '--output-format',
      'json',
      ...(write ? ['--yolo'] : []),
      ...flag('-m', model),
    ],
    output: (stdout) => JSON.parse(stdout).response,
  },
  grok: {
    name: 'Grok',
    secret: 'XAI_API_KEY',
    subscription: false,
    // The npm package swaps in its native binary from a postinstall script,
    // which bunx doesn't run — xAI's installer puts the binary in place.
    prepare: async () => existsSync(`${home}/.grok/bin/grok`) || (await $`curl -fsSL https://x.ai/cli/install.sh | bash`.quiet()),
    command: ({ write, model, out, prompt }) => {
      writeFileSync(`${out}.prompt`, prompt);
      return [`${home}/.grok/bin/grok`, '--prompt-file', `${out}.prompt`, '--permission-mode', write ? 'acceptEdits' : 'dontAsk', '--tools', write ? 'read_file,list_dir,grep,search_replace,write' : 'read_file,list_dir,grep', '--output-format', 'json', ...flag('-m', model)];
    },
    // A denied tool cancels the whole turn, so only the allowed ones are
    // offered; plain output stops at the first message of a turn with tools.
    output: (stdout) => JSON.parse(stdout).text,
  },
  glm: {
    name: 'GLM',
    secret: 'GLM_API_KEY',
    subscription: true,
    // Z.ai's Coding Plan runs inside Claude Code against Z.ai's
    // Anthropic-compatible endpoint, so a Claude token must not leak in.
    env: ({ CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, ...env }) => ({
      ...env,
      ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
      ANTHROPIC_AUTH_TOKEN: env.GLM_API_KEY,
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.3',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.3',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-5.3-flash',
      API_TIMEOUT_MS: '3000000',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    }),
    command: claudeCode,
  },
};
