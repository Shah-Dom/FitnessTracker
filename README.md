# Fitness Tracker — Supabase + GitHub Pages PWA

## Files

```text
FitnessTracker/
├── index.html
├── manifest.json
├── sw.js
├── README.md
├── css/
│   └── style.css
├── js/
│   ├── config.js
│   ├── supabase.js
│   ├── storage.js
│   └── app.js
└── icons/
    ├── icon-180.png
    ├── icon-192.png
    └── icon-512.png
```

## 1. Configure Supabase

Open `js/config.js`.

Replace:

```js
window.SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
window.SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";
```

with your Supabase Project URL and Publishable key.

Get them from:

**Supabase → Project Settings → API**

Do NOT put a database password or `service_role`/secret key into this file.

## 2. Supabase authentication

Email authentication should be enabled.

Set:

**Site URL**
`https://shah-dom.github.io/FitnessTracker/`

and add the same address under allowed redirect URLs.

## 3. Deploy

Upload the contents of this folder to the root of your existing GitHub repository:

`https://github.com/shah-dom/FitnessTracker`

GitHub Pages should then serve:

`https://shah-dom.github.io/FitnessTracker/`

## 4. First login and migration

The first time you sign in:

- If your Supabase account has no workouts but this browser still has the old localStorage data, the app asks whether you want to import it.
- If you accept, your existing local workouts are uploaded to Supabase.
- After that, the cloud database becomes the shared source of truth.
- The browser keeps a local cache for offline viewing.

## 5. Multi-device use

On PC and phone:

1. Open the GitHub Pages app.
2. Sign in with the same account.
3. Both devices will load the same Supabase workouts.

## 6. Offline behavior

A workout can be saved to the local cache if the cloud request fails. The current version does not yet implement a full background upload queue for offline-created workouts; that is a planned next improvement.

## Security

The database uses Row Level Security. Every cloud row is associated with the authenticated user's `user_id`, and the policies created in the previous SQL step restrict access to that user's rows.
