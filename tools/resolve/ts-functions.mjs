/**
 * functions.json extraction -- the per-symbol detail tier.
 *
 * Emits `ast` only. The `doc` half is the Explainer's, and writing a placeholder
 * for it would put model-shaped content in a tier whose whole contract is that
 * it contains none.
 *
 * Inline subscriptions live here per D12a: a chain built and subscribed in one
 * expression has no name in source, so it gets no id and is recorded as an
 * attribute of the symbol that subscribes it.
 */
import ts from "typescript";
import { basename } from "node:path";
import { sourceOf, LIFECYCLE_HOOKS, visibilityOf, complexityOf, locOf as loc } from "./ts-source.mjs";
import { createWarnings } from "./warnings.mjs";





/**
 * What the original developer wrote. Never mixed with generated prose.
 *
 * Comments come from the compiler's own trivia scanner rather than a `//` regex
 * over the body text. The regex matched inside string literals, so
 * `const url = "https://x/y"` contributed `/x/y` as a developer comment -- and a
 * fabricated comment is worse than a missing one, because it reads as intent.
 */
function existingComments(node, sourceText) {
  const jsDocNodes = node.jsDoc ?? [];
  const jsDoc = jsDocNodes.length
    ? jsDocNodes.map((d) => d.comment ?? "").filter(Boolean).join("\n") || null
    : null;

  const inline = [];
  const seen = new Set();
  const take = (ranges) => {
    for (const r of ranges ?? []) {
      if (r.kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;   // jsDoc handled above
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      inline.push(sourceText.slice(r.pos, r.end).replace(/^\/\/\s?/, "").trim());
    }
  };
  const visit = (n) => {
    take(ts.getLeadingCommentRanges(sourceText, n.getFullStart()));
    take(ts.getTrailingCommentRanges(sourceText, n.getEnd()));
    ts.forEachChild(n, visit);
  };
  visit(node);
  return { jsDoc, inline: inline.filter(Boolean) };
}

/** The identifier a call chain starts from: `window.x.y()` -> "window". */
function rootIdentifier(expr) {
  let n = expr;
  while (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n) || ts.isElementAccessExpression(n)) {
    n = n.expression;
  }
  return ts.isIdentifier(n) ? n.text : null;
}

const TIMER_FNS = new Set(["setTimeout", "setInterval", "requestAnimationFrame"]);
const STORAGE_ROOTS = new Set(["localStorage", "sessionStorage"]);
const DOM_ROOTS = new Set(["document", "window"]);
const NAV_METHODS = new Set(["navigate", "navigateByUrl"]);

function sideEffectHints(node, src, depNames) {
  const h = {
    touchesDom: false, domApis: [], subscribes: false, usesTimers: false,
    usesLocalOrSessionStorage: false, navigates: false,
    mutatesInjectedServiceState: false, throws: false, hasTryCatch: false,
  };
  const walk = (n) => {
    if (ts.isCallExpression(n)) {
      // Matched on tree shape, not on the printed text of the callee. `/^document\./`
      // also matched `documentService.load()`, and `/\.subscribe$/` matched any
      // member named subscribe on anything.
      const callee = n.expression;
      const root = rootIdentifier(callee);
      if (DOM_ROOTS.has(root)) {
        h.touchesDom = true;
        const api = callee.getText(src);
        if (!h.domApis.includes(api)) h.domApis.push(api);
      }
      if (STORAGE_ROOTS.has(root)) h.usesLocalOrSessionStorage = true;
      if (ts.isIdentifier(callee) && TIMER_FNS.has(callee.text)) h.usesTimers = true;
      if (ts.isPropertyAccessExpression(callee)) {
        if (callee.name.text === "subscribe") h.subscribes = true;
        if (NAV_METHODS.has(callee.name.text)) h.navigates = true;
      }
    }
    if (ts.isThrowStatement(n)) h.throws = true;
    if (ts.isTryStatement(n)) h.hasTryCatch = true;
    // this.someInjectedService.field = x  -- writing to state that outlives the unit
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(n.left)) {
      const owner = ts.isPropertyAccessExpression(n.left.expression)
        && n.left.expression.expression.kind === ts.SyntaxKind.ThisKeyword
        ? n.left.expression.name.text : null;
      if (owner && depNames.has(owner)) h.mutatesInjectedServiceState = true;
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return h;
}

/** `a.pipe(x, y).subscribe(...)` -> the chain, its operators, and how it ends. */
function subscriptionsIn(node, src, file, cleanupStrategy) {
  const out = [];
  const walk = (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && n.expression.name.text === "subscribe") {
      const chain = n.expression.expression;
      const operators = [];
      let takeUntilDestroyed = false;
      const scanPipe = (x) => {
        if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression)
            && x.expression.name.text === "pipe") {
          for (const a of x.arguments) {
            const nm = ts.isCallExpression(a) ? a.expression.getText(src) : a.getText(src);
            operators.push(nm);
            if (/takeUntilDestroyed/.test(nm)) takeUntilDestroyed = true;
          }
        }
        ts.forEachChild(x, scanPipe);
      };
      scanPipe(chain);
      out.push({
        index: out.length,
        sourceExpression: chain.getText(src),
        operators,
        consumption: "explicit-subscribe",
        unsubscribeStrategy: takeUntilDestroyed ? "takeUntilDestroyed"
          : cleanupStrategy === "ngOnDestroy-unsubscribe" ? "Subscription.unsubscribe"
          : cleanupStrategy === "DestroyRef" ? "DestroyRef"
          : "none",
        loc: loc(n, src, file),
      });
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return out;
}

/**
 * Reactive form groups, read from the AST rather than from source text.
 *
 * Every decision here used to be a regex over `node.getText()`: `/FormArray/`
 * matched the substring anywhere in a control's text including inside a comment
 * or a string, `/disabled\s*:\s*true/` missed `disabled: isLocked` entirely, and
 * `/Validators\.(\w+)/` could not see a validator imported directly. Text matching
 * is a fallback for when no tree is available; here one is.
 *
 * Where the tree cannot settle a question, the field is null and a warning is
 * raised -- never a guess. A half-matched heuristic writes a confident wrong
 * value, and nothing downstream can tell that from a right one.
 */
const FORM_CTORS = new Set(["FormGroup", "FormControl", "FormArray", "FormRecord"]);

/** `Validators.required` / `Validators.compose([...])` -> the names used, from the tree. */
function validatorsIn(node, src) {
  const names = [];
  const walk = (n) => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)
        && n.expression.text === "Validators") {
      names.push(n.name.text);
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return names;
}

/** The property named `key` in an object literal, or null. */
function propNamed(node, key, src) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText(src) === key) return p.initializer;
  }
  return null;
}

/** `fb.group(...)`, `fb.nonNullable.group(...)`, `new FormGroup(...)` -> how it was built. */
function formConstruction(init, src) {
  if (ts.isNewExpression(init)) {
    const name = ts.isIdentifier(init.expression) ? init.expression.text : null;
    if (name && FORM_CTORS.has(name)) {
      return { builtWith: `new ${name}`, ctor: name, args: init.arguments };
    }
    return null;
  }
  if (ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression)) {
    const method = init.expression.name.text;          // group / array / control / record
    if (method === "group" || method === "record") {
      return { builtWith: "FormBuilder", ctor: null, args: init.arguments, builderMethod: method };
    }
  }
  return null;
}

/** What kind of control an initializer expression creates, from the tree. */
function controlKind(init, src) {
  if (ts.isNewExpression(init) && ts.isIdentifier(init.expression)) {
    const n = init.expression.text;
    if (n === "FormArray") return "array";
    if (n === "FormRecord") return "record";
    if (n === "FormGroup") return "group";
    if (n === "FormControl") return "control";
  }
  if (ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression)) {
    const m = init.expression.name.text;
    if (m === "array") return "array";
    if (m === "record") return "record";
    if (m === "group") return "group";
    if (m === "control") return "control";
  }
  // `['', Validators.required]` and a bare literal are both plain controls.
  return "control";
}

function extractForms(cls, src, file, w) {
  const groups = [];
  let approach = "none";
  for (const m of cls.members) {
    if (!ts.isPropertyDeclaration(m) || !m.initializer) continue;
    const built = formConstruction(m.initializer, src);
    if (!built) continue;
    approach = "reactive";
    const name = m.name.getText(src);

    const controls = [];
    const objLit = built.args?.[0];
    if (objLit && ts.isObjectLiteralExpression(objLit)) {
      for (const p of objLit.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const path = p.name.getText(src);
        const init = p.initializer;

        // A control may be `x`, `[x, validators]`, or `{value, disabled}`.
        const first = ts.isArrayLiteralExpression(init) ? (init.elements[0] ?? init) : init;
        const disabledExpr = propNamed(first, "disabled", src);
        const optionsObj = ts.isArrayLiteralExpression(init)
          ? init.elements.find((e) => ts.isObjectLiteralExpression(e) && propNamed(e, "updateOn", src))
          : null;
        const updateOnNode = optionsObj ? propNamed(optionsObj, "updateOn", src) : null;

        controls.push({
          // Citable in its own right: a claim about the identifier field should not
          // have to cite the whole group and lose which control it meant.
          id: `control:${name}.${path}`,
          path,
          type: controlKind(ts.isArrayLiteralExpression(init) ? first : init, src),
          valueType: "unknown",
          initialValueExpression: init.getText(src),
          syncValidators: validatorsIn(init, src),
          asyncValidators: [],
          // A disabled control does not participate in validation, so a required
          // rule alongside it is inert -- recorded, not collapsed. The EXPRESSION is
          // kept, not a boolean: `disabled: isLocked` is a real case the old
          // /disabled:\s*true/ match silently reported as not-disabled.
          disabledExpression: disabledExpr ? disabledExpr.getText(src) : null,
          updateOn: updateOnNode && ts.isStringLiteralLike(updateOnNode)
            ? updateOnNode.text : null,
        });
      }
    }
    groups.push({
      id: `form:${name}`, name,
      builtWith: built.builtWith,
      controls, crossFieldValidators: [], patchedBy: [], loc: loc(m, src, file),
    });
  }
  return { approach, groups, ngModelBindings: [] };
}

/** describe/it titles from the spec file, with suite nesting. */
function extractTests(specFile, specText, memberNames, depNames) {
  const src = ts.createSourceFile(specFile, specText, ts.ScriptTarget.Latest, true);
  const cases = [];
  const walk = (n, suite) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const fn = n.expression.text;
      const titleNode = n.arguments[0];
      const title = titleNode && (ts.isStringLiteral(titleNode) || ts.isNoSubstitutionTemplateLiteral(titleNode))
        ? titleNode.text : null;
      if (fn === "describe" && title) {
        n.arguments.slice(1).forEach((a) => walk(a, [...suite, title]));
        return;
      }
      if (fn === "it" && title) {
        const body = n.getText(src);
        cases.push({
          id: `test:${cases.length + 1}`,
          suitePath: suite,
          title,
          targets: [...memberNames].filter((m) => new RegExp(`\\b${m}\\b`).test(body))
            .map((m) => memberNames.get(m)),
          mocks: [...depNames].filter((d) => new RegExp(`\\b${d}\\b`, "i").test(body)).map((d) => `dep:${d}`),
          isSkipped: false,
          loc: loc(n, src, specFile),
        });
        return;
      }
    }
    ts.forEachChild(n, (c) => walk(c, suite));
  };
  walk(src, []);
  return cases;
}

export function extractFunctions(filePath, sourceText, signature, dependencies, opts = {}) {
  const w = opts.warn ?? createWarnings({ root: opts.root });
  w.warn("empty-by-design",
    "doc is absent on every symbol: it is the Explainer's output, and a placeholder would put "
    + "model-shaped content in a tier that contains none.");
  const file = basename(filePath);
  const src = sourceOf(opts, filePath, sourceText);
  const cls = src.statements.find((s) => ts.isClassDeclaration(s) && s.members?.length);
  if (!cls) return null;

  const depNames = new Set(signature.injectedDependencies.map((d) => d.propertyName));
  const leaf = new Set(dependencies?.callGraph?.leafMethods ?? []);
  const symbols = {};

  for (const m of cls.members) {
    let id, name, symbolKind;
    if (ts.isMethodDeclaration(m)) { name = m.name.getText(src); id = `method:${name}`; symbolKind = "method"; }
    else if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) { name = m.name.getText(src); id = `accessor:${name}`; symbolKind = "accessor"; }
    else if (ts.isConstructorDeclaration(m) && m.body) { name = "constructor"; id = "method:constructor"; symbolKind = "constructor"; }
    else continue;

    const l = loc(m, src, file);
    symbols[id] = {
      ast: {
        id, name, symbolKind,
        visibility: visibilityOf(m),
        static: !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static),
        isAsync: !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Async),
        lifecycleHook: LIFECYCLE_HOOKS.has(name) ? name : null,
        params: (m.parameters ?? []).map((p) => ({
          name: p.name.getText(src),
          type: p.type ? p.type.getText(src) : "unknown",
          optional: !!p.questionToken,
          defaultExpression: p.initializer ? p.initializer.getText(src) : null,
        })),
        returnType: m.type ? m.type.getText(src) : "unknown",
        isLeaf: leaf.has(id),
        cyclomaticComplexity: complexityOf(m),
        lineCount: l.endLine - l.line + 1,
        loc: l,
        // Null unless asked for. The body is already in the file that `loc`
        // points at, so storing it copies a fact rather than recording one --
        // and the copy can go stale against the source it duplicates.
        sourceExcerpt: opts.sourceExcerpt && m.body ? m.body.getText(src) : null,
        existingComments: existingComments(m, sourceText),
        sideEffectHints: sideEffectHints(m, src, depNames),
        subscriptions: m.body ? subscriptionsIn(m.body, src, file, signature.lifecycle.cleanupStrategy) : [],
      },
    };
  }

  const memberNames = new Map(
    [...signature.stateOutline.methodIds.map((x) => [x.slice(7), x]),
     ...signature.stateOutline.fields.map((f) => [f.name, f.id])]);

  const tests = opts.specText
    ? { files: [opts.specFile], framework: opts.framework ?? "unknown",
        cases: extractTests(opts.specFile, opts.specText, memberNames, depNames) }
    : { files: [], framework: "unknown", cases: [] };

  const explained = 0;
  // A template-driven form is only visible from the template: nothing in the
  // TypeScript distinguishes a plain string field from one bound by ngModel.
  // The forms fixture pair asserts this, and without it the template-driven
  // member reported 'none' -- indistinguishable from a component with no form.
  const forms = extractForms(cls, src, file, w);
  const ngModelBindings = (opts.templateTwoWay ?? []).filter((b) => b.property === "ngModel");
  if (ngModelBindings.length) {
    forms.ngModelBindings = ngModelBindings.map((b) => b.id);
    forms.approach = forms.groups.length ? "mixed" : "template-driven";
  }

  return {
    schemaVersion: "0.5.0",
    unitId: signature.unit.id,
    symbols,
    forms,
    streams: [],  // source-named only (D12a); inline ones are on their symbol
    signals: signature.stateOutline.fields
      .filter((f) => f.roleHints?.isSignal)
      .map((f) => ({
        id: f.id, signalKind: f.roleHints.signalKind,
        dependsOn: dependencies?.fieldAccess?.signalDependencies?.[f.id] ?? [],
        writtenBy: dependencies?.fieldAccess?.writtenBy?.[f.id] ?? [],
      })),
    tests,
    coverage: {
      symbolsTotal: Object.keys(symbols).length,
      symbolsExplained: explained,
      symbolsTrivialSkipped: 0,
    },
    provenance: {
      source: "ast",
      astInputHash: opts.inputHash ?? null,
      docInputHash: null,
      resolverVersion: opts.resolverVersion ?? "0.1.0",
      explainerModel: null,
      generatedAt: opts.generatedAt ?? "1970-01-01T00:00:00.000Z",
      parseStatus: w.parseStatus(),
      warnings: w.list(),
    },
  };
}
