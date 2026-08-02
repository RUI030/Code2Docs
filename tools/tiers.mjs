/**
 * The tier list, and the paths every tool resolves against.
 *
 * `TIERS` was written out four times across query, golden, validate and
 * check-integrity, in TWO different versions -- three listed five tiers and
 * golden listed four. Golden's shorter list is correct for what it does (it
 * diffs extractor output, and `analysis` is not extractor output), but nothing
 * said so, so it read as one of the four having fallen behind. Adding a tier
 * meant finding all four and knowing which of the two lists each should get.
 *
 * Named separately here so the difference is a stated distinction rather than an
 * apparent inconsistency.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA_DIR = join(ROOT, "templates", "schema");
export const FIXTURES_DIR = join(ROOT, "fixtures");
export const EXAMPLES_DIR = join(ROOT, "examples");

/** Deterministic extractor output. What the Resolver produces and goldens diff. */
export const AST_TIERS = Object.freeze([
  "signature", "dependencies", "functions", "template",
]);

/** Every per-unit tier, including the model-written aggregate. What schemas and ids span. */
export const ALL_TIERS = Object.freeze([...AST_TIERS, "analysis"]);

/** Repo-level outputs (one per repository, not one per unit). */
export const REPO_TIERS = Object.freeze(["index"]);

/** Union of all tier names that have schemas and can be validated. */
export const VALIDATABLE_TIERS = Object.freeze([...ALL_TIERS, ...REPO_TIERS]);
