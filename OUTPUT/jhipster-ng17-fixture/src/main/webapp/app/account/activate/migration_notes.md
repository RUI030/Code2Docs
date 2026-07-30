<!-- code2docs:unit id="component:app/account/activate:ActivateComponent" schemaVersion="0.2.0" -->
<!--
  PHASE A OUTPUT — hand-written, not rendered. No extractor was involved.
  Paths are relative to:
  INPUT/jhipster-ng17-fixture/src/main/webapp/app/account/activate/
-->

# Migration Notes: Account Activation

> **This list is a lower bound, not a complete inventory.**
>
> Risk flagging works by pattern-matching against conditions such as "a subscription with no
> cancellation" — which presumes every subscription was found. Phase A has no verified
> extraction, so recall is unproven. Read the entries below as "hazards found," never as
> "hazards present." A short list here means the analysis was shallow, not that the component
> is safe.

## 1. Migration-Sensitive Behavior

| Severity | Category | Behavior at risk | Source |
|---|---|---|---|
| High | `rxjs-pipeline` | Concurrent redemption attempts are not cancelled; a stale reply can overwrite a newer one | `activate.component.ts:22` |
| High | `rxjs-pipeline` | A failure permanently ends the stream, so later address changes are ignored | `activate.component.ts:22-25` |
| Medium | `routing` | Address values are watched continuously, not read once, so redemption can re-run | `activate.component.ts:22` |
| Medium | `template-directive` | Both outcome messages can render together; neither condition excludes the other | `activate.component.html:5,11` |
| Low | `subscription-leak` | The subscription is never explicitly cancelled | `activate.component.ts:22` |
| Low | `di-assumption` | The activation service is an application-wide single instance | `activate.service.ts:7` |

### Detail

- **`rxjs-pipeline` — no cancellation between attempts (high)**
  - *What Angular does here:* the operator chaining address changes to redemption requests runs
    every attempt to completion in parallel. It does not abandon an in-flight request when a new
    address value arrives (`activate.component.ts:22`).
  - *What could silently break:* a rebuild that switches to cancel-previous semantics, or to a
    plain single fetch, changes which reply wins when two are in flight. Today the last reply to
    *arrive* sets the outcome, regardless of which was requested first. Either direction is
    defensible; changing it accidentally is not.
  - *Evidence:* `activate.component.ts:22`.

- **`rxjs-pipeline` — failure is terminal (high)**
  - *What Angular does here:* reporting a failure through the stream's error path ends the
    stream permanently. No further address values are processed
    (`activate.component.ts:22-25`).
  - *What could silently break:* most straightforward rebuilds handle an error per-request and
    remain ready for the next one — strictly *more* forgiving than the original. That difference
    is invisible in testing and changes recovery behavior after a transient failure. Preserving
    the current behavior is probably undesirable, but it must be a decision, not a side effect.
  - *Evidence:* `activate.component.ts:22-25`.

- **`routing` — continuous watch rather than a single read (medium)**
  - *What Angular does here:* the component subscribes to the stream of address query values, so
    it reacts to every change while it remains open, not just the value present on arrival
    (`activate.component.ts:22`).
  - *What could silently break:* reading the value once at startup — the more obvious approach —
    silently drops repeat redemption. Whether that loses anything real depends on whether the
    address can change while this screen is open; see the blocking open question in
    `requirement.md`.
  - *Evidence:* `activate.component.ts:22`.

- **`template-directive` — non-exclusive conditions (medium)**
  - *What Angular does here:* two independent conditional blocks, each testing its own flag, with
    no mutual exclusion and no reset of one when the other is set
    (`activate.component.html:5,11`; `activate.component.ts:23-24`).
  - *What could silently break:* a rebuild that naturally expresses this as one either/or branch
    would *fix* the double-message defect as a side effect — changing observable behavior while
    appearing to be a faithful translation. The fix is welcome; making it silently is not, since
    it means the original defect is never acknowledged.
  - *Evidence:* `activate.component.html:5,11`.

- **`subscription-leak` — no explicit cancellation (low)**
  - *What Angular does here:* the subscription created at startup is never cancelled, and there
    is no teardown handler (`activate.component.ts:21-26`).
  - *What could silently break:* little, most likely. The framework is understood to end
    address-value streams automatically when a routed screen is torn down, which would make this
    harmless — but that was asserted from knowledge, not verified here, which is why it is
    recorded rather than dismissed. A rebuild whose equivalent stream does *not* self-terminate
    would turn this into a real leak.
  - *Evidence:* `activate.component.ts:22`.

- **`di-assumption` — application-wide single instance (low)**
  - *What Angular does here:* the activation service is registered once for the whole
    application (`activate.service.ts:7`).
  - *What could silently break:* nothing observable in this case, because the service holds no
    state (`activate.service.ts:8-17`) — instance count is unobservable when there is nothing to
    share. Noted only so the scope is not assumed to matter elsewhere.
  - *Evidence:* `activate.service.ts:7`.

## 2. Suggested Functional Breakdown

None. The component has a single responsibility, one method, and two flags
(`activate.component.ts:14-27`). There is no seam worth separating.

## 3. Third-Party Dependencies

| Package | Used for | Direct equivalent in target? |
|---|---|---|
| Translation directive (via the shared presentation module) | Resolving all four visible strings from translation keys at display time (`activate.component.html:4,7,8,12`) | unknown |
| Alert styling classes (Bootstrap-style, from global styles) | Success and failure message appearance (`activate.component.html:6,12`) | unknown |

The component itself has **no direct third-party imports** — everything comes from the framework
or from internal shared modules (`activate.component.ts:1-6`).

## 4. Target Implementation Suggestions

Architectural recommendations for the target implementation.

**Human-owned by default.** The pipeline deliberately does not generate this: doing so would let
target-framework assumptions leak backward into the behavioral specification, which is the
failure mode the requirement/migration split exists to prevent. Fill this in during review, once
§1–§3 are understood.
