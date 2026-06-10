# RedZone Arena Pro

Next.js + Supabase tournament platform.

## ENV
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxx
NEXT_PUBLIC_DISCORD_INVITE=https://discord.gg/yourserver

## Admin setup
1. Create/login your account on the website.
2. Supabase SQL Editor дээр run:

```sql
update profiles set role = 'admin' where email = 'YOUR_EMAIL@gmail.com';
```

Then logout/login again.
