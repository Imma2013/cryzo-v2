# Full-Auto Autonomy UX And Executor Handoff

## Scope

This note reviews the current full-auto autonomous task flow across:

- `frontend/components/autonomous/autonomous-view.tsx`
- `frontend/app/api/autonomous/dispatch/route.ts`
- `frontend/convex/autonomous.ts`

It is documentation only. No runtime behavior is changed here.

## Current UX Shape

The new Autonomous tab is currently optimized around one path only:

- create a saved task
- choose a cadence
- choose connected integrations
- save the task in `full_auto` mode
- let the scheduler and dispatcher pick it up later

Important UX facts from the current implementation:

- The UI presents `Runtime mode: Full auto` as a fixed state.
- Task creation always writes `autonomyMode: "full_auto"`.
- Task creation always writes `triggerType: "schedule"`.
- A newly created task gets `schedule.nextRunAt = new Date().toISOString()`, so the first run becomes eligible immediately.
- The form does not expose approval-required mode.
- The form does not expose policy selection, memory selection, or a dry-run mode.
- Saved tasks expose pause and resume controls only.
- The saved-task card copy says tasks will be picked up by the scheduler/dispatcher layer.

The practical result is that the first autonomy UX is not a general autonomy configurator yet. It is a narrow full-auto scheduled-task creator with no explicit safety decision points in the form itself.

## UX Assumptions Embedded In The Current Surface

The current task-creation UX assumes all of the following:

- the user understands that task creation may lead to near-immediate execution
- selecting integrations is enough to describe the task's allowed action surface
- the executor will behave conservatively even without an approval gate in the form
- task instructions and success criteria are sufficient to safely guide autonomous behavior
- pause/resume is an adequate operational control after creation

Those assumptions are larger than what the current backend actually enforces.

## Safety Model As Implemented Today

### What is actually enforced

- Only connected integrations can be selected in the UI.
- The task record stores `integrationSlugs`.
- The scheduler only queues active tasks.
- The dispatcher processes claimed runs one at a time per request loop.
- The dispatch route now requires a scheduler secret in production via `CRON_SECRET` and also accepts `AUTONOMOUS_DISPATCH_SECRET` as a legacy/manual fallback.
- The executor checks the user's remaining token budget before running.
- The executor derives an effective integration set from task integrations plus policy allow/block lists.
- The executor fails a run if required integrations are not connected.
- The executor caps run length from enforced policy `maxActionsPerRun` when present.
- The executor records completion/failure events and usage.

### What is only implied or prompt-based

- The dispatch route still does not enforce `autonomyMode`.
- The dispatch route still does not branch into approval-required behavior.
- The dispatch route still does not construct a reduced toolset from selected integrations at Composio bind time.
- The system prompt says `Allowed integrations: ...`, but tool access is still broad within the session after the connectivity and policy checks pass.

The main remaining runtime gap is that the UX suggests the task may use only the integrations the user selected, but the current executor still obtains Composio tools for the full session and relies on preflight checks plus prompt instructions rather than hard tool binding.

## Executor Behavior Assumptions

The current dispatch route assumes:

- an authenticated or otherwise valid Composio session can be created for the task user
- the session's tool inventory is suitable for autonomous execution without a separate permission layer
- preflight filtering plus prompt instructions are sufficient until hard tool binding is added
- the minimum enforced `maxActionsPerRun` across attached policies is a reasonable cap for one run
- successful completion can be represented by a single natural-language summary plus token usage
- storing `last_run_summary` as task memory is sufficient carry-forward context for future runs

These are workable bootstrap assumptions, but they are not strong enough to support production-grade full-auto behavior without more explicit controls.

## Approval Assumptions

The current full-auto UX does not expose approval choices, and the executor path does not create approval requests. That implies:

- full-auto is the only UX-visible operating mode right now
- approval-required remains a backend contract, not a real end-user flow
- any future approval UX will need a separate task-creation branch or advanced settings path
- executor-side approval checks must be added deliberately rather than assumed to exist already

This matters because the presence of approval tables and mutations can make the system look safer than the actual UX/runtime path currently is.

## Main Risks To Call Out

- Immediate execution risk: new tasks are eligible to run right after creation because `nextRunAt` is set to the current time.
- Tool-scope mismatch: selected integrations and policy allow/block lists are checked before execution, but the executor still loads session tools broadly and does not enforce that selection at the tool-binding layer.
- No approval checkpoint in practice: the active UX path is full-auto only, and the executor does not route into approval workflows.
- Prompt-only safety: the strongest safety instruction today is prompt text, not executable policy enforcement.
- Limited operator visibility: the UI shows saved tasks and pause/resume, but not run history, pending approvals, last action details, or high-risk action previews.
- Memory simplicity risk: task memory persists the last summary, but there is no structured execution ledger or resumable action checkpoint.

## Handoff Notes For The Executor Owner

If executor work continues from the current route, keep these constraints explicit:

- Treat `task.integrationSlugs` as a required enforcement input, not just a prompt hint.
- Decide whether executor tool access is filtered before model invocation or mediated during tool execution.
- Do not assume `policy.policy` is informative enough on its own; define which policy fields are actually enforced in code.
- Add an explicit branch for `approval_required` before relying on the broader autonomy contract.
- Decide whether first-run immediacy is intentional or whether new tasks should default to a future execution time.
- Add event records for attempted tool actions, not just run-level success/failure summaries.
- Define what constitutes a high-risk action that must be blocked, downgraded, or escalated.

## Handoff Notes For UX/Product Follow-On

If the Autonomous tab is extended later, the biggest UX gaps are:

- mode selection: `full_auto` vs `approval_required`
- first-run timing: now vs next scheduled slot
- policy visibility: what the task may or may not do
- action transparency: recent runs, actions taken, failures, and pending approvals
- kill switch clarity: stop one task, stop all tasks, or revoke an integration

Without those affordances, the current UX should be treated as an early operator-facing prototype rather than a fully trustworthy autonomy control surface.
