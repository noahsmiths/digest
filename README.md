# Digest

This is a [Convex](https://convex.dev/) project created with [`npm create convex`](https://www.npmjs.com/package/create-convex).

After the initial setup (<2 minutes) you'll have a working full-stack app using:

- Convex as your backend (database, server logic)
- [React](https://react.dev/) as your frontend (web page interactivity)
- [Vite](https://vite.dev/) for optimized web hosting
- [Tailwind](https://tailwindcss.com/) for building great looking accessible UI
- [Convex Auth v2](https://auth-v2.previews.convex.dev/) for email/password and GitHub authentication

## Get started

If you just cloned this codebase and didn't use `npm create convex`, run:

```
npm install
npm run dev
```

Copy `.env.local.example` to `.env.local` and set `VITE_CONVEX_URL` to your Convex deployment URL.

GitHub sign-in additionally requires a GitHub OAuth app whose callback URL is
`<CONVEX_SITE_URL>/oauth/github/callback`, plus `AUTH_GITHUB_CLIENT_ID` and
`AUTH_GITHUB_CLIENT_SECRET` in the Convex deployment environment.

## Client-side routes and static hosting

The app uses React Router's browser-history router: `/` is the landing page
(or redirects signed-in users to their digest or connection settings), `/digest`
opens the latest digest, `/digest/:digestId` opens a saved digest, and `/settings`
opens settings. Signed-out visitors retain their requested path through sign-in.
Old `?page=...` and `?digest=...` links are intentionally no longer supported.

Build with `npm run build` and statically serve `dist/`. No rendering server is
needed. The static host must serve `index.html` for unmatched paths without
changing the URL, while serving existing assets normally. This enables direct
links and refreshes. `public/_redirects` supplies this SPA fallback for hosts
such as Netlify and Cloudflare Pages; configure the equivalent rewrite on other
hosts. See [React Router's client-side setup](https://reactrouter.com/start/declarative/installation).

For a subdirectory deployment, set Vite's `base` to that directory and set
`DIGEST_APP_URL` to the same public app base URL. The router uses Vite's base;
digest email links preserve the app's base path.

## Digest email

Digest completion queues a compact email through AgentMail, with a link to the
full digest in the web app. Configure the AgentMail API key, a sending inbox,
and the public URL where this app is hosted:

```
npx convex env set AGENTMAIL_API_KEY <agentmail-api-key>
npx convex env set AGENTMAIL_INBOX_ID <agentmail-inbox-id>
npx convex env set DIGEST_APP_URL https://your-digest-app.example
```

### Update preferences by replying

Users can reply to a digest with directives such as “Add a Music section for new
releases from friends” or “Only include local events.” An agent edits their
category rules and replies with a brief summary of the changes. Delivery settings,
shared classification instructions, and Drop rules are not configurable by email.
Changes apply to future digests; existing digest snapshots remain unchanged.

After pushing the backend, enable incoming replies on your development deployment:

```
npm run email:setup-replies
```

This creates or reuses an inbox-scoped AgentMail webhook for `message.received`
at `<CONVEX_SITE_URL>/webhooks/agentmail` and saves its signing secret as
`AGENTMAIL_WEBHOOK_SECRET`, without printing credentials, then refreshes the
development backend so its typed environment binding picks up the secret. The script deliberately
refuses production. To configure another deployment, create an inbox-scoped
webhook in AgentMail with that URL/event and set its signing secret in that
deployment and redeploy to refresh its environment bindings. An unset secret
makes the endpoint fail closed with HTTP 503.

The handler verifies [AgentMail's Svix signatures](https://docs.agentmail.to/webhook-verification),
matches reply references to a sent digest, and requires the sender to match both
the original recipient and the user's current account email. Spam, unauthenticated
events, and automatic replies are ignored. A durable workflow hydrates the new
reply text, runs the preference agent, checks for concurrent settings edits, and
sends an idempotent confirmation only to the verified sender. Repeated webhook
deliveries cannot apply the same change twice.

## Learn more

To learn more about developing your project with Convex, check out:

- The [Tour of Convex](https://docs.convex.dev/get-started) for a thorough introduction to Convex principles.
- The rest of [Convex docs](https://docs.convex.dev/) to learn about all Convex features.
- [Stack](https://stack.convex.dev/) for in-depth articles on advanced topics.

## Join the community

Join thousands of developers building full-stack apps with Convex:

- Join the [Convex Discord community](https://convex.dev/community) to get help in real-time.
- Follow [Convex on GitHub](https://github.com/get-convex/), star and contribute to the open-source implementation of Convex.
