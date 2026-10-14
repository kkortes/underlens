# Quality control

Underlens holds the whole codebase to these rules and to nothing else, on every pull request it reviews: what the pull request brings in, what it causes together with existing code, and what was already there. Each rule is numbered and decidable: a reviewer can point at a line and say which rule it breaks. Taste no rule decides is never raised.

A point you disagree with comes back on every review for as long as its rule stands. That's by design — to settle it, change the code or change the rule here.

1. No `console.log` in committed code.
2. No commented-out code.
3. No `try`/`catch` that swallows an error: a caught error is handled, rethrown or reported.
4. A function does one thing its name says; a name that needs "and" is two functions.
5. No dependency is added for something a few lines of code would do.
6. Every new user-facing behaviour comes with a test that exercises it.
