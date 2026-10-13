// The sample PR the flow walks through, step by step.
export default {
  lanes: [
    { harness: 'Claude', findings: 3 },
    { harness: 'GPT', findings: 2 },
    { harness: 'GLM', findings: 2 },
  ],
  findings: [
    { harness: 'Claude', at: 'rule 3 · api.js:14' },
    { harness: 'GPT', at: 'rule 3 · api.js:14' },
    { harness: 'GLM', at: 'rule 3 · api.js:15' },
    { harness: 'Claude', at: 'rule 1 · cart.js:8' },
    { harness: 'GPT', at: 'rule 4 · package.json' },
    { harness: 'Claude', at: 'rule 4 · package.json' },
    { harness: 'GLM', at: 'rule 7 · no such rule', dropped: true },
  ],
};
