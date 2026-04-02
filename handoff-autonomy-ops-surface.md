# Autonomy Operator Visibility Review

## Scope

This note reviews the operator visibility that now exists in the product and proposes the next control surface to add on top of it.

Primary reference points:

- `frontend/components/autonomous/autonomous-view.tsx`
- `frontend/convex/autonomous.ts`
- prior autonomy handoff docs

## What Operators Can See Today

The current Autonomous tab gives operators three useful views:

- task creation for new scheduled full-auto jobs
- saved task cards with pause and resume controls
- a recent autonomous runs panel with run status, timing, task title, trigger source, and either summary or failure text

That is enough to confirm that the runtime is doing something and to inspect the latest outcomes at a high level.

## Main Visibility Gaps

### 1. No queue health view

Operators still cannot answer basic runtime questions quickly:

- how many runs are currently queued
- how many are running right now
- whether the queue is draining or backing up
- whether one task is repeatedly reappearing in failure states

The recent-runs panel is historical, not operational. It shows what happened recently, not what needs attention now.

### 2. No approval or intervention queue

The system has approval records in the backend contract, but the product has no operator surface for:

- pending approvals
- expired approvals
- runs awaiting approval
- manual approve/reject actions

That creates a visibility gap between the autonomy data model and the actual operator workflow.

### 3. No task-level risk summary

Saved task cards currently show:

- title
- status
- instruction snippet
- cadence
- selected integrations

They do not show the operator facts most relevant to trust and incident response:

- last run result
- last failure time
- consecutive failure count
- next scheduled execution
- whether the task is currently policy-limited or blocked by disconnected integrations

### 4. No per-run drilldown

The recent-runs view is shallow. It does not expose:

- full event trail
- tool actions attempted
- policy denials
- billing/token exhaustion markers
- integration connectivity failures as distinct operator states

That means a failed run is visible, but the path to diagnosis is still outside the product.

### 5. No global control plane

Operators can pause one task at a time, but there is still no in-product control for:

- stop all autonomy
- pause all runs for one user
- disable a risky integration across tasks
- view system-wide runtime degradation

This is the biggest gap between a useful feature UI and an actual control surface.

## What The Current UI Already Suggests

The current shape of the Autonomous tab implies a natural progression:

1. Create tasks
2. Inspect recent runs
3. Add an operator panel that lets someone intervene when runs are unhealthy

That is a better next step than expanding task creation again.

## Recommended Next Control Surface

The next control surface should be a focused `Run Ops` panel inside the Autonomous tab.

It should not try to become a full admin console yet. It should be a narrow operator layer that answers:

- what is happening now
- what is broken
- what can I safely stop or retry

### Minimum v1 sections

`Runtime summary`

- queued runs count
- running runs count
- failed runs in last 24h
- awaiting-approval count
- paused task count

`Attention queue`

- failed runs needing review
- runs awaiting approval
- tasks blocked by disconnected integrations
- tasks failing due to billing/token exhaustion

`Task controls`

- pause task
- resume task
- view next scheduled run
- view last run result

`Run drilldown`

- full summary/error text
- key event timeline
- trigger source
- integration set used
- policy constraints applied

### Why this is the right next surface

- It builds directly on the recent-runs panel rather than replacing it.
- It improves operator trust without forcing a broad redesign.
- It supports incident handling before the product grows more automation modes.
- It makes the existing backend lifecycle more legible to non-developers.

## What Not To Build Next

Avoid these as the immediate next step:

- a bigger task-creation wizard
- a generic analytics dashboard
- a full admin backoffice detached from the Autonomous tab
- advanced memory editing UI

Those are lower leverage than a basic intervention-oriented run-ops surface.

## Suggested Handoff For Pane 1

If Pane 1 picks this up next, the bounded product direction should be:

- keep the existing Autonomous tab structure
- preserve the current task-creation form
- keep recent runs as a history section
- add one new operator-focused surface for status, intervention, and diagnosis

The target is not “more autonomy features.” The target is operator clarity and safe control over the autonomy that already exists.
