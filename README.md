# My Fitness Tracker — Revision 3

Revision 3 builds on Revision 2 and keeps the existing workout database structure. It uses the user's existing Supabase `public.equipment` table as the single source of truth for exercise and cardio selection.

## Revision 3 changes

### 1. Equipment tab
- New Equipment tab.
- Loads equipment dynamically from Supabase.
- All / Strength / Cardio filters.
- Displays name, type, primary muscles, secondary muscles and cardio benefit.
- Add, edit and delete equipment.
- Changes are written directly to the existing `public.equipment` table.

### 2. Dynamic workout selections
The Log Workout page does not contain a hard-coded exercise catalogue.
- Strength exercise dropdowns come from `equipment` rows where `type` is `Strength`.
- Cardio selection comes from rows where `type` is `Cardio`.
- Matching is case-insensitive for robustness.

### 3. Load Previous Session
The Log Workout page includes **Load Previous Session**. It loads the most recent workout's:
- strength exercise names
- weights
- sets
- reps
- RPE
- cardio equipment
- duration, distance, speed, incline
- average/peak HR
- cardio RPE, calories and 1-minute recovery

Today's pre-workout HR is intentionally cleared so it can be measured again.

### 4. Recommendations
Recommendations are generated from the current Strength equipment in Supabase rather than from a hard-coded list. Previous exercise history is matched case-insensitively.

### 5. Progress charts
The strength chart discovers exercise names from historical workout data. It is no longer restricted to a fixed list of six exercises or dependent on the current equipment table being populated.

### 6. Local cache
Revision 3 uses `myFitnessTracker_v3_cache` and a new service-worker cache name `fitness-tracker-pwa-v3`.
- Existing `myFitnessTracker_v2_cache` workout data is migrated when first opened.
- Equipment is cached separately for offline use.
- Workout records remain compatible with the existing Supabase workout tables.

## Supabase equipment table

Revision 3 expects the existing table to have these columns:

- `id bigint`
- `name text`
- `type text`
- `primary_muscles text`
- `secondary_muscles text`
- `cardio_benefit text`
- `created_at timestamptz`

The app accepts `Strength`/`Cardio` capitalization and compares types case-insensitively.

**Do not create another equipment table and do not run an equipment seed script.**

### Add/Edit/Delete RLS
If the Equipment tab displays correctly but Add/Edit/Delete gives a Supabase RLS error, run `supabase_equipment_policies.sql` in Supabase SQL Editor. It does not create or seed the table.

## Deployment

1. Keep your existing `js/config.js` values.
2. Upload the contents of this folder to your GitHub Pages repository.
3. Deploy and open the app.
4. Sign in.
5. Confirm the Equipment tab displays your existing equipment.
6. Open Log Workout and confirm the Strength and Cardio selectors are populated from the catalogue.
7. Test Load Previous Session.

## Clearing Revision 3 cache

If the browser keeps showing an old/offline version:

```js
localStorage.removeItem("myFitnessTracker_v3_cache");
location.reload();
```

In Chrome DevTools you can also use Application → Storage → Clear site data and Application → Service Workers → Unregister.

## Security

Keep only the Supabase project URL and publishable/anon key in `js/config.js`. Never put a database password or `service_role`/secret key in the frontend.
