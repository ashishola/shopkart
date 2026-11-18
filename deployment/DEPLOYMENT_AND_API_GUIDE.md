# SHOPKART — Architecture, API & Deployment Guide

## 1. Environment Variables
Copy `.env.example` to `.env` and set production secrets before deploying:
- `PORT=3000`
- `NODE_ENV=production`
- `JWT_SECRET` (64-character random string)
- `PAYMENT_ENCRYPTION_KEY` (32+ character key for AES-256-GCM credential encryption)
- `MONGODB_URI` (MongoDB Atlas SRV string for cloud persistence)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

## 2. Default Accounts (Change Immediately in Production)
- **Super Admin**: `admin@shopkart.in` / `Admin@1234` (Can manage Razorpay keys, UPI QRs, COD, rollback, and Admin Users)
- **Customer**: `customer@shopkart.in` / `Shop@1234`

## 3. Payment Account Switching (Zero Code Edits)
1. Sign in to **Admin Panel** -> **Razorpay Accounts**.
2. Add multiple Razorpay accounts (Key ID + Secret Key + Webhook Secret). Secrets are encrypted via AES-256-GCM on the server and never returned in public APIs.
3. Click **Test Connection** to verify gateway authentication, then click **Activate** on Account 1, 2, or 3.
4. Go to **Payment Settings** to switch between `multiple`, `razorpay`, `upi_qr`, or `cod`, or click **Rollback Previous Config**.
5. Historical orders keep an immutable snapshot of their `paymentAccountId` and `paymentAccountLabel`.
6. Manual **UPI QR** payments remain in `pending_verification` until an authorized Admin verifies the 12-digit UTR under **Admin Panel -> Payments**.

## 4. Core REST API Endpoints
- `GET /api/storefront` — Banners, categories, products, approved reviews, store settings
- `GET /api/products` — Filterable & sortable product search
- `GET /api/payment-options` — Public safe active gateway metadata (no secrets)
- `POST /api/customer/auth/register` & `/login` & `/verify-email` & `/forgot-password` & `/reset-password`
- `POST /api/payments/create-order` — Server-side price/GST/shipping/coupon calculation & order creation
- `POST /api/payments/verify` — Strict HMAC-SHA256 signature verification & atomic stock decrement
- `POST /api/payments/webhook` — `X-Razorpay-Signature` verified webhook handler
- `GET /api/admin/overview`, `/products`, `/orders`, `/payments`, `/payment-settings`, `/audit-logs`
- `PUT /api/admin/payment-settings/active` & `POST /api/admin/payment-settings/rollback` (Super Admin only)

## 5. Production Build & Hosting
- **Build**: `npm run build` (outputs optimized Vite SPA to `dist/`)
- **Start Full-Stack Node Server**: `npm run start` (`NODE_ENV=production tsx server.ts`)
- Deploy `dist/` to **Vercel** (pointing `/api/*` rewrites to your Render Node.js service) or deploy the unified Express + Vite bundle directly to **Render** on port `3000`.
