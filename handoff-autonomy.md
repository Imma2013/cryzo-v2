# Autonomy Runtime Handoff

## Scope

This note documents the autonomy architecture currently defined in:

- `frontend/convex/schema.ts`
- `frontend/convex/autonomous.ts`

It is a review and runtime-assumptions handoff only. It does not change the runtime model.

## Current Architecture Summary

The current Convex layer defines persistence and lifecycle primitives for autonomous work, and it now includes an early Convex-native scheduler and executor path. Today the code supports:

- durable task records in `autonomousTasks`
- queued and running task executions in `autonomousRuns`
- scoped memory entries in `autonomousMemory`
- reusable policy records in `autonomousPolicies`
- approval requests in `autonomousApprovals`
- event storage in `autonomousEvents`
- a Node-based executor in `frontend/convex/autonomousRuntime.ts`
- a Convex cron schedule in `frontend/convex/crons.ts`

What exists now is an early runtime rather than only a future contract. The scheduler wake-up loop, event ingestion, and first execution worker now exist, but approval delivery, richer policy enforcement, and resumable execution are still incomplete.

## Runtime Model Assumptions

### Scheduler

Implemented model:

- Convex cron invokes `internal.autonomousRuntime.dispatchScheduledRuns` every 15 minutes.
- The runtime enqueues due runs through `ensureScheduledRuns`, claims them, and executes them directly.
- Scheduled work is driven by `autonomousTasks.schedule.nextRunAt` and `autonomousRuns.scheduledFor`.

Current implementation notes:

- `createTask` stores schedule metadata on the task.
- `queueRun` still stores one queued run with optional `scheduledFor` for manual or retry paths.
- `ensureScheduledRuns` derives queued runs from task schedules.
- `ensureScheduledRuns` updates `schedule.lastRunAt` and computes the next `nextRunAt`.
- `ensureScheduledRuns` avoids duplicate queued runs for the same task and schedule window.

Assumption to preserve:

- The wake-up loop is implemented, but worker locking is still optimistic and does not yet use leases or heartbeats.

### Memory

Assumed model:

- Memory is a simple key-value store used by the future executor for context hydration.
- Scope determines whether memory is shared by user, workspace, or task.
- The executor decides when memory is read; this file only supports upsert persistence.

Current implementation notes:

- `upsertMemory` supports `user`, `workspace`, and `task` scopes.
- Task-scoped memory is keyed by `(taskId, key)`.
- Non-task memory is keyed by `(userId, scope, key)`.
- `workspace` scope currently has no workspace identifier, so it behaves as another user-level namespace.
- No query function exists yet for retrieving filtered memory sets for runtime assembly.
- `value` is `v.any()`, so schema validation does not constrain memory payload shape.

Assumption to preserve:

- Do not treat `workspace` memory as truly multi-user or org-scoped until a concrete workspace identifier exists in schema and indexes.

### Approval

Assumed model:

- A run can execute up to an approval boundary, then request approval before a sensitive action.
- An external UX or notification layer surfaces pending approvals to the user.
- Once resolved, the run is either re-queued for continuation or cancelled.

Current implementation notes:

- `createApprovalRequest` creates an `autonomousApprovals` record and flips the run to `awaiting_approval`.
- `resolveApprovalRequest` sets approval status to `approved`, `rejected`, or `expired`.
- Approved runs are moved back to `queued`.
- Rejected or expired runs are moved to `cancelled`.
- There is no stored execution cursor, continuation payload, or action checkpoint that tells a resumed run where to continue.
- `requestedAction` is free-form text and not a structured action contract.

Assumption to preserve:

- Approval currently pauses a run at the workflow level, not at a resumable execution-frame level. Any future executor must define how continuation state is serialized before relying on approval-based resume.

### Full-Auto Runtime

Assumed model:

- `autonomyMode = full_auto` means the executor may perform actions without pausing for user approval, subject to policy constraints.
- Policies are expected to define the safety rails for integrations and action volume.

Current implementation notes:

- Tasks and policies both store `full_auto` vs `approval_required`.
- Policies can define allowed integrations, blocked integrations, escalation channels, and max actions per run.
- The executor currently enforces allow/block integration lists and max-actions-per-run in the runtime path.
- `queueRun`, `startRun`, and `completeRun` do not inspect policy or autonomy mode.
- The runtime records run-level success/failure events, but not action-level tool audit events.

Assumption to preserve:

- `full_auto` is declarative only right now. It should not be interpreted as production-safe autonomous execution until policy enforcement, action logging, and kill-switch behavior exist in the executor path.

## Data Flow Intended By The Current Contract

The current tables imply this lifecycle:

1. A client creates a task with instructions, goals, success criteria, integrations, and optional schedule/memory/policy keys.
2. A scheduler or manual trigger creates a queued run for that task.
3. A worker claims the run with `startRun`.
4. The worker either:
   - completes it with `succeeded`, `failed`, or `cancelled`, or
   - requests approval and leaves it in `awaiting_approval`
5. Approval resolution either:
   - re-queues the run for later continuation, or
   - cancels it
6. Memory and policy tables act as lookup/state tables around that run lifecycle.

That is coherent as a first-pass backend contract and runtime, but post-approval continuation, stronger lock ownership, and richer action visibility are still operational assumptions rather than complete behavior.

## Main Gaps To Keep In Mind

- The scheduler and first executor path now exist.
- Event ingestion now writes scheduler-cycle and run-level events to `autonomousEvents`.
- Policy enforcement still does not exist in mutations; it currently lives in the executor path only.
- No resumable run state exists for approval boundaries.
- No dedupe or locking strategy exists for queued runs.
- No retry/backoff model exists beyond `triggerSource = retry`.
- No guarantee exists that `task.autonomyMode` and `policy.approvalMode` stay aligned.

## Practical Implementation Guidance

Before wiring UI or external automation around this model, the next backend/runtime pass should make these decisions explicit:

- stronger lock semantics for run claiming and recovery
- run claiming semantics: single-consumer lock and duplicate prevention
- approval resume semantics: checkpoint payload, pending action descriptor, and expiry behavior
- policy precedence: whether task mode or policy mode wins on conflict
- memory read model: exact query API and serialization limits for runtime context
- full-auto safety: enforced integration allow/block lists, action caps, audit events, and emergency disable path

## Recommended Positioning For Other Panels

- Pane 1 can build orchestration only after scheduler and executor ownership are chosen.
- Pane 2 can test current lifecycle primitives, but those tests should not assume true scheduling or resumable approvals yet.
- Pane 3 can tighten autonomy types safely, but should preserve the distinction between declared contract and implemented runtime behavior.
