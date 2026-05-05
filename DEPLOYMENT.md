# Deployment Checklist

## Static UI Deploy

The app can be deployed to Vercel, Netlify, or GitHub Pages as a static site.

For Vercel:

1. Import the GitHub repo.
2. Select branch `codex/full-app-v1`.
3. Framework preset: `Other`.
4. Build command: leave empty.
5. Output directory: leave empty or use project root.
6. Deploy.

The included `vercel.json` adds basic security headers and cache rules for the service worker and app assets.

## Supabase Connection

This branch is wired to Supabase for:

- Email magic-link sign-in
- First-owner trip bootstrap
- Invite-code joining
- Player profile claiming
- Admin setup/scoring/review
- Assigned player scorecard updates
- Leaderboards computed from database source data

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase-schema.sql` in the SQL editor, or apply the migrations already applied through the Supabase MCP.
3. Enable email magic-link auth.
4. Add your deployed domain to Supabase Auth redirect URLs.
5. Confirm the public values in `app.js` or expose them before the app script as:

```text
window.GOLF_TRIP_SUPABASE_URL = "https://your-project.supabase.co"
window.GOLF_TRIP_SUPABASE_ANON_KEY = "sb_publishable..."
```

Do not expose service-role keys in the browser.

## Security Notes

- Row-level security is enabled in `supabase-schema.sql`.
- Members can read trip data.
- Admins/owners can manage setup, rounds, awards, and scores.
- Invite-code join and player claiming use RPC functions so anonymous users cannot browse trips.
