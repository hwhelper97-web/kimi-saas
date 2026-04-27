# 🏗️ Kimi AI — System Architecture Document

---

## 1. 🧠 Overview

Kimi AI is a **multi-tenant SaaS platform** that provides AI-powered voice agents for businesses.

The system enables:

* Automated phone call handling
* Appointment booking
* Order processing (future)
* Real-time dashboard monitoring

---

## 2. 🧱 High-Level Architecture

```
Customer Call
     ↓
📞 Twilio Voice API
     ↓
🎙️ WebSocket (Media Stream)
     ↓
🧠 Deepgram (Speech-to-Text)
     ↓
🤖 AI Engine (Rule-based → GPT in future)
     ↓
🗣️ Twilio Voice Response (TwiML)
     ↓
📊 Dashboard (Socket.IO real-time updates)
     ↓
🗄️ Database (Prisma + PostgreSQL)
```

---

## 3. 🧩 Core Components

---

### 3.1 📞 Twilio Voice Layer

Handles:

* Incoming calls
* Speech input (via `<Gather>`)
* Call routing to backend

**Key Routes:**

* `/api/call/incoming`
* `/api/call/process`

---

### 3.2 🧠 AI Processing Layer

Current:

* Rule-based conversation flow

Future:

* OpenAI GPT integration
* Context-aware responses
* Intent detection

Handles:

* Date extraction
* Time parsing
* Service detection
* Name capture

---

### 3.3 🎙️ Speech Processing (Deepgram)

* Converts voice → text
* Streams real-time transcription
* Feeds AI engine

---

### 3.4 ⚙️ Backend (Node.js + Express)

Responsibilities:

* API routing
* Business logic
* Authentication (JWT)
* Multi-tenant handling
* Socket.IO server

---

### 3.5 🗄️ Database Layer (Prisma + PostgreSQL)

Core Models:

#### Tenant

* id
* name

#### User

* id
* email
* role
* tenantId

#### Business

* id
* name
* type (ORDER / APPOINTMENT)
* phoneNumber
* tenantId

#### Appointment

* id
* customerName
* serviceName
* date
* businessId
* tenantId

---

### 3.6 🔄 Real-Time Layer (Socket.IO)

Used for:

* Live transcripts
* New appointment notifications
* Dashboard updates

Rooms:

```
businessId → socket room
```

---

### 3.7 🖥️ Admin Dashboard

(Current: EJS)

Features:

* Business switcher
* Live call view
* Appointment list
* Analytics (basic)

Future:

* React/Next.js migration
* Advanced charts
* Filters & insights

---

## 4. 🔐 Authentication & Security

* JWT-based authentication
* Middleware:

  * `auth.middleware`
  * `tenant.middleware`
  * `role.middleware`

---

## 5. 🧭 Request Flow (CALL)

### 📞 Incoming Call

```
User calls number
→ Twilio hits /api/call/incoming
→ Backend finds business via phoneNumber
→ Session initialized
→ Twilio <Gather> starts conversation
```

---

### 🧠 Conversation Loop

```
User speaks
→ /api/call/process
→ AI processes step
→ Stores session data
→ Returns TwiML response
→ Repeat until complete
```

---

### 💾 Final Step

```
Data collected
→ Save to DB (Prisma)
→ Emit Socket.IO event
→ Dashboard updates instantly
```

---

## 6. 🧠 Session Handling (Current)

```
let session = {}
```

Stores:

* step
* date
* time
* service
* name
* businessId

⚠️ Limitation:

* Not scalable (shared across users)

---

## 7. ⚠️ Current Limitations

### ❌ Session System

* Global object (not per call)
* Will break with multiple concurrent calls

### ❌ Rule-Based AI

* Limited flexibility
* Robotic responses

### ❌ Twilio Flow

* Basic retry logic
* Needs smarter fallback handling

---

## 8. 🚀 Future Architecture Improvements

---

### 8.1 🧠 GPT AI Engine

Replace rule-based flow with:

* OpenAI GPT
* Context memory
* Natural language understanding

---

### 8.2 📦 Call Session Store

Replace:

```
let session = {}
```

With:

* Redis (recommended)
* or DB-backed sessions

---

### 8.3 📞 Multi-Number Routing

* Each business gets unique Twilio number
* Dynamic routing via DB

---

### 8.4 📊 Advanced Analytics

* Call success rate
* Revenue tracking
* Conversion metrics

---

### 8.5 🖥️ Frontend Upgrade

* Move to Next.js
* Real-time charts
* Better UX

---

## 9. 🧱 Deployment Architecture (Future)

```
Frontend (Vercel)
Backend (Node.js API)
Database (PostgreSQL - Neon / AWS RDS)
Redis (Session store)
Twilio (Voice)
Deepgram (STT)
OpenAI (AI Brain)
```

---

## 10. 🎯 System Goals

* Handle thousands of businesses
* Real-time AI responses
* Human-like voice interaction
* Zero manual call handling

---

## 11. 🏁 Summary

Kimi AI is evolving from:
👉 Rule-based call bot
➡️ Into
👉 Fully autonomous AI receptionist system

---
