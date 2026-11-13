# Supabase setup (Google sign-in + leaderboard)

Project: `https://kukdmtnflwzfwxypngzj.supabase.co` (publishable key is in `src/lib/supabase.ts`).
Never put the secret / service_role key or the database password in this repo.

## 1. Create the tables

Supabase dashboard → **SQL Editor** → **New query** → paste all of `supabase/schema.sql` → **Run**.
It creates `profiles`, `test_runs`, the `leaderboard` view and their access rules. Re-running is safe.

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

## 4. ID + password accounts and the owner

1. **Authentication → Sign In / Providers → Email**: make sure Email is **enabled**, and turn **off**
   **Confirm email**. (IDs use stand-in addresses like `kim@janchi-trainer.invalid` that cannot receive
   mail, so confirmation emails could never arrive.) Save.
2. **SQL Editor**: run `supabase/owner_and_ids.sql` (adds the owner flag and the owner-only
   "Clear leaderboard" function).
3. On the site: **Sign in → Create account**, ID e.g. `owner`, with a strong password.
4. **SQL Editor**: make that account the owner (use the ID you chose):

   ```sql
   update public.profiles set is_owner = true
     where id = (select id from auth.users where email = 'owner@janchi-trainer.invalid');
   ```

5. Sign in as the owner and open **Leaderboard**: an **Owner tools** box lets you clear the
   leaderboard (type CLEAR to confirm).

Forgotten passwords: there is no email reset for ID accounts (their addresses can't receive mail).
Simplest fix: in Supabase, **Authentication → Users**, find `<id>@janchi-trainer.invalid`, delete that
user (their saved runs go with it), and let them create the account again.
