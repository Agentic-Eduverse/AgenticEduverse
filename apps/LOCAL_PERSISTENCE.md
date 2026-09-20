# Local persistent mode

Business data is stored in `/home/ls-jl/apps/data/eduverse.db`. Uploaded class files default to `/home/ls-jl/apps/data/uploads`. Attendance, private tutoring sessions, recordings and publication state are persisted in SQLite. Presence, hand raises, active quiz state and bounded realtime caches use a real Redis service.

Start Redis first, then run the services in separate terminals:

```bash
cd /home/ls-jl/apps
corepack pnpm --filter server dev
corepack pnpm --filter web dev
```

Required local environment:

- both services use `DATABASE_URL=file:/home/ls-jl/apps/data/eduverse.db`;
- the Socket server uses `REDIS_URL=redis://127.0.0.1:6379`;
- web and Socket use the same strong `SOCKET_TICKET_SECRET`;
- `WEB_ORIGINS` lists every allowed local browser origin;
- `NEXT_PUBLIC_SOCKET_URL` is reachable from the browser.

There is no demo-mode switch. Unconfigured AI/media services display an explicit unavailable state while manual quiz, classroom chat, whiteboard and local persistence continue to work.

For the optional media stack, see `infra/media/README.md`.
