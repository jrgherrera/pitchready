# PITCHREADY

Admin dashboard, match scheduling, and player registration for PITCHREADY soccer leagues, with real-time Firestore syncing and Firebase Authentication.

React 19 + TypeScript + Vite, Tailwind CSS v4, Firebase (Auth + Firestore), deployed to Firebase Hosting.

## Prerequisites

- Node.js 26.5.0 and npm 11.17.0 (see `engines` in [package.json](package.json))
- A Firebase project with Google auth enabled

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy [.env.example](.env.example) to `.env` and fill in your Firebase web app config (Firebase Console → Project settings).
3. Start the dev server on http://localhost:3000:
   ```bash
   npm run dev
   ```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Type-check with `tsc --noEmit` |
| `npm run clean` | Remove `dist/` and `server.js` |
| `npm run deploy:hosting` | Build and deploy to Firebase Hosting (`pitchready-soccer`) |

## Firebase setup

- Enable the Google auth provider and add your authorized domains (including `localhost`).
- Deploy the security rules in [firestore.rules](firestore.rules) before using the app against a real project.

## Deploys

Pushes to `main` (including merged PRs) build and deploy to Firebase Hosting via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). Two repo secrets are required:

- `ENV_FILE` — the full contents of your `.env`, pasted as one secret
- `FIREBASE_SERVICE_ACCOUNT` — service account JSON with the Firebase Hosting Admin role

## Project layout

```
src/
  components/   shared UI and layout
  features/     auth, matches, players, settings
  lib/          firebase and ai clients
  i18n/         translation messages
  data/  types/  utils/
```
