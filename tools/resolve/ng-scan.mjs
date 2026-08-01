/**
 * Text-search recall audit (D3a job 4).
 *
 * The extractors' hardest property to verify is RECALL. A golden file cannot
 * check it: goldens are written from the extractor's own output, so an extractor
 * that has always missed a construct produces a stable, passing golden forever.
 * The pair fixtures catch a construct handled in one syntax and not another, but
 * not one missed in both.
 *
 * So: count the same constructs a second way, crudely, and compare. If grep sees
 * nine `@Input` and the compiler reported seven, that gap is a bug signal. It is
 * cheap and it catches the one failure this phase is most exposed to -- an
 * extractor returning seven of nine and reporting success.
 *
 * THE RULE THAT MAKES THIS SAFE (D3a): text-search results never write into `ast`
 * fields. Quietly merging fuzzy matches would destroy the determinism invariant
 * and corrupt the very omission metric the extractor exists to provide -- a field
 * half-filled by grep looks complete.
 *
 * That rule is enforced structurally rather than by discipline: every function
 * here returns NUMBERS ONLY. There is no code path by which this module can
 * produce a record, an id, or a name, so there is nothing shaped like `ast`
 * content for a caller to mistakenly assign. `countConstructs` asserts it.
 *
 * DIRECTION OF ERROR, stated because it decides what we do with a mismatch: text
 * counting is an UPPER bound. It cannot see that `@Input` appeared inside a
 * comment it failed to strip, or that `.subscribe(` belonged to a non-Observable.
 * So `scan > ast` means "possibly missed, look" -- a warning. `ast >= scan` is
 * normal and silent: the compiler legitimately sees declarations no literal
 * substring reveals, such as an inherited or aliased one.
 */

/**
 * Remove line comments, block comments and string/template literals.
 *
 * Crude on purpose -- a real lexer here would be re-implementing the compiler we
 * are trying to cross-check, and a cross-check that shares the thing it checks is
 * worth nothing. This only has to be good enough that the FALSE-POSITIVE rate
 * stays low; the direction-of-error note above covers the rest.
 */
function stripNonCode(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === "/" && d === "/") { while (i < n && text[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n && text[i] !== q) { if (text[i] === "\\") i++; i++; }
      i++;
      out += " ";           // keep tokens either side from fusing
      continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * The constructs worth counting: ones where a raw occurrence count is meaningful.
 *
 * Deliberately NOT everything the extractors emit. Counting `@if` blocks is
 * meaningful; counting "bindings" is not, because one element carries several and
 * no substring marks the boundary. A metric nobody can interpret produces
 * warnings nobody acts on.
 */
const PATTERNS = Object.freeze({
  // key                     where the ast answer lives      regex
  decoratorInputs:  { tier: "signature", re: /@Input\s*\(/g },
  decoratorOutputs: { tier: "signature", re: /@Output\s*\(/g },
  injectCalls:      { tier: "signature", re: /(?<![.\w])inject\s*\(/g },
  lifecycleHooks:   { tier: "signature", re: /\bng(OnInit|OnDestroy|OnChanges|DoCheck|AfterContentInit|AfterContentChecked|AfterViewInit|AfterViewChecked)\s*\(/g },
  subscribeCalls:   { tier: "functions", re: /\.subscribe\s*\(/g },
});

/** Template constructs, counted against template.json. Templates have no comments to strip in the TS sense. */
const TEMPLATE_PATTERNS = Object.freeze({
  ifBlocks:      /(?:^|[^@\w])@if\s*\(/g,
  forBlocks:     /(?:^|[^@\w])@for\s*\(/g,
  switchBlocks:  /(?:^|[^@\w])@switch\s*\(/g,
  deferBlocks:   /(?:^|[^@\w])@defer\b/g,
  ngIfUses:      /\*ngIf\s*=/g,
  ngForUses:     /\*ngFor\s*=/g,
});

const countOf = (text, re) => (text.match(re) ?? []).length;

/**
 * @returns {Readonly<Record<string, number>>} counts only -- see the module header.
 */
export function countConstructs(sourceText, templateText = "") {
  const code = stripNonCode(sourceText ?? "");
  const counts = {};
  for (const [k, { re }] of Object.entries(PATTERNS)) counts[k] = countOf(code, re);
  for (const [k, re] of Object.entries(TEMPLATE_PATTERNS)) counts[k] = countOf(templateText ?? "", re);

  // The structural guarantee, asserted rather than assumed.
  for (const [k, v] of Object.entries(counts)) {
    if (typeof v !== "number") throw new Error(`ng-scan must return numbers only; '${k}' is ${typeof v}`);
  }
  return Object.freeze(counts);
}

/** Which tier owns the authoritative answer for each counted construct. */
export const OWNING_TIER = Object.freeze({
  decoratorInputs: "signature", decoratorOutputs: "signature",
  injectCalls: "signature", lifecycleHooks: "signature",
  subscribeCalls: "functions",
  ifBlocks: "template", forBlocks: "template", switchBlocks: "template",
  deferBlocks: "template", ngIfUses: "template", ngForUses: "template",
});

/**
 * Compare text counts against what the extractors actually recorded.
 *
 * @param scan   output of countConstructs
 * @param astCounts  same keys, derived from the emitted tiers by the caller
 * @returns {{key:string, tier:string, scanned:number, recorded:number}[]} gaps only
 */
export function recallGaps(scan, astCounts) {
  const gaps = [];
  for (const [k, scanned] of Object.entries(scan)) {
    const recorded = astCounts[k];
    if (typeof recorded !== "number") continue;   // tier absent -- not a recall gap
    if (scanned > recorded) {
      gaps.push({ key: k, tier: OWNING_TIER[k] ?? "signature", scanned, recorded });
    }
  }
  return gaps;
}
