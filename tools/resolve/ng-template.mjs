/**
 * template.json extraction via @angular/compiler's parseTemplate.
 *
 * The compiler is loaded from the ANALYZED repo, not from ours. D3 assumed the
 * target's own toolchain could be borrowed; for `typescript` that turned out
 * false (npm now resolves it to the API-less native port) but for
 * `@angular/compiler` it holds, and it is the better source: template syntax is
 * version-sensitive, so parsing a 17.x template with a 20.x parser would accept
 * constructs that repo cannot actually use.
 *
 * Node ids are positional per D13 -- 0-based document order by source start
 * offset. Exported TmplAst* classes are used for identification rather than
 * constructor.name, which the fesm build minifies to things like `Element$1`.
 *
 * uiRequirements are NOT emitted here. They are prose, hence `doc` content, and
 * this file contains only what the parser saw.
 */
import { existsSync } from "node:fs";import { dirname, join, resolve, sep } from "node:path";import { createWarnings } from "./warnings.mjs";
/**
 * The analyzed repo's own compiler, else ours.
 *
 * Repo-first because template syntax is version-sensitive: parsing a 17.x
 * template with a 20.x parser accepts constructs that repo cannot use. The
 * fallback exists because a source tree need not vendor node_modules at all --
 * the fixtures are exactly that case, and without it the extractor's own unit
 * tests could not exercise template parsing. Which one was used is recorded in
 * provenance, and falling back raises a warning, since a version mismatch
 * between parser and repo is a real hazard rather than a detail.
 */
export function findAngularCompiler(startDir, fallbackDir) {
  // `vendored` is a claim about the ANALYZED repo, so it is decided by whose
  // node_modules the file came from -- not by which search found it. Walking up
  // from a unit nested inside this repo reaches OUR node_modules, and reporting
  // that as the analyzed repo's silently suppressed every version-mismatch
  // warning for anything under this tree, INPUT/ included.
  const ours = fallbackDir ? join(resolve(fallbackDir), "node_modules") : null;
  const isOurs = (p) => !!ours && resolve(p).startsWith(ours + sep);

  const found = searchUp(startDir);
  if (found && !isOurs(found)) return { path: found, vendored: true };
  const own = found ?? (fallbackDir ? searchUp(fallbackDir) : null);
  return own ? { path: own, vendored: false } : null;
}

function searchUp(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    // Angular's published entry point has moved between majors (fesm2015 ->
    // fesm2020 -> fesm2022), so try the known ones rather than pin one.
    for (const rel of [["fesm2022", "compiler.mjs"], ["fesm2020", "compiler.mjs"],
                       ["fesm2015", "compiler.js"], ["bundles", "compiler.umd.js"]]) {
      const cand = join(dir, "node_modules", "@angular", "compiler", ...rel);
      if (existsSync(cand)) return cand;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Attribute-based translation mechanisms, by directive name.
 *
 * Angular's built-in `i18n` / `i18n-*` needs no entry -- it is handled below and
 * is the only one that is part of Angular itself. The rest are third-party
 * libraries an Angular app may or may not use, so they are listed rather than
 * assumed: `jhiTranslate` is JHipster's, and hardcoding it as the sole mechanism
 * meant every other Angular codebase silently reported no i18n at all.
 *
 * An unlisted directive is not guessed at. A missing entry shows up as absent
 * i18n, which is visible, rather than as a wrong mechanism, which is not.
 */
const TRANSLATE_DIRECTIVES = new Map([
  ["jhiTranslate", "translate-directive"],   // JHipster
  ["translate", "translate-directive"],      // @ngx-translate
  ["transloco", "translate-directive"],      // @jsverse/transloco
]);

/** contextVariables is an array in some majors and a keyed record in others. */
function ctxVarNames(cv) {
  if (!cv) return [];
  const list = Array.isArray(cv) ? cv : Object.values(cv);
  return list.map((v) => v?.name).filter(Boolean);
}

/** Major version from a range like "^17.3.9" or "~17.0.0". */
const major = (v) => (String(v).match(/(\d+)/) ?? [])[1] ?? null;

const has = (n, k) => n && Object.prototype.hasOwnProperty.call(n, k);
const startOf = (n) => n?.sourceSpan?.start?.offset ?? n?.sourceSpan?.start ?? 0;
/**
 * `off` shifts template-relative lines onto real file lines. It is 0 for an
 * external .html, and the line of the template literal for an inline one --
 * without it every loc in an inline template points at the top of the .ts.
 */
const lineOf = (n, off = 0) => (n?.sourceSpan?.start?.line ?? 0) + 1 + off;
const endLineOf = (n, off = 0) =>
  (n?.sourceSpan?.end?.line ?? n?.sourceSpan?.start?.line ?? 0) + 1 + off;

/** Field ids an expression reads: `success()` and `post.title` both count. */
function readsOf(ast, C) {
  const found = new Set();
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n instanceof C.PropertyRead || n instanceof C.SafePropertyRead) {
      // only the root of a chain: a.b.c reads `a`
      const root = n.receiver;
      if (root && root.constructor && /ImplicitReceiver|ThisReceiver/.test(root.constructor.name)) {
        found.add(n.name);
      }
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object" && k !== "sourceSpan" && k !== "span") walk(v);
    }
  };
  walk(ast instanceof C.ASTWithSource ? ast.ast : ast);
  return [...found];
}

/**
 * Method names a handler expression CALLS on the component.
 *
 * Walks the parsed expression instead of matching `/^(\w+)\s*\(/` against its
 * source, which only saw a bare call at position 0. Everything else went
 * unrecorded and therefore uncalled: `(click)="items.length && save()"`,
 * `(click)="save(); close()"`, `(click)="$event.stopPropagation(); save()"`.
 * A missed handler is a missed call-graph edge, which becomes a method wrongly
 * reported as unreachable -- the failure F16 had already been bitten by once.
 */
function callsOf(ast, C) {
  const found = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n instanceof C.Call || n instanceof C.SafeCall) {
      const r = n.receiver;
      // only calls on the component itself: `save()` / `this.save()`, not `x.trim()`
      if (r instanceof C.PropertyRead || r instanceof C.SafePropertyRead) {
        const root = r.receiver;
        if (root && root.constructor && /ImplicitReceiver|ThisReceiver/.test(root.constructor.name)) {
          if (!found.includes(r.name)) found.push(r.name);
        }
      }
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object" && k !== "sourceSpan" && k !== "span") walk(v);
    }
  };
  walk(ast instanceof C.ASTWithSource ? ast.ast : ast);
  return found;
}

/**
 * Node classes that legitimately have no branch of their own because a parent's
 * branch already consumes them -- `@if` reads its own branches, an element reads
 * its own attributes. Matched by NAME, not identity: a class absent from an older
 * or newer compiler must not throw here.
 *
 * Anything not in this set and not dispatched is reported as
 * `unhandled-template-node` rather than dropped. That is the whole point: the
 * walker covers 13 of the 31 TmplAst classes 17.3.9 defines, and before this the
 * other 18 vanished in silence -- including TmplAstIcu, which carries
 * pluralisation rules. No golden could catch it, because goldens are written from
 * this extractor's own output (F10a).
 *
 * The names are resolved through `exportedNames` below, NOT `constructor.name`:
 * this module's header records that the fesm build minifies those to `Element$1`
 * and similar, which would make every node look unhandled.
 */
const REACHED_VIA_PARENT = new Set([
  "TmplAstIfBlockBranch",           // via TmplAstIfBlock.branches
  "TmplAstSwitchBlockCase",         // via TmplAstSwitchBlock.cases
  "TmplAstForLoopBlockEmpty",       // via TmplAstForLoopBlock.empty
  "TmplAstDeferredBlockPlaceholder",
  "TmplAstDeferredBlockLoading",
  "TmplAstDeferredBlockError",      // all three via TmplAstDeferredBlock
  "TmplAstVariable",                // via the block or template that declares it
  "TmplAstTextAttribute",           // via TmplAstElement.attributes
]);

/**
 * Attributes whose VALUE is read by the person using the screen.
 *
 * Distinct from every other attribute, which addresses the browser or the
 * framework. `placeholder` is a label; `formControlName` is a wiring detail.
 */
const VISIBLE_ATTRS = new Set(["placeholder", "title", "alt", "aria-label", "value"]);

/**
 * constructor -> the name @angular/compiler exports it under.
 *
 * Built from the module's own exports so it survives minification and needs no
 * hardcoded class list: whatever TmplAst* classes this compiler version ships,
 * we can name them.
 */
function exportedNames(C) {
  const m = new Map();
  for (const [k, v] of Object.entries(C)) {
    if (k.startsWith("TmplAst") && typeof v === "function") m.set(v, k);
  }
  return m;
}

export function extractTemplate(templateFile, templateText, signature, compilerPath, opts = {}) {
  const C = opts.compiler;
  const w = opts.warn ?? createWarnings({ root: opts.root });
  const nameOf = (n) => exportNames.get(n?.constructor) ?? n?.constructor?.name ?? "unknown node";
  const exportNames = exportedNames(C);
  const parsed = C.parseTemplate(templateText, templateFile, { preserveWhitespaces: false });

  w.warn("empty-by-design",
    "uiRequirements is empty by design: it is doc content, written by the Synthesizer, not extracted.");
  // Relativised: an absolute path here pins the golden to the machine that wrote it.
  w.warn("parser-selected", `parsed with @angular/compiler from ${w.relativise(compilerPath)}`);
  // Severity rests on EVIDENCE, not on which code path was taken. Falling back is
  // only a hazard if the versions actually differ -- and every fixture vendors
  // nothing and never will, so warning on the path alone left four fixtures
  // permanently `partial`. A warning that is always on stops being read.
  if (!opts.vendored) {
    const ours = opts.compilerVersion ?? null;
    const theirs = opts.repoAngularVersion ?? null;
    if (theirs && ours && major(theirs) === major(ours)) {
      w.warn("parser-selected",
        `fallback parser used, but versions agree: the analyzed tree expects Angular ${theirs} `
        + `and this Resolver pins ${ours}.`);
    } else {
      w.warn("compiler-version-fallback",
        "the analyzed source tree vendors no @angular/compiler, so this Resolver's own pinned copy "
        + `was used${theirs ? ` (tree expects ${theirs}, we pin ${ours ?? "unknown"})` : ""}. `
        + (theirs ? "The majors differ, so newer syntax may parse wrong or not at all."
                  : "The tree's expected version could not be determined, so a mismatch cannot be ruled out."));
    }
  }
  for (const e of parsed.errors ?? []) {
    w.warn("template-parse-errors", String(e), { file: templateFile, line: e.span?.start?.line ?? 0 });
  }

  const fieldNames = new Set(signature.stateOutline.fields.map((f) => f.name));
  const methodNames = new Set(signature.stateOutline.methodIds.map((m) => m.slice(7)));
  const memberIdFor = (n) =>
    fieldNames.has(n) ? `field:${n}` : methodNames.has(n) ? `method:${n}` : null;
  const dependsOn = (ast) => readsOf(ast, C).map(memberIdFor).filter(Boolean);

  // --- pass 1: collect every node with a source span, in document order
  const flat = [];
  const STRUCTURAL = ["children", "branches", "cases", "placeholder", "loading", "error", "empty"];
  const ATTACHED = ["attributes", "inputs", "outputs", "references", "variables", "templateAttrs"];
  const collect = (n, depth, parent) => {
    if (!n || typeof n !== "object") return;
    flat.push({ node: n, depth, parent });
    // Only structural containment adds a level. An attribute sits ON an element,
    // it is not nested INSIDE it, and counting it as depth contradicts the
    // schema's stated definition (F8b's lesson: define first, then implement).
    // Depth advances only past an element or a control-flow block, per the
    // schema's definition. Text is content, not nesting; and a branch/case/empty
    // wrapper is an implementation detail of its block, not a level a reader sees.
    const advances = n instanceof C.TmplAstElement || n instanceof C.TmplAstTemplate
      || n instanceof C.TmplAstIfBlock || n instanceof C.TmplAstForLoopBlock
      || n instanceof C.TmplAstSwitchBlock || n instanceof C.TmplAstDeferredBlock;
    const childDepth = depth + (advances ? 1 : 0);
    for (const k of STRUCTURAL) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => collect(c, childDepth, n));
      else if (v && typeof v === "object" && v.sourceSpan) collect(v, childDepth, n);
    }
    for (const k of ATTACHED) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => collect(c, depth, n));
    }
  };
  parsed.nodes.forEach((n) => collect(n, 0, null));
  flat.sort((a, b) => startOf(a.node) - startOf(b.node));

  // Ids number the PARSED set -- every node the compiler produced, in document
  // order -- not the subset this tier records (D13a).
  //
  // Numbering the recorded set made ids depend on the classifier, so changing
  // what the extractor records renumbered ids with the source untouched. That is
  // worse than churn under source edits: a source edit changes the file, while an
  // extractor upgrade silently re-points every id in every artifact already
  // generated. Removing one heuristic here shifted tpl:2 onward and made the
  // probe and the extractor disagree about which node tpl:5 is.
  //
  // The dangling references that originally motivated numbering the recorded set
  // were a separate bug: coverage.uncoveredNodeIds listed parsed ids rather than
  // recorded-but-uncited ones. Fixed below, which removes the reason to couple
  // ids to the classifier at all. Ids are now sparse, and stable against
  // anything but a change of source or compiler version -- both of which are
  // recorded in provenance.
  const emitted = [];
  const emit = (bucket, node, rec) => { emitted.push({ bucket, node, rec }); return rec; };
  const idOf = new Map();
  const id = (n) => idOf.get(n) ?? null;
  const lineOffset = opts.lineOffset ?? 0;
  const loc = (n) => ({
    file: templateFile,
    line: lineOf(n, lineOffset),
    endLine: endLineOf(n, lineOffset),
  });
  // Nodes the walker had no branch for -- see REACHED_VIA_PARENT.
  const unhandledNodes = new Set();

  const out = {
    elements: [], controlFlow: [], propertyBindings: [], eventBindings: [], twoWayBindings: [],
    interpolations: [], childComponents: [], templateRefs: [], ngTemplates: [],
    contentProjection: [], hostBindings: [], hostListeners: [], accessibility: [],
    i18n: [], staticText: [], rawHtmlSinks: [], directivesUsed: [], pipesUsed: [], viewQueries: [],
  };
  const directives = new Map(), pipes = new Map();
  // measured over elements and control-flow blocks only -- see collect()
  let maxDepth = 0;

  const CF = {
    [C.TmplAstIfBlockBranch.name]: null, // handled via IfBlock
  };

  for (const { node: n, depth, parent } of flat) {
    if (n instanceof C.TmplAstElement || n instanceof C.TmplAstTemplate
        || n instanceof C.TmplAstIfBlock || n instanceof C.TmplAstForLoopBlock
        || n instanceof C.TmplAstSwitchBlock || n instanceof C.TmplAstDeferredBlock) {
      maxDepth = Math.max(maxDepth, depth);
    }
    const nid = id(n);

    if (n instanceof C.TmplAstIfBlock) {
      n.branches.forEach((b, i) => {
        emit("controlFlow", b, {
          id: null,
          construct: i === 0 ? "@if" : b.expression ? "@else if" : "@else",
          expression: b.expression ? b.expression.source ?? "" : null,
          itemAlias: null, trackBy: null,
          aliases: (b.expressionAlias ? [b.expressionAlias.name] : []),
          dependsOn: b.expression ? dependsOn(b.expression) : [],
          parent: null, depth, loc: loc(b),
        });
      });
    } else if (n instanceof C.TmplAstForLoopBlock) {
      emit("controlFlow", n, {
        id: null, construct: "@for",
        expression: n.expression?.source ?? "",
        itemAlias: n.item?.name ?? null,
        trackBy: n.trackBy?.source ?? null,
        aliases: ctxVarNames(n.contextVariables),
        dependsOn: n.expression ? dependsOn(n.expression) : [],
        parent: null, depth, loc: loc(n),
      });
      if (n.empty) emit("controlFlow", n.empty, {
        id: null, construct: "@empty",
        expression: null, itemAlias: null, trackBy: null, aliases: [],
        dependsOn: [], parent: null, depth, loc: loc(n.empty),
      });
    } else if (n instanceof C.TmplAstSwitchBlock) {
      emit("controlFlow", n, {
        id: null, construct: "@switch", expression: n.expression?.source ?? "",
        itemAlias: null, trackBy: null, aliases: [],
        dependsOn: n.expression ? dependsOn(n.expression) : [], parent: null, depth, loc: loc(n),
      });
      for (const c of n.cases) emit("controlFlow", c, {
        id: null, construct: c.expression ? "@case" : "@default",
        expression: c.expression?.source ?? null,
        itemAlias: null, trackBy: null, aliases: [],
        dependsOn: c.expression ? dependsOn(c.expression) : [], parent: null, depth: depth + 1, loc: loc(c),
      });
    } else if (n instanceof C.TmplAstDeferredBlock) {
      // @defer changes WHEN content renders -- exactly the behavior this project
      // preserves, and absent from the pre-D13 construct vocabulary (F8e).
      // prefetchTriggers fire a prefetch but do not change WHEN the block renders,
      // so they are prefixed to distinguish them from render triggers (F10d).
      const triggers = Object.keys(n.triggers ?? {});
      const prefetch  = Object.keys(n.prefetchTriggers ?? {}).map((k) => `prefetch:${k}`);
      emit("controlFlow", n, {
        id: null, construct: "@defer",
        expression: [...triggers, ...prefetch].join(",") || null,
        itemAlias: null, trackBy: null, aliases: [], dependsOn: [], parent: null, depth, loc: loc(n),
      });
      for (const [k, blk] of [["@placeholder", n.placeholder], ["@loading", n.loading], ["@error", n.error]]) {
        if (blk) emit("controlFlow", blk, {
          id: null, construct: k,
          expression: null, itemAlias: null, trackBy: null, aliases: [],
          dependsOn: [], parent: null, depth: depth + 1, loc: loc(blk),
        });
      }
    } else if (n instanceof C.TmplAstTemplate) {
      // Structural directives desugar to a Template node carrying the directive
      // as a templateAttr -- *ngIf does NOT produce an IfBlock. Handling only the
      // block syntax made the control-flow fixture pair's structural member report
      // no control flow at all, while still emitting pipes, so nothing failed and
      // the metadata was simply wrong. That is the failure the pairing exists for.
      const attrs = new Map((n.templateAttrs ?? []).map((a) => [a.name, a]));
      const structural = [
        ["ngIf", "*ngIf"], ["ngForOf", "*ngFor"],
        ["ngSwitchCase", "*ngSwitchCase"], ["ngSwitchDefault", "*ngSwitchDefault"],
      ].find(([k]) => attrs.has(k));
      if (structural) {
        const [key, construct] = structural;
        const a = attrs.get(key);
        const trackAttr = attrs.get("ngForTrackBy");
        emit("controlFlow", n, {
          id: null, construct,
          expression: a.value?.source ?? a.value ?? null,
          itemAlias: (n.variables ?? []).find((v) => v.value === "$implicit")?.name ?? null,
          trackBy: trackAttr ? (trackAttr.value?.source ?? trackAttr.value ?? null) : null,
          aliases: (n.variables ?? []).map((v) => v.name),
          dependsOn: a.value ? dependsOn(a.value) : [],
          parent: null, depth, loc: loc(n),
        });
      } else {
        emit("ngTemplates", n, {
          id: null, name: (n.references ?? []).map((r) => r.name)[0] ?? null,
          contextKeys: (n.variables ?? []).map((v) => v.name), instantiatedBy: [],
        });
      }
    } else if (n instanceof C.TmplAstBoundAttribute) {
      if (n.name === "ngSwitch") {
        emit("controlFlow", n, {
          id: null, construct: "ngSwitch",
          expression: n.value?.source ?? "", itemAlias: null, trackBy: null, aliases: [],
          dependsOn: dependsOn(n.value), parent: null, depth, loc: loc(n),
        });
        continue;
      }
      const target = parent?.name ?? "";
      const rec = {
        id: null, target, property: n.name,
        bindingKind: { 0: "property", 1: "attribute", 2: "class", 3: "style", 4: "animation" }[n.type] ?? "property",
        expression: n.value?.source ?? "", dependsOn: dependsOn(n.value), loc: loc(n),
      };
      if (n.name === "ngModel") emit("twoWayBindings", n, { ...rec, boundField: rec.dependsOn[0] ?? null });
      else emit("propertyBindings", n, rec);
      // Emitted against the BINDING node, not against `n.value`: the value is a
      // parsed expression, not a template node, so it is absent from the id map and
      // the record shipped with `id: undefined` -- schema-invalid, and produced by
      // no fixture because none binds innerHTML (F20). Sharing an id with the
      // propertyBindings record is correct and intended: an id names the node, not
      // the record (D13a).
      if (n.name === "innerHTML") {
        emit("rawHtmlSinks", n, {
          id: null, property: "innerHTML", expression: rec.expression,
          sanitizerBypassed: false, loc: loc(n),
        });
      }
    } else if (n instanceof C.TmplAstBoundEvent) {
      const handler = n.handler?.source ?? "";
      const called = callsOf(n.handler, C).filter((name) => methodNames.has(name));
      if (called.length > 1) {
        w.warn("unhandled-declaration",
          `handler "${handler}" calls ${called.length} component methods `
          + `(${called.join(", ")}) but handlerMethod records one. The rest are in the call `
          + "graph via templateCallers; this field is the primary handler only.", loc(n));
      }
      emit("eventBindings", n, {
        id: null, target: parent?.name ?? "", event: n.name,
        handlerExpression: handler,
        handlerMethod: called.length ? `method:${called[0]}` : null,
        passesEvent: /\$event/.test(handler), loc: loc(n),
      });
    } else if (n instanceof C.TmplAstBoundText) {
      const ast = n.value?.ast ?? n.value;
      emit("interpolations", n, {
        id: null, expression: n.value?.source ?? "",
        pipes: collectPipeNames(ast, C, pipes, n),
        dependsOn: dependsOn(n.value), loc: loc(n),
      });
    } else if (n instanceof C.TmplAstText) {
      // The words on the screen.
      //
      // Previously skipped as "static text carries no behavior", which is true and
      // was the wrong test: this tier records what the UI DOES, and the label on a
      // field is what tells a person what the field IS. F19 found the consequence --
      // `Content` is the visible label for the `content` control, the requirement
      // document called it "body" six times, and nothing could contradict it because
      // no tier held the word. Extraction anchors naming (F2's stated fix), and it
      // can only anchor vocabulary it actually records.
      //
      // Whitespace-only nodes are structure, not content. `preserveWhitespaces:
      // false` removes most; the guard covers the rest.
      const text = (n.value ?? "").replace(/\s+/g, " ").trim();
      if (text) {
        emit("staticText", n, {
          id: null, text, host: parent?.name ?? null, attribute: null, loc: loc(n),
        });
      }
    } else if (n instanceof C.TmplAstReference) {
      emit("templateRefs", n, { id: null, name: n.name, onElement: parent?.name ?? "", referencedBy: [] });
    } else if (n instanceof C.TmplAstContent) {
      emit("contentProjection", n, { id: null, select: n.selector === "*" ? null : n.selector });
    } else if (n instanceof C.TmplAstElement) {
      emit("elements", n, {
        id: null, tag: n.name,
        attributes: (n.attributes ?? []).map((a) => a.name),
        depth, loc: loc(n),
      });
      // A dashed tag is a component or a custom element; the compiler alone
      // cannot say which, so resolvedUnitId stays null for the repo index.
      if (n.name.includes("-")) {
        emit("childComponents", n, {
          id: null, selector: n.name, resolvedUnitId: null,
          inputsPassed: (n.inputs ?? []).map((i) => ({ name: i.name, expression: i.value?.source ?? "" })),
          outputsHandled: (n.outputs ?? []).map((o) => ({ name: o.name, handlerExpression: o.handler?.source ?? "", handlerMethod: null })),
          loc: loc(n),
        });
      }
      const attrs = {};
      for (const a of n.attributes ?? []) {
        if (/^(role|aria-|alt$|tabindex$)/.test(a.name)) attrs[a.name] = a.value;
        // A visible attribute value is a label too -- `placeholder="Search posts"`
        // names the field exactly as a <label> would. Recorded in the same bucket
        // so a consumer asking "what words does this screen show?" has one answer.
        // `value` only counts on inputs, where it is prefilled content a person
        // reads; elsewhere it is a wiring detail.
        if (VISIBLE_ATTRS.has(a.name) && (a.name !== "value" || n.name === "input")) {
          const text = (a.value ?? "").replace(/\s+/g, " ").trim();
          if (text) {
            emit("staticText", a, {
              id: null, text, host: n.name, attribute: a.name, loc: loc(a),
            });
          }
        }
        const translateMechanism = TRANSLATE_DIRECTIVES.get(a.name)
          ?? (a.name === "i18n" || a.name.startsWith("i18n-") ? "i18n-attr" : null);
        if (translateMechanism) {
          emit("i18n", n, { id: null, mechanism: translateMechanism, key: a.value, params: [] });
        }
        if (!directives.has(a.name) && /^[a-z][a-zA-Z]*$/.test(a.name) && a.name !== a.name.toLowerCase()) {
          directives.set(a.name, { selector: a.name, origin: "internal", resolvedUnitId: null, inputsPassed: [], occurrences: [] });
        }
        if (directives.has(a.name)) directives.get(a.name).occurrences.push(n);
        if (a.name === "routerLink") {
          if (!directives.has("routerLink")) directives.set("routerLink", { selector: "routerLink", origin: "angular", resolvedUnitId: null, inputsPassed: [], occurrences: [] });
          directives.get("routerLink").inputsPassed.push({ name: "routerLink", expression: a.value });
          directives.get("routerLink").occurrences.push(n);
        }
      }
      // Recorded when the element carries a11y-relevant attributes, or is a
      // non-semantic element wired to handle events. An earlier version also
      // matched Bootstrap's `alert`/`toast` class names, which reads one CSS
      // framework's conventions as if they were Angular's.
      const nonSemanticInteractive = !!(n.outputs ?? []).length
        && !/^(button|a|input|select|textarea|form|label|summary|details)$/.test(n.name);
      if (Object.keys(attrs).length || nonSemanticInteractive) {
        emit("accessibility", n, {
          id: null, target: n.name, attributes: attrs,
          isInteractiveNonSemantic: nonSemanticInteractive,
        });
      }
    } else if (n instanceof C.TmplAstIcu) {
      // ICU expressions: `{count, plural, =0 {none} one {one} other {many}}`.
      // Previously fell through to the unhandled-template-node catch-all (F10a).
      // The ICU structure is in n.i18n.nodes[0]: { expression, type, cases }.
      // n.vars holds VAR_PLURAL/VAR_SELECT placeholder → ASTWithSource, not
      // the source expression; the readable form lives in i18n.nodes[0].
      const i18nDef = n.i18n?.nodes?.[0];
      const icuType = i18nDef?.type ?? "plural";
      const switchExpr = i18nDef?.expression ?? "";
      const caseKeys = i18nDef?.cases ? Object.keys(i18nDef.cases) : [];
      const depId = switchExpr ? memberIdFor(switchExpr) : null;
      emit("i18n", n, {
        id: null,
        mechanism: "icu",
        icuType,
        switchExpression: switchExpr,
        cases: caseKeys,
        dependsOn: depId ? [depId] : [],
        loc: loc(n),
      });
    } else if (n instanceof C.TmplAstUnknownBlock) {
      // Angular itself did not recognise the block: an invalid template, or one
      // using syntax newer than the compiler doing the parsing. Distinct from the
      // branch below -- that one is OUR gap, this one is the source's.
      w.warn("unknown-block",
        `@${n.name ?? "?"} is not a block this compiler recognises`, loc(n));
    } else if (!REACHED_VIA_PARENT.has(nameOf(n))) {
      // The terminal branch F10a exists for. Reported once per class with a count,
      // so a template with 40 ICU expressions yields one line, not forty.
      unhandledNodes.add(n);
      w.warn("unhandled-template-node",
        `${nameOf(n)} is parsed by @angular/compiler but has no `
        + `branch in this walker, so its content is not recorded`, loc(n));
    }
  }

  // --- assign ids over the parsed set, then hand them to the records that kept a node
  flat.forEach((f, i) => { if (!idOf.has(f.node)) idOf.set(f.node, `tpl:${i}`); });
  emitted.sort((a, b) => startOf(a.node) - startOf(b.node));
  for (const e of emitted) { e.rec.id = idOf.get(e.node); out[e.bucket].push(e.rec); }

  const resolveNodes = (arr) => [...new Set(arr.map((x) => idOf.get(x)).filter(Boolean))];
  out.directivesUsed = [...directives.values()].map((d) => ({ ...d, occurrences: resolveNodes(d.occurrences) }));
  out.pipesUsed = [...pipes.values()].map((p) => ({ ...p, occurrences: resolveNodes(p.occurrences) }));

  const citedByRequirements = new Set();  // extractor emits no uiRequirements; the Synthesizer fills these
  const recordedIds = [...new Set(emitted.map((e) => idOf.get(e.node)).filter(Boolean))];
  const nodesTotal = recordedIds.length;
  const tier = {
    schemaVersion: "0.4.0",
    unitId: signature.unit.id,
    templateFile,
    parse: {
      status: w.parseStatus(),
      parser: "@angular/compiler",
      angularVersion: opts.angularVersion ?? null,
      diagnostics: (parsed.errors ?? []).map(String),
      nodesParsed: flat.length,
      // Nodes THIS WALKER did not record. Previously this counted TmplAstUnknownBlock,
      // which is Angular failing to parse -- a different failure, now carried by the
      // unknown-block warning. Conflating them meant our own coverage gaps read as 0.
      nodesUnrecognized: unhandledNodes.size,
    },
    ast: { ...out, styles: {
      files: signature.unit.files.styles ?? [],
      encapsulation: signature.decorator?.encapsulation ?? null,
      usesEncapsulationEscapes: false, escapeSelectors: [],
      usesHostSelectors: false, importsGlobalStyles: [], classesToggledFromTs: [],
    } },
    uiRequirements: [],
    coverage: {
      $comment: "nodesTotal counts nodes this tier RECORDS. parse.nodesParsed counts everything the compiler produced -- ids are numbered over that larger set (D13a), so recorded ids are sparse. uncoveredNodeIds lists recorded nodes no uiRequirement cites, never unrecorded ones: citing those was the original dangling bug.",
      nodesTotal,
      nodesCoveredByRequirements: 0,
      uncoveredNodeIds: recordedIds.filter((rid) => !citedByRequirements.has(rid)),
    },
    provenance: {
      source: "ast",
      astInputHash: opts.inputHash ?? null,
      docInputHash: null,
      resolverVersion: opts.resolverVersion ?? "0.1.0",
      generatedAt: opts.generatedAt ?? "1970-01-01T00:00:00.000Z",
      parseStatus: w.parseStatus(),
      warnings: w.list(),
    },
  };

  // Returned ALONGSIDE the tier, not on it. It belongs to signature.metrics, and
  // hanging it on the tier object meant the caller had to delete the field again
  // -- the return value used as a side channel, with cleanup left to whoever
  // remembered. An explicit second value cannot be forgotten.
  return { tier, metrics: { maxTemplateNestingDepth: maxDepth } };
}

function collectPipeNames(ast, C, pipes, owner) {
  const names = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.constructor && /BindingPipe/.test(n.constructor.name) && n.name) {
      names.push(n.name);
      if (!pipes.has(n.name)) pipes.set(n.name, { name: n.name, origin: "angular", resolvedUnitId: null, isPure: true, occurrences: [] });
      pipes.get(n.name).occurrences.push(owner);
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object" && k !== "sourceSpan" && k !== "span") walk(v);
    }
  };
  walk(ast);
  return names;
}
