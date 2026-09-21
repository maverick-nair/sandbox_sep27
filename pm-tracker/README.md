# PM Task Tracker

A single-file web app for tracking the work assigned to product managers: product development, product improvements, and client work such as custom simulations, coaching programs and role-plays.

Every task records a **start date and an end date**, an **owner**, a **checklist of subtasks**, and **dependencies** on other tasks. The board shows what is overdue, what is due this week, and what is waiting on an unfinished dependency. A timeline view plots every task as a bar between its start and end dates, with today marked.

## Using it

- **Published board (shared).** When the page is published as a Claude artifact with the `db` capability, tasks live in the artifact's shared database and every PM with access sees the same live board.
- **Standalone (this file).** Open `index.html` in a browser. Tasks are then saved in that browser's local storage only.

The first time the board is empty it offers to load example tasks. They are marked "Example" and can be removed in one click.

## Task fields

| Field | Notes |
| --- | --- |
| Task | Short name of the work |
| Type | Product development, Product improvement, Product task, Custom simulation, Coaching, Role-play, Client task |
| Product | Optional. One of the 4E product lines: Evaluate (Conversation AI, Nano AI, PitchPerfect AI), Educate (AI Microlearn, Interactive Learn), Experience (Simulations, AI RolePlay), Enable (AI Koach) |
| Client | Optional. Blank for internal work |
| Owner | The PM responsible |
| Status | Not started, In progress, Blocked, Done |
| Start and end date | Required |
| Checklist | Subtasks, each with a done checkbox |
| Depends on | Other tasks that must finish first. Circular dependencies are prevented |
| Notes | Free text |

## Data model

One document per task in the `tasks` collection:

```json
{
  "title": "Nano AI: adaptive question bank v2",
  "kind": "product-dev",
  "product": "Nano AI",
  "client": "",
  "owner": "Asha",
  "status": "in_progress",
  "start": "2026-09-11",
  "end": "2026-10-09",
  "notes": "",
  "subtasks": [{ "id": "s_x", "text": "Write PRD", "done": true }],
  "dependsOn": ["t_otherTaskId"],
  "createdAt": "2026-09-21T09:00:00.000Z",
  "updatedAt": "2026-09-21T09:00:00.000Z"
}
```

No build step and no dependencies. Fonts load from Google Fonts with a system fallback.
