/**
 * The resolver's warning channel.
 *
 * Phase 1's cross-cutting rule is "never throw on unparseable input -- degrade,
 * set parseStatus, record a warning." Before this module there was nowhere for
 * the warning to go: `provenance.warnings` was an array of free prose that
 * carried explanatory notes and real degradations in the same list, so nothing
 * downstream could tell "this field is empty by design" from "this field is
 * empty because the extractor gave up."
 *
 * Three properties the free-text version could not have:
 *
 * 1. A CLOSED CODE VOCABULARY. Downstream stages branch on `code`, never on the
 *    English. A message is for a human reading the file; a code is for the
 *    recall audit, the integrity checker, and the eventual review triage.
 * 2. A COMPUTED parseStatus. It was hardcoded "ok" in ts-signature, which meant
 *    the field that exists to admit degradation could never admit any. Here it
 *    is derived from what was actually recorded, so it cannot disagree with the
 *    warning list.
 * 3. DETERMINISM. Messages must never embed absolute paths -- a golden holding
 *    /home/<user>/... passes only on the machine that wrote it. `relativise` is
 *    mandatory for anything path-shaped, and its omission is the reason the
 *    template goldens are currently machine-specific.
 *
 * Adding a code is deliberate: put it in WARNING_CODES with its severity and the
 * reason it exists. An unlisted code throws, because a typo'd code silently
 * degrades to an unfilterable one, which is the failure this module prevents.
 */
import { relative, isAbsolute } from "node:path";

/**
 * severity -> what it means for the tier that recorded it:
 *   error   the tier could not be produced faithfully; parseStatus "failed"
 *   warning the tier is incomplete in a known way;     parseStatus "partial"
 *   info    worth recording, no loss of fidelity;      parseStatus "ok"
 *
 * `info` is not a weaker warning -- it is the slot for "this is empty by
 * design", which previously had to masquerade as a warning.
 */
export const WARNING_CODES = Object.freeze({
  // --- source-level, extraction could not proceed -------------------------
  "source-unreadable": { severity: "error",
    why: "The unit's .ts could not be read. Recorded rather than thrown so one bad file does not abort a multi-file run." },
  "no-component-decorator": { severity: "error",
    why: "No decorated class found. Was an exit(1); a unit the resolver cannot classify is a finding, not a crash." },
  "source-parse-errors": { severity: "error",
    why: "TypeScript reported syntactic diagnostics; every downstream fact from this file is suspect." },

  // --- template resolution ------------------------------------------------
  "template-not-found": { severity: "warning",
    why: "The decorator declares a templateUrl that does not resolve. Distinct from having no template at all, which is not a warning." },
  "template-parse-errors": { severity: "warning",
    why: "@angular/compiler reported parse errors; the node tree is partial." },
  "compiler-not-found": { severity: "warning",
    why: "No @angular/compiler above the analysed file or in this tool, so the template was not parsed. All UI facts are missing, not merely incomplete." },
  "compiler-version-fallback": { severity: "warning",
    why: "Parsed with this tool's compiler rather than the analysed repo's. Syntax newer than ours parses wrong or not at all." },

  // --- extractor coverage gaps (F10a) -------------------------------------
  "unhandled-template-node": { severity: "warning",
    why: "The compiler produced a node class the walker has no branch for. THE point of this channel: without it such nodes are dropped in silence and no golden can fail, because goldens are written from this extractor's own output." },
  "unknown-block": { severity: "warning",
    why: "Angular itself did not recognise the block (TmplAstUnknownBlock) -- an invalid or newer-than-17.3.9 template. Separate from unhandled-template-node: that is our gap, this is the source's." },
  "unhandled-declaration": { severity: "warning",
    why: "A class member matched no known declaration style (input/output/model/signal/query). Reserved for D14's model() work." },

  // --- cross-check --------------------------------------------------------
  "recall-gap": { severity: "warning",
    why: "Text-search counted more occurrences of a construct than the compiler pass recorded (D3a). The extractor returned seven of nine and would otherwise have reported success." },

  "upper-bound-only": { severity: "warning",
    why: "A derived set is an upper bound because one of its inputs was unavailable -- unreachableMethods without a parsed template, and in Phase 2 consumedBy without the repo index. The set is populated and wrong-in-a-known-direction, which reads as authoritative unless said." },

  // --- non-degrading notes ------------------------------------------------
  "empty-by-design": { severity: "info",
    why: "A section is empty because another stage owns it, not because extraction failed. Previously indistinguishable from a real gap." },
  "parser-selected": { severity: "info",
    why: "Records which compiler was used and from where. Path must be relativised -- see this module's header." },
});

const RANK = { error: 3, warning: 2, info: 1 };

/**
 * @param {object} opts
 * @param {string} opts.root  absolute path all recorded paths are relative to;
 *                            without it a message can pin a golden to one machine.
 */
export function createWarnings({ root } = {}) {
  const entries = [];

  /** Absolute path -> repo-relative, so recorded text is machine-independent. */
  const relativise = (p) =>
    root && typeof p === "string" && isAbsolute(p) ? relative(root, p) : p;

  return {
    /**
     * @param {keyof WARNING_CODES} code
     * @param {string} message  human-readable; pass paths through relativise
     * @param {{file:string,line:number}|null} loc
     */
    warn(code, message, loc = null) {
      const spec = WARNING_CODES[code];
      if (!spec) {
        throw new Error(
          `unknown warning code '${code}'. Add it to WARNING_CODES with a severity `
          + `and a reason -- an unlisted code cannot be filtered downstream.`);
      }
      entries.push({
        code,
        severity: spec.severity,
        message: relativise(message),
        ...(loc ? { loc: { ...loc, file: relativise(loc.file) } } : {}),
      });
    },

    relativise,

    /** Deduplicated by code+message: one unhandled node class reported once, with a count. */
    list() {
      const seen = new Map();
      for (const e of entries) {
        // Escaped, not a literal NUL byte: a raw one in source makes git treat the
        // whole file as binary, so it would never show a diff again.
        const k = `${e.code}\u0000${e.message}`;
        const hit = seen.get(k);
        if (hit) hit.count = (hit.count ?? 1) + 1;
        else seen.set(k, { ...e });
      }
      return [...seen.values()];
    },

    /** Derived, never asserted -- it cannot disagree with what was recorded. */
    parseStatus() {
      const worst = entries.reduce((m, e) => Math.max(m, RANK[e.severity]), 0);
      return worst === 3 ? "failed" : worst === 2 ? "partial" : "ok";
    },

    get size() { return entries.length; },
  };
}
