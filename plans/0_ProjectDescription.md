### **Code2Doc**

This is an agentic AI project that aims to read the Angular code base and extract a requirement document and a json file that contains the structure, dependency, Abstract Data Type, UI logic etc. The format of the requirement document (template) is at 'Code2Docs/templates/requirement.md'. The machine-readable side is split across five JSON tiers in 'Code2Docs/templates/' — see **How the outputs relate** below and decision **D2** in `1_ImplementationPlan.md`.

*A quick implementation of this is to let claude code use `grep` command to figure out the dependency. Add compiler and AST tools later.* — See decision **D3** in `1_ImplementationPlan.md`, which recommends inverting this and using the TypeScript Compiler API from the start; grep is retained as a fallback and for the coarse repo-wide inventory sweep.

#### **Scope**

* **Unit of analysis.** The pipeline runs per *unit*, where a unit is a component, service, directive, pipe, guard, interceptor, route resolver, module, or shared model. Components are the richest case and drive the design, but a migration is blocked by the other kinds too, so they share one pipeline and one output schema (with inapplicable sections omitted).
* **Artifacts.** Per unit: `signature.json`, `dependencies.json`, `functions.json`, `template.json`, `analysis.json` (machine-readable), plus `requirement.md` and `migration_notes.md` (rendered for humans). Per repository: `index.json`, holding the unit inventory, the cross-unit dependency graph, and a leaf-first processing order.
* **Build strategy.** A skills-only proof of concept comes first: one agent, reading Angular source directly with no AST tooling, producing `requirement.md` for a single component. It validates the deliverable and reveals which metadata fields actually matter before any extractor is written. The four-stage pipeline below describes the *production* design that follows. See **Phase A** and decision **D7** in `1_ImplementationPlan.md`.
* **Out of scope.** Generating React or any other target-framework code. Code2Docs is Stage 1 and ends at the human-approval gate described at the end of this document. Outputs describe existing behavior and must never prescribe target-framework architecture.

#### **How the outputs relate**

There is **one logical dataset with one id space and no fact stored twice**, projected into five physical files split by access pattern — because the purpose is an IDE-like interface for agents and humans, and what makes an IDE fast is random access to just the slice you need. Two files that both assert a component's inputs would eventually disagree, and then neither could be trusted.

* `signature.json` — "what is this": identity, public API, injected dependencies, lifecycle, state outline. The hot tier, always read first, deliberately kept small. Supersedes the Resolver's `ast_signatures.json`.
* `dependencies.json` — "what connects to what": the in-file function call graph (including same-file calls), field read/write sets, leaf-first execution order, and cross-unit edges.
* `functions.json` — "what does this symbol do": per-symbol detail keyed by id for random access, carrying both AST facts and the Explainer's comments, plus forms and stream detail.
* `template.json` — "what does the UI do": parsed bindings and control flow, co-located with the framework-independent UI requirements derived from them.
* `analysis.json` — "what must be preserved": the Synthesizer's aggregate output — purpose, state model, workflows, invariants, acceptance criteria, domain rules, migration risks, review status.

Within each file, `ast` content is deterministic and LLM-free (byte-reproducible from unchanged source, so it is cacheable and testable without a model), while `doc` content is LLM-written and must cite `evidence` ids that resolve to `ast` ids. Dangling evidence is a hard failure. Reverse indexes (`calledBy`, `readBy`) are emitted alongside forward ones, which is what makes find-references cheap for an agent.

`requirement.md` and `migration_notes.md` are **rendered deterministically** from this data, not written by a second LLM pass — so the prose can never contradict the JSON. Because reviewers edit `requirement.md`, rendering is a merge: machine-owned regions are hash-fenced, and a human edit marks a region permanently human-owned.

#### **0\. Repository Inventory (Tool, no LLM)**

* **Background:** A pass that runs once per repository before any per-unit work, producing the cross-unit dependency graph that the Requirements Synthesizer consumes. The original draft listed that graph as a Synthesizer input without assigning anyone to build it.
* **Workflow:** Walks the source root, classifies files into units, resolves internal imports and template selectors to unit ids, and topologically sorts units leaf-first so that a unit's dependencies are already documented when it is processed.
* **Output:** `index.json` (unit list, dependency edges, processing order, route tree, reverse-dependency lists, unresolved references).

#### **Workflow / Algorithm:**

**1\. Resolver (The Parser & Feature Extractor \- Tool)**

* **Background:** The `resolver` is a subagent that preprocesses an angular file, exploring and finding semantic meaning for angular code.  
* **Precondition:** A Javascript tool that is registered with Claude Code. Enabled, only for the `resolver` subagent along with `read`, `write` tools. This tool, when called on an angular `ts` file, returns the AST of that file as its output.  
* **Input:** Unit folder (typically a component folder), passed in from the orchestrating agent.  
* **Workflow:**  
  * Uses AST to parse the component structure and build an in-file dependency graph.  
  * Identifies the execution sequence, starting from "leaf functions" (functions that do not call other local functions) and working bottom-up.  
  * Extracts structural Angular signatures: @Input(), @Output(), injected services in the constructor, UI template bindings (e.g., \[(ngModel)\], \*ngIf), and RxJS variables (e.g., Observable, Subject).  
* **Output:**  
  * Ordered sequence of code snippets (from bottom to top).  
  * `signature.json` (a structured map of all state, props, and injected dependencies), `dependencies.json` (the call graph and cross-unit edges), and `template.json` (parsed UI bindings) — the `ast` portions only; the `doc` portions are filled by the later stages.  
  * Output is returned back to the orchestrating agent.

**2\. Explainer (LLM)**

* **Background:**  The `explainer` subagent finds the intent behind each code block in a file. \[Will require tuning to make sure it’s not too granular\]  
* **Input:** A specific function's code snippet \+ a dictionary of related/helper functions (including relevant .spec.ts).  
* **Workflow:**  
  * Acts as the "Map" function in the pipeline.  
  * Focuses purely on the micro-level business logic of the provided snippet without worrying about global state.  
* **Output:** A concise, plain-text explanation of what the function does (e.g., "Validates the user's session token against the API").

### **3\. Requirements Synthesizer (LLM)**

* **Background:** The Requirements Synthesizer combines the structural information extracted by the Resolver with the function-level explanations produced by the Explainer. Its purpose is to generate a framework-independent requirements document that describes what behavior the React implementation must preserve. The output is intended for human review before migration begins.  
* **Input:**  
  * `signature.json`, `dependencies.json`, and `template.json` from the Resolver.  
  * Ordered function explanations from the Explainer.  
  * Parsed HTML template bindings.  
  * Component dependency graph.  
  * Relevant `.spec.ts` files.  
  * Requirements Skill File containing rules for interpreting Angular behavior and writing framework-independent requirements.  
* **Workflow:**  
  Acts as the **Reduce** function in the pipeline.  
  Performs a single comprehensive LLM call using the aggregated structural and behavioral information to reconstruct the component as a complete system rather than as isolated functions.  
  The Requirements Synthesizer:  
1. Identifies the component’s business purpose and primary responsibilities.  
2. Documents the public component contract, including inputs, outputs, public methods, and parent-child interactions.  
3. Describes external dependencies such as injected services, routes, stores, child components, pipes, and directives.  
4. Reconstructs state and data flow, including external state, local state, derived state, form state, and asynchronous state.  
5. Converts Angular template syntax into framework-independent UI requirements, including conditions, loops, event bindings, forms, loading states, and error states.  
6. Reconstructs component-level behavioral workflows from the ordered function explanations.  
7. Describes lifecycle behavior Identifies behavioral invariants that the migrated component must preserve.  
8. Flags migration-sensitive behavior such as complex RxJS pipelines, mutable service state, direct DOM access, lifecycle ordering, or Angular dependency-injection assumptions.  
9. Identifies unclear behavior, unsupported assumptions, and potential defects for human review.  
10. Suggests a functional breakdown when the original Angular component contains multiple separable responsibilities.  
    The generated requirements should describe existing behavior rather than prescribe the final React architecture.  
* **Output:**   
  `requirement.md`: The primary human-reviewable specification  
  The developer reviews and edits `requirement.md`. Stage 2 begins only after the developer confirms that the document accurately represents the behavior that must be preserved during migration.