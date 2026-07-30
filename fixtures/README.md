# Fixtures

Small hand-written Angular files, each isolating one construct. These — not `INPUT/` — are what
the extractor's unit tests run against.

## Why hand-written

`INPUT/` is one vendored repository, and the Phase A corpus was two components from it, both
generated. Generated code is far more regular than hand-written code: consistent member
ordering, no unusual formatting, one idiom per construct. An extractor tuned against it passes
on that repository and fails elsewhere, silently — which is the specific failure D3 warns about,
since a mis-parse produces confidently wrong metadata rather than an error.

The same bias already reached the schemas: thirteen fields exist because those two components
reached for them (`plans/3_PhaseAFindings.md` F5a). These fixtures are the correction.

## Why pairs

Every fixture has a partner expressing **the same semantics in different syntax** — decorator
inputs against signal inputs, `*ngIf` against `@if`, `takeUntilDestroyed` against a manual
`Subscription`. The pair *is* the assertion: both members must extract to equivalent output,
differing only in the field recording which syntax was used.

This catches what a single fixture cannot. An extractor typically handles the idiom it was
written against and mishandles the other, and because both produce *some* output, nothing
fails — the metadata is just wrong. A pair makes that visible as a diff.

It also surfaces genuine asymmetries rather than hiding them. `@for` has an `@empty` branch with
no structural-directive equivalent; `model()` has no decorator form. Those are recorded as
expected differences in `fixtures.json`, not smoothed over.

## Layout

```
fixtures.json          what each pair isolates and what must be extracted
<construct>/           one member of a pair
  *.ts, *.html         the fixture source
  expected.<tier>.json the golden -- output the Resolver must produce
```

`fixtures.json` is written as a specification, before the Resolver exists, so it states what
correct output *is* rather than describing whatever the extractor happens to emit.

## Running

```
npm run golden
```

Until Phase 1 there is no extractor and therefore no goldens to diff against. The runner checks
what it can: every declared fixture exists, every pair has both members, no undeclared folders,
and any golden already written is itself a schema-valid instance. That last check matters —
a golden is the specification of correct output, so a malformed one would encode a wrong
specification and the extractor would be built to satisfy it.

## Gaps

`fixtures.json#/notCoveredYet` names constructs with no fixture yet, so their absence is a
decision rather than an oversight. The one that matters most is the last: cross-component shared
mutable service state is the highest-severity item in the migration risk taxonomy and is not
observable from a single unit, so no fixture of this shape can cover it. It needs Phase 2.
