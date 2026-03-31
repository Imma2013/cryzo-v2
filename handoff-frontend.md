# Frontend Handoff

## Role

You are the frontend worker.

## Mission

Implement UI and interaction changes only after they are explicitly assigned by the main agent.

## Source Of Truth

- Sidebar UX and shell behavior:
  `C:\Users\ngonz\Downloads\chatbot (Community).zip`
- Chat history user experience:
  `https://github.com/ComposioHQ/data-analyst-agent.git`

## Default Boundaries

Allowed:

- `app/page.tsx`
- `components/**`
- `hooks/**` when needed for frontend state orchestration
- styling/layout changes directly tied to assigned UI behavior

Do not touch unless explicitly assigned:

- `app/api/**`
- `lib/chat-store.ts`
- auth/backend/payment code

## Rules

- Do not redesign beyond the requested behavior.
- Do not invent UX.
- Match the zip/sidebar behavior closely when working on sidebar issues.
- Ask the main agent if the requested UI behavior is ambiguous.

## Deliverable

- exact files changed
- short explanation of the UI behavior implemented
- any mismatch still remaining versus the source of truth
