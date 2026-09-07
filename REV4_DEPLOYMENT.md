# My Fitness Tracker — Revision 4

Rev 4 keeps the Rev 3 workout/equipment/history/progress functionality and adds:
- Profile (name, DOB, gender, height, goal)
- Weight history and trend
- Exercise completion controls (Complete / Delete; fields remain editable)
- AI Coach
- AI proposal -> Log Workout workflow

## Supabase web-only deployment

No Supabase CLI is required.

1. Run `supabase/migrations/20260906_rev4_profile_weight.sql` in Supabase SQL Editor after the existing Rev 3 schema.
2. In Supabase Edge Function secrets, set `GEMINI_API_KEY` and optionally `GEMINI_MODEL=gemini-2.5-flash`.
3. In Supabase Dashboard, create an Edge Function named `generate-workout` and paste the contents of `supabase/functions/generate-workout/index.ts` into the function editor, then deploy it.
4. Upload the contents of this folder to the same GitHub Pages site used by Rev 3.
5. Test locally before publishing: sign in, Profile, add two Weight entries, Log Workout completion/edit/delete, then AI Coach -> Propose -> Use This Workout.

The Gemini key is server-side only. The Edge Function authenticates the user's Supabase session and reads that user's profile, weight, workout history and equipment itself.

## Frontend configuration

Keep the existing `js/config.js` Supabase URL and publishable key. Never put `service_role`, database passwords, or the Gemini key in the frontend.
