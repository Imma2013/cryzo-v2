# Context

## Main Agent Role

This terminal is the main coordinating agent.

- Own the overall architecture and integration decisions.
- Delegate bounded implementation tasks to other terminals.
- Keep shared behavior consistent across chat UI, chat history, Composio integrations, and app connections.
- Use this file as the baseline context for any delegated terminal.

## Current Project

Project root:

`C:\Users\ngonz\Downloads\Cryzo V2\frontend`

Current stack in this repo:

- `Next.js` frontend
- `Vercel AI SDK` chat UI
- `Composio` for tools and app connections
- Temporary local server-side chat persistence in `.data/chats.json`

Planned production stack later:

- `Convex` for database and backend
- `Firebase` for auth
- `Vercel` for hosting
- `Stripe` for payments

## Current UI State

- Sidebar-based chat UI
- Chat history persisted through `/api/chats`
- `Apps` item restored in the sidebar
- Chat history and sidebar behavior are being aligned to the reference implementations

Important:

- The user wants the zip file to be the source of truth for sidebar UX.
- The user wants `ComposioHQ/data-analyst-agent` to be the source of truth for chat-history behavior.
- Do not improvise UI changes outside what is explicitly requested.

## Composio Session Bootstrap

Use this exact session bootstrap as provided by the user:

```python
from composio import Composio

composio = Composio(api_key="ak_Ff4U94OPDuFwWPFLQouQ")
external_user_id = "pg-test-pg-test-43d08743-c471-4d27-ac73-9b9398880252"

session = composio.create(
    user_id=external_user_id,
    toolkits=[
        "gmail",
        "googlecalendar",
        "googlesheets",
        "twitter",
        "googledrive",
        "googledocs",
        "youtube",
        "reddit",
        "hackernews",
        "shopify",
        "linkedin",
        "google_maps",
        "one_drive",
        "salesforce",
        "slackbot",
        "slack",
        "stripe",
        "cursor",
        "linkedin_ads",
        "metaads",
        "facebook",
        "browserbase_tool",
        "browser_tool",
        "instagram",
        "tiktok",
        "canva",
        "google_analytics",
        "googleads",
        "google_search_console",
        "mailchimp",
    ],
)

print(session.mcp)
```

## Reference Sources

### Sidebar UX reference

Local zip source previously referenced by the user:

`C:\Users\ngonz\Downloads\chatbot (Community).zip`

Use it as the source of truth for:

- sidebar collapse behavior
- sidebar header controls
- general sidebar/chat shell interaction

### Chat history reference

GitHub source of truth:

`https://github.com/ComposioHQ/data-analyst-agent.git`

Use it as the source of truth for:

- chat history flow
- create/select/delete/save patterns
- separation between page orchestration and chat-history logic

Key files already identified:

- `app/page.tsx`
- `hooks/use-chat-history.ts`
- `hooks/use-streaming-chat.ts`
- `components/chat/chat-sidebar.tsx`

## Working Rules For Delegated Terminals

- Do not redesign the UI.
- Do not add features beyond the explicitly assigned scope.
- If working on sidebar behavior, follow the zip.
- If working on chat history, follow `data-analyst-agent`.
- Keep changes isolated and minimal.
- Report exact files changed.
- If a task touches both sidebar UX and chat history, stop and ask for scope clarification instead of guessing.

## Current Important Files In This Repo

- `app/page.tsx`
- `app/api/chat/route.ts`
- `app/api/chats/route.ts`
- `app/api/chats/[id]/route.ts`
- `app/api/chats/[id]/messages/route.ts`
- `app/api/connections/route.ts`
- `app/api/connections/disconnect/route.ts`
- `components/chat/chat-sidebar.tsx`
- `components/ToolCallDisplay.tsx`
- `hooks/use-chat-history.ts`
- `hooks/use-local-storage.ts`
- `lib/chat-store.ts`

## Notes

- Local testing is the current priority.
- Production-grade migration to Convex/Firebase comes after the local UX is correct.
- Avoid repeating earlier mistakes: ask before changing behavior that is not explicitly requested.
- Autonomy runtime assumptions and current Convex contract are documented in `frontend/handoff-autonomy.md` for scheduler, memory, approval, and full-auto follow-on work.
- Full-auto autonomous task UX and executor safety assumptions are documented in `frontend/handoff-autonomy-full-auto.md`.
- Deploy-time cron secret, kill-switch, and observability expectations are documented in `frontend/handoff-autonomy-deploy.md`.
- Operator visibility gaps and the proposed next autonomy control surface are documented in `frontend/handoff-autonomy-ops-surface.md`.
