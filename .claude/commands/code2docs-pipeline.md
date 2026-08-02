# /code2docs-pipeline

Run the Phase 3 documentation pipeline on one Angular unit.

**Usage:** `/code2docs-pipeline <unit-source-file> [--unit-path <logical-path>]`

Example:
```
/code2docs-pipeline INPUT/src/app/account/activate/activate.component.ts
/code2docs-pipeline INPUT/src/app/entities/post/update/post-update.component.ts --unit-path app/entities/post/update
```

---

## What it does

Runs the full orchestration on a single unit:

1. **Resolver** — extracts `signature.json`, `dependencies.json`, `template.json`,
   `functions.json` from the Angular source using the TypeScript Compiler API
2. **Explainer** (complexity-gated) — fills `doc.explanation` per symbol if
   `linesOfCode > 200` OR method count `> 10`
3. **Synthesizer** — writes `analysis.json` via StructureAgent → BehaviorAgent →
   CritiqueAgent pipeline
4. **Validate + integrity-check + render** — schema validation, referential integrity, then
   `requirement.md` + `migration_notes.md` rendered

Output lands in `OUTPUT/<unit-path>/`.

---

## Steps to follow

1. Parse the arguments:
   - `unitSourceFile` — the `.ts` path provided (absolute or relative to project root)
   - `unitPath` — from `--unit-path` if given; otherwise derive by stripping the `INPUT/`
     prefix and the filename from the source path
     (e.g. `INPUT/src/app/account/activate/activate.component.ts` →
     `src/app/account/activate`)
   - `outputDir` — `OUTPUT/<unitPath>/` (create if absent)
   - `repoRoot` — current working directory (the project root)

2. Confirm `unitSourceFile` exists before proceeding.

3. Invoke the **orchestrator** agent:
   ```
   Agent: orchestrator
   Input: { unitSourceFile, unitPath, outputDir, repoRoot }
   ```

4. Report the orchestrator's final summary to the user:
   - tiers written
   - complexity path taken (simple / complex)
   - open questions count (blocking / non-blocking)
   - validation and integrity-check result
   - rendered file paths, or failure reason

---

## Notes

- Running on a single unit without the repo index is expected — `outboundUnitEdges` and
  `httpInteractions` will be empty. Run `npm run resolve -- index <src-root>` first if you
  want cross-unit edges backfilled.
- Phase A skills (`/code2docs-analyze`, `angular-semantics`, etc.) are not invoked by this
  pipeline — they are the D11 baseline and must remain unmodified.
- `OUTPUT/` is gitignored. Promote a run worth keeping by copying the unit folder to
  `examples/` manually.
