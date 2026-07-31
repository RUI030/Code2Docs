/**
 * dependencies.json extraction -- the graph tier.
 *
 * Takes the already-extracted signature so it can tell a field from a method
 * from an injected dependency: `this.x.y()` means three different things
 * depending on what `x` is, and nothing in the syntax says which.
 *
 * Reverse indexes (calledBy, readBy, writtenBy) are emitted alongside the
 * forward ones. They are nearly free while the tree is already walked and
 * expensive for a consumer to derive by scanning, which is D2's reason for
 * emitting both.
 *
 * Streams here are source-named only (D12a). A chain built and subscribed
 * inline has no id and belongs to functions.json, on the symbol that
 * subscribes it.
 */
import ts from "typescript";
import { basename } from "node:path";
import { createWarnings } from "./warnings.mjs";

const SIGNAL_WRITERS = new Set(["set", "update", "mutate"]);
const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete"]);
const NAV_APIS = new Set(["navigate", "navigateByUrl"]);

const ANGULAR_MODULE = /^@angular\//;
const RXJS_MODULE = /^rxjs(\/|$)/;

function lineOf(node, src) {
  return src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
}
const locOf = (node, src, file) => ({ file, line: lineOf(node, src) });

/** `this.foo` -> "foo"; anything else -> null. */
function thisProp(node) {
  return ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword
    ? node.name.text
    : null;
}
/** `this.a.b` -> {owner:"a", member:"b"}; else null. */
function thisPropProp(node) {
  if (!ts.isPropertyAccessExpression(node)) return null;
  const owner = thisProp(node.expression);
  return owner ? { owner, member: node.name.text } : null;
}

/** Every member that can contain executable code, plus how to name its call site. */
function callSites(cls, src) {
  const out = [];
  for (const m of cls.members) {
    if (ts.isMethodDeclaration(m)) out.push({ id: `method:${m.name.getText(src)}`, body: m.body, node: m });
    else if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) out.push({ id: `accessor:${m.name.getText(src)}`, body: m.body, node: m });
    else if (ts.isPropertyDeclaration(m) && m.initializer) {
      // A field initializer runs during construction, before ngOnInit -- it is a
      // call site, and not one any method id can name (F5a).
      const name = m.name.getText(src);
      const isArrow = ts.isArrowFunction(m.initializer) || ts.isFunctionExpression(m.initializer);
      out.push({
        id: isArrow ? `field:${name}` : `field-initializer:${name}`,
        body: isArrow ? m.initializer.body : m.initializer,
        node: m,
        isInitializer: !isArrow,
      });
    } else if (ts.isConstructorDeclaration(m) && m.body) {
      out.push({ id: "method:constructor", body: m.body, node: m });
    }
  }
  return out;
}

export function extractDependencies(filePath, sourceText, signature, opts = {}) {
  const file = basename(filePath);
  // Per-tier collector: warnings live in this tier's provenance, so a gap here
  // must not be reported on signature's record or vice versa.
  const w = opts.warn ?? createWarnings({ root: opts.root });
  w.warn("empty-by-design",
    "outboundUnitEdges and inboundUnitEdges are empty: cross-unit resolution needs the repo index (Phase 2).");
  if (!opts.templateHandlers) {
    w.warn("upper-bound-only",
      "unreachableMethods OVER-REPORTS: no template was parsed, so methods called only from a "
      + "template binding or host listener look uncalled. Treat it as an upper bound until template.json exists.");
  }
  const src = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  const cls = src.statements.find((s) => ts.isClassDeclaration(s) && s.members?.length);
  if (!cls || !signature) return null;

  // --- symbol table from the signature: what kind of thing is `this.x`?
  const fieldNames = new Set(signature.stateOutline.fields.map((f) => f.name));
  const signalFields = new Set(
    signature.stateOutline.fields.filter((f) => f.roleHints?.isSignal).map((f) => f.name));
  const depByName = new Map(signature.injectedDependencies.map((d) => [d.propertyName, d]));
  const methodNames = new Set(signature.stateOutline.methodIds.map((m) => m.slice(7)));
  const accessorNames = new Set(signature.stateOutline.accessorIds.map((a) => a.slice(9)));

  const nodes = [...signature.stateOutline.methodIds, ...signature.stateOutline.accessorIds];

  const edges = [];
  const calls = {}, calledBy = {};
  const reads = {}, writes = {}, readBy = {}, writtenBy = {};
  const derivedFrom = {}, signalDependencies = {};
  const usage = new Map();   // dep name -> { members: Map, usedBy: Set }
  const httpInteractions = [], navigations = [];
  const routeParams = [], queryParams = [], routeData = [];

  const push = (obj, k, v) => { (obj[k] ??= []); if (!obj[k].includes(v)) obj[k].push(v); };

  for (const site of callSites(cls, src)) {
    if (!site.body) continue;
    const from = site.id;

    const walk = (n) => {
      // --- this.method(...)  -> call-graph edge
      if (ts.isCallExpression(n)) {
        const direct = thisProp(n.expression);
        if (direct && (methodNames.has(direct) || accessorNames.has(direct))) {
          const to = methodNames.has(direct) ? `method:${direct}` : `accessor:${direct}`;
          const existing = edges.find((e) => e.from === from && e.to === to);
          if (existing) existing.callCount++;
          else edges.push({ from, to, callCount: 1, conditional: false, loc: locOf(n, src, file) });
          push(calls, from, to);
          push(calledBy, to, from);
        }

        const pair = thisPropProp(n.expression);
        if (pair) {
          const { owner, member } = pair;

          // this.someSignal.set(v) is a WRITE to the field, not a call on it
          if (signalFields.has(owner) && SIGNAL_WRITERS.has(member)) {
            push(writes, from, `field:${owner}`);
            push(writtenBy, `field:${owner}`, from);
          } else if (depByName.has(owner)) {
            // this.someService.method(...) -> dependency usage
            const rec = usage.get(owner) ?? { members: new Map(), usedBy: new Set() };
            const m = rec.members.get(member) ?? { member, argTypes: [], returnType: "unknown", fromMethods: [], loc: locOf(n, src, file) };
            if (!m.fromMethods.includes(from)) m.fromMethods.push(from);
            rec.members.set(member, m);
            rec.usedBy.add(from);
            usage.set(owner, rec);

            const dep = depByName.get(owner);
            if (HTTP_VERBS.has(member) && /^Http/.test(dep.token)) {
              httpInteractions.push({
                id: `http:${httpInteractions.length + 1}`,
                method: member.toUpperCase(),
                urlExpression: n.arguments[0] ? n.arguments[0].getText(src) : "",
                requestType: null, responseType: null,
                viaDependency: `dep:${owner}`, calledFrom: from,
                directHttpClientUse: true, loc: locOf(n, src, file),
              });
            }
            if (NAV_APIS.has(member) && /Router$/.test(dep.token)) {
              navigations.push({
                id: `nav:${navigations.length + 1}`,
                api: `router.${member}`,
                targetExpression: n.arguments[0] ? n.arguments[0].getText(src) : "",
                from, loc: locOf(n, src, file),
              });
            }
          } else if (fieldNames.has(owner)) {
            push(reads, from, `field:${owner}`);
            push(readBy, `field:${owner}`, from);
          }
        }
      }

      // --- this.x = v / this.x += v  -> write
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
          && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const target = thisProp(n.left) ?? thisPropProp(n.left)?.owner;
        if (target && fieldNames.has(target)) {
          push(writes, from, `field:${target}`);
          push(writtenBy, `field:${target}`, from);
        }
      }

      // --- bare this.x  -> read (call/assign cases already handled above)
      const p = thisProp(n);
      if (p && fieldNames.has(p)) {
        const parent = n.parent;
        const isAssignTarget = parent && ts.isBinaryExpression(parent) && parent.left === n
          && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
          && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
        const isCallee = parent && ts.isPropertyAccessExpression(parent) && parent.expression === n
          && parent.parent && ts.isCallExpression(parent.parent) && parent.parent.expression === parent;
        if (!isAssignTarget && !isCallee) {
          push(reads, from, `field:${p}`);
          push(readBy, `field:${p}`, from);
        }
      }

      // --- ActivatedRoute consumption
      const rp = thisPropProp(n);
      if (rp && depByName.has(rp.owner) && /ActivatedRoute/.test(depByName.get(rp.owner).token)) {
        const target = { queryParams, params: routeParams }[rp.member];
        if (target && !target.some((x) => x.inMethod === from)) {
          target.push({ name: rp.member, access: "observable", inMethod: from, loc: locOf(n, src, file) });
        }
        if (rp.member === "data" && !routeData.includes("data")) routeData.push("data");
      }

      ts.forEachChild(n, walk);
    };
    walk(site.body);
  }

  // --- template bindings are callers too. Without this, "what calls save()?"
  //     answers null on a method the template submits to, which is the exact
  //     question the reverse index exists to make instant (D2).
  for (const { node, member } of opts.templateCallers ?? []) {
    if (!member) continue;
    push(calledBy, member, node);
    if (!edges.some((e) => e.from === node && e.to === member)) {
      edges.push({ from: node, to: member, callCount: 1, conditional: false });
    }
  }
  for (const { node, field } of opts.templateReaders ?? []) {
    if (!field) continue;
    push(readBy, field, node);
  }

  // --- accessors derive from whatever they read
  for (const a of signature.stateOutline.accessorIds) {
    if (reads[a]?.length) derivedFrom[a] = [...reads[a]];
  }
  // --- computed(() => this.x()) depends on the signals it reads
  for (const f of signature.stateOutline.fields) {
    if (f.roleHints?.signalKind === "computed" && f.initializerExpression) {
      const deps = [...f.initializerExpression.matchAll(/this\.([A-Za-z_$][\w$]*)\(\)/g)]
        .map((m) => `field:${m[1]}`)
        .filter((id) => signalFields.has(id.slice(6)));
      if (deps.length) signalDependencies[f.id] = [...new Set(deps)];
    }
  }

  // --- graph shape
  // An entry point is something OUTSIDE the class calls: a lifecycle hook, or a
  // template binding / host listener. "Has no in-file caller" is not the same
  // thing -- treating it as one makes dead code indistinguishable from an entry
  // point, which is precisely the reachability claim Phase 1 exists to verify (F4).
  const lifecycle = new Set(signature.lifecycle.implementedHooks.map((h) => `method:${h}`));
  const templateHandlers = new Set(opts.templateHandlers ?? []);
  const entryPoints = nodes.filter((n) => lifecycle.has(n) || templateHandlers.has(n));
  const leafMethods = nodes.filter((n) => !(calls[n]?.length));
  const reachable = new Set();
  const depthFromEntry = {};
  for (const e of entryPoints) {
    const queue = [[e, 0]];
    while (queue.length) {
      const [n, d] = queue.shift();
      if (reachable.has(n)) { depthFromEntry[n] = Math.min(depthFromEntry[n] ?? d, d); continue; }
      reachable.add(n);
      depthFromEntry[n] = Math.min(depthFromEntry[n] ?? d, d);
      for (const c of calls[n] ?? []) queue.push([c, d + 1]);
    }
  }
  const unreachableMethods = nodes.filter((n) => !reachable.has(n));

  // --- leaf-first order: the sequence the Explainer must follow, so a caller is
  //     never reached before its callees have been explained.
  const executionOrder = [];
  const state = new Map();
  const cycles = [];
  const visit = (n, stack) => {
    if (state.get(n) === "done") return;
    if (state.get(n) === "open") {
      const cut = stack.slice(stack.indexOf(n));
      if (cut.length && !cycles.some((c) => c.length === cut.length && c[0] === cut[0])) cycles.push(cut);
      return;
    }
    state.set(n, "open");
    for (const c of calls[n] ?? []) visit(c, [...stack, n]);
    state.set(n, "done");
    executionOrder.push(n);
  };
  for (const n of nodes) visit(n, []);

  const dependencyUsage = signature.injectedDependencies.map((d) => {
    const rec = usage.get(d.propertyName);
    return {
      dep: d.id,
      resolvedUnitId: null,
      calledMembers: rec ? [...rec.members.values()] : [],
      readProperties: [],
      usedByMethods: rec ? [...rec.usedBy] : [],
    };
  });

  // --- every identifier appearing in a type position, so imported symbols can be
  //     classified as types by use rather than by naming convention
  const typePositionNames = new Set();
  const collectTypeNames = (node) => {
    if (ts.isTypeReferenceNode(node)) {
      const nm = ts.isIdentifier(node.typeName) ? node.typeName.text : node.typeName.getText(src).split(".")[0];
      typePositionNames.add(nm);
    }
    ts.forEachChild(node, collectTypeNames);
  };
  collectTypeNames(src);

  // --- imports, classified by module specifier
  const imports = { angular: [], rxjs: [], thirdParty: [], internal: [], unresolved: [] };
  const dataTypes = [];
  for (const st of src.statements) {
    if (!ts.isImportDeclaration(st) || !st.moduleSpecifier) continue;
    const mod = st.moduleSpecifier.text ?? st.moduleSpecifier.getText(src).replace(/['"]/g, "");
    const names = [];
    const nb = st.importClause?.namedBindings;
    if (st.importClause?.name) names.push(st.importClause.name.text);
    if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) names.push(e.name.text);
    if (nb && ts.isNamespaceImport(nb)) names.push(nb.name.text);

    const entry = { module: mod, symbols: names };
    if (ANGULAR_MODULE.test(mod)) imports.angular.push(entry);
    else if (RXJS_MODULE.test(mod)) imports.rxjs.push(entry);
    else if (mod.startsWith(".") || mod.startsWith("app/")) {
      entry.resolvedUnitId = null;
      imports.internal.push(entry);
      // Types imported from internal modules become type: ids so doc-tier claims
      // about domain terms have something to resolve to -- the gap behind the six
      // dangling references in the Phase A baseline (F6).
      //
      // Membership is decided by whether the symbol is actually USED in a type
      // position, not by its name. The first version matched /^I[A-Z]/, which
      // works on a codebase using the IFoo convention and silently finds nothing
      // on one that does not -- and Angular's own style guide discourages the
      // prefix, so that was a JHipster reading rather than an Angular one.
      for (const n of names) {
        if (typePositionNames.has(n)) {
          dataTypes.push({
            id: `type:${n}`, name: n, declarationKind: "unknown",
            definedHere: false, sourceUnitId: null, shape: [], usedBy: [],
          });
        }
      }
    } else { entry.package = mod.split("/")[0]; imports.thirdParty.push(entry); }
  }

  // --- source-named streams only (D12a)
  const streams = signature.stateOutline.streamIds.map((id) => ({
    id,
    consumedBy: [],
    consumption: "none",
    unsubscribeStrategy: signature.lifecycle.cleanupStrategy === "none" ? "none" : signature.lifecycle.cleanupStrategy,
  }));

  return {
    schemaVersion: "0.5.0",
    unitId: signature.unit.id,
    callGraph: {
      nodes, edges, calls, calledBy, entryPoints, executionOrder,
      depthFromEntry, cycles, unreachableMethods, leafMethods,
    },
    fieldAccess: { reads, writes, readBy, writtenBy, derivedFrom, signalDependencies },
    dependencyUsage,
    outboundUnitEdges: [],
    inboundUnitEdges: [],
    httpInteractions,
    routing: {
      isRoutedComponent: routeParams.length + queryParams.length + routeData.length > 0,
      routePaths: [], routeParamsConsumed: routeParams, queryParamsConsumed: queryParams,
      routeDataConsumed: routeData, navigations, guards: [], resolvers: [],
    },
    imports,
    dataTypes,
    streams,
    provenance: {
      source: "ast",
      resolverVersion: opts.resolverVersion ?? "0.1.0",
      generatedAt: opts.generatedAt ?? "1970-01-01T00:00:00.000Z",
      inputHash: opts.inputHash ?? null,
      parseStatus: w.parseStatus(),
      warnings: w.list(),
    },
  };
}
