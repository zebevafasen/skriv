# Personal Vercel deployment

This setup deploys the Vite frontend and Fastify API as one Vercel project. Keeping both on one
domain avoids cross-origin cookie and API routing problems. The API runs as a Node.js Vercel
Function in Frankfurt (`fra1`), so create the PostgreSQL database in Frankfurt as well.

## 1. Import the repository

1. In Vercel, choose **Add New → Project** and import the `asterism` GitHub repository.
2. Leave **Root Directory** set to the repository root.
3. The checked-in `vercel.json` supplies the Vite build, output directory, SPA routing, API
   function, Frankfurt region, and 60-second function limit.
4. Do not deploy yet; create and connect the database first.

## 2. Add Neon Postgres

1. Open the Vercel project, choose **Storage**, and install the **Neon** Marketplace integration.
2. Create the database in AWS `eu-central-1` (Frankfurt) and connect it to this project.
3. Confirm that the integration added a pooled PostgreSQL connection string named
   `DATABASE_URL`. If Neon used another name, copy its pooled connection value into a new
   `DATABASE_URL` project variable.

Use the pooled URL for the deployed app. Keep any direct/unpooled URL available for migrations
and backups if Neon supplies one.

## 3. Configure production variables

Add these variables under **Project Settings → Environment Variables** for Production:

```text
NODE_ENV=production
WEB_ORIGIN=https://YOUR-PROJECT.vercel.app
BETTER_AUTH_URL=https://YOUR-PROJECT.vercel.app
BETTER_AUTH_SECRET=<random secret of at least 32 characters>
DEV_AUTH_BYPASS=false
INVITE_ONLY=false
AI_PROVIDER=fake
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
CREDENTIAL_ENCRYPTION_KEY=<a different random secret of at least 32 characters>
FAKE_AI_DELAY_MS=20
```

Replace `YOUR-PROJECT` with the stable production hostname shown by Vercel. Generate the two
secrets separately, for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Keep `CREDENTIAL_ENCRYPTION_KEY` backed up in a password manager. Losing or changing it makes a
saved OpenRouter key unreadable. You do not need to put an OpenRouter key in Vercel: after signing
in, save your personal key through Asterism's Settings page.

`INVITE_ONLY=false` is only for creating the first account. After registration, change it to
`true` and redeploy so additional accounts require invitations.

## 4. Apply the database migrations

Install and authenticate the Vercel CLI, then link this checkout to the project:

```bash
pnpm dlx vercel@latest login
pnpm dlx vercel@latest link
```

Run the committed migrations with the production environment without writing its secrets into
the repository:

```bash
pnpm dlx vercel@latest -- env run -e production -- pnpm db:migrate
```

Run this command before deploying any future release that contains a new file under
`packages/db/drizzle`.

## 5. Deploy and create the personal account

Deploy from the repository root:

```bash
pnpm dlx vercel@latest --prod
```

Then verify `https://YOUR-PROJECT.vercel.app/api/health`, open the site, choose **Settings** only
after creating and signing into your account, and save the OpenRouter API key. Once the account
works:

1. Set `INVITE_ONLY=true` in Vercel Production variables.
2. Redeploy the current production deployment.
3. Confirm that a signed-out visitor cannot create an account without an invitation.

## 6. Updating and backing up

Pushing to the configured production branch (normally `main`) creates a production deployment.
Before database migrations, create a Neon restore point or logical backup. Project export remains
available inside Asterism, but it is not a replacement for a database backup.

If AI generation regularly exceeds 60 seconds, move the API to a long-running Node host; Vercel's
Hobby function duration is capped at 60 seconds.
