# ShahiPosh — Premium Clothing Brand Website

A production-ready fashion e-commerce codebase featuring a luxury dark UI, Next.js App Router storefront, Express + Prisma backend, and admin dashboard workflows.

## Tech Stack
- **Frontend:** Next.js 14 (App Router), Tailwind CSS, Framer Motion
- **Backend:** Node.js + Express REST API
- **Database:** PostgreSQL with Prisma ORM
- **Admin:** Authentication, product management, order management

## Features
- Animated premium hero section and micro-interactions
- Responsive product grid with hover effects
- Full pages: Home, Shop, Product Details, Cart & Checkout, About, Contact
- Admin routes: login, products CRUD UI scaffold, orders dashboard
- REST APIs for products and orders
- Image upload support via Multer
- Secure protected endpoints with JWT middleware
- SEO metadata configured in layout
- Environment-variable driven configuration

## Folder Structure

```bash
.
├── frontend/               # Next.js app for storefront + admin UI
│   ├── app/
│   ├── components/
│   └── lib/
├── backend/                # Express API + Prisma
│   ├── prisma/
│   └── src/
└── README.md
```

## Local Setup

### 1) Install dependencies
```bash
npm install
npm install --prefix frontend
npm install --prefix backend
```

### 2) Configure environment variables
```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

### 3) Prepare database
```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
```

### 4) Run in development
```bash
npm run dev
```
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

## API Endpoints

### Auth
- `POST /api/auth/login`

### Products
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products` (protected + image upload)
- `PUT /api/products/:id` (protected + image upload)
- `DELETE /api/products/:id` (protected)

### Orders
- `POST /api/orders`
- `GET /api/orders` (protected)
- `PATCH /api/orders/:id/status` (protected)

## Deploy

### Frontend (Vercel)
- Import repo into Vercel
- Set project root as `frontend`
- Add `NEXT_PUBLIC_API_URL` env variable pointing to backend URL

### Backend
- Deploy to Render/Railway/Fly.io
- Set `DATABASE_URL`, `JWT_SECRET`, and `PORT`
- Run `prisma migrate deploy`

## Notes
- For production image uploads, replace local disk storage with S3/Cloudinary.
- Admin UI pages are included and connected structurally; wire login/session state for full workflow.
