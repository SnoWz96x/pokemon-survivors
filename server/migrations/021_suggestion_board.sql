-- The idea board becomes a kanban (src/suggestions.ts). Statuses only add, so the previous API keeps working during a rollout:
-- `open` stays the Backlog column, so the ideas already on the board land there and the shipped ones stay `done`.

-- `pending`: posted, waiting for staff to approve it in the Discord's #idea-review (a reaction puts it in the Backlog).
-- `todo` and `cooking`: the admin moved it to "A fazer" or "Cozinhando".
alter table suggestions drop constraint suggestions_status_check;
alter table suggestions add constraint suggestions_status_check check (status in ('pending', 'open', 'todo', 'cooking', 'done', 'hidden'));
alter table suggestions alter column status set default 'pending';

-- The ideas waiting for review, oldest first (the bot posts the ones it missed).
create index suggestions_pending on suggestions (created_at) where status = 'pending';
