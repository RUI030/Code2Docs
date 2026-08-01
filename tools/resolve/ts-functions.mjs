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
import { sourceOf } from "./ts-source.mjs";
import { createWarnings } from "./warnings.mjs";

const LIFECYCLE_HOOKS = new Set([
  "ngOnInit", "ngOnDestroy", "ngOnChanges", "ngDoCheck", "ngAfterContentInit",
  "ngAfterContentChecked", "ngAfterViewInit", "ngAfterViewChecked",
]);

const loc = (n, src, file) => ({
  file,
  line: src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1,
  endLine: src.getLineAndCharacterOfPosition(n.getEnd()).line + 1,
});

function visibilityOf(node) {
  const m = ts.getCombinedModifierFlags(node);
  if (m & ts.ModifierFlags.Private) return "private";
  if (m & ts.ModifierFlags.Protected) return "protected";
  return "public";
}

/**
 * 1 + one per branch point. The counted kinds are enumerated in
 * functions.schema.json and this must not drift from them: an undefined metric
 * is one two correct implementations disagree on, which is what F8b was about.
 */
function complexityOf(node) {
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

/** What the original developer wrote. Never mixed with generated prose. */
function existingComments(node, sourceText) {
  const jsDocNodes = node.jsDoc ?? [];
  const jsDoc = jsDocNodes.length
    ? jsDocNodes.map((d) => d.comment ?? "").filter(Boolean).join("\n") || null
    : null;
  const inline = [];
  const body = sourceText.slice(node.getStart(), node.getEnd());
  for (const m of body.matchAll(/(^|\s)\/\/\s?(.+)$/gm)) inline.push(m[2].trim());
  return { jsDoc, inline };
}

function sideEffectHints(node, src, depNames) {
  const h = {
    touchesDom: false, domApis: [], subscribes: false, usesTimers: false,
    usesLocalOrSessionStorage: false, navigates: false,
    mutatesInjectedServiceState: false, throws: false, hasTryCatch: false,
  };
  const walk = (n) => {
    if (ts.isCallExpression(n)) {
      const txt = n.expression.getText(src);
      if (/^(document|window)\./.test(txt)) { h.touchesDom = true; if (!h.domApis.includes(txt)) h.domApis.push(txt); }
      if (/\.subscribe$/.test(txt)) h.subscribes = true;
      if (/^(setTimeout|setInterval|requestAnimationFrame)$/.test(txt)) h.usesTimers = true;
      if (/(localStorage|sessionStorage)\./.test(txt)) h.usesLocalOrSessionStorage = true;
      if (/\.(navigate|navigateByUrl)$/.test(txt)) h.navigates = true;
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

/** Reactive form groups built with FormBuilder or `new FormGroup`. */
function extractForms(cls, src, file) {
  const groups = [];
  let approach = "none";
  for (const m of cls.members) {
    if (!ts.isPropertyDeclaration(m) || !m.initializer) continue;
    const init = m.initializer;
    const txt = init.getText(src);
    const isFb = /\.(group|nonNullable\.group)\(/.test(txt);
    const isNew = ts.isNewExpression(init) && /FormGroup/.test(init.expression.getText(src));
    if (!isFb && !isNew) continue;
    approach = "reactive";
    const name = m.name.getText(src);
    const controls = [];
    const objLit = (isNew ? init.arguments?.[0] : init.arguments?.[0]);
    if (objLit && ts.isObjectLiteralExpression(objLit)) {
      for (const p of objLit.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const ctrlText = p.initializer.getText(src);
        const validators = [...ctrlText.matchAll(/Validators\.(\w+)/g)].map((x) => x[1]);
        const path = p.name.getText(src);
        controls.push({
          // Citable in its own right: a claim about the identifier field should not
          // have to cite the whole group and lose which control it meant.
          id: `control:${name}.${path}`,
          path,
          type: /FormArray/.test(ctrlText) ? "array" : /FormGroup/.test(ctrlText) ? "group" : "control",
          valueType: "unknown",
          initialValueExpression: ctrlText,
          syncValidators: validators,
          asyncValidators: [],
          // A disabled control does not participate in validation, so a required
          // rule alongside `disabled: true` is inert -- recorded, not collapsed.
          disabledExpression: /disabled\s*:\s*true/.test(ctrlText) ? "true" : null,
          updateOn: null,
        });
      }
    }
    groups.push({
      id: `form:${name}`, name,
      builtWith: isFb ? "FormBuilder" : "new FormGroup",
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
  const forms = extractForms(cls, src, file);
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
