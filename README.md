# Code2Docs

Reads an Angular codebase and writes down what it does — a human-reviewable requirement
specification plus a machine-readable dataset — so the behavior can be preserved when the code
is rebuilt in another framework.

This is **Stage 1** of a migration. It produces documentation and stops at a human approval
gate. It does not generate target-framework code.

## Why this exists

Rewriting an application framework-to-framework fails in a specific way: the new version looks
right and behaves subtly differently. A condition that used to reset a form now preserves it; a
search that used to cancel stale requests now shows them. Those differences reach production
because nothing flagged them.

Code2Docs' job is to write down the behavior precisely enough — and traceably enough — that a
reviewer can confirm it before anyone rebuilds anything.

## Status

**Phase A: proof of concept.** One agent, reading Angular source directly, no AST tooling. The
goal is to establish that generated requirement documents are accurate and useful *before*
investing in extraction infrastructure. See `plans/2_ImplementationPlan.md`.

Nothing here is production-ready. Templates and skills are expected to change based on POC
findings — that is the point of running it first.

## Usage

### Analyze one component

```
/code2docs-analyze INPUT/<path>/<component-folder>
```

This reads the component's `.ts`, `.html`, styles, and `.spec.ts` files and writes to
`OUTPUT/<mirrored path>/`:

| Output | What it is |
|---|---|
| `requirement.md` | The deliverable. Framework-neutral behavioral spec for human review. |
| `migration_notes.md` | Hazards that will not survive a naive rewrite. Separate so the spec stays framework-neutral. |
| `signature.json` | What the component is: public interface, dependencies, state outline. |
| `dependencies.json` | How it connects: in-file call graph, cross-file edges. |

`OUTPUT/` is gitignored scratch space. A run worth keeping — in particular the hand-derived
`signature.json` and `callGraph`, which are the baseline Phase 1's extractor gets measured
against — is promoted by **manually** copying the component folder to `examples/`, preserving
the same mirrored path. Promotion is deliberately a human step, and `examples/` is denied to
Edit/Write in `.claude/settings.json` so no agent can overwrite a promoted baseline.

You can also just ask in plain language — "document the component at `INPUT/.../foo`" — and the
relevant skills load automatically.

### Review the output

`requirement.md` is the artifact that matters. Read it and check it against the source.

Two kinds of error, and they are not equally easy to find:

- **False statements** — the document claims something the code does not do. Findable by
  reading both.
- **Omissions** — the code does something the document never mentions. **These are invisible
  from the document alone.** A document covering 9 of 12 behaviors reads exactly as complete
  and confident as one covering all 12.

### Score omissions without reading Angular

Angular projects ship test files (`*.spec.ts`) whose titles are already behavior statements in
plain English:

```
it('should disable the save button when the form is invalid', ...)
it('should navigate back to the list after a successful save', ...)
```

Extract every test title for the component, then check each one appears somewhere in
`requirement.md`. Any that does not is a **confirmed omission** — found by comparing two lists
of English sentences, with no Angular knowledge required.

Its limit: tests cover only part of a component's behavior, so this establishes a floor on
omissions, not a full measurement. Definitive review is owned by a separate team.

## Layout

```
.claude/skills/          the agent's instructions (auto-discovered, see below)
  angular-semantics/       Angular construct -> observable behavior
  requirements-writing/    how to write framework-neutral requirements
  migration-risk-flagging/ hazards that break silently in a rewrite
  code2docs-analyze/       the workflow entry point
plans/
  0_ProjectDescription.md  intent, scope, artifact model
  1_Decisions.md           D1-D10, append-only decision records
  2_ImplementationPlan.md  phases, risks, next steps
templates/               output shapes (5 JSON tiers + 2 rendered Markdown views)
tools/                   Resolver CLI — Phase 1, not yet built
examples/                promoted runs — reference output and Phase 1 baseline, hand-curated
INPUT/                   Angular source under analysis (gitignored)
OUTPUT/                  generated documentation, scratch (gitignored)
```

## Skills and slash commands

**No registration needed.** Claude Code discovers skills by location: any
`.claude/skills/<name>/SKILL.md` in the project is picked up automatically. There is nothing to
add to `settings.json`.

Two ways they activate:

- **Automatically.** Claude reads each skill's `description` frontmatter and loads the relevant
  ones when a task matches. This is the main path, and why those descriptions are written to
  say *when* to use the skill rather than just what it contains.
- **Explicitly, as a slash command.** Typing `/code2docs-analyze` invokes it by name.

That difference is worth keeping in mind when adding more:

| | Skill | Slash command (`.claude/commands/*.md`) |
|---|---|---|
| Invoked by | model, when relevant — or by name | user, explicitly |
| Good for | knowledge and procedure | a fixed task you trigger often |

`angular-semantics` is pure reference — you would never "run" it, you want it loaded when
Angular is being read. `code2docs-analyze` is a workflow, so it is written to work either way.

## Design invariants

Four rules the whole design rests on. Full reasoning in `plans/1_Decisions.md`.

1. **No fact is stored twice.** The JSON tiers are one dataset with one id space, split by
   access pattern for cheap random access. Two files asserting the same thing would eventually
   disagree, and then neither could be trusted.
2. **`ast` content is deterministic; `doc` content cites it.** Extracted facts are reproducible
   from unchanged source and contain no model output. Every model-written claim carries
   `evidence` ids that must resolve. Dangling evidence is a hard failure.
3. **Markdown is rendered from JSON, never written twice.** Prose is stored finished in the
   JSON and assembled mechanically, so the document cannot contradict the data. Rendering
   merges rather than overwrites — human review edits are preserved.
4. **Nothing describes the target framework.** `requirement.md` stays valid if the migration
   target changes, and readable by domain experts who do not know it. Target material lives in
   `migration_notes.md`.

## Roadmap

| Phase | |
|---|---|
| **A** | Skills-only POC, component level, no tooling ← **here** |
| 0 | Revise templates from POC findings; JSON schemas; referential-integrity checker |
| 1 | Resolver: deterministic extraction via the TypeScript Compiler API |
| 2 | Repo inventory and cross-unit dependency graph |
| 3 | Agent wiring, one unit end to end |
| 4 | Decide whether the Explainer stage earns its place, then build it |
| 5 | Requirements Synthesizer and the Markdown renderer |
| 6 | Scale, caching, resumable runs |
| 7 | Evaluation and the human review loop |
