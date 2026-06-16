---
name: implementation-spec
description: >-
  Produce a thorough, code-grounded implementation spec (design doc / technical
  plan) for a feature, refactor, or architectural change before any code is
  written. Use this whenever the user asks to "write a spec", "create an
  implementation plan", "design doc", "technical plan", "RFC", "plan out", or
  "figure out how we'd build/refactor X" — and also when a request is clearly a
  large multi-subsystem change that should be planned before coding (migrations,
  multi-tenant, payments, auth changes, big refactors), even if they don't say
  the word "spec". Do NOT use it for small, localized changes that are faster to
  just implement, or for pure research questions with no build intent.
---

# Implementation Spec Writer

A spec is worth writing when a change touches many files or subsystems, has
architectural forks, or will be implemented later (possibly by someone else, or
a future session). The goal is a document so grounded and complete that
implementation becomes mechanical — no re-discovery, no guessing, no silent
assumptions.

A bad spec is generic advice that could apply to any codebase. A good spec is
**specific to this code**: it names the real files, the real query sites, the
real config constants, and the real footguns. The difference comes entirely from
doing the homework before writing.

In this repo, `docs/MULTI_TENANT_SPEC.md`, `docs/STRIPE_SPEC.md`, and
`docs/STYLING_SPEC.md` are worked examples of the target quality — read one to
calibrate before writing a new spec.

## The workflow

Five phases. Don't skip phase 1 or phase 4 — they're what separate a real spec
from a plausible-sounding one.

### Phase 1 — Recon the codebase (do this before writing anything)

You cannot spec what you don't understand. Build an accurate mental model first:

- **Read the central files yourself**: the data model (schema/models), auth, the
  main config/env module, the domain/business-logic layer, and a representative
  slice of the routes/handlers the change touches. These anchor every later
  claim.
- **Fan out for breadth**: launch `Explore` (or general-purpose) subagents in
  parallel to map the parts you won't read line-by-line — "inventory every route
  and the queries it makes", "list every place X constant is used", "how does
  the notification layer decide who to notify". Ask each for *conclusions and a
  concrete inventory*, not file dumps.
- **Confirm, don't assume.** If the plan hinges on how something works (a cookie
  scope, a runtime constraint, a framework version's behavior), open the file and
  verify. Assumptions are where specs rot.

The output of phase 1 is a precise picture: which models/files/queries/config the
change lands on, and how the current single behavior is wired.

### Phase 2 — Surface the genuine decisions BEFORE writing

Most changes have a few forks that fundamentally reshape the spec (e.g. URL
strategy, tenancy model, sync vs async, build-for-now vs build-for-future).
These are the user's to make, not yours to silently pick.

- Use `AskUserQuestion` for the 2–4 decisions that actually change the document's
  structure. Put the recommended option first and label it. Give each option a
  one-line consequence so the choice is informed.
- Don't ask about things you can decide from convention or the code — pick the
  obvious default and note it.
- Distinguish **locked decisions** (answered now, drive the whole spec) from
  **open decisions** (genuinely deferrable to implementation time). The latter go
  in the spec as a checklist (see structure), not as blockers now.

### Phase 3 — Write the spec

Follow the structure below. Save to `docs/<FEATURE>_SPEC.md` (or wherever the
repo keeps design docs). Write in the codebase's idiom — match the language,
naming, and patterns of the real code in every snippet.

### Phase 4 — Adversarially verify (the "bulletproof" pass)

Re-read your own draft with the assumption that it contains a mistake, and go
back into the code to find it. This pass is where the most valuable findings come
from — the things that would otherwise surface painfully mid-implementation:

- Did you assume a file/function/flag exists? Confirm it does and is named what
  you wrote.
- Did you assume framework/library behavior? Verify against the installed version
  (check `package.json`, the actual config files).
- Are there ordering, caching, runtime, or security implications you glossed
  (e.g. "this runs at the edge so the DB client won't work there")?
- Correct the draft and call out what changed — surfacing the catch is itself
  valuable to the reader.

Scale this pass to the change: a small spec needs a quick self-review; a large
architectural one (multi-tenant, payments, auth) deserves a genuine hunt, and is
a good candidate for spawning a verification subagent or two against specific
claims.

### Phase 5 — Wire it in

- Link the new spec from the repo's task index (`TODO.md`, a docs README,
  whatever exists) so it's discoverable.
- If the spec has open decisions the user wants to be prompted on later, record a
  memory pointing at the spec's "Open decisions" section so a future session
  surfaces them instead of silently choosing.
- Briefly summarize for the user: the locked decisions, the highest-risk items,
  and any open decision you're leaving to them.

## Spec structure

Adapt to the change, but this skeleton is what makes specs scannable and
complete. Order matters: decisions and risks are near the top where they get
read.

```markdown
# <Feature> — Implementation Spec
<one-line statement of what this enables and why>

## Decisions (locked)
<table: Decision | Choice | Implication — the answers from phase 2>

## Dependency
<what other work/specs this builds on; what must land first. Omit if none.>

## ⚠️ Open decisions — confirm before implementing
<checklist of deferred decisions, each with section ref + recommended default.
 These are explicitly NOT chosen yet; whoever implements resolves them.>

## Guiding principle
<the one invariant that keeps the design correct — e.g. "tenant is derived from
 host/session, never client input". Not every spec needs one, but a sharp
 principle prevents whole classes of bugs.>

## <Numbered sections, one per subsystem the change touches>
<Data model first (it grounds everything), then each subsystem. For each:
 name the real files, enumerate every touchpoint (every query site, route,
 constant), and show snippets in the project's idiom. Completeness here is what
 makes implementation mechanical — the reader shouldn't have to rediscover where
 the change lands.>

## Config / env
<exact vars/constants to add, change, or drop, referencing the real config module>

## Testing
<what proves it works — especially the risky behaviors and isolation/security>

## Suggested rollout phases
<ordered phases; call out what's safely shippable behind a flag and what the
 behavior-visible cutover is>

## Appendix — highest-risk items (verify these first)
<the handful of things that become bugs if missed: security holes, race
 conditions, framework footguns, easy-to-miss touchpoints. This is the distilled
 risk register.>
```

## Writing principles

- **Ground every claim in real code.** Reference files as clickable paths and,
  where useful, line numbers. If you can't point to where a statement lives in
  the code, you probably haven't verified it.
- **Enumerate, don't hand-wave.** "Add a tenant filter to the queries" is useless;
  "these 18 query sites need `salonId` — here they are" is a spec. The inventory
  is the value.
- **Explain the why, not just the what.** The reader (often a future you) needs
  the reasoning to make sound calls when reality differs from the plan.
- **No silent defaults.** Anything you chose arbitrarily either becomes a locked
  decision (with rationale) or an open decision (deferred to the owner). Don't
  bury a consequential choice in prose.
- **Phase for safety.** Identify what can ship inert (behind a flag, schema-only,
  no behavior change) so the change de-risks incrementally rather than in one big
  cutover.
- **Lead with risk.** The appendix of highest-risk items is often the most-read
  part. Put the things that cause outages or data leaks there, explicitly.

## Anti-patterns

- Writing the spec from general knowledge of "how these features usually work"
  without reading this codebase. The result is plausible and wrong.
- Asking the user about everything, including things decidable from convention —
  or asking nothing and silently picking architecture-defining options.
- A flat wall of prose with no decisions table, no risk appendix, no phases — all
  the information might be there, but it's not usable as an implementation guide.
- Skipping the verification pass and shipping a draft whose assumptions were never
  checked against the actual code.
