#!/usr/bin/env node
/**
 * Render analysis.json -> requirement.md + migration_notes.md.
 *
 * The renderer is deliberately dumb: it assembles finished prose from the JSON
 * rather than generating it. All sentences live in analysis.json; this tool only
 * decides the order and the markdown decoration around them.
 *
 * Two properties this design enforces:
 *
 * 1. DETERMINISM. Running the renderer twice on the same analysis.json produces
 *    the same file. No LLM, no clock, no random. This is how requirement.md can
 *    be committed alongside analysis.json without a drift risk.
 *
 * 2. HUMAN-OWNED SECTIONS. A section touched by a human gets a hash in its
 *    opening comment. On the next render, if the hash of the current file content
 *    differs from what the renderer would produce, the section is marked
 *    human-owned and preserved verbatim. analysis.json#/review.humanOwnedSections
 *    records these so a future synthesizer knows not to overwrite them.
 *
 * Usage:
 *   node tools/render.mjs <path/to/analysis.json>
 *   node tools/render.mjs <path/to/analysis.json> --dry-run
 *
 *   --dry-run   Print to stdout instead of writing files.
 *   --force     Overwrite human-owned sections (re-renders everything).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const DRY_RUN = flags.has("--dry-run");
const FORCE   = flags.has("--force");

if (!args[0]) {
  console.error("usage: node tools/render.mjs <analysis.json> [--dry-run] [--force]");
  process.exit(2);
}

const analysisPath = args[0];
if (!existsSync(analysisPath)) {
  console.error(`not found: ${analysisPath}`);
  process.exit(1);
}

const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
const dir = dirname(analysisPath);

const reqPath  = join(dir, analysis.rendersTo?.requirement   ?? "requirement.md");
const migPath  = join(dir, analysis.rendersTo?.migrationNotes ?? "migration_notes.md");

// ── helpers ────────────────────────────────────────────────────────────────────

/** Stable 8-char hash of a rendered section body. */
function hashSection(body) {
  return createHash("sha256").update(body).digest("hex").slice(0, 8);
}

/**
 * Wrap a rendered section body in begin/end comments that the next render can
 * detect. The hash covers only the BODY so a human can reformat the comments
 * without triggering a mismatch.
 */
function section(name, body) {
  const h = hashSection(body);
  return `<!-- c2d:begin section="${name}" hash="${h}" -->\n${body.trimEnd()}\n<!-- c2d:end section="${name}" -->`;
}

/**
 * For a file already on disk: extract the current content of a named section.
 * Returns null if the section is absent or the file does not exist.
 */
function extractSection(fileContent, name) {
  const re = new RegExp(
    `<!-- c2d:begin section="${name}"[^>]*-->([\\s\\S]*?)<!-- c2d:end section="${name}" -->`,
    "m",
  );
  const m = fileContent.match(re);
  return m ? m[0] : null;   // return the full begin...end block
}

/**
 * True when the section in the file differs from what we would render, i.e. a
 * human edited it since the last render.
 */
function isHumanOwned(fileContent, name, renderedBody) {
  if (FORCE) return false;
  const existing = extractSection(fileContent, name);
  if (!existing) return false;
  const hashRe = /hash="([a-f0-9]+)"/;
  const m = existing.match(hashRe);
  if (!m) return false;
  return m[1] !== hashSection(renderedBody);
}

// ── building blocks ────────────────────────────────────────────────────────────

const nl = "\n";
const h2 = (t) => `## ${t}`;
const h3 = (t) => `### ${t}`;
const h4 = (t) => `#### ${t}`;
const ul = (items) => items.map((s) => `- ${s}`).join(nl);
const bold = (t) => `**${t}**`;

function confidenceMark(c) {
  if (!c) return "";
  return ` *(${c} confidence)*`;
}

function renderNotes(notes) {
  if (!notes?.length) return "";
  return notes.map((n) => `> ${n.statement}${confidenceMark(n.confidence)}`).join(nl);
}

// ── section renderers ──────────────────────────────────────────────────────────

function renderPurpose(p) {
  if (!p) return "";
  const lines = [p.statement];
  if (p.responsibilities?.length) {
    lines.push("", bold("Responsibilities"));
    lines.push(ul(p.responsibilities.map((r) => r.statement + confidenceMark(r.confidence))));
  }
  const notes = renderNotes(p.notes);
  if (notes) lines.push("", notes);
  return lines.join(nl);
}

function renderStateModel(sm) {
  if (!sm) return "";
  const lines = [];

  if (sm.propsAndEvents?.length) {
    lines.push(h3("Props & Events (External)"));
    lines.push(ul(sm.propsAndEvents.map((e) => `${bold(e.name ?? "?")} (${e.direction ?? "?"}) — ${e.statement}`)));
    lines.push("");
  } else {
    lines.push(h3("Props & Events (External)"));
    lines.push("None declared.");
    lines.push("");
  }

  if (sm.external?.length) {
    lines.push(h3("External State"));
    lines.push(ul(sm.external.map((e) => `${bold(e.name)} (owner: ${e.owner}) — ${e.statement}`)));
    lines.push("");
  }

  if (sm.local?.length) {
    lines.push(h3("Local State (Internal)"));
    lines.push(ul(sm.local.map((s) => `${bold(s.member ?? "?")} — ${s.statement}`)));
    lines.push("");
  }

  if (sm.derived?.length) {
    lines.push(h3("Derived State"));
    lines.push(ul(sm.derived.map((d) => `${bold(d.name ?? "?")} — ${d.rule}`)));
    lines.push("");
  }

  if (sm.form?.length) {
    lines.push(h3("Form State"));
    for (const f of sm.form) {
      if (f.statement) lines.push(f.statement, "");
      if (f.controls?.length) {
        lines.push("| Control | Statement |");
        lines.push("|---|---|");
        for (const c of f.controls) {
          lines.push(`| \`${c.control}\` | ${c.statement} |`);
        }
        lines.push("");
      }
    }
  }

  if (sm.async?.length) {
    lines.push(h3("Async / Subscriptions"));
    for (const a of sm.async) {
      const parts = [bold(a.stream ?? "?")];
      if (a.trigger) parts.push(`Trigger: ${a.trigger}`);
      if (a.loadingIndicator) parts.push(`Loading indicator: \`${a.loadingIndicator}\``);
      if (a.errorHandling) parts.push(`Error handling: ${a.errorHandling}`);
      lines.push(`- ${parts.join(". ")}.`);
    }
    lines.push("");
  }

  const notes = renderNotes(sm.notes);
  if (notes) { lines.push(notes, ""); }
  return lines.join(nl).trimEnd();
}

function renderPublicContract(pc) {
  if (!pc) return "";
  const lines = [];

  if (pc.consumedBy?.length) {
    lines.push(h3("Consumed By"));
    lines.push(ul(pc.consumedBy));
    lines.push("");
  }

  if (pc.inputContracts?.length) {
    lines.push(h3("Inputs"));
    lines.push(ul(pc.inputContracts.map((i) => `${bold(i.member ?? "?")} — ${i.statement}`)));
    lines.push("");
  }

  if (pc.outputContracts?.length) {
    lines.push(h3("Outputs"));
    lines.push(ul(pc.outputContracts.map((o) => `${bold(o.member ?? "?")} — ${o.statement}`)));
    lines.push("");
  }

  if (pc.methods?.length) {
    lines.push(h3("Public Methods"));
    for (const m of pc.methods) {
      const sig = m.signature ? `\`${m.signature}\`` : bold(m.symbol ?? "?");
      const dead = m.unreachable ? " *(unreachable)*" : "";
      lines.push(`- ${sig}${dead} — ${m.contract}`);
      if (m.preconditions?.length)  lines.push(`  - Pre: ${m.preconditions.join("; ")}`);
      if (m.postconditions?.length) lines.push(`  - Post: ${m.postconditions.join("; ")}`);
    }
    lines.push("");
  }

  if (pc.extensionPoints?.length) {
    lines.push(h3("Extension Points"));
    lines.push(ul(pc.extensionPoints.map((e) => e.statement)));
    lines.push("");
  }

  const notes = renderNotes(pc.notes);
  if (notes) { lines.push(notes, ""); }
  return lines.join(nl).trimEnd();
}

function renderWorkflows(flows) {
  if (!flows?.length) return "";
  const lines = [];
  for (const f of flows) {
    lines.push(h3(`${f.name}`));
    if (f.trigger) lines.push(`**Trigger:** ${f.trigger}`, "");
    if (f.preconditions?.length) {
      lines.push(`**Preconditions:** ${f.preconditions.join("; ")}`, "");
    }
    if (f.steps?.length) {
      lines.push("**Steps:**");
      for (const s of (f.steps ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
        lines.push(`${(s.order ?? 0) + 1}. ${s.action}`);
      }
      lines.push("");
    }
    if (f.successOutcome) lines.push(`**Success:** ${f.successOutcome}`, "");
    if (f.failureOutcomes?.length) {
      lines.push("**Failure outcomes:**");
      lines.push(ul(f.failureOutcomes.map((fo) => `${fo.condition}: ${fo.result}`)));
      lines.push("");
    }
  }
  return lines.join(nl).trimEnd();
}

function renderLifecycle(lc) {
  if (!lc) return "";
  const lines = [];
  if (lc.onInitialization) { lines.push(bold("On initialization:"), lc.onInitialization, ""); }
  if (lc.onInputChange)    { lines.push(bold("On input change:"),    lc.onInputChange,    ""); }
  if (lc.onDestroy)        { lines.push(bold("On destroy:"),         lc.onDestroy,        ""); }
  if (lc.orderingConstraints?.length) {
    lines.push(bold("Ordering constraints:"));
    lines.push(ul(lc.orderingConstraints.map((c) => c.statement)));
    lines.push("");
  }
  const notes = renderNotes(lc.notes);
  if (notes) { lines.push(notes, ""); }
  return lines.join(nl).trimEnd();
}

function renderExternal(ei) {
  if (!ei) return "";
  const lines = [];
  if (ei.services?.length) {
    lines.push(h3("Services Used"));
    for (const s of ei.services) {
      const ops = s.operations?.length ? ` Operations: ${s.operations.join(", ")}.` : "";
      lines.push(`- ${bold(s.dep ?? "?")} — ${s.purpose}${ops}`);
    }
    lines.push("");
  }
  if (ei.apis?.length) {
    lines.push(h3("HTTP APIs"));
    lines.push(ul(ei.apis.map((a) => `\`${a.http}\` — ${a.purpose}`)));
    lines.push("");
  }
  if (ei.packages?.length) {
    lines.push(h3("Third-Party Packages"));
    lines.push(ul(ei.packages.map((p) => `\`${p.package}\` — ${p.usedFor}`)));
    lines.push("");
  }
  const notes = renderNotes(ei.notes);
  if (notes) { lines.push(notes, ""); }
  return lines.join(nl).trimEnd();
}

function renderServiceLayer(sl) {
  if (!sl) return "";
  if (sl.applicable === false) return "*This component touches no state that outlives it.*";
  const lines = [];
  if (sl.sharedState?.length) {
    lines.push(h3("Shared State"));
    for (const s of sl.sharedState) {
      lines.push(`- ${bold(s.service ?? "?")} — \`${s.state}\` (lifetime: ${s.lifetime ?? "unknown"})`);
      const flags = [];
      if (s.readByThisUnit)    flags.push("read by this unit");
      if (s.mutatedByThisUnit) flags.push("mutated by this unit");
      if (!s.consumersKnown)   flags.push("other consumers unknown");
      if (flags.length) lines.push(`  - ${flags.join("; ")}`);
    }
    lines.push("");
  }
  if (sl.statelessOperations?.length) {
    lines.push(h3("Stateless Operations"));
    lines.push(ul(sl.statelessOperations.map((o) => `${bold(o.service ?? "?")} — ${o.operation}`)));
    lines.push("");
  }
  if (sl.couplingNotes?.length) {
    lines.push(h3("Coupling Notes"));
    lines.push(ul(sl.couplingNotes.map((c) => c.statement)));
    lines.push("");
  }
  const notes = renderNotes(sl.notes);
  if (notes) { lines.push(notes, ""); }
  return lines.join(nl).trimEnd();
}

function renderInvariants(inv) {
  if (!inv?.length) return "";
  return inv.map((i) => `- **${i.id}** ${i.statement}${i.whyItMatters ? ` *Why it matters:* ${i.whyItMatters}` : ""}`).join(nl);
}

function renderAcceptanceCriteria(acs) {
  if (!acs?.length) return "";
  const lines = [];
  for (const ac of acs) {
    lines.push(`### ${ac.id}: ${ac.scenario}`);
    if (ac.given?.length)  lines.push(`**Given:** ${ac.given.join("; ")}`);
    if (ac.when?.length)   lines.push(`**When:** ${ac.when.join("; ")}`);
    if (ac.then?.length)   lines.push(`**Then:**\n${ul(ac.then)}`);
    if (ac.coveredByExistingTest) lines.push(`**Covered by:** ${ac.coveredByExistingTest}`);
    lines.push("");
  }
  return lines.join(nl).trimEnd();
}

function renderDomainRules(dr) {
  if (!dr) return "";
  const lines = [];
  if (dr.businessConstraints?.length) {
    lines.push(h3("Business Constraints"));
    lines.push(ul(dr.businessConstraints.map((c) => c.statement + confidenceMark(c.confidence))));
    lines.push("");
  }
  if (dr.edgeCases?.length) {
    lines.push(h3("Edge Cases"));
    for (const e of dr.edgeCases) {
      lines.push(`- **${e.situation}** — ${e.currentBehavior}`);
    }
    lines.push("");
  }
  if (dr.terminology?.length) {
    lines.push(h3("Terminology"));
    for (const t of dr.terminology) {
      lines.push(`- **${t.term}** — ${t.definition}`);
    }
    lines.push("");
  }
  if (dr.formulas?.length) {
    lines.push(h3("Formulas"));
    for (const f of dr.formulas) {
      lines.push(`- **${f.name}:** \`${f.expression}\``);
    }
    lines.push("");
  }
  const notes = renderNotes(dr.notes);
  if (notes) { lines.push(notes, ""); }
  return lines.join(nl).trimEnd();
}

function renderReview(rv) {
  if (!rv) return "";
  const lines = [`**Status:** ${rv.status}`];
  if (rv.openQuestions?.length) {
    lines.push("", h3("Open Questions"));
    for (const q of rv.openQuestions) {
      const tag = q.blocking ? " *(blocking)*" : "";
      lines.push(`- **${q.id}**${tag} ${q.question}`);
    }
  }
  if (rv.suspectedDefects?.length) {
    lines.push("", h3("Suspected Defects"));
    for (const b of rv.suspectedDefects) {
      lines.push(`- **${b.id}** *(${b.confidence ?? "?"} confidence)* ${b.description}`);
    }
  }
  if (rv.unresolvedReferences?.length) {
    lines.push("", h3("Unresolved References"));
    lines.push(ul(rv.unresolvedReferences));
  }
  return lines.join(nl);
}

// ── migration_notes.md renderer ───────────────────────────────────────────────

function renderMigration(mig) {
  if (!mig) return "";
  const lines = [];

  if (mig.deadCode && (mig.deadCode.methods?.length || mig.deadCode.dependencies?.length)) {
    lines.push(h2("Dead Code"));
    if (mig.deadCode.statement) lines.push(mig.deadCode.statement, "");
    const dead = [];
    if (mig.deadCode.methods?.length)       dead.push(`Methods: ${mig.deadCode.methods.join(", ")}`);
    if (mig.deadCode.dependencies?.length)  dead.push(`Dependencies: ${mig.deadCode.dependencies.join(", ")}`);
    if (dead.length) lines.push(ul(dead), "");
    lines.push(`*Verified: ${mig.deadCode.verified ? "yes" : "no (manual search only)"}*`, "");
  }

  if (mig.risks?.length) {
    const lowerBound = mig.isLowerBound
      ? "\n> **This list is a lower bound.** Pattern-matching against source; recall is unproven.\n"
      : "";
    lines.push(h2("Migration Risks"), lowerBound);
    lines.push("| Severity | Category | Behavior at risk |");
    lines.push("|---|---|---|");
    for (const r of mig.risks) {
      const desc = r.behaviorAtRisk ?? r.description ?? "";
      lines.push(`| ${r.severity} | \`${r.category}\` | ${desc} |`);
    }
    lines.push("");

    const highRisks = mig.risks.filter((r) => r.severity === "high");
    if (highRisks.length) {
      lines.push(h3("Detail (high-severity)"));
      for (const r of highRisks) {
        lines.push(h4(`${r.category} — ${r.description ?? ""}` ));
        if (r.behaviorAtRisk) lines.push(`*Behavior at risk:* ${r.behaviorAtRisk}`, "");
      }
    }
  }

  if (mig.suggestedDecomposition?.length) {
    lines.push(h2("Suggested Decomposition"));
    for (const s of mig.suggestedDecomposition) {
      lines.push(`- **${s.proposedUnit}** — ${s.rationale}`);
      if (s.coveredMembers?.length) lines.push(`  - Covers: ${s.coveredMembers.join(", ")}`);
    }
    lines.push("");
  }

  if (mig.thirdPartyEquivalence?.length) {
    lines.push(h2("Third-Party Equivalence"));
    lines.push("| Package | Used for | Equivalent exists? |");
    lines.push("|---|---|---|");
    for (const t of mig.thirdPartyEquivalence) {
      lines.push(`| \`${t.package}\` | ${t.usedFor ?? ""} | ${t.hasDirectEquivalent ?? "unknown"} |`);
    }
    lines.push("");
  }

  const notes = renderNotes(mig.notes);
  if (notes) lines.push(notes, "");

  return lines.join(nl).trimEnd();
}

// ── top-level render ──────────────────────────────────────────────────────────

/**
 * Build a rendered file, preserving human-owned sections from the existing file.
 *
 * @param {string} existingContent  Current file content (empty string if not on disk).
 * @param {string} header           Lines before the first section.
 * @param {Array<{name:string, title:string, body:string}>} sections
 * @returns {string}
 */
function assembleFile(existingContent, header, sections) {
  const parts = [header];
  for (const { name, title, body } of sections) {
    if (!body.trim()) continue;
    const owned = isHumanOwned(existingContent, name, body);
    if (owned) {
      const existing = extractSection(existingContent, name);
      parts.push(existing ?? section(name, body));
    } else {
      parts.push(title ? `${title}\n\n${section(name, body)}` : section(name, body));
    }
  }
  return parts.filter(Boolean).join("\n\n") + "\n";
}

function renderRequirementMd(a, existingContent) {
  const unit = a.unitId ?? "";
  const ver  = a.schemaVersion ?? "?";
  const header = `<!-- code2docs:unit id="${unit}" schemaVersion="${ver}" -->\n`
    + `# Unit: ${unit.split(":").pop() ?? unit}`;

  const sections = [
    { name: "1-purpose",          title: h2("1. Purpose"),                  body: renderPurpose(a.purpose) },
    { name: "2-state",            title: h2("2. State & Data Flow"),         body: renderStateModel(a.stateModel) },
    { name: "3-public-contract",  title: h2("3. Public Contract"),           body: renderPublicContract(a.publicContract) },
    { name: "4-workflows",        title: h2("4. Workflows"),                 body: renderWorkflows(a.workflows) },
    { name: "5-lifecycle",        title: h2("5. Lifecycle Behavior"),        body: renderLifecycle(a.lifecycleBehavior) },
    { name: "6-integrations",     title: h2("6. External Integrations"),     body: renderExternal(a.externalIntegrations) },
    { name: "7-service-layer",    title: h2("7. Service Layer"),             body: renderServiceLayer(a.serviceLayer) },
    { name: "8-invariants",       title: h2("8. Behavioral Invariants"),     body: renderInvariants(a.behavioralInvariants) },
    { name: "9-acceptance",       title: h2("9. Acceptance Criteria"),       body: renderAcceptanceCriteria(a.acceptanceCriteria) },
    { name: "10-domain",          title: h2("10. Domain Rules"),             body: renderDomainRules(a.domainRules) },
    { name: "11-review",          title: h2("11. Review"),                   body: renderReview(a.review) },
  ];

  return assembleFile(existingContent, header, sections);
}

function renderMigrationMd(a, existingContent) {
  const unit = a.unitId ?? "";
  const ver  = a.schemaVersion ?? "?";
  const header = `<!-- code2docs:unit id="${unit}" schemaVersion="${ver}" -->\n`
    + `# Migration Notes: ${unit.split(":").pop() ?? unit}`;

  const body = renderMigration(a.migration);
  if (!body.trim()) {
    return `${header}\n\n*No migration notes recorded.*\n`;
  }

  const sections = [
    { name: "migration", title: "", body },
  ];
  return assembleFile(existingContent, header, sections);
}

// ── entrypoint ────────────────────────────────────────────────────────────────

const reqExisting  = existsSync(reqPath)  ? readFileSync(reqPath,  "utf8") : "";
const migExisting  = existsSync(migPath)  ? readFileSync(migPath,  "utf8") : "";

const reqContent = renderRequirementMd(analysis, reqExisting);
const migContent = renderMigrationMd(analysis, migExisting);

if (DRY_RUN) {
  console.log("=== requirement.md ===");
  console.log(reqContent);
  console.log("=== migration_notes.md ===");
  console.log(migContent);
} else {
  writeFileSync(reqPath,  reqContent,  "utf8");
  writeFileSync(migPath,  migContent,  "utf8");
  console.error(`rendered: ${reqPath}`);
  console.error(`rendered: ${migPath}`);
}
