import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb, saveDb } from '../db.ts';
import type { CheckoutPaymentOptionsResponse } from '../../src/types.ts';

export const publicRouter = Router();

publicRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'shopkart-api', timestamp: new Date().toISOString() });
});

publicRouter.get('/storefront', (_req, res) => {
  const db = getDb();
  const activeProducts = db.products.filter((p) => p.isActive);
  const categories = db.categories
    .filter((c) => c.isActive)
    .map((c) => ({
      ...c,
      productCount: activeProducts.filter((p) => p.categoryId === c.id).length,
    }));
  const approvedReviews = db.reviews.filter((r) => r.isApproved);
  res.json({
    settings: db.settings,
    banners: db.banners.filter((b) => b.isActive),
    categories,
    products: activeProducts,
    reviews: approvedReviews.slice(0, 12),
  });
});

publicRouter.get('/products', (req, res) => {
  const db = getDb();
  let list = db.products.filter((p) => p.isActive);
  const { q, category, tag, sort, minPrice, maxPrice } = req.query;

  if (typeof q === 'string' && q.trim()) {
    const query = q.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query) ||
        p.categoryName.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
    );
  }
  if (typeof category === 'string' && category !== 'all') {
    list = list.filter((p) => p.categoryId === category || p.categoryName === category);
  }
  if (typeof tag === 'string' && tag !== 'all') {
    list = list.filter((p) => p.tags.includes(tag as any));
  }
  if (typeof minPrice === 'string' && !Number.isNaN(Number(minPrice))) {
    list = list.filter((p) => p.discountedPrice >= Number(minPrice));
  }
  if (typeof maxPrice === 'string' && !Number.isNaN(Number(maxPrice))) {
    list = list.filter((p) => p.discountedPrice <= Number(maxPrice));
  }

  if (sort === 'price_asc') {
    list = [...list].sort((a, b) => a.discountedPrice - b.discountedPrice);
  } else if (sort === 'price_desc') {
    list = [...list].sort((a, b) => b.discountedPrice - a.discountedPrice);
  } else if (sort === 'rating') {
    list = [...list].sort((a, b) => b.rating - a.rating);
  } else if (sort === 'discount') {
    list = [...list].sort((a, b) => b.discountPercent - a.discountPercent);
  }

  res.json({ products: list });
});

publicRouter.get('/products/:id', (req, res) => {
  const db = getDb();
  const product = db.products.find(
    (p) => p.id === req.params.id || p.slug === req.params.id
  );
  if (!product) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }
  const reviews = db.reviews.filter(
    (r) => r.productId === product.id && r.isApproved
  );
  res.json({ product, reviews });
});

publicRouter.get('/categories', (_req, res) => {
  const db = getDb();
  const activeProducts = db.products.filter((p) => p.isActive);
  const categories = db.categories
    .filter((c) => c.isActive)
    .map((c) => ({
      ...c,
      productCount: activeProducts.filter((p) => p.categoryId === c.id).length,
    }));
  res.json({ categories });
});

publicRouter.post('/coupons/validate', (req, res) => {
  const db = getDb();
  const { code, subtotal } = req.body as { code?: string; subtotal?: number };
  if (!code || typeof subtotal !== 'number') {
    res.status(400).json({ error: 'Coupon code and subtotal are required.' });
    return;
  }
  const coupon = db.coupons.find(
    (c) => c.code.toUpperCase() === code.trim().toUpperCase() && c.isActive
  );
  if (!coupon) {
    res.status(404).json({ error: 'Invalid or inactive coupon code.' });
    return;
  }
  if (new Date(coupon.expiryDate).getTime() < Date.now()) {
    res.status(400).json({ error: 'This coupon has expired.' });
    return;
  }
  if (subtotal < coupon.minOrderValue) {
    res.status(400).json({
      error: `Minimum order value of ₹${coupon.minOrderValue.toLocaleString('en-IN')} required for ${coupon.code}.`,
    });
    return;
  }
  let discount =
    coupon.type === 'percentage'
      ? Math.round((subtotal * coupon.value) / 100)
      : coupon.value;
  if (coupon.maxDiscount && discount > coupon.maxDiscount) {
    discount = coupon.maxDiscount;
  }
  discount = Math.min(discount, subtotal);
  res.json({
    valid: true,
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discountAmount: discount,
    },
  });
});

// Publicly exposes ONLY safe payment options (never secret keys or bank secrets)
publicRouter.get('/payment-options', (_req, res) => {
  const db = getDb();
  const cfg = db.paymentConfig;
  const rzpAcc =
    db.razorpayAccounts.find(
      (a) => a.id === cfg.activeRazorpayAccountId && a.isActive
    ) || db.razorpayAccounts.find((a) => a.isActive);

  const upiAcc =
    db.upiAccounts.find((u) => u.id === cfg.activeUpiAccountId && u.isActive) ||
    db.upiAccounts.find((u) => u.isDefault && u.isActive) ||
    db.upiAccounts.find((u) => u.isActive);

  const razorpayEnabled =
    (cfg.mode === 'razorpay' || (cfg.mode === 'multiple' && cfg.allowRazorpay)) &&
    Boolean(rzpAcc);

  const upiQrEnabled =
    (cfg.mode === 'upi_qr' || (cfg.mode === 'multiple' && cfg.allowUpiQr)) &&
    Boolean(upiAcc);

  const codEnabled =
    (cfg.mode === 'cod' || (cfg.mode === 'multiple' && cfg.allowCod)) &&
    db.codSettings.enabled;

  const response: CheckoutPaymentOptionsResponse = {
    activeMode: cfg.mode,
    razorpay:
      razorpayEnabled && rzpAcc
        ? {
            enabled: true,
            accountId: rzpAcc.id,
            accountLabel: rzpAcc.label,
            keyId: rzpAcc.keyId,
            mode: rzpAcc.mode,
            isDemoKey: rzpAcc.keyId.includes('_demo_'),
          }
        : null,
    upiQr:
      upiQrEnabled && upiAcc
        ? {
            enabled: true,
            accountId: upiAcc.id,
            label: upiAcc.label,
            upiId: upiAcc.upiId,
            payeeName: upiAcc.payeeName,
            qrImageUrl: upiAcc.qrImageUrl,
            instructions: upiAcc.instructions,
          }
        : null,
    cod: {
      ...db.codSettings,
      enabled: codEnabled,
    },
  };

  res.json(response);
});

publicRouter.post('/newsletter', (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  if (!db.newsletterEmails.includes(normalized)) {
    db.newsletterEmails.push(normalized);
    saveDb(db);
  }
  res.json({ subscribed: true, message: 'Subscribed to SHOPKART updates.' });
});

publicRouter.post('/contact', (req, res) => {
  const { name, email, subject, message } = req.body as Record<string, string>;
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    res.status(400).json({ error: 'Name, email, and message are required.' });
    return;
  }
  const db = getDb();
  db.inquiries.unshift({
    id: `inq_${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim(),
    email: email.trim(),
    subject: subject?.trim() || 'General Inquiry',
    message: message.trim(),
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  res.json({ success: true, message: 'Support inquiry received. Our team will respond within 24 hours.' });
});

// Public order tracking lookup by Order Number + Email/Phone
publicRouter.post('/orders/track', (req, res) => {
  const { orderNumber, contact } = req.body as {
    orderNumber?: string;
    contact?: string;
  };
  if (!orderNumber?.trim()) {
    res.status(400).json({ error: 'Order number is required.' });
    return;
  }
  const db = getDb();
  const order = db.orders.find(
    (o) => o.orderNumber.toUpperCase() === orderNumber.trim().toUpperCase()
  );
  if (!order) {
    res.status(404).json({ error: 'No order found with that Order ID.' });
    return;
  }
  if (
    contact?.trim() &&
    order.customerEmail.toLowerCase() !== contact.trim().toLowerCase() &&
    !order.customerPhone.replace(/\s+/g, '').endsWith(contact.trim().replace(/\s+/g, ''))
  ) {
    res.status(403).json({ error: 'Order ID and email/phone do not match.' });
    return;
  }
  res.json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentGatewayLabel: order.paymentGatewayLabel,
      trackingNumber: order.trackingNumber,
      carrierName: order.carrierName,
      totalAmount: order.totalAmount,
      items: order.items,
      shippingAddress: {
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        postalCode: order.shippingAddress.postalCode,
      },
      statusTimeline: order.statusTimeline,
      createdAt: order.createdAt,
    },
  });
});
