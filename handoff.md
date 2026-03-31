# Handoff

A `handoff.md` is the short task brief I give to another terminal.

Use it when the worker does **one bounded task** and should not have to read the full project history.

`context.md` = full shared background  
`handoff.md` = the exact assignment for the next worker

## How To Use

When delegating, provide:

- the goal
- scope boundaries
- source of truth
- files to touch
- files not to touch
- expected output

## Standard Handoff Format

```md
# Task

Short description of the exact task.

## Goal

What must be true when the task is done.

## Source Of Truth

- Sidebar UX: zip file
- Chat history logic: ComposioHQ/data-analyst-agent

## Allowed Files

- list of files the worker may edit

## Do Not Touch

- list of files/modules out of scope

## Notes

- constraints
- UI expectations
- implementation warnings

## Deliverable

- exact files changed
- short summary of what was done
- blockers, if any
```

## Current Worker Roles

- Main agent: planning, delegation, integration decisions
- Frontend Gemini: UI/layout/frontend implementation
- Backend Codex: routes, persistence, backend behavior
- Security Gemini: security review, auth/payment risk review, audit notes
