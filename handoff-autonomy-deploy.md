# Autonomy Deploy Checklist

## Scope

This note covers deploy-time expectations for the current autonomous scheduler and executor path:

- cron secret setup
- kill-switch expectations
- run observability

It reflects the current implementation in:

- `frontend/vercel.json`
- `frontend/app/api/autonomous/dispatch/route.ts`
- existing autonomy handoff docs

## Cron Secret Checklist

Before enabling production cron execution, confirm all of the following:

- `AUTONOMOUS_DISPATCH_SECRET` is set in the Vercel project environment for production.
- The cron caller sends the same secret on each request.
- The preferred auth path is either `Authorization: Bearer <secret>` or `x-autonomous-dispatch-secret: <secret>`.
- Query-string `?secret=` support exists, but should be treated as fallback-only because it is easier to leak through logs and dashboards.
- `NEXT_PUBLIC_CONVEX_URL` is present in the same deployment environment.
- The deployed route path matches [frontend/vercel.json](/C:/Users/ngonz/Downloads/Cryzo%20V2/frontend/vercel.json), currently `/api/autonomous/dispatch`.
- The cron schedule in [frontend/vercel.json](/C:/Users/ngonz/Downloads/Cryzo%20V2/frontend/vercel.json) is intentionally `*/15 * * * *` and not just a placeholder.

Important current behavior:

- In production, the dispatch route rejects requests without the configured secret.
- Outside production, the route allows execution even when no secret is configured.

Operator assumption:

- Treat missing `AUTONOMOUS_DISPATCH_SECRET` as a deploy blocker for production autonomy.

## Kill-Switch Expectations

### What exists today

- A task can be paused from the Autonomous UI, which stops future scheduler pickup because only active tasks are enqueued.
- A task can be resumed later by setting it back to `active`.
- A run fails fast when the user has no remaining token budget.
- A run fails when policy filtering leaves no usable integrations.
- A run fails when required integrations are disconnected.

### What does not exist yet

- No global kill switch disables all autonomous dispatches at once.
- No route-level maintenance flag blocks execution while preserving the deploy.
- No per-user kill switch disables all tasks for one account.
- No executor-side emergency denylist exists for high-risk tools or actions.
- No admin UI exists for halting or draining the queue.
- No automatic circuit breaker exists for repeated failures.

Practical interpretation:

- The current operational kill switch is primarily task pause plus secret rotation or cron disablement.
- Secret rotation blocks future cron-triggered execution, but it does not by itself explain or resolve already-running work.
- Removing the cron entry or disabling the route caller is an infrastructure kill switch, not an in-product control.

Recommended minimum operator playbook before production use:

- stop the cron trigger
- rotate or unset `AUTONOMOUS_DISPATCH_SECRET` if external triggering must be cut off immediately
- pause any known risky tasks in Convex/UI
- inspect recent autonomous events and failed runs before re-enabling dispatch

## Run Observability Review

### What is observable now

- Run status is stored in `autonomousRuns`
- Run summaries and errors are stored on the run record
- `autonomousEvents` receives executor-written lifecycle events such as claim, success, and failure
- token usage is recorded on successful runs through billing usage writes
- task memory stores `last_run_summary`
- the dispatch HTTP response includes `queuedCount`, `processedCount`, and per-run result summaries

### What is missing for operators

- No dedicated run history UI
- No dashboard for queued vs running vs failed vs cancelled counts
- No alerting on repeated failures or unauthorized dispatch attempts
- No event stream for attempted individual tool calls
- No correlation id that ties together cron invocation, claimed run, tool actions, and billing writes
- No explicit metric for skipped runs, policy-denied actions, or disconnected-integration frequency
- No visible audit trail for secret failures or manual dispatch invocations

Practical interpretation:

- The data model is enough for forensic review in Convex, but not enough for low-friction operations.
- Production support will still depend on direct database inspection and platform logs.

## Deploy Readiness Assessment

Current status:

- Cron path exists.
- Secret guard exists for production.
- Some executor preflight checks exist.
- Observability is partial.
- Kill-switch behavior is incomplete.

That means the system is deployable as an early controlled operator workflow, but it is not yet a fully operationalized autonomous runtime.

## Recommended Follow-On Work

- Add a documented production procedure for how Vercel cron supplies the secret header.
- Add a global executor disable flag checked at the top of the dispatch route.
- Add per-user or per-workspace autonomy disablement checked before claim or execution.
- Record structured events for denied execution, unauthorized trigger attempts, and disconnected integrations.
- Add a lightweight run-ops view showing recent runs, failures, and pending approvals.
- Add a clear incident procedure for pausing autonomy during billing, tool, or model outages.
