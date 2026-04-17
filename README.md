# AI Voice SaaS (Appointment + Order)

## Folder Structure

- `backend/`: Express + Prisma + PostgreSQL + Twilio/OpenAI orchestration
- `frontend/`: React + TypeScript + Zustand + Tailwind UI

## Backend Setup

1. `cd backend`
2. Copy env:
   - `DATABASE_URL=postgresql://...`
   - `JWT_SECRET=...`
   - `OPENAI_API_KEY=...`
   - `TWILIO_ACCOUNT_SID=...`
   - `TWILIO_AUTH_TOKEN=...`
   - `TWILIO_PHONE_NUMBER=...`
3. Install: `npm install`
4. `npx prisma migrate dev`
5. Seed demo businesses/users: `npm run prisma:seed`
6. `npm run dev`

## Frontend Setup

1. `cd frontend`
2. `npm install`
3. `echo "VITE_API_URL=http://localhost:5000/api" > .env`
4. `npm run dev`

## API Examples

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Appointment APIs

- `POST /api/appointments`
- `GET /api/appointments/availability`
- `POST /api/appointments/slots`

### Order APIs

- `GET /api/order/menus`
- `POST /api/order/menus`
- `POST /api/order/orders`

## Twilio Voice Webhooks

Set webhook URL for number to:
- `POST /api/voice/inbound`
- gather callback: `POST /api/voice/gather`

Supports business-specific conversational behavior via `businessType`.

## Local Test Accounts (created by seed)

Run `cd backend && npm run prisma:seed` to upsert:

### Appointment businesses
- **Kimi Dental Studio** (`APPOINTMENT`)
  - Owner: `owner.appointment@kimi-saas.local` / `KimiApp!2026`
  - Admin: `admin@kimi-saas.local` / `KimiAdmin!2026`
- **Kimi Wellness Clinic** (`APPOINTMENT`)
  - Owner: `owner.clinic@kimi-saas.local` / `KimiClinic!2026`

### Order businesses
- **Kimi Burger House** (`ORDER`)
  - Owner: `owner.order@kimi-saas.local` / `KimiOrder!2026`
- **Kimi Pizza Express** (`ORDER`)
  - Owner: `owner.pizza@kimi-saas.local` / `KimiPizza!2026`
