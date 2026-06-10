# RedZone Arena - Next.js + Supabase

A working tournament website with:
- Email/password login/register
- Supabase database
- Team creation
- Match creation
- Score submit
- Opponent confirm / dispute
- Leaderboard auto update
- Discord invite button

## Deploy

1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase/schema.sql`.
3. Supabase Auth > Providers > Email: enable Email provider.
   - For easier testing, turn OFF email confirmation.
4. Copy `.env.example` values into Vercel Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_DISCORD_INVITE`
5. Import the GitHub repo in Vercel.
6. Framework: Next.js. Build command: `npm run build`.

## Local

```bash
npm install
npm run dev
```
