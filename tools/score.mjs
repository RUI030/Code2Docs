#!/usr/bin/env node
/**
 * Phase 7 testbed — automated quality metrics for one unit's output.
 *
 *   node tools/score.mjs <outputDir> [--spec <spec.ts>]
 *
 * Reads requirement.md, analysis.json (if present), template.json (if present),
 * and the spec file. Writes score.json to outputDir and prints a summary.
 *
 * Metrics:
 *   blockingQuestions      — count from analysis.json (S1 only)
 *   nonBlockingQuestions   — count from analysis.json (S1 only)
 *   screenLabelCoverage    — fraction of staticText labels found in requirement.md
 *   specTitleCoverage      — fraction of it() titles reflected in requirement.md
 *   frameworkNeutral       — true if no framework terms found in requirement.md prose
 *   frameworkTermsFound    — list of Angular/React/Vue terms found
 *   contradictions         — spec titles whose claim appears negated in requirement.md
 *   sectionsPresent        — which c2d sections are in the requirement.md
 *   missingSections        — sections absent from requirement.md
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

// ── Framework term detector (framework-neutrality check) ──────────────────────

// Terms that reveal framework-specific knowledge in the prose.
// Deliberately excludes generic words like "component", "module", "pipe"
// that appear in document headings and neutral technical prose.
const FRAMEWORK_TERMS = [
  // Angular-specific API names
  "ngOnInit", "ngOnDestroy", "ngOnChanges", "ngAfterViewInit", "ngAfterContentInit",
  "@Component", "@Injectable", "@Input(", "@Output(", "@ViewChild",
  "BehaviorSubject", "ReplaySubject", "AsyncSubject",
  "takeUntil", "switchMap", "mergeMap", "combineLatest", "forkJoin",
  "FormGroup", "FormControl", "FormBuilder", "ReactiveFormsModule",
  "ActivatedRoute", "RouterLink", "HttpClient", "HttpClientModule",
  "*ngIf", "*ngFor", "@if (", "@for (", "[ngModel]", "[(ngModel)]",
  "ChangeDetectionStrategy", "ChangeDetectorRef", "zone.js", "NgZone",
  "providedIn: 'root'", "NgModule", "declarations:", "imports: [",
  // React-specific
  "useState(", "useEffect(", "useCallback(", "useMemo(", "useRef(",
  "React.Component", "setState(", "componentDidMount", "componentWillUnmount",
  // Vue-specific
  "defineComponent(", "onMounted(", "onUnmounted(",
  "v-if=", "v-for=", "v-model=",
];

// Terms that are OK in evidence citations (inside backticks or code blocks)
function stripCodeBlocks(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

// ── Spec title extractor ──────────────────────────────────────────────────────

function extractSpecTitles(specText) {
  const titles = [];
  const re = /\bit\s*\(\s*(['"`])([\s\S]*?)\1/g;
  let m;
  while ((m = re.exec(specText)) !== null) {
    titles.push(m[2].trim());
  }
  return titles;
}

// ── Screen label extractor ────────────────────────────────────────────────────

function extractScreenLabels(template) {
  const labels = [];
  // staticText lives at template.ast.staticText (S1 schema) or template.staticText (legacy)
  const st = template?.ast?.staticText ?? template?.staticText ?? [];
  for (const entry of st) {
    const text = (entry.text ?? entry.value ?? "").trim();
    if (text.length >= 2 && !/^\d+$/.test(text)) labels.push(text);
  }
  return [...new Set(labels)];
}

// ── c2d section checker ───────────────────────────────────────────────────────

const REQUIRED_SECTIONS = [
  "1-purpose", "2-state-and-data-flow", "3-ui-and-rendering",
  "4-public-interface", "5-dependencies", "6-service-layer",
  "7-acceptance-criteria", "8-domain-business-rules", "review-gate",
];

function checkSections(mdText) {
  const present = [];
  const missing = [];
  for (const id of REQUIRED_SECTIONS) {
    if (mdText.includes(`section="${id}"`)) present.push(id);
    else missing.push(id);
  }
  return { present, missing };
}

// ── Coverage helpers ──────────────────────────────────────────────────────────

function normalise(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function mentionedIn(needle, haystack) {
  const n = normalise(needle);
  const h = normalise(haystack);
  // Check whole phrase or all significant words present
  if (h.includes(n)) return true;
  const words = n.split(" ").filter(w => w.length > 3);
  if (words.length === 0) return h.includes(n);
  return words.filter(w => h.includes(w)).length >= Math.ceil(words.length * 0.7);
}

// ── Main scorer ───────────────────────────────────────────────────────────────

function score(outputDir, specPath) {
  const mdPath = join(outputDir, "requirement.md");
  if (!existsSync(mdPath)) {
    return { error: "requirement.md not found", outputDir };
  }

  const mdText = readFileSync(mdPath, "utf8");
  const mdProse = stripCodeBlocks(mdText);

  // S1 pipeline metrics from analysis.json
  let blockingQuestions = null;
  let nonBlockingQuestions = null;
  let coverageRatio = null;

  const analysisPath = join(outputDir, "analysis.json");
  if (existsSync(analysisPath)) {
    try {
      const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
      // openQuestions lives at analysis.review.openQuestions (S1 schema) or analysis.openQuestions (legacy)
      const qs = analysis.review?.openQuestions ?? analysis.openQuestions ?? [];
      blockingQuestions = qs.filter(q => q.blocking).length;
      nonBlockingQuestions = qs.filter(q => !q.blocking).length;
      coverageRatio = analysis.coverageAssessment?.coverageRatio ?? null;
    } catch { /* analysis.json may be malformed */ }
  }

  // Screen label coverage
  let screenLabelCoverage = null;
  let screenLabels = [];
  let missingLabels = [];

  const templatePath = join(outputDir, "template.json");
  if (existsSync(templatePath)) {
    try {
      const template = JSON.parse(readFileSync(templatePath, "utf8"));
      screenLabels = extractScreenLabels(template);
      if (screenLabels.length > 0) {
        missingLabels = screenLabels.filter(l => !mentionedIn(l, mdProse));
        screenLabelCoverage = (screenLabels.length - missingLabels.length) / screenLabels.length;
      }
    } catch { /* template.json may be absent */ }
  }

  // Spec title coverage
  let specTitleCoverage = null;
  let specTitles = [];
  let missingTitles = [];

  const resolvedSpec = specPath
    ? resolvePath(specPath)
    : (() => {
        // Try to find spec file from signature.json
        const sigPath = join(outputDir, "signature.json");
        if (existsSync(sigPath)) {
          try {
            const sig = JSON.parse(readFileSync(sigPath, "utf8"));
            const specRel = sig?.files?.specs;
            if (specRel) {
              // specRel is relative to the source root — try relative to outputDir
              const guessed = join(outputDir, "..", specRel.split("/").pop());
              if (existsSync(guessed)) return guessed;
            }
          } catch { /* ignore */ }
        }
        return null;
      })();

  if (resolvedSpec && existsSync(resolvedSpec)) {
    const specText = readFileSync(resolvedSpec, "utf8");
    specTitles = extractSpecTitles(specText);
    if (specTitles.length > 0) {
      missingTitles = specTitles.filter(t => !mentionedIn(t, mdProse));
      specTitleCoverage = (specTitles.length - missingTitles.length) / specTitles.length;
    }
  }

  // Framework neutrality
  const frameworkTermsFound = FRAMEWORK_TERMS.filter(t =>
    mdProse.toLowerCase().includes(t.toLowerCase())
  );
  const frameworkNeutral = frameworkTermsFound.length === 0;

  // Section check
  const { present: sectionsPresent, missing: missingSections } = checkSections(mdText);

  const result = {
    scoredAt: new Date().toISOString(),
    outputDir,
    specFile: resolvedSpec ?? null,
    blockingQuestions,
    nonBlockingQuestions,
    coverageRatio,
    screenLabelCoverage: screenLabelCoverage !== null ? Math.round(screenLabelCoverage * 1000) / 1000 : null,
    screenLabels: { total: screenLabels.length, missing: missingLabels },
    specTitleCoverage: specTitleCoverage !== null ? Math.round(specTitleCoverage * 1000) / 1000 : null,
    specTitles: { total: specTitles.length, missing: missingTitles },
    frameworkNeutral,
    frameworkTermsFound,
    sectionsPresent,
    missingSections,
  };

  writeFileSync(join(outputDir, "score.json"), JSON.stringify(result, null, 2));
  return result;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function printSummary(r) {
  if (r.error) { console.error("score:", r.error); return; }
  console.log("\n── Score ─────────────────────────────────────────────────");
  if (r.blockingQuestions !== null) console.log(`  Blocking questions:    ${r.blockingQuestions}`);
  if (r.nonBlockingQuestions !== null) console.log(`  Non-blocking:          ${r.nonBlockingQuestions}`);
  if (r.coverageRatio !== null) console.log(`  Coverage ratio:        ${(r.coverageRatio * 100).toFixed(0)}%`);
  if (r.screenLabelCoverage !== null)
    console.log(`  Screen label coverage: ${(r.screenLabelCoverage * 100).toFixed(0)}% (${r.screenLabels.total - r.screenLabels.missing.length}/${r.screenLabels.total})`);
  if (r.specTitleCoverage !== null)
    console.log(`  Spec title coverage:   ${(r.specTitleCoverage * 100).toFixed(0)}% (${r.specTitles.total - r.specTitles.missing.length}/${r.specTitles.total})`);
  console.log(`  Framework neutral:     ${r.frameworkNeutral ? "yes" : "NO — " + r.frameworkTermsFound.join(", ")}`);
  console.log(`  Sections present:      ${r.sectionsPresent.length}/9${r.missingSections.length ? " — missing: " + r.missingSections.join(", ") : ""}`);
  if (r.screenLabels.missing.length) console.log(`  Missing screen labels: ${r.screenLabels.missing.join(", ")}`);
  if (r.specTitles.missing.length) console.log(`  Missing spec titles:\n    ${r.specTitles.missing.map(t => "- " + t).join("\n    ")}`);
  console.log("──────────────────────────────────────────────────────────\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const outputDir = args[0];
  const specIdx = args.indexOf("--spec");
  const specPath = specIdx !== -1 ? args[specIdx + 1] : null;

  if (!outputDir) {
    console.error("Usage: node tools/score.mjs <outputDir> [--spec <spec.ts>]");
    process.exit(1);
  }

  const result = score(outputDir, specPath);
  printSummary(result);
  if (result.error) process.exit(1);
}

export { score };
