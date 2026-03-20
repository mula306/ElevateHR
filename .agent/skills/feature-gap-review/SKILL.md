---
name: feature-gap-review
description: Review implemented, hidden, partial, and not-yet-enabled capabilities to identify features that can be included next using the current architecture. Use when asked to review feature on/off states, find dormant or expandable modules, assess what can be turned on safely, or recommend additional features already supported in part by the codebase.
---

# Feature Gap Review

Review the application as a product architect looking for near-term expansion opportunities with minimal redesign.

## Focus

- Inspect feature flags, navigation visibility, route guards, and settings-controlled features.
- Inspect placeholder routes, partial modules, seeded data, and existing APIs.
- Identify capabilities that are already mostly implemented but not surfaced cleanly.
- Identify adjacent features that align with current models and workflows.
- Distinguish low-effort enablement from features that still require substantial backend work.

## Workflow

1. Inventory visible modules, hidden routes, feature toggles, and placeholders.
2. Compare what exists in the data model, APIs, and UI.
3. Classify each candidate as:
   - already live
   - partially implemented
   - hidden behind feature or navigation logic
   - placeholder only
   - not supported yet
4. Recommend what can be included next with the current architecture.
5. Note dependencies, risks, and what still blocks each candidate.

## Output

Provide a practical matrix or structured list with:

- feature or capability
- current state
- what is already present
- what is missing
- recommended action
- implementation effort

After the matrix, summarize:

- the best near-term features to expose
- the best medium-term features to build next
- any architectural constraints that should shape sequencing

## Review Standard

- Do not recommend turning on features that are only UI placeholders.
- Align suggestions to the existing role, settings, workflow, and feature-flag model.
- Favor features that reuse current APIs, data models, or seeded admin configuration.
