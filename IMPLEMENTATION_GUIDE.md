# Implementation Guide: Deploying Your Own Robin Cloud Stack

This guide walks you through provisioning and deploying a personal instance of the Robin Cloud memory/dashboard stack, assuming you already have accounts with the required services.

## Overview

Robin Cloud consists of:
- **Next.js 13 (App Router)** – UI and API routes
- **Clerk** – Authentication
- **Supabase** – Postgres database (`memory_events` table) + Auth (anon key for public reads, service role for server)
- **Pinecone** – Vector store for semantic search
- **Resend** – Transactional email (optional)
- **Upstash Redis** – Lightweight server‑side cache
- **OpenAI** – Optional LLM helpers
- **Vercel** – Hosting, serverless functions, CI/CD
- **1Password** – Secure storage for the admin token used by Hermes/OpenClaw wrappers

All secrets must remain **server‑only**. Never expose them to the browser.

## Prerequisites

You need active accounts (or free tiers) for:
- [Vercel](https://vercel.com)
- [Supabase](https://supabase.com)
- [Pinecone](https://pinecone.io)
- [Clerk](https://clerk.com)
- [Resend](https://resend.com) (optional but recommended for email)
- [Upstash](https://upstash.com) (Redis)
- [OpenAI](https://openai.com) (optional)
- A password manager (we use 1Password, but any secure vault works)

You also need:
- Git
- Node.js ≥18
- npm or yarn or pnpm

## Step 1: Fork / Clone the Repository

```bash
git clone git@github.com:YOUR_USERNAME/robin-cloud.git
cd robin-cloud
```

If you don’t have a fork, create one on GitHub first, then clone your fork.

## Step 2: Provision the Services

### 2.1 Supabase
1. Create a new project.
2. Note the **Project URL** and the **anon public key** (you’ll need these for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. Go to **Settings → API** and copy the **service_role key** (this is `SUPABASE_SERVICE_ROLE_KEY`).
4. Enable **Row Level Security** on the `public.memory_events` table (it is on by default).  
   The table schema is supplied in `supabase/schema.sql` (if present) or you can run the migration later.

### 2.2 Pinecone
1. Create an index named `robin-memory-events-1024` (or another name; you’ll set `PINECONE_INDEX_NAME` accordingly).
   - Dimension: `1024`
   - Metric: Cosine
   - Model: `llama-text-embed-v2` (you’ll set `PINECONE_EMBEDDING_MODEL`)
2. Copy your **API key** (`PINECONE_API_KEY`).

### 2.3 Clerk
1. Create an application.
2. From the Clerk dashboard, copy:
   - **Publishable Key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (if you want to use Clerk’s Next.js helpers; the dashboard currently relies on session via cookies, but you may need it for custom auth).
   - **Secret Key** → `CLERK_SECRET_KEY` (if you need backend calls; the current app uses session cookies from the browser, so you may not need this unless you extend the API).
   However the current Robin Cloud code does **not** directly call Clerk’s backend; it relies on the browser sending the session cookie. So you may not need to expose Clerk secrets to the Node backend unless you add custom endpoints that verify the session server‑side. For now you can leave Clerk keys out of `.env` and rely on the cookie flow.
   - For safety, you can still add:
     ```
     NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
     CLERK_SECRET_KEY=
     ```
   If you do not use them, the app will still work as long as the frontend can reach Clerk.

### 2.4 Resend (optional)
1. Create an API key.
2. Set `RESEND_API_KEY`.

### 2.5 Upstash Redis
1. Create a Redis database.
2. Copy the **REST URL** and **REST Token**.
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 2.6 OpenAI (optional)
1. Create an API key.
2. Set `OPENAI_API_KEY`.

### 2.7 Admin Token for Hermes/OpenClaw
You need a long‑lived random string that will be used as a bearer token for protected routes (`/api/admin/*`).
- Generate a secure token, e.g.:
  ```bash
  openssl rand -base64 32
  ```
- Store this token in your password manager (we put it in 1Password under **Robin Vault → Robin Cloud Vercel App Admin Token**).
- You will set `ADMIN_TASK_TOKEN` to this value.

## Step 3: Create the Environment File

Create a file named `.env.local` in the repository root (this file is ignored by git).

Fill it with the values you collected:

```env
# Next.js
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
# (optional) if you use Clerk’s helpers
# NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
# NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Supabase (server‑only)
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-key

# Pinecone (server‑only)
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=robin-memory-events-1024
PINECONE_EMBEDDING_MODEL=llama-text-embed-v2

# Resend (server‑only, optional)
RESEND_API_KEY=re_...

# Upstash Redis (server‑only)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# OpenAI (server‑only, optional)
OPENAI_API_KEY=sk-...

# Admin token for protected routes (server‑only)
ADMIN_TASK_TOKEN=your-long-random-string-here
```

> **Never** commit `.env.local`. Never share it. Never log its contents.

## Step 4: Install Dependencies

```bash
npm install
```

## Step 5: Test Locally

Start the development server:

```bash
npm run dev
```

Open <http://localhost:3000>. You should see the Robin Cloud dashboard sign‑in page (via Clerk). Sign in with a Clerk‑created email/password or social provider.

Once signed in:
- Try creating a memory via the “New Memory” button (if available) – it should call `/api/dashboard/memory-events` (protected by Clerk session).
- Try the search box – it should call `/api/search-memory`.
- Open the browser devtools Network tab and verify that **no** request contains your Supabase service role, Pinecone key, etc. (they are only used in server‑side API routes).

### 5.1 Test Admin Routes (Optional)
You can test the protected admin routes with `curl` using the admin token:

```bash
ADMIN_TOKEN=$(op read "op://Robin Vault/Robin Cloud Vercel App Admin Token/credential")
curl -s -X POST http://localhost:3000/api/admin/memory-events \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"test","kind":"decision","summary":"Test decision from implementation guide"}'
```

You should receive a JSON response with the created event.

## Step 6: Prepare for Vercel Deployment

Vercel will automatically read environment variables from the **Project Settings → Environment Variables** UI.  
You need to add the following variables (choose **Environment** for all, unless marked otherwise):

| Variable | Environment | Notes |
|----------|-------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Preview, Production | **public** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview, Production | **public** |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Preview, Production | **public** (if you added it) |
| `SUPABASE_URL` | Preview, Production | **secret** |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview, Production | **secret** |
| `PINECONE_API_KEY` | Preview, Production | **secret** |
| `PINECONE_INDEX_NAME` | Preview, Production | (not secret) |
| `PINECONE_EMBEDDING_MODEL` | Preview, Production | (not secret) |
| `RESEND_API_KEY` | Preview, Production | **secret** (optional) |
| `UPSTASH_REDIS_REST_URL` | Preview, Production | (not secret) |
| `UPSTASH_REDIS_REST_TOKEN` | Preview, Production | **secret** |
| `OPENAI_API_KEY` | Preview, Production | **secret** (optional) |
| `ADMIN_TASK_TOKEN` | Preview, Production | **secret** |
| (Optional) `CLERK_SECRET_KEY` | Preview, Production | **secret** if you need it |

Add each variable with its corresponding value from `.env.local`.

> In Vercel’s UI, mark the toggle for **Environment Variable** (not **Expose to Browser**) for all variables **except** those starting with `NEXT_PUBLIC_`. Those **must** be exposed to the browser, so leave the toggle **on** for them (Vercel calls this “Expose to Browser”).

## Step 7: Push to GitHub and Trigger Deployment

```bash
git add .
git commit -m "chore: add environment prep for Vercel"
git push origin main   # or your default branch
```

Vercel will detect the push, install dependencies, build the project, and deploy.

Visit your Vercel project’s **Deployments** tab to see the build logs. If the deploy fails, check:
- Missing environment variables
- Typos in variable names
- The build step (`next build`) output
- The runtime logs for any API‑route errors

## Step 8: Post‑Deploy Verification

After a successful deploy:
1. Visit your deployed URL (e.g., `https://your-project.vercel.app`).
2. Sign in via Clerk.
3. Try creating a memory and searching.
4. (Optional) Test an admin route with `curl` using the production URL and your `ADMIN_TASK_TOKEN`.

## Step 9: Ongoing Maintenance

- **Secrets Rotation**: If you ever need to rotate a key, update the value in both your password manager and Vercel (or `.env.local` for local dev), then redeploy.
- **Database Migrations**: If the schema changes, apply the migration via Supabase’s SQL editor or the Vercel‑connected CLI.
- **Pinecone Index**: Remember that archived memories remove their vectors from Pinecone; restored memories re‑embed them. No manual cleanup needed.
- **Logs**: Use Vercel’s Log Drains or the built‑in **Logs** tab to inspect runtime errors.

## Where Obsidian Fits

Robin Cloud is for compact, high‑signal memory events (decisions, deployments, errors/fixes, milestones, handoffs, system facts).  
For long‑form notes, plans, research, runbooks, and narrative context, use your Obsidian vault at `/home/caretaker/Obsidian/RobinVault` (or any path you prefer).  
When an Obsidian note becomes a durable decision, etc., summarize it into Robin Cloud via the memory‑capture wrapper (`npm run memory:capture`).

--- 

*This guide assumes you already have service accounts. Adjust variable names if you chose different ones in your services. Keep your secrets server‑only and never expose them to the browser.* 