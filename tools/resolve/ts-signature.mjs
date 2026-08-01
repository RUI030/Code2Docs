/**
 * signature.json extraction from a component's TypeScript source.
 *
 * Deterministic by construction: reads the AST, never a model, and every value
 * traces to a syntax node. Per D3 this uses the TypeScript compiler rather than
 * text search -- decorator arguments, DI parameter lists and inject() calls
 * break regex matching as soon as formatting spans lines, and they break
 * *silently*, producing confidently wrong metadata the later stages elaborate on.
 *
 * Single-file parse (ts.createSourceFile), no type checker: nothing here needs
 * cross-file type resolution, and a program-wide checker would need the target
 * repo's tsconfig to resolve. resolvedUnitId is left null for that reason and
 * is filled by the repo indexer at Phase 2.
 */
import ts from "typescript";
import { basename } from "node:path";
import { sourceOf } from "./ts-source.mjs";
import { createWarnings } from "./warnings.mjs";

const LIFECYCLE_HOOKS = new Set([
  "ngOnInit", "ngOnDestroy", "ngOnChanges", "ngDoCheck", "ngAfterContentInit",
  "ngAfterContentChecked", "ngAfterViewInit", "ngAfterViewChecked",
]);

const SIGNAL_FACTORIES = { signal: "signal", computed: "computed", linkedSignal: "linkedSignal", toSignal: "toSignal" };
const RXJS_TYPES = new Set(["Observable", "Subject", "BehaviorSubject", "ReplaySubject", "Subscription"]);
const FORM_TYPES = new Set(["FormGroup", "FormControl", "FormArray", "FormRecord"]);

const text = (n, src) => (n ? n.getText(src) : null);

function lineOf(node, src) {
  const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
  return line + 1;
}
function endLineOf(node, src) {
  const { line } = src.getLineAndCharacterOfPosition(node.getEnd());
  return line + 1;
}
function loc(node, src, file) {
  return { file, line: lineOf(node, src), endLine: endLineOf(node, src) };
}

const decoratorsOf = (node) =>
  (ts.canHaveDecorators?.(node) ? ts.getDecorators(node) : node.decorators) ?? [];

function decoratorNamed(node, name) {
  for (const d of decoratorsOf(node)) {
    const e = d.expression;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === name) return e;
    if (ts.isIdentifier(e) && e.text === name) return { arguments: [] };
  }
  return null;
}

/** The object literal passed to @Component({...}), as a plain lookup. */
function componentMeta(cls, src) {
  const call = decoratorNamed(cls, "Component");
  if (!call?.arguments?.length) return null;
  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return {};
  const out = {};
  for (const p of arg.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = p.name.getText(src);
    out[key] = p.initializer;
  }
  return out;
}

const stringOf = (node, src) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : text(node, src);

function arrayOfNames(node, src) {
  if (!node || !ts.isArrayLiteralExpression(node)) return [];
  return node.elements.map((e) => e.getText(src));
}

/** `inject(Token, {optional: true})` -> descriptor, else null. */
function injectCall(init) {
  if (!init || !ts.isCallExpression(init)) return null;
  if (!ts.isIdentifier(init.expression) || init.expression.text !== "inject") return null;
  return init;
}

function injectOptions(call, src) {
  const mods = { optional: false, self: false, skipSelf: false, host: false };
  const opts = call.arguments[1];
  if (opts && ts.isObjectLiteralExpression(opts)) {
    for (const p of opts.properties) {
      if (ts.isPropertyAssignment(p)) {
        const k = p.name.getText(src);
        if (k in mods) mods[k] = p.initializer.kind === ts.SyntaxKind.TrueKeyword;
      }
    }
  }
  return mods;
}

/** Which of @Optional/@Self/@SkipSelf/@Host sit on a constructor parameter. */
function paramModifiers(param) {
  const mods = { optional: false, self: false, skipSelf: false, host: false };
  const map = { Optional: "optional", Self: "self", SkipSelf: "skipSelf", Host: "host" };
  for (const d of decoratorsOf(param)) {
    const e = d.expression;
    const name = ts.isCallExpression(e) ? e.expression.getText() : e.getText();
    if (map[name]) mods[map[name]] = true;
  }
  return mods;
}

function visibilityOf(node) {
  const m = ts.getCombinedModifierFlags(node);
  if (m & ts.ModifierFlags.Private) return "private";
  if (m & ts.ModifierFlags.Protected) return "protected";
  return "public";
}

const originOf = (token) => {
  if (/^(HttpClient|HttpParams|HttpHeaders)$/.test(token)) return "angular";
  if (/^(ActivatedRoute|Router|ActivatedRouteSnapshot)$/.test(token)) return "angular";
  if (/^(ChangeDetectorRef|ElementRef|Renderer2|NgZone|DestroyRef|Injector|ViewContainerRef|TemplateRef)$/.test(token)) return "angular";
  if (/^(FormBuilder|NonNullableFormBuilder|UntypedFormBuilder)$/.test(token)) return "angular";
  return "internal";
};

/** input()/input.required()/output()/model() on a property initializer. */
function signalApiCall(init) {
  if (!init || !ts.isCallExpression(init)) return null;
  const callee = init.expression;
  if (ts.isIdentifier(callee)) return { name: callee.text, required: false, call: init };
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    return { name: callee.expression.text, required: callee.name.text === "required", call: init };
  }
  return null;
}

function aliasFromOptions(call, src, argIndex) {
  const opts = call.arguments[argIndex];
  if (!opts || !ts.isObjectLiteralExpression(opts)) return null;
  for (const p of opts.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText(src) === "alias") return stringOf(p.initializer, src);
  }
  return null;
}

function firstTypeArg(call, src) {
  return call.typeArguments?.length ? call.typeArguments[0].getText(src) : null;
}

/**
 * What the @Component decorator declares about its own template and styles.
 *
 * Exists because the orchestrator used to GUESS the template as `<stem>.html`
 * while this module separately parsed the real `templateUrl` -- so a component
 * naming its template anything else got a signature citing one file and a
 * template.json built from another, and an INLINE template got no template.json
 * at all, with no message. A unit whose UI behavior is entirely unrecorded looked
 * exactly like a unit that has no UI.
 *
 * Returns the DECLARATION, not the contents: resolving a path against the disk
 * is the caller's job, so a declared-but-missing file is reportable rather than
 * indistinguishable from an absent declaration.
 *
 * One function rather than one per field, because each would re-parse the file.
 *
 *   template.kind: "inline"   -> text, startLine   (template: `...`)
 *                  "external" -> url               (templateUrl: './x.html')
 *                  "none"                          neither -- legitimate
 *                  "absent"                        no @Component at all
 */
export function readComponentDeclaration(filePath, sourceText, opts = {}) {
  const src = sourceOf(opts, filePath, sourceText);
  const cls = src.statements.find((s) => ts.isClassDeclaration(s) && decoratorNamed(s, "Component"));
  if (!cls) return { template: { kind: "absent" }, hasInlineStyles: false };
  const meta = componentMeta(cls, src) ?? {};

  let template = { kind: "none" };
  if (meta.template) {
    // Line of the opening quote/backtick. The literal's cooked text begins
    // immediately after it, so this is the offset that maps a template line
    // number back onto a real line in the .ts -- without it every loc in an
    // inline template would point at the top of the file.
    template = {
      kind: "inline",
      text: stringOf(meta.template, src),
      startLine: src.getLineAndCharacterOfPosition(meta.template.getStart(src)).line,
    };
  } else if (meta.templateUrl) {
    template = { kind: "external", url: stringOf(meta.templateUrl, src) };
  }

  return { template, hasInlineStyles: !!(meta.styles || meta.styleUrl) };
}

export function extractSignature(filePath, sourceText, opts = {}) {
  const file = basename(filePath);
  const src = sourceOf(opts, filePath, sourceText);

  const cls = src.statements.find((s) => ts.isClassDeclaration(s) && decoratorNamed(s, "Component"));
  if (!cls) return null;

  const meta = componentMeta(cls, src) ?? {};
  const className = cls.name?.text ?? "(anonymous)";
  const unitPath = opts.unitPath ?? "";
  const w = opts.warn ?? createWarnings({ root: opts.root });

  const inputs = [], outputs = [], twoWay = [], fields = [];
  const deps = [], methodIds = [], accessorIds = [], formIds = [], streamIds = [];
  const implementedHooks = [];
  let constructorDoesWork = false;
  let fieldInitializerDoesWork = false;
  let maxComplexity = 0;

  const declaredInterfaces = (cls.heritageClauses ?? [])
    .filter((h) => h.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((h) => h.types.map((t) => t.expression.getText(src)));

  // --- constructor-injected dependencies
  const ctor = cls.members.find(ts.isConstructorDeclaration);
  if (ctor) {
    for (const p of ctor.parameters) {
      const name = p.name.getText(src);
      const token = p.type ? p.type.getText(src) : "unknown";
      const hasVisibility = ts.getCombinedModifierFlags(p) &
        (ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Public | ts.ModifierFlags.Readonly);
      if (!hasVisibility) continue; // a plain parameter is not a class member
      deps.push({
        id: `dep:${name}`, propertyName: name, token,
        resolvedUnitId: null, origin: originOf(token),
        visibility: visibilityOf(p),
        injectionStyle: "constructor-param",
        modifiers: paramModifiers(p),
        loc: loc(p, src, file),
      });
    }
    if (ctor.body && ctor.body.statements.length > 0) constructorDoesWork = true;
  }

  // --- members
  for (const m of cls.members) {
    if (ts.isPropertyDeclaration(m)) {
      const name = m.name.getText(src);
      const init = m.initializer;

      const inj = injectCall(init);
      if (inj) {
        const token = inj.arguments[0]?.getText(src) ?? "unknown";
        deps.push({
          id: `dep:${name}`, propertyName: name, token,
          resolvedUnitId: null, origin: originOf(token),
          visibility: visibilityOf(m),
          injectionStyle: "inject-fn",
          modifiers: injectOptions(inj, src),
          loc: loc(m, src, file),
        });
        continue;
      }

      const decoIn = decoratorNamed(m, "Input");
      const decoOut = decoratorNamed(m, "Output");
      const sig = signalApiCall(init);

      if (decoIn) {
        let alias = null, required = false;
        const a0 = decoIn.arguments?.[0];
        if (a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0))) alias = a0.text;
        else if (a0 && ts.isObjectLiteralExpression(a0)) {
          for (const p of a0.properties) {
            if (!ts.isPropertyAssignment(p)) continue;
            const k = p.name.getText(src);
            if (k === "alias") alias = stringOf(p.initializer, src);
            if (k === "required") required = p.initializer.kind === ts.SyntaxKind.TrueKeyword;
          }
        }
        inputs.push({
          id: `input:${name}`, name, alias,
          type: m.type ? m.type.getText(src) : inferLiteralType(init),
          required, defaultExpression: init ? init.getText(src) : null,
          declarationStyle: "decorator", transform: null, loc: loc(m, src, file),
        });
        continue;
      }

      if (decoOut) {
        outputs.push({
          id: `output:${name}`, name, alias: stringOf(decoOut.arguments?.[0], src),
          payloadType: init && ts.isNewExpression(init) ? firstTypeArg(init, src) ?? "unknown" : "unknown",
          declarationStyle: "eventemitter", emittedFrom: [], loc: loc(m, src, file),
        });
        continue;
      }

      if (sig && sig.name === "input") {
        inputs.push({
          id: `input:${name}`, name,
          alias: aliasFromOptions(sig.call, src, sig.required ? 0 : 1),
          type: firstTypeArg(sig.call, src) ??
                (sig.required ? "unknown" : inferLiteralType(sig.call.arguments[0])),
          required: sig.required,
          defaultExpression: sig.required ? null : text(sig.call.arguments[0], src),
          declarationStyle: "signal", transform: null, loc: loc(m, src, file),
        });
        continue;
      }
      if (sig && sig.name === "output") {
        outputs.push({
          id: `output:${name}`, name, alias: null,
          payloadType: firstTypeArg(sig.call, src) ?? "unknown",
          declarationStyle: "output-fn", emittedFrom: [], loc: loc(m, src, file),
        });
        continue;
      }
      if (sig && sig.name === "model") {
        twoWay.push({
          id: `model:${name}`, name,
          type: firstTypeArg(sig.call, src) ?? "unknown", loc: loc(m, src, file),
        });
        continue;
      }

      // plain field
      const typeText = m.type ? m.type.getText(src) : null;
      const initText = init ? init.getText(src) : null;
      const signalKind = sig && SIGNAL_FACTORIES[sig.name] ? SIGNAL_FACTORIES[sig.name] : null;
      const rxjsKind = [...RXJS_TYPES].find((t) => (typeText ?? "").startsWith(t) || (initText ?? "").includes(`new ${t}`)) ?? null;
      const formKind = [...FORM_TYPES].find((t) => (typeText ?? "").includes(t) || (initText ?? "").includes(t)) ?? null;
      const isArrow = !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));

      // a field initializer that calls out runs during construction, before ngOnInit
      if (init && !isArrow && !signalKind && ts.isCallExpression(init)) fieldInitializerDoesWork = true;

      const field = {
        id: `field:${name}`, name,
        type: typeText ?? (signalKind ? signalFieldType(sig, src) : inferLiteralType(init)) ?? "unknown",
        visibility: visibilityOf(m),
        readonly: !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Readonly),
        initializerExpression: initText,
        roleHints: {
          isSignal: !!signalKind, signalKind,
          isRxjs: !!rxjsKind, rxjsKind,
          isFormEntity: !!formKind, formKind,
          isConstant: !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Readonly),
        },
        loc: loc(m, src, file),
      };
      if (isArrow) field.isArrowFunctionProperty = true;
      fields.push(field);
      if (formKind) formIds.push(`form:${name}`);
      if (rxjsKind && rxjsKind !== "Subscription") streamIds.push(`stream:${name}`);
      continue;
    }

    if (ts.isMethodDeclaration(m)) {
      const name = m.name.getText(src);
      methodIds.push(`method:${name}`);
      if (LIFECYCLE_HOOKS.has(name)) implementedHooks.push(name);
      maxComplexity = Math.max(maxComplexity, complexityOf(m));
      continue;
    }
    if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) {
      accessorIds.push(`accessor:${m.name.getText(src)}`);
      continue;
    }
  }

  const bodyText = cls.getText(src);
  const cleanupStrategy = implementedHooks.includes("ngOnDestroy")
    ? (/\.unsubscribe\(\)/.test(bodyText) ? "ngOnDestroy-unsubscribe" : "none")
    : /takeUntilDestroyed/.test(bodyText) ? "takeUntilDestroyed"
    : /inject\(\s*DestroyRef\s*\)/.test(bodyText) ? "DestroyRef"
    : /\|\s*async/.test(opts.templateText ?? "") ? "async-pipe-only"
    : "none";

  const isDefaultExport = !!(ts.getCombinedModifierFlags(cls) & ts.ModifierFlags.Default);
  // The caller resolves the declaration against disk and passes back what it
  // actually read; falling back to the declared url only when it did not.
  const templateFile = opts.templateFile !== undefined
    ? opts.templateFile
    : (meta.templateUrl ? basename(stringOf(meta.templateUrl, src)) : null);

  const publicMethods = methodIds.filter((id) => {
    const n = id.slice("method:".length);
    const m = cls.members.find((x) => ts.isMethodDeclaration(x) && x.name.getText(src) === n);
    return m && visibilityOf(m) === "public" && !LIFECYCLE_HOOKS.has(n);
  });

  return {
    schemaVersion: "0.4.0",
    unit: {
      id: `component:${unitPath}:${className}`,
      kind: "component",
      className,
      selector: meta.selector ? stringOf(meta.selector, src) : null,
      path: unitPath,
      standalone: meta.standalone ? meta.standalone.kind === ts.SyntaxKind.TrueKeyword : true,
      declaredInModule: null,
      isDefaultExport,
      files: {
        typescript: file,
        template: templateFile,
        templateInline: !!meta.template,
        styles: (meta.styleUrls ? arrayOfNames(meta.styleUrls, src) : []).map((s) => basename(s.replace(/['"]/g, ""))),
        specs: opts.specs ?? [],
      },
    },
    manifest: {
      dependencies: "./dependencies.json", functions: null, template: null,
      analysis: null, requirement: null, migrationNotes: null, repoIndex: null,
    },
    publicApi: {
      inputs, outputs, twoWayBindings: twoWay,
      publicMethods,
      templateReachableMembers: [],
    },
    injectedDependencies: deps,
    lifecycle: {
      implementedHooks, declaredInterfaces, constructorDoesWork,
      fieldInitializerDoesWork, cleanupStrategy,
    },
    stateOutline: { fields, methodIds, accessorIds, formIds, streamIds },
    decorator: {
      changeDetection: meta.changeDetection ? meta.changeDetection.getText(src).split(".").pop() : null,
      encapsulation: meta.encapsulation ? meta.encapsulation.getText(src).split(".").pop() : null,
      providers: meta.providers ? arrayOfNames(meta.providers, src) : [],
      imports: meta.imports ? arrayOfNames(meta.imports, src) : [],
      hostDirectives: meta.hostDirectives ? arrayOfNames(meta.hostDirectives, src) : [],
      animations: meta.animations ? arrayOfNames(meta.animations, src) : [],
    },
    metrics: {
      tsLineCount: countLines(sourceText),
      templateLineCount: opts.templateLineCount ?? 0,
      methodCount: methodIds.length,
      publicApiSurface: inputs.length + outputs.length + twoWay.length + publicMethods.length,
      injectedDependencyCount: deps.length,
      maxCyclomaticComplexity: maxComplexity,
      maxTemplateNestingDepth: opts.maxTemplateNestingDepth ?? null,
    },
    provenance: {
      source: "ast",
      resolverVersion: opts.resolverVersion ?? "0.1.0",
      generatedAt: opts.generatedAt ?? new Date().toISOString(),
      sourceRevision: opts.sourceRevision ?? null,
      inputHash: opts.inputHash ?? null,
      parseStatus: w.parseStatus(),
      warnings: w.list(),
    },
  };
}

/** Lines of content, not counting a trailing newline as a further line. */
function countLines(s) {
  if (!s) return 0;
  const n = s.split("\n").length;
  return s.endsWith("\n") ? n - 1 : n;
}

/** `signal(false)` carries its type in the initializer; recover it without a checker. */
function signalFieldType(sig, src) {
  const explicit = firstTypeArg(sig.call, src);
  const inner = explicit ?? inferLiteralType(sig.call.arguments[0]) ?? "unknown";
  const wrapper = sig.name === "signal" ? "WritableSignal" : "Signal";
  return `${wrapper}<${inner}>`;
}

function inferLiteralType(init) {
  if (!init) return null;
  if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return "string";
  if (ts.isNumericLiteral(init)) return "number";
  if (init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword) return "boolean";
  if (ts.isArrayLiteralExpression(init)) return "unknown[]";
  return null;
}

function complexityOf(node) {
  let n = 1;
  const walk = (x) => {
    switch (x.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
        n++;
        break;
      case ts.SyntaxKind.BinaryExpression:
        if ([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]
            .includes(x.operatorToken.kind)) n++;
        break;
    }
    ts.forEachChild(x, walk);
  };
  ts.forEachChild(node, walk);
  return n;
}
