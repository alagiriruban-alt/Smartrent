<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

PostgreSQL 16 is installed on the machine. Docker is not available, so do not use `docker compose`. Copy `.env.example` to `.env` if it is missing. Those values match the local database: user `smartrent`, password `smartrent`, database `smartrentboss` on `localhost:5432`.

The environment start script starts PostgreSQL, creates that role and database when they are missing, runs `npx prisma migrate deploy` and `npm run db:seed`, then serves the app with `npm run dev` on port 3000.

Sign in at http://localhost:3000 with `landlord@example.com` and `DemoRent1`. `npm test` and `npm run lint` match CI and do not need a running database. The typecheck is `npx next typegen` followed by `npx tsc --noEmit`.
