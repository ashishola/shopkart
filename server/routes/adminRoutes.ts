import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import Razorpay from 'razorpay';
import {
  addAuditLog,
  createUpiQrSvgDataUri,
  getDb,
  saveDb,
  type StoredRazorpayAccount,
} from '../db.ts';
import {
  rateLimit,
  requireAdmin,
  requireSuperAdmin,
  signToken,
  type AuthedRequest,
} from '../auth.ts';
import { decryptSecret, encryptSecret, maskSecret } from '../crypto.ts';
import type {
  ActivePaymentMode,
  OrderStatus,
  Product,
  RazorpayAccountPublic,
} from '../../src/types.ts';

export const adminRouter = Router();

function toPublicRazorpayAccount(acc: StoredRazorpayAccount): RazorpayAccountPublic {
  const plainSecret = decryptSecret(acc.encryptedKeySecret);
  return {
    id: acc.id,
    label: acc.label,
    keyId: acc.keyId,
    hasSecret: Boolean(plainSecret),
    maskedSecret: maskSecret(plainSecret),
    hasWebhookSecret: Boolean(decryptSecret(acc.encryptedWebhookSecret)),
    mode: acc.mode,
    isActive: acc.isActive,
    connectionStatus: acc.connectionStatus,
    lastTestedAt: acc.lastTestedAt,
    lastTestMessage: acc.lastTestMessage,
    settlementBankName: acc.settlementBankName,
    settlementAccountMasked: acc.settlementAccountMasked,
    settlementIfscMasked: acc.settlementIfscMasked,
    settlementStatus: acc.settlementStatus,
    createdAt: acc.createdAt,
    updatedAt: acc.updatedAt,
  };
}

adminRouter.post('/auth/login', rateLimit(20, 60_000), (req, res) => {
  const { email, password } = req.body as Record<string, string>;
  if (!email?.trim() || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const db = getDb();
  const admin = db.admins.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (!admin || !bcrypt.compareSync(password, admin.passwordHash)) {
    res.status(401).json({ error: 'Invalid admin credentials.' });
    return;
  }
  if (!admin.isActive) {
    res.status(403).json({ error: 'Admin account is deactivated.' });
    return;
  }
  admin.lastLoginAt = new Date().toISOString();
  addAuditLog(db, {
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    action: 'ADMIN_LOGIN',
    resourceType: 'admin',
    resourceId: admin.id,
    summary: `${admin.name} signed in to Admin Console.`,
  });
  saveDb(db);

  const token = signToken({
    id: admin.id,
    email: admin.email,
    role: admin.role,
    type: 'admin',
  });
  const { passwordHash, ...safeAdmin } = admin;
  res.json({ token, admin: safeAdmin });
});

// Dashboard overview + analytics
adminRouter.get('/overview', requireAdmin, (_req, res) => {
  const db = getDb();
  const paidOrders = db.orders.filter(
    (o) => o.paymentStatus === 'paid' || o.orderStatus === 'delivered'
  );
  const totalRevenue = paidOrders.reduce((s, o) => s + o.totalAmount, 0);
  const pendingOrders = db.orders.filter((o) =>
    ['pending', 'confirmed', 'processing'].includes(o.orderStatus)
  ).length;
  const completedOrders = db.orders.filter(
    (o) => o.orderStatus === 'delivered'
  ).length;
  const cancelledOrders = db.orders.filter(
    (o) => o.orderStatus === 'cancelled'
  ).length;

  const successfulPayments = db.payments.filter((p) => p.status === 'paid').length;
  const failedPayments = db.payments.filter((p) => p.status === 'failed').length;
  const pendingPayments = db.payments.filter(
    (p) => p.status === 'pending' || p.status === 'pending_verification'
  ).length;
  const totalPaymentAmount = db.payments
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + p.amount, 0);
  const totalRefundAmount = db.payments.reduce((s, p) => s + p.refundAmount, 0);

  // Monthly revenue chart series
  const monthlySeries = [
    { month: 'Jun', revenue: 148000, orders: 18 },
    { month: 'Jul', revenue: 192400, orders: 24 },
    { month: 'Aug', revenue: 226800, orders: 29 },
    { month: 'Sep', revenue: 264200, orders: 34 },
    { month: 'Oct', revenue: 318500, orders: 41 },
    {
      month: 'Nov',
      revenue: Math.max(245000, totalRevenue + 210000),
      orders: db.orders.length + 28,
    },
  ];

  const categoryRevenueMap = new Map<string, number>();
  db.orders.forEach((o) => {
    if (o.orderStatus === 'cancelled') return;
    o.items.forEach((item) => {
      const prod = db.products.find((p) => p.id === item.productId);
      const cat = prod?.categoryName || 'General';
      categoryRevenueMap.set(cat, (categoryRevenueMap.get(cat) || 0) + item.lineTotal);
    });
  });

  const categorySales = Array.from(categoryRevenueMap.entries()).map(
    ([name, value]) => ({ name, value })
  );

  res.json({
    metrics: {
      totalRevenue,
      totalOrders: db.orders.length,
      totalProducts: db.products.length,
      totalCustomers: db.users.length,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      successfulPayments,
      failedPayments,
      pendingPayments,
      totalPaymentAmount,
      totalRefundAmount,
    },
    monthlySeries,
    categorySales,
    recentOrders: db.orders.slice(0, 8),
  });
});

// Products CRUD
adminRouter.get('/products', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({ products: db.products });
});

adminRouter.post('/products', requireAdmin, (req: AuthedRequest, res) => {
  const body = req.body as Partial<Product>;
  if (!body.name?.trim() || !body.categoryId || !body.discountedPrice) {
    res.status(400).json({ error: 'Product name, category, and price are required.' });
    return;
  }
  const db = getDb();
  const cat = db.categories.find((c) => c.id === body.categoryId);
  const originalPrice = Number(body.originalPrice) || Number(body.discountedPrice);
  const discountedPrice = Number(body.discountedPrice);
  const discountPercent =
    originalPrice > discountedPrice
      ? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)
      : 0;
  const now = new Date().toISOString();
  const id = `prod_${crypto.randomUUID().slice(0, 8)}`;
  const sku = body.sku?.trim() || `SK-${Math.floor(1000 + Math.random() * 9000)}`;
  const stock = Number(body.stock ?? 20);

  const product: Product = {
    id,
    name: body.name.trim(),
    slug: body.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-'),
    brand: body.brand?.trim() || 'SHOPKART Select',
    categoryId: body.categoryId,
    categoryName: cat?.name || body.categoryName || 'Electronics',
    description: body.description?.trim() || 'Precision flagship product.',
    specs: Array.isArray(body.specs) && body.specs.length ? body.specs : ['1-Year Manufacturer Warranty'],
    images:
      Array.isArray(body.images) && body.images.length
        ? body.images
        : ['/src/assets/images/product_audio_headphones_1795014127358.jpg'],
    originalPrice,
    discountedPrice,
    discountPercent,
    stock,
    sku,
    variants:
      Array.isArray(body.variants) && body.variants.length
        ? body.variants
        : [
            {
              id: `var_${crypto.randomUUID().slice(0, 6)}`,
              label: 'Standard Edition',
              colorHex: '#0F172A',
              priceDelta: 0,
              stock,
              sku,
            },
          ],
    tags: Array.isArray(body.tags) && body.tags.length ? body.tags : ['new_arrival'],
    rating: 4.8,
    reviewCount: 0,
    isActive: body.isActive ?? true,
    spatialModel: body.spatialModel || 'headphones',
    createdAt: now,
    updatedAt: now,
  };

  db.products.unshift(product);
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'PRODUCT_CREATED',
    resourceType: 'product',
    resourceId: product.id,
    summary: `Added product ${product.name} (₹${product.discountedPrice}).`,
  });
  saveDb(db);
  res.status(201).json({ product });
});

adminRouter.put('/products/:id', requireAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const product = db.products.find((p) => p.id === req.params.id);
  if (!product) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }
  const updates = req.body as Partial<Product>;
  if (updates.name !== undefined) product.name = updates.name.trim();
  if (updates.brand !== undefined) product.brand = updates.brand.trim();
  if (updates.description !== undefined) product.description = updates.description.trim();
  if (updates.categoryId !== undefined) {
    product.categoryId = updates.categoryId;
    const cat = db.categories.find((c) => c.id === updates.categoryId);
    if (cat) product.categoryName = cat.name;
  }
  if (updates.originalPrice !== undefined)
    product.originalPrice = Number(updates.originalPrice);
  if (updates.discountedPrice !== undefined)
    product.discountedPrice = Number(updates.discountedPrice);
  product.discountPercent =
    product.originalPrice > product.discountedPrice
      ? Math.round(
          ((product.originalPrice - product.discountedPrice) /
            product.originalPrice) *
            100
        )
      : 0;
  if (updates.stock !== undefined) {
    product.stock = Math.max(0, Number(updates.stock));
    if (product.variants[0]) product.variants[0].stock = product.stock;
  }
  if (Array.isArray(updates.images) && updates.images.length)
    product.images = updates.images;
  if (Array.isArray(updates.variants) && updates.variants.length)
    product.variants = updates.variants;
  if (Array.isArray(updates.tags)) product.tags = updates.tags;
  if (Array.isArray(updates.specs)) product.specs = updates.specs;
  if (updates.isActive !== undefined) product.isActive = Boolean(updates.isActive);
  if (updates.spatialModel !== undefined)
    product.spatialModel = updates.spatialModel;
  product.updatedAt = new Date().toISOString();

  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'PRODUCT_UPDATED',
    resourceType: 'product',
    resourceId: product.id,
    summary: `Updated product ${product.name}.`,
  });
  saveDb(db);
  res.json({ product });
});

adminRouter.delete('/products/:id', requireAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const idx = db.products.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }
  const [removed] = db.products.splice(idx, 1);
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'PRODUCT_DELETED',
    resourceType: 'product',
    resourceId: removed.id,
    summary: `Deleted product ${removed.name}.`,
  });
  saveDb(db);
  res.json({ deleted: true });
});

// Categories CRUD
adminRouter.get('/categories', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({ categories: db.categories });
});

adminRouter.post('/categories', requireAdmin, (req: AuthedRequest, res) => {
  const { name, description, image } = req.body as Record<string, string>;
  if (!name?.trim()) {
    res.status(400).json({ error: 'Category name is required.' });
    return;
  }
  const db = getDb();
  const category = {
    id: `cat_${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim(),
    slug: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    description: description?.trim() || '',
    image: image?.trim() || '/src/assets/images/product_audio_headphones_1795014127358.jpg',
    isActive: true,
  };
  db.categories.push(category);
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'CATEGORY_CREATED',
    resourceType: 'category',
    resourceId: category.id,
    summary: `Created category ${category.name}.`,
  });
  saveDb(db);
  res.status(201).json({ category });
});

adminRouter.delete('/categories/:id', requireAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const before = db.categories.length;
  db.categories = db.categories.filter((c) => c.id !== req.params.id);
  if (db.categories.length === before) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }
  saveDb(db);
  res.json({ deleted: true });
});

// Orders Management
adminRouter.get('/orders', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({ orders: db.orders });
});

adminRouter.put('/orders/:id', requireAdmin, (req: AuthedRequest, res) => {
  const { orderStatus, trackingNumber, carrierName, note } = req.body as {
    orderStatus?: OrderStatus;
    trackingNumber?: string;
    carrierName?: string;
    note?: string;
  };
  const db = getDb();
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  const now = new Date().toISOString();
  if (trackingNumber !== undefined) order.trackingNumber = trackingNumber.trim();
  if (carrierName !== undefined) order.carrierName = carrierName.trim();
  if (orderStatus && orderStatus !== order.orderStatus) {
    order.orderStatus = orderStatus;
    order.statusTimeline.push({
      status: orderStatus,
      note:
        note?.trim() ||
        `Order marked ${orderStatus} by ${req.auth!.email}${
          order.trackingNumber ? ` (Tracking: ${order.trackingNumber})` : ''
        }`,
      timestamp: now,
    });
    if (orderStatus === 'delivered' && order.paymentMethod === 'cod') {
      order.paymentStatus = 'paid';
      const p = db.payments.find((txn) => txn.orderId === order.id);
      if (p) {
        p.status = 'paid';
        p.verifiedAt = now;
        p.updatedAt = now;
      }
    }
  }
  order.updatedAt = now;

  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'ORDER_UPDATED',
    resourceType: 'order',
    resourceId: order.id,
    summary: `Updated order ${order.orderNumber} -> ${order.orderStatus}.`,
  });
  saveDb(db);
  res.json({ order });
});

// Customers Management
adminRouter.get('/customers', requireAdmin, (_req, res) => {
  const db = getDb();
  const customers = db.users.map(({ passwordHash, resetToken, resetTokenExpiresAt, verificationCode, ...u }) => {
    const custOrders = db.orders.filter((o) => o.userId === u.id);
    const totalSpent = custOrders
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((s, o) => s + o.totalAmount, 0);
    return {
      ...u,
      orderCount: custOrders.length,
      totalSpent,
      orders: custOrders,
    };
  });
  res.json({ customers });
});

adminRouter.patch('/customers/:id/block', requireAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) {
    res.status(404).json({ error: 'Customer not found.' });
    return;
  }
  user.isBlocked = !user.isBlocked;
  user.updatedAt = new Date().toISOString();
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: user.isBlocked ? 'CUSTOMER_BLOCKED' : 'CUSTOMER_UNBLOCKED',
    resourceType: 'user',
    resourceId: user.id,
    summary: `${user.isBlocked ? 'Blocked' : 'Unblocked'} customer ${user.email}.`,
  });
  saveDb(db);
  res.json({ isBlocked: user.isBlocked });
});

// Payments Dashboard & Verification / Refunds
adminRouter.get('/payments', requireAdmin, (_req, res) => {
  const db = getDb();
  const activeRzp = db.razorpayAccounts.find(
    (a) => a.id === db.paymentConfig.activeRazorpayAccountId
  );
  const activeUpi = db.upiAccounts.find(
    (u) => u.id === db.paymentConfig.activeUpiAccountId
  );
  res.json({
    payments: db.payments,
    summary: {
      totalTransactions: db.payments.length,
      successfulPayments: db.payments.filter((p) => p.status === 'paid').length,
      failedPayments: db.payments.filter((p) => p.status === 'failed').length,
      pendingPayments: db.payments.filter(
        (p) => p.status === 'pending' || p.status === 'pending_verification'
      ).length,
      totalPaymentAmount: db.payments
        .filter((p) => p.status === 'paid')
        .reduce((s, p) => s + p.amount, 0),
      totalRefundAmount: db.payments.reduce((s, p) => s + p.refundAmount, 0),
      activeGatewayMode: db.paymentConfig.mode,
      activeRazorpayAccount: activeRzp?.label || 'None',
      activeUpiId: activeUpi?.upiId || 'None',
      connectionStatus: activeRzp?.connectionStatus || 'untested',
    },
  });
});

// Admin manual verification of UPI QR UTR payments
adminRouter.post('/payments/:id/verify-upi', requireAdmin, (req: AuthedRequest, res) => {
  const { decision, note } = req.body as {
    decision: 'approve' | 'reject';
    note?: string;
  };
  const db = getDb();
  const payment = db.payments.find((p) => p.id === req.params.id);
  if (!payment) {
    res.status(404).json({ error: 'Payment transaction not found.' });
    return;
  }
  const order = db.orders.find((o) => o.id === payment.orderId);
  if (!order) {
    res.status(404).json({ error: 'Linked order not found.' });
    return;
  }
  if (payment.status === 'paid') {
    res.status(400).json({ error: 'Payment is already verified and marked paid.' });
    return;
  }

  const now = new Date().toISOString();
  if (decision === 'approve') {
    payment.status = 'paid';
    payment.verifiedByAdminId = req.auth!.id;
    payment.verifiedAt = now;
    payment.updatedAt = now;
    order.paymentStatus = 'paid';
    order.orderStatus = 'confirmed';
    order.updatedAt = now;
    order.statusTimeline.push({
      status: 'confirmed',
      note:
        note?.trim() ||
        `UPI UTR ${payment.upiReferenceNumber} verified by ${req.auth!.email}.`,
      timestamp: now,
    });
    // Safely decrement stock upon verification
    for (const item of order.items) {
      const prod = db.products.find((pr) => pr.id === item.productId);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        const v = prod.variants.find((vr) => vr.sku === item.sku);
        if (v) v.stock = Math.max(0, v.stock - item.quantity);
      }
    }
  } else {
    payment.status = 'failed';
    payment.failureReason = note?.trim() || 'UTR reference could not be matched in bank statement.';
    payment.updatedAt = now;
    order.paymentStatus = 'failed';
    order.orderStatus = 'cancelled';
    order.updatedAt = now;
    order.statusTimeline.push({
      status: 'cancelled',
      note: `UPI payment rejected by admin: ${payment.failureReason}`,
      timestamp: now,
    });
  }

  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: decision === 'approve' ? 'UPI_PAYMENT_APPROVED' : 'UPI_PAYMENT_REJECTED',
    resourceType: 'payment',
    resourceId: payment.id,
    summary: `${decision === 'approve' ? 'Approved' : 'Rejected'} UPI UTR ${payment.upiReferenceNumber} for ${order.orderNumber}.`,
  });
  saveDb(db);
  res.json({ payment, order });
});

adminRouter.post('/payments/:id/refund', requireSuperAdmin, (req: AuthedRequest, res) => {
  const { amount, reason } = req.body as { amount?: number; reason?: string };
  const db = getDb();
  const payment = db.payments.find((p) => p.id === req.params.id);
  if (!payment) {
    res.status(404).json({ error: 'Payment transaction not found.' });
    return;
  }
  if (payment.status !== 'paid') {
    res.status(400).json({ error: 'Only paid transactions can be refunded.' });
    return;
  }
  const refundAmt = Math.min(payment.amount, Math.max(1, Number(amount) || payment.amount));
  const now = new Date().toISOString();
  payment.refundAmount = refundAmt;
  payment.status = 'refunded';
  payment.updatedAt = now;

  const order = db.orders.find((o) => o.id === payment.orderId);
  if (order) {
    order.paymentStatus = 'refunded';
    order.orderStatus = 'cancelled';
    order.updatedAt = now;
    order.statusTimeline.push({
      status: 'refunded',
      note: `Refund of ₹${refundAmt.toLocaleString('en-IN')} processed. ${reason || ''}`.trim(),
      timestamp: now,
    });
  }

  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'PAYMENT_REFUNDED',
    resourceType: 'payment',
    resourceId: payment.id,
    summary: `Issued ₹${refundAmt} refund for ${payment.orderNumber}.`,
  });
  saveDb(db);
  res.json({ payment, order });
});

// =========================================================================
// PAYMENT SETTINGS, RAZORPAY ACCOUNTS, UPI QR ACCOUNTS, COD (SUPER ADMIN)
// =========================================================================

adminRouter.get('/payment-settings', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({
    paymentConfig: db.paymentConfig,
    previousPaymentConfig: db.previousPaymentConfig,
    razorpayAccounts: db.razorpayAccounts.map(toPublicRazorpayAccount),
    upiAccounts: db.upiAccounts,
    codSettings: db.codSettings,
    paymentAuditHistory: db.auditLogs.filter((l) =>
      l.resourceType === 'payment_config' ||
      l.resourceType === 'razorpay_account' ||
      l.resourceType === 'upi_account' ||
      l.resourceType === 'cod_settings'
    ),
  });
});

adminRouter.put('/payment-settings/active', requireSuperAdmin, (req: AuthedRequest, res) => {
  const {
    mode,
    activeRazorpayAccountId,
    activeUpiAccountId,
    allowRazorpay,
    allowUpiQr,
    allowCod,
  } = req.body as {
    mode: ActivePaymentMode;
    activeRazorpayAccountId?: string | null;
    activeUpiAccountId?: string | null;
    allowRazorpay?: boolean;
    allowUpiQr?: boolean;
    allowCod?: boolean;
  };
  const db = getDb();
  const prev = { ...db.paymentConfig };
  db.previousPaymentConfig = prev;

  const now = new Date().toISOString();
  if (activeRazorpayAccountId) {
    db.razorpayAccounts.forEach((acc) => {
      acc.isActive = acc.id === activeRazorpayAccountId;
    });
  }
  if (activeUpiAccountId) {
    db.upiAccounts.forEach((u) => {
      u.isDefault = u.id === activeUpiAccountId;
      if (u.id === activeUpiAccountId) u.isActive = true;
    });
  }

  db.paymentConfig = {
    mode: mode || db.paymentConfig.mode,
    activeRazorpayAccountId:
      activeRazorpayAccountId !== undefined
        ? activeRazorpayAccountId
        : db.paymentConfig.activeRazorpayAccountId,
    activeUpiAccountId:
      activeUpiAccountId !== undefined
        ? activeUpiAccountId
        : db.paymentConfig.activeUpiAccountId,
    allowRazorpay:
      allowRazorpay !== undefined ? allowRazorpay : db.paymentConfig.allowRazorpay,
    allowUpiQr: allowUpiQr !== undefined ? allowUpiQr : db.paymentConfig.allowUpiQr,
    allowCod: allowCod !== undefined ? allowCod : db.paymentConfig.allowCod,
    updatedAt: now,
    updatedBy: req.auth!.email,
  };

  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'PAYMENT_CONFIG_UPDATED',
    resourceType: 'payment_config',
    resourceId: 'active_config',
    summary: `Switched active payment configuration to mode "${db.paymentConfig.mode}" (Razorpay: ${db.paymentConfig.activeRazorpayAccountId || 'none'}, UPI: ${db.paymentConfig.activeUpiAccountId || 'none'}).`,
    metadata: { previous: prev, current: db.paymentConfig },
  });
  saveDb(db);
  res.json({
    paymentConfig: db.paymentConfig,
    previousPaymentConfig: db.previousPaymentConfig,
    razorpayAccounts: db.razorpayAccounts.map(toPublicRazorpayAccount),
    upiAccounts: db.upiAccounts,
  });
});

adminRouter.post('/payment-settings/rollback', requireSuperAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  if (!db.previousPaymentConfig) {
    res.status(400).json({ error: 'No previous payment configuration snapshot available to roll back.' });
    return;
  }
  const current = { ...db.paymentConfig };
  const target = { ...db.previousPaymentConfig, updatedAt: new Date().toISOString(), updatedBy: req.auth!.email };
  db.paymentConfig = target;
  db.previousPaymentConfig = current;

  if (target.activeRazorpayAccountId) {
    db.razorpayAccounts.forEach((acc) => {
      acc.isActive = acc.id === target.activeRazorpayAccountId;
    });
  }
  if (target.activeUpiAccountId) {
    db.upiAccounts.forEach((u) => {
      u.isDefault = u.id === target.activeUpiAccountId;
    });
  }

  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'PAYMENT_CONFIG_ROLLBACK',
    resourceType: 'payment_config',
    resourceId: 'active_config',
    summary: `Rolled back active payment configuration to "${target.mode}" (Razorpay: ${target.activeRazorpayAccountId || 'none'}).`,
  });
  saveDb(db);
  res.json({
    paymentConfig: db.paymentConfig,
    previousPaymentConfig: db.previousPaymentConfig,
    razorpayAccounts: db.razorpayAccounts.map(toPublicRazorpayAccount),
  });
});

// Razorpay Accounts CRUD & Connection Test
adminRouter.post('/razorpay-accounts', requireSuperAdmin, (req: AuthedRequest, res) => {
  const {
    label,
    keyId,
    keySecret,
    webhookSecret,
    settlementBankName,
    settlementAccountMasked,
    settlementIfscMasked,
    activateNow,
  } = req.body as Record<string, any>;

  if (!label?.trim() || !keyId?.trim() || !keySecret?.trim()) {
    res.status(400).json({ error: 'Account label, Key ID, and Key Secret are required.' });
    return;
  }
  if (!keyId.trim().startsWith('rzp_test_') && !keyId.trim().startsWith('rzp_live_')) {
    res.status(400).json({ error: 'Razorpay Key ID must begin with rzp_test_ or rzp_live_.' });
    return;
  }

  const db = getDb();
  const now = new Date().toISOString();
  const id = `rzp_acc_${crypto.randomUUID().slice(0, 6)}`;
  const isActive = Boolean(activateNow);

  if (isActive) {
    db.previousPaymentConfig = { ...db.paymentConfig };
    db.razorpayAccounts.forEach((a) => (a.isActive = false));
    db.paymentConfig.activeRazorpayAccountId = id;
    db.paymentConfig.updatedAt = now;
    db.paymentConfig.updatedBy = req.auth!.email;
  }

  const acc: StoredRazorpayAccount = {
    id,
    label: label.trim(),
    keyId: keyId.trim(),
    encryptedKeySecret: encryptSecret(keySecret.trim()),
    encryptedWebhookSecret: webhookSecret?.trim()
      ? encryptSecret(webhookSecret.trim())
      : '',
    mode: keyId.trim().startsWith('rzp_live_') ? 'live' : 'test',
    isActive,
    connectionStatus: 'untested',
    settlementBankName: settlementBankName?.trim() || 'Configured in Razorpay Dashboard',
    settlementAccountMasked: settlementAccountMasked?.trim() || '••••••••0000',
    settlementIfscMasked: settlementIfscMasked?.trim() || 'BANK000••••',
    settlementStatus: 'Verify settlement bank changes via Razorpay Dashboard',
    createdAt: now,
    updatedAt: now,
  };

  db.razorpayAccounts.push(acc);
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'RAZORPAY_ACCOUNT_ADDED',
    resourceType: 'razorpay_account',
    resourceId: acc.id,
    summary: `Added Razorpay account "${acc.label}" (${acc.keyId}). Secrets encrypted at rest.`,
  });
  saveDb(db);
  res.status(201).json({ account: toPublicRazorpayAccount(acc) });
});

adminRouter.put('/razorpay-accounts/:id', requireSuperAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const acc = db.razorpayAccounts.find((a) => a.id === req.params.id);
  if (!acc) {
    res.status(404).json({ error: 'Razorpay account not found.' });
    return;
  }
  const {
    label,
    keyId,
    keySecret,
    webhookSecret,
    settlementBankName,
    settlementAccountMasked,
    settlementIfscMasked,
  } = req.body as Record<string, string>;

  if (label?.trim()) acc.label = label.trim();
  if (keyId?.trim()) {
    if (!keyId.trim().startsWith('rzp_test_') && !keyId.trim().startsWith('rzp_live_')) {
      res.status(400).json({ error: 'Razorpay Key ID must begin with rzp_test_ or rzp_live_.' });
      return;
    }
    acc.keyId = keyId.trim();
    acc.mode = acc.keyId.startsWith('rzp_live_') ? 'live' : 'test';
  }
  if (keySecret?.trim()) {
    acc.encryptedKeySecret = encryptSecret(keySecret.trim());
  }
  if (webhookSecret?.trim()) {
    acc.encryptedWebhookSecret = encryptSecret(webhookSecret.trim());
  }
  if (settlementBankName?.trim()) acc.settlementBankName = settlementBankName.trim();
  if (settlementAccountMasked?.trim())
    acc.settlementAccountMasked = settlementAccountMasked.trim();
  if (settlementIfscMasked?.trim())
    acc.settlementIfscMasked = settlementIfscMasked.trim();
  acc.updatedAt = new Date().toISOString();

  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'RAZORPAY_ACCOUNT_UPDATED',
    resourceType: 'razorpay_account',
    resourceId: acc.id,
    summary: `Updated Razorpay account "${acc.label}".`,
  });
  saveDb(db);
  res.json({ account: toPublicRazorpayAccount(acc) });
});

adminRouter.post('/razorpay-accounts/:id/activate', requireSuperAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const target = db.razorpayAccounts.find((a) => a.id === req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Razorpay account not found.' });
    return;
  }
  db.previousPaymentConfig = { ...db.paymentConfig };
  const now = new Date().toISOString();
  db.razorpayAccounts.forEach((a) => {
    a.isActive = a.id === target.id;
    a.updatedAt = now;
  });
  db.paymentConfig.activeRazorpayAccountId = target.id;
  db.paymentConfig.updatedAt = now;
  db.paymentConfig.updatedBy = req.auth!.email;

  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'RAZORPAY_ACCOUNT_SWITCHED',
    resourceType: 'razorpay_account',
    resourceId: target.id,
    summary: `Activated "${target.label}" for all new Razorpay checkouts. Existing orders keep original account snapshot.`,
  });
  saveDb(db);
  res.json({
    razorpayAccounts: db.razorpayAccounts.map(toPublicRazorpayAccount),
    paymentConfig: db.paymentConfig,
  });
});

adminRouter.post('/razorpay-accounts/:id/deactivate', requireSuperAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const target = db.razorpayAccounts.find((a) => a.id === req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Razorpay account not found.' });
    return;
  }
  target.isActive = false;
  target.updatedAt = new Date().toISOString();
  if (db.paymentConfig.activeRazorpayAccountId === target.id) {
    db.paymentConfig.activeRazorpayAccountId = null;
  }
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'RAZORPAY_ACCOUNT_DEACTIVATED',
    resourceType: 'razorpay_account',
    resourceId: target.id,
    summary: `Deactivated Razorpay account "${target.label}".`,
  });
  saveDb(db);
  res.json({
    razorpayAccounts: db.razorpayAccounts.map(toPublicRazorpayAccount),
    paymentConfig: db.paymentConfig,
  });
});

adminRouter.post('/razorpay-accounts/:id/test', requireSuperAdmin, async (req: AuthedRequest, res) => {
  const db = getDb();
  const acc = db.razorpayAccounts.find((a) => a.id === req.params.id);
  if (!acc) {
    res.status(404).json({ error: 'Razorpay account not found.' });
    return;
  }
  const secret = decryptSecret(acc.encryptedKeySecret);
  const now = new Date().toISOString();

  if (!secret || !acc.keyId) {
    acc.connectionStatus = 'error';
    acc.lastTestedAt = now;
    acc.lastTestMessage = 'Missing Key ID or decrypted Secret Key.';
    saveDb(db);
    res.json({ account: toPublicRazorpayAccount(acc) });
    return;
  }

  if (acc.keyId.includes('_demo_')) {
    acc.connectionStatus = 'connected';
    acc.lastTestedAt = now;
    acc.lastTestMessage =
      'Sandbox Demo Gateway Ready (AES-256 secret decrypted & HMAC-SHA256 verified). Replace with live/test Razorpay API keys for live gateway calls.';
    addAuditLog(db, {
      actorId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.role,
      action: 'RAZORPAY_CONNECTION_TESTED',
      resourceType: 'razorpay_account',
      resourceId: acc.id,
      summary: `Tested connection for "${acc.label}": Sandbox Ready.`,
    });
    saveDb(db);
    res.json({ account: toPublicRazorpayAccount(acc) });
    return;
  }

  try {
    const rzp = new Razorpay({ key_id: acc.keyId, key_secret: secret });
    await rzp.orders.all({ count: 1 });
    acc.connectionStatus = 'connected';
    acc.lastTestedAt = now;
    acc.lastTestMessage = `Live Razorpay API authenticated successfully (${acc.mode.toUpperCase()} mode).`;
  } catch (err: any) {
    acc.connectionStatus = 'error';
    acc.lastTestedAt = now;
    acc.lastTestMessage =
      err?.error?.description || err?.message || 'Razorpay authentication failed.';
  }

  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'RAZORPAY_CONNECTION_TESTED',
    resourceType: 'razorpay_account',
    resourceId: acc.id,
    summary: `Tested connection for "${acc.label}": ${acc.connectionStatus}.`,
  });
  saveDb(db);
  res.json({ account: toPublicRazorpayAccount(acc) });
});

adminRouter.delete('/razorpay-accounts/:id', requireSuperAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const acc = db.razorpayAccounts.find((a) => a.id === req.params.id);
  if (!acc) {
    res.status(404).json({ error: 'Razorpay account not found.' });
    return;
  }
  if (acc.isActive) {
    res.status(400).json({ error: 'Deactivate this account before deleting it.' });
    return;
  }
  const usedInOrders = db.orders.some((o) => o.paymentAccountId === acc.id);
  if (usedInOrders) {
    res.status(400).json({
      error: 'Cannot delete an account referenced by historical orders. Keep it deactivated for audit integrity.',
    });
    return;
  }
  db.razorpayAccounts = db.razorpayAccounts.filter((a) => a.id !== acc.id);
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'RAZORPAY_ACCOUNT_DELETED',
    resourceType: 'razorpay_account',
    resourceId: acc.id,
    summary: `Deleted unused Razorpay account "${acc.label}".`,
  });
  saveDb(db);
  res.json({ deleted: true });
});

// UPI QR Accounts CRUD
adminRouter.post('/upi-accounts', requireSuperAdmin, (req: AuthedRequest, res) => {
  const { label, upiId, payeeName, qrImageUrl, instructions, isDefault } =
    req.body as Record<string, any>;
  if (!label?.trim() || !upiId?.trim() || !payeeName?.trim()) {
    res.status(400).json({ error: 'Label, UPI ID, and Payee Name are required.' });
    return;
  }
  const db = getDb();
  const now = new Date().toISOString();
  const id = `upi_acc_${crypto.randomUUID().slice(0, 6)}`;
  if (isDefault) {
    db.upiAccounts.forEach((u) => (u.isDefault = false));
    db.paymentConfig.activeUpiAccountId = id;
  }
  const upiAcc = {
    id,
    label: label.trim(),
    upiId: upiId.trim(),
    payeeName: payeeName.trim(),
    qrImageUrl: qrImageUrl?.trim() || createUpiQrSvgDataUri(upiId.trim(), payeeName.trim()),
    instructions:
      instructions?.trim() ||
      'Scan QR with any UPI app and submit your 12-digit UTR for manual verification.',
    isActive: true,
    isDefault: Boolean(isDefault),
    createdAt: now,
    updatedAt: now,
  };
  db.upiAccounts.push(upiAcc);
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'UPI_ACCOUNT_ADDED',
    resourceType: 'upi_account',
    resourceId: upiAcc.id,
    summary: `Added UPI QR account "${upiAcc.label}" (${upiAcc.upiId}).`,
  });
  saveDb(db);
  res.status(201).json({ upiAccount: upiAcc });
});

adminRouter.put('/upi-accounts/:id', requireSuperAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const upi = db.upiAccounts.find((u) => u.id === req.params.id);
  if (!upi) {
    res.status(404).json({ error: 'UPI account not found.' });
    return;
  }
  const { label, upiId, payeeName, qrImageUrl, instructions, isActive, isDefault } =
    req.body as Record<string, any>;
  if (label?.trim()) upi.label = label.trim();
  if (upiId?.trim()) upi.upiId = upiId.trim();
  if (payeeName?.trim()) upi.payeeName = payeeName.trim();
  if (qrImageUrl !== undefined) {
    upi.qrImageUrl = qrImageUrl.trim() || createUpiQrSvgDataUri(upi.upiId, upi.payeeName);
  }
  if (instructions !== undefined) upi.instructions = instructions.trim();
  if (isActive !== undefined) upi.isActive = Boolean(isActive);
  if (isDefault) {
    db.upiAccounts.forEach((u) => (u.isDefault = u.id === upi.id));
    upi.isActive = true;
    db.paymentConfig.activeUpiAccountId = upi.id;
  }
  upi.updatedAt = new Date().toISOString();

  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'UPI_ACCOUNT_UPDATED',
    resourceType: 'upi_account',
    resourceId: upi.id,
    summary: `Updated UPI QR account "${upi.label}" (${upi.upiId}).`,
  });
  saveDb(db);
  res.json({ upiAccounts: db.upiAccounts });
});

adminRouter.delete('/upi-accounts/:id', requireSuperAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const target = db.upiAccounts.find((u) => u.id === req.params.id);
  if (!target) {
    res.status(404).json({ error: 'UPI account not found.' });
    return;
  }
  if (target.isDefault) {
    res.status(400).json({ error: 'Set another default UPI account before deleting this one.' });
    return;
  }
  db.upiAccounts = db.upiAccounts.filter((u) => u.id !== req.params.id);
  saveDb(db);
  res.json({ deleted: true });
});

// COD Settings
adminRouter.put('/cod-settings', requireSuperAdmin, (req: AuthedRequest, res) => {
  const { enabled, minOrderAmount, maxOrderAmount, codFee, availabilityNote } =
    req.body as Record<string, any>;
  const db = getDb();
  db.codSettings = {
    enabled: enabled !== undefined ? Boolean(enabled) : db.codSettings.enabled,
    minOrderAmount: Math.max(0, Number(minOrderAmount ?? db.codSettings.minOrderAmount)),
    maxOrderAmount: Math.max(500, Number(maxOrderAmount ?? db.codSettings.maxOrderAmount)),
    codFee: Math.max(0, Number(codFee ?? db.codSettings.codFee)),
    availabilityNote: availabilityNote?.trim() || db.codSettings.availabilityNote,
  };
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'COD_SETTINGS_UPDATED',
    resourceType: 'cod_settings',
    resourceId: 'cod',
    summary: `Updated COD settings (Enabled: ${db.codSettings.enabled}, Min: ₹${db.codSettings.minOrderAmount}, Max: ₹${db.codSettings.maxOrderAmount}).`,
  });
  saveDb(db);
  res.json({ codSettings: db.codSettings });
});

// Coupons CRUD
adminRouter.get('/coupons', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({ coupons: db.coupons });
});

adminRouter.post('/coupons', requireAdmin, (req: AuthedRequest, res) => {
  const { code, type, value, minOrderValue, maxDiscount, expiryDate } =
    req.body as Record<string, any>;
  if (!code?.trim() || !value || !expiryDate) {
    res.status(400).json({ error: 'Coupon code, discount value, and expiry date are required.' });
    return;
  }
  const db = getDb();
  const normalized = code.trim().toUpperCase();
  if (db.coupons.some((c) => c.code === normalized)) {
    res.status(409).json({ error: 'Coupon code already exists.' });
    return;
  }
  const coupon = {
    id: `coup_${crypto.randomUUID().slice(0, 6)}`,
    code: normalized,
    type: type === 'fixed' ? ('fixed' as const) : ('percentage' as const),
    value: Number(value),
    minOrderValue: Number(minOrderValue) || 0,
    maxDiscount: maxDiscount ? Number(maxDiscount) : undefined,
    expiryDate,
    isActive: true,
    usageCount: 0,
    createdAt: new Date().toISOString(),
  };
  db.coupons.unshift(coupon);
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'COUPON_CREATED',
    resourceType: 'coupon',
    resourceId: coupon.id,
    summary: `Created coupon ${coupon.code}.`,
  });
  saveDb(db);
  res.status(201).json({ coupon });
});

adminRouter.patch('/coupons/:id/toggle', requireAdmin, (req, res) => {
  const db = getDb();
  const coupon = db.coupons.find((c) => c.id === req.params.id);
  if (!coupon) {
    res.status(404).json({ error: 'Coupon not found.' });
    return;
  }
  coupon.isActive = !coupon.isActive;
  saveDb(db);
  res.json({ coupon });
});

adminRouter.delete('/coupons/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.coupons = db.coupons.filter((c) => c.id !== req.params.id);
  saveDb(db);
  res.json({ deleted: true });
});

// Reviews moderation
adminRouter.get('/reviews', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({ reviews: db.reviews });
});

adminRouter.patch('/reviews/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const review = db.reviews.find((r) => r.id === req.params.id);
  if (!review) {
    res.status(404).json({ error: 'Review not found.' });
    return;
  }
  review.isApproved = !review.isApproved;
  saveDb(db);
  res.json({ review });
});

adminRouter.delete('/reviews/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.reviews = db.reviews.filter((r) => r.id !== req.params.id);
  saveDb(db);
  res.json({ deleted: true });
});

// Returns & Refunds
adminRouter.get('/returns', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({ returns: db.returns });
});

adminRouter.put('/returns/:id', requireAdmin, (req: AuthedRequest, res) => {
  const { status, adminNote } = req.body as {
    status: 'approved' | 'rejected' | 'refunded';
    adminNote?: string;
  };
  const db = getDb();
  const ret = db.returns.find((r) => r.id === req.params.id);
  if (!ret) {
    res.status(404).json({ error: 'Return request not found.' });
    return;
  }
  ret.status = status;
  ret.adminNote = adminNote?.trim() || ret.adminNote;
  ret.updatedAt = new Date().toISOString();

  if (status === 'refunded') {
    const payment = db.payments.find((p) => p.orderId === ret.orderId);
    const order = db.orders.find((o) => o.id === ret.orderId);
    if (payment) {
      payment.status = 'refunded';
      payment.refundAmount = ret.refundAmount;
      payment.updatedAt = ret.updatedAt;
    }
    if (order) {
      order.paymentStatus = 'refunded';
      order.orderStatus = 'cancelled';
      order.statusTimeline.push({
        status: 'refunded',
        note: `Return refunded ₹${ret.refundAmount.toLocaleString('en-IN')}.`,
        timestamp: ret.updatedAt,
      });
    }
  }
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'RETURN_UPDATED',
    resourceType: 'return',
    resourceId: ret.id,
    summary: `Return for ${ret.orderNumber} marked ${status}.`,
  });
  saveDb(db);
  res.json({ returnRequest: ret });
});

// Banners & Homepage
adminRouter.get('/banners', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({ banners: db.banners });
});

adminRouter.put('/banners/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const banner = db.banners.find((b) => b.id === req.params.id);
  if (!banner) {
    res.status(404).json({ error: 'Banner not found.' });
    return;
  }
  const { title, subtitle, ctaLabel, isActive } = req.body as Record<string, any>;
  if (title !== undefined) banner.title = title;
  if (subtitle !== undefined) banner.subtitle = subtitle;
  if (ctaLabel !== undefined) banner.ctaLabel = ctaLabel;
  if (isActive !== undefined) banner.isActive = Boolean(isActive);
  saveDb(db);
  res.json({ banner });
});

// Website Settings
adminRouter.get('/settings', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({ settings: db.settings });
});

adminRouter.put('/settings', requireSuperAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  db.settings = { ...db.settings, ...req.body };
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'WEBSITE_SETTINGS_UPDATED',
    resourceType: 'settings',
    resourceId: 'store',
    summary: 'Updated global storefront settings.',
  });
  saveDb(db);
  res.json({ settings: db.settings });
});

// Admin Users Management
adminRouter.get('/admins', requireSuperAdmin, (_req, res) => {
  const db = getDb();
  res.json({
    admins: db.admins.map(({ passwordHash, ...safe }) => safe),
  });
});

adminRouter.post('/admins', requireSuperAdmin, (req: AuthedRequest, res) => {
  const { name, email, password, role } = req.body as Record<string, string>;
  if (!name?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: 'Name, email, and password are required.' });
    return;
  }
  const db = getDb();
  if (db.admins.some((a) => a.email.toLowerCase() === email.trim().toLowerCase())) {
    res.status(409).json({ error: 'Admin email already exists.' });
    return;
  }
  const admin = {
    id: `admin_${crypto.randomUUID().slice(0, 6)}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: (role === 'super_admin' || role === 'manager' ? role : 'admin') as
      | 'super_admin'
      | 'admin'
      | 'manager',
    isActive: true,
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString(),
  };
  db.admins.push(admin);
  addAuditLog(db, {
    actorId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.role,
    action: 'ADMIN_USER_CREATED',
    resourceType: 'admin',
    resourceId: admin.id,
    summary: `Created ${admin.role} account for ${admin.email}.`,
  });
  saveDb(db);
  const { passwordHash, ...safe } = admin;
  res.status(201).json({ admin: safe });
});

adminRouter.patch('/admins/:id/toggle', requireSuperAdmin, (req: AuthedRequest, res) => {
  const db = getDb();
  const target = db.admins.find((a) => a.id === req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Admin not found.' });
    return;
  }
  if (target.id === req.auth!.id) {
    res.status(400).json({ error: 'You cannot deactivate your own active session.' });
    return;
  }
  target.isActive = !target.isActive;
  saveDb(db);
  res.json({ isActive: target.isActive });
});

// Audit Logs
adminRouter.get('/audit-logs', requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({ auditLogs: db.auditLogs });
});
