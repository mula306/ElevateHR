---
name: security-review
description: Review application security risks across frontend, backend, auth, authorization, validation, secrets, auditability, and operational configuration. Use when asked to perform a security review, threat-focused code review, permission model review, or to find concrete vulnerabilities and hardening gaps.
---

# Security Review

Review the application like a pragmatic product security engineer.

## Focus

- Inspect authentication, session handling, and environment bypass behavior.
- Inspect authorization and role/feature-based access controls.
- Inspect input validation, output encoding, and unsafe trust boundaries.
- Inspect sensitive data exposure in APIs, logs, UI payloads, and configuration.
- Inspect auditability for high-impact admin or workflow actions.
- Inspect feature-flag, settings, and admin surfaces for abuse paths.
- Inspect backend endpoints before assuming the frontend protections are sufficient.

## Workflow

1. Map the feature area and identify the request and permission boundaries.
2. Trace how a user reaches the action from UI to API to persistence.
3. Look for missing server-side enforcement, unsafe defaults, bypass paths, and stale compatibility fallbacks.
4. Prefer concrete evidence over hypothetical issues.
5. Note exploitable impact and realistic remediation.

## Output

Lead with findings, ordered by severity.

For each finding include:

- severity
- affected area
- concise explanation
- concrete exploit or failure path
- file references when available
- recommended remediation

After findings, include:

- open questions or assumptions
- residual risks
- testing or validation gaps

## Review Standard

- Do not treat missing defense-in-depth as the same severity as broken authorization.
- Do not report speculative issues without evidence.
- Call out where frontend-only controls are not backed by API enforcement.
- Favor exact, actionable fixes over generic security advice.
