#!/usr/bin/env node
/**
 * Trivial-tier renderer (D17).
 *
 *   node tools/render-trivial.mjs <outputDir>
 *
 * For units classified as "trivial" by classify-unit.mjs, there is no Synthesizer run
 * and no analysis.json. This renderer reads signature.json directly and writes a minimal
 * requirement.md containing only the public contract table and a note that no behavioral
 * analysis was generated.
 *
 * Output is deterministic and LLM-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

function render(sig) {
  const unit = sig.unit ?? {};
  const api = sig.publicApi ?? {};
  const inputs = api.inputs ?? [];
  const outputs = api.outputs ?? [];
  const twoWay = api.twoWayBindings ?? [];
  // publicMethods may be id strings ("method:bump") or objects with .name
  const methods = (api.publicMethods ?? [])
    .map(m => typeof m === "string" ? { name: m.replace(/^method:/, "") } : m)
    .filter(m => m.name && !m.name.startsWith("ng"));
  const selector = unit.selector ?? sig.decorator?.selector ?? "(no selector)";
  const className = unit.className ?? "Unknown";
  const kind = unit.kind ?? "component";

  const lines = [];

  lines.push(`<!-- code2docs:unit id="${unit.id ?? ""}" tier="trivial" -->`);
  lines.push(`<!-- GENERATED — trivial unit, no behavioral analysis. Rendered from signature.json by render-trivial.mjs -->`);
  lines.push("");
  lines.push(`# ${kind.charAt(0).toUpperCase() + kind.slice(1)}: ${className}`);
  lines.push("");
  lines.push(`**Selector:** \`${selector}\``);
  lines.push("");
  lines.push(
    `> **Trivial unit.** This unit has no forms, streams, or HTTP interactions and fewer than 4 methods.`,
  );
  lines.push(
    `> A full behavioral analysis was not generated. If this unit requires documentation, run it through`,
  );
  lines.push(
    `> \`/code2docs-pipeline\` or reclassify it by editing the thresholds in \`tools/classify-unit.mjs\`.`,
  );
  lines.push("");

  // ── Public contract ───────────────────────────────────────────────────────

  if (inputs.length || outputs.length || twoWay.length || methods.length) {
    lines.push("## Public Contract");
    lines.push("");
    lines.push("| Member | Direction | Type | Notes |");
    lines.push("|---|---|---|---|");

    for (const inp of inputs) {
      const required = inp.required ? " *(required)*" : "";
      lines.push(`| \`${inp.name}\` | input | \`${inp.type ?? "unknown"}\` | ${required} |`);
    }
    for (const out of outputs) {
      lines.push(`| \`${out.name}\` | output | \`EventEmitter<${out.payloadType ?? "void"}>\` | |`);
    }
    for (const tw of twoWay) {
      lines.push(`| \`${tw.name}\` | two-way | \`${tw.type ?? "unknown"}\` | |`);
    }
    for (const m of methods) {
      lines.push(`| \`${m.name}\` | method | \`${m.signature ?? ""}\` | |`);
    }

    lines.push("");
  } else {
    lines.push("## Public Contract");
    lines.push("");
    lines.push("*(no public inputs, outputs, or methods)*");
    lines.push("");
  }

  // ── Injected dependencies (brief) ────────────────────────────────────────

  const deps = sig.injectedDependencies ?? [];
  if (deps.length) {
    lines.push("## Dependencies");
    lines.push("");
    for (const d of deps) {
      lines.push(`- \`${d.token ?? d.name}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const outputDir = process.argv[2];
if (!outputDir) {
  console.error("Usage: node tools/render-trivial.mjs <outputDir>");
  process.exit(1);
}

try {
  const sig = JSON.parse(readFileSync(join(outputDir, "signature.json"), "utf8"));
  const md = render(sig);
  const outPath = join(outputDir, "requirement.md");
  writeFileSync(outPath, md);
  console.log(`render-trivial: wrote ${outPath}`);
} catch (err) {
  console.error(`render-trivial: ${err.message}`);
  process.exit(1);
}
