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
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
  const found = searchUp(startDir);
  if (found) return { path: found, vendored: true };
  const own = fallbackDir ? searchUp(fallbackDir) : null;
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

const has = (n, k) => n && Object.prototype.hasOwnProperty.call(n, k);
const startOf = (n) => n?.sourceSpan?.start?.offset ?? n?.sourceSpan?.start ?? 0;
const lineOf = (n) => (n?.sourceSpan?.start?.line ?? 0) + 1;
const endLineOf = (n) => (n?.sourceSpan?.end?.line ?? n?.sourceSpan?.start?.line ?? 0) + 1;

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

export function extractTemplate(templateFile, templateText, signature, compilerPath, opts = {}) {
  const C = opts.compiler;
  const parsed = C.parseTemplate(templateText, templateFile, { preserveWhitespaces: false });

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

  // Ids number the nodes this tier RECORDS, not every node the parser saw. The
  // parse sees text and whitespace it emits no record for; numbering those left
  // coverage.uncoveredNodeIds citing ids nothing declared, which the integrity
  // checker caught as 24 dangling references. Assignment happens after
  // classification, in document order over the recorded set (D13).
  const emitted = [];
  const emit = (bucket, node, rec) => { emitted.push({ bucket, node, rec }); return rec; };
  const idOf = new Map();
  const id = (n) => idOf.get(n) ?? null;
  const loc = (n) => ({ file: templateFile, line: lineOf(n), endLine: endLineOf(n) });

  const out = {
    controlFlow: [], propertyBindings: [], eventBindings: [], twoWayBindings: [],
    interpolations: [], childComponents: [], templateRefs: [], ngTemplates: [],
    contentProjection: [], hostBindings: [], hostListeners: [], accessibility: [],
    i18n: [], rawHtmlSinks: [], directivesUsed: [], pipesUsed: [], viewQueries: [],
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
      emit("controlFlow", n, {
        id: null, construct: "@defer",
        expression: (n.triggers ? Object.keys(n.triggers) : []).join(",") || null,
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
      if (n.name === "innerHTML") emit("rawHtmlSinks", n.value ?? n, { id: null, property: "innerHTML", expression: rec.expression, sanitizerBypassed: false });
    } else if (n instanceof C.TmplAstBoundEvent) {
      const handler = n.handler?.source ?? "";
      const m = /^([A-Za-z_$][\w$]*)\s*\(/.exec(handler);
      emit("eventBindings", n, {
        id: null, target: parent?.name ?? "", event: n.name,
        handlerExpression: handler,
        handlerMethod: m && methodNames.has(m[1]) ? `method:${m[1]}` : null,
        passesEvent: /\$event/.test(handler), loc: loc(n),
      });
    } else if (n instanceof C.TmplAstBoundText) {
      const ast = n.value?.ast ?? n.value;
      emit("interpolations", n, {
        id: null, expression: n.value?.source ?? "",
        pipes: collectPipeNames(ast, C, pipes, n),
        dependsOn: dependsOn(n.value), loc: loc(n),
      });
    } else if (n instanceof C.TmplAstReference) {
      emit("templateRefs", n, { id: null, name: n.name, onElement: parent?.name ?? "", referencedBy: [] });
    } else if (n instanceof C.TmplAstContent) {
      emit("contentProjection", n, { id: null, select: n.selector === "*" ? null : n.selector });
    } else if (n instanceof C.TmplAstElement) {
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
    }
  }

  // --- assign ids: document order by source start offset, over recorded nodes only
  emitted.sort((a, b) => startOf(a.node) - startOf(b.node));
  emitted.forEach((e, i) => { if (!idOf.has(e.node)) idOf.set(e.node, `tpl:${i}`); });
  for (const e of emitted) { e.rec.id = idOf.get(e.node); out[e.bucket].push(e.rec); }

  const resolveNodes = (arr) => [...new Set(arr.map((x) => idOf.get(x)).filter(Boolean))];
  out.directivesUsed = [...directives.values()].map((d) => ({ ...d, occurrences: resolveNodes(d.occurrences) }));
  out.pipesUsed = [...pipes.values()].map((p) => ({ ...p, occurrences: resolveNodes(p.occurrences) }));

  const recordedIds = emitted.map((e) => idOf.get(e.node));
  const nodesTotal = recordedIds.length;
  return {
    schemaVersion: "0.3.0",
    unitId: signature.unit.id,
    templateFile,
    parse: {
      status: parsed.errors?.length ? "partial" : "ok",
      parser: "@angular/compiler",
      angularVersion: opts.angularVersion ?? null,
      diagnostics: (parsed.errors ?? []).map(String),
      nodesParsed: flat.length,
      nodesUnrecognized: flat.filter((f) => f.node instanceof C.TmplAstUnknownBlock).length,
    },
    ast: { ...out, styles: {
      files: signature.unit.files.styles ?? [],
      encapsulation: signature.decorator?.encapsulation ?? null,
      usesEncapsulationEscapes: false, escapeSelectors: [],
      usesHostSelectors: false, importsGlobalStyles: [], classesToggledFromTs: [],
    } },
    uiRequirements: [],
    coverage: {
      $comment: "nodesTotal counts nodes this tier RECORDS and gives an id. parse.nodesParsed counts everything the parser saw, including text and whitespace it emits no record for -- the two differ and mean different things.",
      nodesTotal,
      nodesCoveredByRequirements: 0,
      uncoveredNodeIds: recordedIds,
    },
    provenance: {
      source: "ast",
      astInputHash: opts.inputHash ?? null,
      docInputHash: null,
      resolverVersion: opts.resolverVersion ?? "0.1.0",
      generatedAt: opts.generatedAt ?? "1970-01-01T00:00:00.000Z",
      warnings: [
        "uiRequirements is empty by design: it is doc content, written by the Synthesizer, not extracted.",
        `parsed with @angular/compiler from ${compilerPath}`,
        ...(opts.vendored ? [] : [
          "FALLBACK PARSER: the analyzed source tree vendors no @angular/compiler, " +
          "so this Resolver's own pinned copy was used. Its version may differ from " +
          "the version the repo builds with.",
        ]),
      ],
    },
    maxTemplateNestingDepth: maxDepth,
  };
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
