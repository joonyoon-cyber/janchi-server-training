# Supabase setup (Google sign-in + leaderboard)

Project: `https://kukdmtnflwzfwxypngzj.supabase.co` (publishable key is in `src/lib/supabase.ts`).
Never put the secret / service_role key or the database password in this repo.

## 1. Create the tables

Supabase dashboard → **SQL Editor** → **New query** → paste all of `supabase/schema.sql` → **Run**.
It creates `profiles`, `test_runs`, the `leaderboard` view and their access rules. Re-running is safe.

The leaderboard is public (visible without signing in). If your project was set up before that change,
run `supabase/team.sql` once the same way (it also sets up the owner's Team page). Visitors can read only the leaderboard's columns
(name, score, clear time, date, number of Tests), never the `test_runs` or `profiles` tables.

## 2. Google sign-in

**Google Cloud Console** (console.cloud.google.com):
1. Create a project (e.g. "Janchi POS Trainer").
2. **APIs & Services → OAuth consent screen**: User type **External**, app name "Janchi POS Trainer",
   your email as support and developer contact. App domain links:
   - Privacy policy: `https://joonyoon-cyber.github.io/janchi-server-training/privacy.html`
   - Terms of service: `https://joonyoon-cyber.github.io/janchi-server-training/terms.html`
   - Authorized domain: `joonyoon-cyber.github.io`
   Save. Under **Audience**/**Publishing status**, click
   **Publish app** so any Google account can sign in (otherwise only listed test users can).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://joonyoon-cyber.github.io`
   - Authorized redirect URIs: `https://kukdmtnflwzfwxypngzj.supabase.co/auth/v1/callback`
   - Create, then copy the **Client ID** and **Client secret**.

**Supabase dashboard**:
4. **Authentication → Sign In / Providers → Google**: enable, paste the Client ID and Client secret, Save.
   (The client secret goes only here, never in chat or the repo.)
5. **Authentication → URL Configuration**:
   - Site URL: `https://joonyoon-cyber.github.io/janchi-server-training/`
   - Redirect URLs: add `https://joonyoon-cyber.github.io/janchi-server-training/` and `http://localhost:5173/`

## 3. Check it

Open the site → **Sign in with Google** (top right) → you should come back signed in, with your
name in the header. Take a Test; the result appears under **Leaderboard**.

## Notes

- Anyone with a Google account can sign in and appear on the leaderboard. To restrict it to staff
  later, we can add an approved-email list.
- Scores are computed in the browser, and each run stores its seed and POS events. A server-side
  re-check (Supabase Edge Function) can be added later to stop tampered scores.
- Free projects pause after about a week with no activity; un-pause from the dashboard, or use the
  Pro plan to avoid it.

## 4. Email + password accounts and the owner

1. **Authentication → Sign In / Providers**: under **User Signups**, turn **off** **Confirm email**
   (Supabase's built-in mailer only delivers to your project team, so confirmation emails would not
   reach staff). In the **Email** provider panel keep Email enabled; optionally set the minimum
   password length to 8. Save.
2. **SQL Editor**: run `supabase/owner.sql` (adds the owner flag and the owner-only
   "Clear leaderboard" function).
3. On the site: **Sign in → Create account** with the owner's email and a strong password.
4. **SQL Editor**: make that account the owner (put the owner's email in the quotes):

   ```sql
   update public.profiles set is_owner = true
     where id = (select id from auth.users where email = 'OWNER-EMAIL-HERE');
   ```

5. Sign in as the owner and open **Leaderboard**: an **Owner tools** box lets you clear the
   leaderboard (type CLEAR to confirm).

Forgotten passwords: no emails are sent, so there is no self-service reset. In Supabase,
**Authentication → Users**, find the person's email and delete the user (their saved runs go with
it); they can then create the account again. (Email resets can be added later with a custom SMTP
sender.)

## Team page (owner only)

`supabase/team.sql` (also part of `schema.sql`) adds what the owner's **Team** tab needs:

- `test_starts`: every Test started, so abandoned attempts can be counted.
- `practice_results`: Scenario practice finished while signed in.
- `team_members()`: owner-only list of accounts with their sign-in email and last sign-in.
- Test runs and practice results: each person reads only their own; the owner reads everyone's.
- **Clear leaderboard** no longer deletes anything. It records a reset time; the leaderboard counts
  only Tests after the latest reset, and the owner's Team page keeps the full history.
