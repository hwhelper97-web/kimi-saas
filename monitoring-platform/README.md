# 🖥️ Naxton Monitor - Internal Operations Center

Naxton Monitor is a private, owner-only PWA operations and telemetry dashboard built for **Naxton Technologies**. It enables real-time service health checks, telemetry tracking, system log metrics, and business analytics under a single custom domain on Railway.

---

## 🛠️ Technology Stack
* **Framework**: Next.js 15 (App Router)
* **Frontend**: React 19, TypeScript, Tailwind CSS, Recharts, Framer Motion
* **Database**: Prisma Client with PostgreSQL
* **Security**: Google OAuth via Auth.js (NextAuth v5)
* **Hosting**: Railway Deployment

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the root of the `monitoring-platform/` folder (use `.env.example` as a template):

```bash
# 🖥️ System Settings
PORT=3000
NEXT_PUBLIC_APP_URL=https://naxtontechnologies.com

# 🗄️ Database Setup (Prisma/PostgreSQL)
DATABASE_URL="postgresql://username:password@hostname:port/dbname?schema=public"

# 🔑 Authentication (NextAuth / Auth.js)
AUTH_SECRET="your-generated-secret-key"
GOOGLE_CLIENT_ID="google-client-id-here"
GOOGLE_CLIENT_SECRET="google-client-secret-here"
APPROVED_ADMIN_EMAILS="owner@naxtontechnologies.com"

# 🤖 AI Platform Configuration
OPENAI_API_KEY="sk-proj-..."

# 📞 Telephony & Voice Configuration
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="your-twilio-token"
TWILIO_WHATSAPP_FROM="+14155238886"

# ☁️ Infrastructure (Railway)
RAILWAY_API_TOKEN="railway-api-token"
RAILWAY_PROJECT_ID="railway-project-id"

# 📢 Alert Notifications
RESEND_API_KEY="re_..."
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
TELEGRAM_CHAT_ID="your-telegram-chat-id-or-group-id"
```

---

## 🚀 Local Installation & Run

1. **Navigate to Directory**:
   ```bash
   cd monitoring-platform
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Database Client Generation**:
   ```bash
   npx prisma generate
   ```

4. **Run Database Migrations**:
   ```bash
   npx prisma db push
   ```

5. **Start Dev Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🔒 Google OAuth Configuration (Owner-Only Auth)
1. Go to the **Google Cloud Console**.
2. Create or select a project.
3. Configure the **OAuth Consent Screen** (Internal / Testing mode).
4. Go to **Credentials** -> **Create Credentials** -> **OAuth Client ID**.
5. Set application type to **Web Application**.
6. Set Authorized JavaScript Origins:
   * `http://localhost:3000`
   * `https://naxtontechnologies.com`
7. Set Authorized Redirect URIs:
   * `http://localhost:3000/api/auth/callback/google`
   * `https://naxtontechnologies.com/api/auth/callback/google`
8. Copy the generated **Client ID** and **Client Secret** into your `.env` file.
9. Verify that `APPROVED_ADMIN_EMAILS` contains only the approved Google emails to lock down access.

---

## 📱 Progressive Web App (PWA) Features
* **Installable**: The app manifest configures `/admin` as the start URL. Visitors on Chrome (Android) or Safari (iOS "Add to Home Screen") will be prompted to install it as a standalone app.
* **Offline Caching**: The background service worker (`sw.js`) caches layout components and page shell dependencies for instant, zero-delay load times even with spotty connectivity.

---

## ☁️ Deploying to Railway

To deploy this platform under your single custom domain `naxtontechnologies.com` on Railway:

1. **Railway Project Setup**:
   Create a new Next.js service on Railway pointing to this repository path.
2. **Setup Custom Domain**:
   Bind `naxtontechnologies.com` to the Next.js service in the Railway domain settings tab.
3. **Configure Environment Variables**:
   Load all variables from `.env` into Railway Service Variables settings.
4. **Build Script Execution**:
   Railway will automatically pick up the `build` script from `package.json`, trigger `prisma generate`, compile the TypeScript application, and serve it on port `3000`.
