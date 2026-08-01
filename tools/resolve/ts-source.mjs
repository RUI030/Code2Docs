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
