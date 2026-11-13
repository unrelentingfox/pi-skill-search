# pi-skill-search

Full-text search over Pi skills: names, descriptions, and `SKILL.md` bodies.
It includes skills that pi-skill-router hides behind route skills.

## Install

This is a local Pi package. Install its dependencies, then add its path to
`packages` in Pi settings:

```bash
npm ci --omit=dev
```

```json
"packages": ["/path/to/pi-skill-search"]
```

Pi does not install dependencies for local packages, so rerun
`npm ci --omit=dev` after a dependency change.

## Use

| Command | Tool | Shows |
| --- | --- | --- |
| `/skill-search <query>` | `skill_search` (`query`, optional `limit`) | Matching skills with route, `SKILL.md` path, and body snippet |

```text
[pi-skill-search]

Query: "invoice retry" (2 of 5 matches)

 - invoice-retry [route-billing] /home/me/skill-packs/finance/invoice-retry/SKILL.md
   Retry failed invoice payments.
 - writing-guide [top-level] /home/me/.pi/agent/skills/writing-guide/SKILL.md
   Style guide for customer wording.
   body: …explain why an invoice retry failed in plain words…
```

Labels: a route name for routed children, `route` for generated route skills,
and `top-level` for other skills. Disabled skills are excluded.

## Search

Search uses [MiniSearch](https://github.com/lucaong/minisearch). Matches in the
name weigh more than matches in the description, which weigh more than body
matches. Words of three or more letters match as prefixes; words of five or more
letters allow small typos. A skill must match every query word; when no skill
does, any matching word is enough. See
`src/search.ts` for current weights.

Bodies are read when a search runs and cached by file modification time.

## Skill sources

- The command uses Pi's base skill list.
- The tool uses the skill list from the most recent agent turn, because tools
  cannot read Pi's base skill options.
- Both add routed children from the `pi-skill-router:routes` event, so results
  do not depend on extension load order. Without pi-skill-router, search covers
  the prompt skills only.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).
