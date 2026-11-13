# Contributing

1. Use Node 22.19 or newer.
2. Run `npm ci` in this directory.
3. Run `npm run check` before committing. It runs the c8 coverage gate (95%
   statements, lines, functions, and branches) for `index.ts` and `src/**/*.ts`,
   then type checking. Only `src/types.ts`, a type-only module, is excluded.
4. Tools and commands must never throw; report failures as text.
5. Never commit `node_modules/` or `coverage/`.

Tests use Node's built-in test runner. `scripts/pi-resolve.mjs` resolves
`@earendil-works/*` imports to the pinned development copy of Pi, or to
`PI_ROOT`.

## Commit messages

Use semantic commit messages: `<type>(<scope>)?: <summary>`, with the 50/72
rule.
