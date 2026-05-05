# Golf Trip Pro

Database-ready golf trip tournament app with admin setup, player scorecards, scorecard review, and computed leaderboards.

## Current State

This branch is the full-app prototype. It is safe to deploy for UI testing as a static app, but it still uses local browser storage until Supabase Auth and Postgres are wired into the data adapter.

The holiday/offline app lives on the older branch and is not changed by this branch.

## Local Preview

```bash
npm run serve
```

Open `http://localhost:8080`.

## Checks

```bash
npm run check
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md).
