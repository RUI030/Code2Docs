---
name: migration-risk-flagging
description: Identify Angular behavior that will not survive a naive rewrite - shared mutable service state, RxJS pipelines, lifecycle ordering, change detection, DOM access, form semantics, style encapsulation, routing, subscription leaks. Load when producing migration_notes.md or the migration section of analysis.json.
---

# Flagging migration risk

Populate `migration_notes.md` (and `analysis.json#/migration`): the Angular-specific
assumptions that a rewrite is likely to break **silently**. Pair with `angular-semantics` for
what each construct actually does.

## Your output is a lower bound. Say so.

Risk flagging works by pattern-matching against conditions like "a subscription with no
unsubscribe" — which presumes you found *every* subscription. Without verified extraction that
recall is unproven, so this list is "risks found," never "all risks."

State that in the document. Under-reported risk is worse than absent risk: an empty list reads
as "not yet analyzed," while a short list reads as "analyzed, and it's fine." The second
manufactures confidence that is not warranted.

## What qualifies

Every entry must name a **concrete observable behavior that could change**. "This component is
complex" is not a risk. "This uses RxJS heavily" is not a risk.

Each entry states:

1. **What Angular does here** — the specific framework guarantee being relied on.
2. **What could silently break** — the observable difference if reimplemented naively.
3. **Evidence** — file and line.

The word *silently* is the filter. A rewrite that crashes gets caught immediately and costs
little. A rewrite that renders the same and behaves subtly differently reaches production. Rank
by that, not by implementation difficulty.

## Never prescribe the solution

Name the hazard; do not design the replacement. No target-framework APIs, libraries, or
patterns — not in `analysis.json`, and not in §1–§3 of `migration_notes.md`. Target
suggestions are human-owned (§4) precisely so that target assumptions cannot leak backward
into the behavioral specification.

## Taxonomy

Use these category ids.

**`mutable-service-state`** — a shared service instance (`providedIn: 'root'`) holding state
that components mutate. Angular guarantees one instance app-wide, so writes here are visible
everywhere. The most under-appreciated hazard on this list: it looks like local state at the
call site and behaves like a global variable.

**`rxjs-pipeline`** — operator choice carries behavior. `switchMap` cancels in-flight work;
`mergeMap` does not, so stale responses can arrive out of order. `BehaviorSubject` replays its
current value on subscribe and `Subject` does not, which changes what a late subscriber sees.
`combineLatest` fires on every change; `forkJoin` waits for completion. Rewrites routinely
substitute a simple fetch and lose cancellation.

**`subscription-leak`** — subscriptions without `takeUntilDestroyed`, an `async` pipe, or
`ngOnDestroy` cleanup. Flag both existing leaks and cleanup the rewrite must preserve.

**`lifecycle-ordering`** — logic depending on Angular's hook order: inputs unavailable in the
constructor, `@ViewChild` unavailable before `ngAfterViewInit`, work that must complete before
other work. Other frameworks order these differently.

**`change-detection`** — `OnPush` components, where in-place mutation may not update the
display. This is observable behavior, not performance tuning.

**`direct-dom-access`** — `document.*`, `ElementRef.nativeElement`, manual event listeners,
direct focus or scroll manipulation. Bypasses the framework and rarely ports cleanly.

**`forms-semantics`** — validation timing, `touched`/`dirty` states governing when errors
appear, async validators, `setValue` versus `patchValue`, disabled controls being excluded from
the form value. The visible rules are easy to port; the timing rules are what get lost.

**`template-directive`** — `*ngIf` destroying and recreating content (state loss) versus
hiding, `track`/`trackBy` identity governing whether rows are reused or rebuilt, content
projection, `ng-template` outlets.

**`routing`** — `snapshot` parameter reads that do not react to later URL changes, guards and
resolvers supplying data before the unit loads, navigation side effects.

**`di-assumption`** — injection scope: app-singleton versus per-component instance, optional
dependencies, injection tokens. Getting the scope wrong converts shared state into isolated
state or the reverse.

**`style-encapsulation`** — `::ng-deep`, `:host`, disabled encapsulation. Angular scopes styles
per component by default; assumptions about that leak.

**`third-party-dependency`** — Angular-specific packages with no obvious equivalent. Record
what it is used for behaviorally, so a replacement can be judged on behavior rather than API
shape.

**`security`** — `innerHTML` bindings, bypassed sanitization. Note both the behavior and that
sanitization must be preserved.

## Severity

**High** — silently produces wrong data, wrong permissions, or lost user work. Shared mutable
state, cancellation semantics, and validation timing usually land here.

**Medium** — visibly wrong but obvious in testing: state resetting unexpectedly, styles
leaking, a display not refreshing.

**Low** — cosmetic or easily caught.

Judge by consequence and detectability, not by how hard the fix looks.

## Suggested decomposition

Only where the existing code has a genuine seam: a distinct responsibility with its own state
and methods that barely touch the rest. Cite the members that would move. These are
observations about the current structure, never a proposed target architecture — and if a unit
has one responsibility, say nothing.
