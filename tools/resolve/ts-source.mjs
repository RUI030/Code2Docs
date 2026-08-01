/**
 * One definition of how this project parses a TypeScript file.
 *
 * The same component `.ts` was being parsed four times per unit -- once in
 * readComponentDeclaration, once in extractSignature, once in
 * extractDependencies, once in extractFunctions -- each constructing its own
 * SourceFile from identical text with identical arguments.
 *
 * The cost is the smaller half of the problem. The real issue is that four call
 * sites each chose a script target and a setParentNodes flag independently, and
 * they were only coincidentally identical. `setParentNodes: true` in particular
 * is load-bearing: several extractors walk upward via `node.parent`, and a call
 * site that omitted it would fail in ways that look like a missing construct
 * rather than a parse-configuration mistake -- which is exactly the class of
 * silent wrongness this project is built to avoid.
 *
 * `ScriptTarget.Latest` is deliberate: we are reading syntax, never emitting, so
 * downleveling would only discard information. No type checker, no program, no
 * module resolution -- a single-file syntactic parse, per D3.
 *
 * It also holds the node helpers every extractor needs, for the same reason: they
 * were defined two or three times each, identical only by coincidence. See
 * complexityOf below for why that matters more than the duplication itself.
 */
import ts from "typescript";
import { basename } from "node:path";

export function parseSource(filePath, sourceText) {
  return ts.createSourceFile(basename(filePath), sourceText, ts.ScriptTarget.Latest, true);
}

/**
 * Use the caller's already-parsed tree when given one, else parse.
 *
 * Every extractor keeps working when called standalone with just text, which is
 * what makes them independently testable -- so this is a shared fast path, not a
 * new required argument.
 */
export function sourceOf(opts, filePath, sourceText) {
  return opts?.src ?? parseSource(filePath, sourceText);
}

/**
 * Angular's eight interface lifecycle hooks.
 *
 * Defined once because it was defined twice, in ts-signature and ts-functions.
 * They happened to agree -- but F10f flagged that adding `afterRender` to one and
 * not the other is exactly how a closed vocabulary starts drifting, and this set
 * is due to gain entries.
 *
 * `afterRender` / `afterNextRender` are NOT here: they are functions registered in
 * an injection context, not interface methods, so `LIFECYCLE_HOOKS.has(name)` is
 * the wrong test for them. Their absence is a known gap (F10f), not an oversight.
 */
export const LIFECYCLE_HOOKS = new Set([
  "ngOnInit", "ngOnDestroy", "ngOnChanges", "ngDoCheck", "ngAfterContentInit",
  "ngAfterContentChecked", "ngAfterViewInit", "ngAfterViewChecked",
]);

export function visibilityOf(node) {
  const m = ts.getCombinedModifierFlags(node);
  if (m & ts.ModifierFlags.Private) return "private";
  if (m & ts.ModifierFlags.Protected) return "protected";
  return "public";
}

/** 1-based line of a node's first token. */
export const lineOf = (node, src) =>
  src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;

/** Just the start line. dependencies records a point, not a range. */
export const lineLocOf = (node, src, file) => ({ file, line: lineOf(node, src) });

/** The `loc` shape common.schema.json defines: file plus 1-based line range. */
export const locOf = (node, src, file) => ({
  file,
  line: lineOf(node, src),
  endLine: src.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
});

/**
 * Cyclomatic complexity: 1 + one per branch point.
 *
 * THE reason these helpers are shared rather than copied. This is a metric, and
 * F8b's definition of a bad metric is one that two correct implementations
 * disagree on. It was implemented twice; the two agreed, but only one carried the
 * note that `DefaultClause` is deliberately not counted -- so the copy without the
 * reasoning was one plausible edit away from disagreeing with the copy that had
 * it, and the resulting numbers would have differed with nothing to say which was
 * right.
 *
 * The counted kinds are enumerated in functions.schema.json and must not drift
 * from them.
 */
export function complexityOf(node) {
  let n = 1;
  const walk = (x) => {
    switch (x.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.CaseClause:            // DefaultClause deliberately not counted
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
        n++;
        break;
      case ts.SyntaxKind.BinaryExpression:
        if ([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
             ts.SyntaxKind.QuestionQuestionToken].includes(x.operatorToken.kind)) n++;
        break;
    }
    ts.forEachChild(x, walk);
  };
  ts.forEachChild(node, walk);
  return n;
}
