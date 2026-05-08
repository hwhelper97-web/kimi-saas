# Nexton AI - Multi-Tenant Voice SaaS

This is a premium, real-time AI Voice SaaS platform designed for Restaurants and Appointment-based businesses.

## 🚀 Deployment Instructions

### 1. GitHub Setup
- Initialize a new repository on GitHub.
- Run:
  ```bash
  git init
  git add .
  git commit -m "initial commit"
  git branch -M main
  git remote add origin YOUR_GITHUB_REPO_URL
  git push -u origin main
  ```

### 2. Vercel Deployment (Important)
Vercel is great for the **API and Dashboard**, but it has limitations for real-time voice:
- **WebSockets**: Socket.io may require a persistent server like **Railway.app** or **Render.com** to handle the live voice streams perfectly.
- **Database**: You MUST replace SQLite with a hosted PostgreSQL database (e.g., **Neon.tech** or **Supabase**) by updating the `DATABASE_URL` in your Vercel Environment Variables.

### 3. Required Environment Variables
Add these to your Vercel Project Settings:
- `DATABASE_URL`: Your PostgreSQL connection string.
- `JWT_SECRET`: A long random string.
- `TWILIO_ACCOUNT_SID`: From Twilio Console.
- `TWILIO_AUTH_TOKEN`: From Twilio Console.
- `ELEVENLABS_API_KEY`: From ElevenLabs Profile.
- `OPENAI_API_KEY`: From OpenAI Dashboard.
- `BASE_URL`: Your Vercel deployment URL (e.g., `https://your-app.vercel.app`).

### 4. Prisma Sync
During deployment, the `vercel-build` script will automatically run `prisma generate` and `prisma db push` to set up your database schema.

---
Built with ❤️ by Nexton AI.
