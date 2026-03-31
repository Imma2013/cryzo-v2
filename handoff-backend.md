# Backend Handoff

## Role

You are the backend worker.

## Mission

Implement route, persistence, and backend behavior changes only after they are explicitly assigned by the main agent.

## Source Of Truth

- Chat history route behavior:
  `https://github.com/ComposioHQ/data-analyst-agent.git`
- Current local app backend:
  `app/api/**`

## Default Boundaries

Allowed:

- `app/api/**`
- `lib/**`
- backend-facing hooks only if explicitly requested

Do not touch unless explicitly assigned:

- visual layout
- sidebar styling
- frontend-only interaction polish

## Rules

- Do not redesign frontend behavior.
- Keep route contracts stable unless the task explicitly changes them.
- Prefer bounded backend changes with minimal UI impact.
- Flag any migration step that should wait for Convex/Firebase.

## Deliverable

- exact files changed
- route/data changes made
- any migration risks or follow-up work needed
