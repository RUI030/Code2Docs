---
name: angular-semantics
description: Reference for reading Angular source and determining what each construct means behaviorally - decorators, dependency injection, lifecycle order, template syntax, RxJS, signals, forms, routing, change detection. Load whenever analyzing Angular code to document what it does, and consult before asserting that any Angular construct has a particular behavior.
---

# Angular semantics

Shared reference for every Code2Docs stage. Its job is one translation: **Angular construct →
observable behavior.** It does not say how to write documents; that belongs to
`requirements-writing`.

Thin by design. It covers high-frequency constructs and the traps that matter, and grows from
observed failures rather than speculation. If you meet a construct that is not here, say so in
an open question rather than inferring behavior from its name.

## How an Angular component is laid out

One component is a folder of sibling files:

| File | Holds |
|---|---|
| `*.component.ts` | logic: class, state, methods, declared dependencies |
| `*.component.html` | template: the visual structure and what it binds to |
| `*.component.scss` | styles, usually scoped to this component |
| `*.component.spec.ts` | tests — **behavior stated in near-English; the most reliable statement of intent in the codebase** |

Services, guards, pipes, and directives are separate files with the same `.ts` conventions.

## Reading order

1. **Decorator** (`@Component({...})`) — configuration, especially `changeDetection`.
2. **Class fields** — what state exists.
3. **Constructor and `inject()` calls** — what it depends on.
4. **Lifecycle hooks** — what happens when.
5. **Methods** — what it does.
6. **Template** — what the user sees and can trigger.
7. **Spec file** — what the authors believed it should do. Read this before finalizing any
   claim; it frequently contradicts a plausible-but-wrong reading of the logic.

## The central distinction

Separate **observable behavior** from **implementation mechanism**.

- Observable: "the save button is disabled until the form is valid."
- Mechanism: "`[disabled]` is bound to `form.invalid`."

Documents record the first and cite the second as evidence. Mechanism appears only in
`migration_notes.md`, where the concern *is* the mechanism.

## Construct → meaning

### Component interface

| Construct | Means |
|---|---|
| `@Input() x` / `x = input()` | data supplied by the parent |
| `x = input.required()` | parent **must** supply it |
| `@Output() y = new EventEmitter<T>()` / `y = output<T>()` | event this component raises for its parent |
| `z = model<T>()` | two-way: reads from and writes back to the parent |
| `@ViewChild(...)` | a reference to an element or child component in this template |
| `@HostListener('click')` | responds to an event on its own host element |

### Dependencies

`constructor(private svc: FooService)` and `svc = inject(FooService)` are equivalent: the
component declares what it needs and the framework supplies it. Consequences that matter:

- `@Injectable({ providedIn: 'root' })` means **one shared instance for the whole
  application**. State stored on it outlives every component and is visible to all of them.
- A service listed in a component's own `providers` gets a fresh instance per component
  instance — much weaker coupling. Check which case applies before describing shared state.

### Lifecycle, in order

`constructor` → `ngOnChanges` → `ngOnInit` → `ngDoCheck` → `ngAfterContentInit` →
`ngAfterViewInit` → (re-runs on change detection) → `ngOnDestroy`

Traps:

- **The constructor runs before inputs are set.** Reading an `@Input()` there yields
  `undefined`. `ngOnInit` is the first point inputs are available.
- `ngOnChanges` runs on *every* input change, including the first, before `ngOnInit`.
- `ngAfterViewInit` is the first point `@ViewChild` references exist.
- `ngOnDestroy` is where cleanup belongs. Its absence, where subscriptions exist, is a leak.

### Async: RxJS

An **Observable** is a stream of future values. Nothing happens until something subscribes.

| Construct | Means |
|---|---|
| `.subscribe(fn)` | start listening; **for HTTP, this is what actually sends the request** |
| `Subject` | a stream you push into; subscribers get only values sent *after* they subscribe |
| `BehaviorSubject` | same, but **immediately replays its current value** on subscribe |
| `\| async` in a template | subscribe, render, and unsubscribe automatically |
| `takeUntilDestroyed()` | auto-unsubscribe when the component is destroyed |
| `toSignal(obs$)` | expose a stream as a signal |

Operator meanings worth stating precisely:

- `map` transforms each value; `filter` drops some.
- `switchMap` **cancels the previous inner request** when a new value arrives — the standard
  choice for type-ahead search, and behaviorally different from `mergeMap` (runs all in
  parallel) and `concatMap` (queues them in order). If a document says "searches as you type,"
  which of these is used determines whether stale results can appear.
- `catchError` handles failure; without it, an error kills the stream permanently.
- `forkJoin` waits for **all** sources to complete; `combineLatest` emits on **every** change
  to any source.
- `debounceTime` waits for a quiet gap before emitting.

**Cold and single-emission:** `HttpClient` calls emit once and complete. Two subscriptions
send two requests.

### Async: signals

`signal(x)` is a value container; read it by calling it (`count()`). `computed(() => ...)`
derives from other signals and recomputes automatically. `effect()` runs on change.
Behaviorally, signals are synchronous current-value state — simpler than streams.

### Templates

Both syntaxes appear; Angular 17+ prefers the `@` block form.

| Old | New | Means |
|---|---|---|
| `*ngIf="cond"` | `@if (cond)` | include this content only when true |
| `*ngFor="let x of list"` | `@for (x of list; track x.id)` | repeat per item |
| `[ngSwitch]` | `@switch` | pick one branch |

Other syntax: `{{ expr }}` inserts a value; `[prop]="expr"` sets a property;
`(event)="handler()"` responds to an event; `[(ngModel)]="x"` binds both ways;
`| pipeName` formats a value; `#ref` names an element; `<ng-content>` is a slot for
parent-supplied content.

**The trap that matters most:** `*ngIf` / `@if` **destroys and recreates** its content. Any
component inside loses all its state and re-runs its full lifecycle when the condition
flips. This is not "hiding" — `[hidden]` and CSS hide while preserving state. Confusing the
two produces a migration that silently loses or retains state where the original did the
opposite. Always state which one the code uses.

`track` in `@for` (or `trackBy`) controls item identity: without correct tracking, rows are
destroyed and rebuilt rather than reordered, which resets in-row state.

### Forms

**Reactive** — structure declared in TypeScript:

- `FormGroup` groups controls; `FormControl` is one field; `FormArray` is a variable-length
  list. `FormBuilder` is shorthand for constructing them.
- `Validators.required`, `Validators.maxLength(50)` etc. are the rules. Async validators
  typically check against the server.
- `valueChanges` and `statusChanges` are streams. `setValue` requires the whole shape;
  `patchValue` accepts a subset. `markAsTouched` affects when errors display.
- Validity gates behavior: a form is `invalid` until rules pass, and submit is usually
  blocked on it.

**Template-driven** — structure implied by `[(ngModel)]` in the HTML. Simpler, less explicit.

### Routing

- `routerLink` / `router.navigate(...)` move between screens.
- `ActivatedRoute` supplies URL parameters. **`snapshot.paramMap.get('id')` reads the value
  once**; subscribing to `params` reacts to later changes. If the same component can be
  reused for a different id without being destroyed, the snapshot version silently shows stale
  data — a real, frequently-shipped bug worth flagging.
- **Guards** decide whether navigation is permitted. **Resolvers** fetch data before the
  screen loads, so the component may receive data it never requested itself.

### Change detection

`changeDetection: ChangeDetectionStrategy.OnPush` means the component re-renders only when an
input reference changes, an event fires inside it, or an observable it renders via `async`
emits. Consequence: **mutating an object in place may not update the display.** This is
behavior, not just performance, and it is a common source of migration surprises.

## When to stop and ask

Raise an open question rather than guessing when: a construct is absent from this reference;
a stream's completion or error path is unclear; whether a service instance is shared is
ambiguous; or logic depends on a third-party library whose behavior you cannot see. A stated
uncertainty is useful to a reviewer. A confident wrong claim is worse than a gap, because it
survives review.
