import { Router } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { getDb, saveDb, addAuditLog } from '../db.ts';
import {
  createRazorpayTestSignature,
  decryptSecret,
  verifyRazorpaySignature,
  verifyWebhookSignature,
} from '../crypto.ts';
import {
  extractBearerToken,
  rateLimit,
  verifyToken,
} from '../auth.ts';
import type {
  Order,
  OrderItem,
  OrderShippingAddress,
  PaymentMethodType,
  PaymentTransaction,
} from '../../src/types.ts';

export const paymentRouter = Router();

function resolveCustomerId(req: any): string {
  const token = extractBearerToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.type === 'customer') return payload.id;
  }
  return 'guest_checkout';
}

function decrementOrderStock(db: ReturnType<typeof getDb>, items: OrderItem[]) {
  for (const item of items) {
    const product = db.products.find((p) => p.id === item.productId);
    if (!product) continue;
    product.stock = Math.max(0, product.stock - item.quantity);
    const variant = product.variants.find((v) => v.sku === item.sku);
    if (variant) {
      variant.stock = Math.max(0, variant.stock - item.quantity);
    }
  }
}

paymentRouter.post('/create-order', rateLimit(30, 60_000), async (req, res) => {
  const {
    items,
    shippingAddress,
    paymentMethod,
    couponCode,
    upiReferenceNumber,
    idempotencyKey,
  } = req.body as {
    items: { productId: string; variantId: string; quantity: number }[];
    shippingAddress: OrderShippingAddress;
    paymentMethod: PaymentMethodType;
    couponCode?: string;
    upiReferenceNumber?: string;
    idempotencyKey?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Your cart is empty.' });
    return;
  }
  if (
    !shippingAddress?.fullName?.trim() ||
    !shippingAddress?.phone?.trim() ||
    !shippingAddress?.email?.trim() ||
    !shippingAddress?.line1?.trim() ||
    !shippingAddress?.city?.trim() ||
    !shippingAddress?.state?.trim() ||
    !shippingAddress?.postalCode?.trim()
  ) {
    res.status(400).json({ error: 'Complete shipping address and contact details are required.' });
    return;
  }

  const db = getDb();
  const userId = resolveCustomerId(req);

  // Duplicate transaction / idempotency guard
  const idemKey = idempotencyKey?.trim() || crypto.randomUUID();
  const existingTxn = db.payments.find((p) => p.idempotencyKey === idemKey);
  if (existingTxn) {
    const existingOrder = db.orders.find((o) => o.id === existingTxn.orderId);
    if (existingOrder) {
      res.json({
        duplicatePrevented: true,
        order: existingOrder,
        payment: existingTxn,
      });
      return;
    }
  }

  // Server-authoritative item & stock calculation (never trust frontend prices)
  const resolvedItems: OrderItem[] = [];
  let subtotal = 0;

  for (const cartItem of items) {
    const product = db.products.find(
      (p) => p.id === cartItem.productId && p.isActive
    );
    if (!product) {
      res.status(400).json({ error: `Product ${cartItem.productId} is unavailable.` });
      return;
    }
    const qty = Math.max(1, Math.min(20, Math.floor(Number(cartItem.quantity) || 1)));
    const variant =
      product.variants.find((v) => v.id === cartItem.variantId) ||
      product.variants[0];
    const availableStock = variant ? variant.stock : product.stock;
    if (availableStock < qty) {
      res.status(400).json({
        error: `Insufficient stock for ${product.name} (${variant?.label || 'Standard'}). Available: ${availableStock}.`,
      });
      return;
    }
    const unitPrice = product.discountedPrice + (variant?.priceDelta || 0);
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    resolvedItems.push({
      productId: product.id,
      productName: product.name,
      image: product.images[0] || '',
      variantLabel: variant?.label || 'Standard',
      sku: variant?.sku || product.sku,
      unitPrice,
      quantity: qty,
      lineTotal,
    });
  }

  // Server-side coupon calculation
  let discountAmount = 0;
  let appliedCouponCode: string | undefined;
  if (couponCode?.trim()) {
    const coupon = db.coupons.find(
      (c) => c.code.toUpperCase() === couponCode.trim().toUpperCase() && c.isActive
    );
    if (
      coupon &&
      new Date(coupon.expiryDate).getTime() >= Date.now() &&
      subtotal >= coupon.minOrderValue
    ) {
      discountAmount =
        coupon.type === 'percentage'
          ? Math.round((subtotal * coupon.value) / 100)
          : coupon.value;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
      discountAmount = Math.min(discountAmount, subtotal);
      appliedCouponCode = coupon.code;
    }
  }

  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const shippingCharge =
    discountedSubtotal >= db.settings.freeShippingThreshold
      ? 0
      : db.settings.standardShippingFee;
  const taxAmount = Math.round(
    (discountedSubtotal * db.settings.gstRatePercent) / 100
  );

  // Verify chosen payment method against active admin payment configuration
  const cfg = db.paymentConfig;
  const isRazorpayMethod = paymentMethod.startsWith('razorpay_');
  const isUpiQrMethod = paymentMethod === 'upi_qr';
  const isCodMethod = paymentMethod === 'cod';

  if (
    isRazorpayMethod &&
    !(cfg.mode === 'razorpay' || (cfg.mode === 'multiple' && cfg.allowRazorpay))
  ) {
    res.status(400).json({ error: 'Razorpay checkout is currently disabled by store admin.' });
    return;
  }
  if (
    isUpiQrMethod &&
    !(cfg.mode === 'upi_qr' || (cfg.mode === 'multiple' && cfg.allowUpiQr))
  ) {
    res.status(400).json({ error: 'UPI QR payment is currently disabled by store admin.' });
    return;
  }
  if (
    isCodMethod &&
    (!(cfg.mode === 'cod' || (cfg.mode === 'multiple' && cfg.allowCod)) ||
      !db.codSettings.enabled)
  ) {
    res.status(400).json({ error: 'Cash on Delivery is currently disabled by store admin.' });
    return;
  }

  const codFee = isCodMethod ? db.codSettings.codFee : 0;
  const totalAmount = discountedSubtotal + shippingCharge + taxAmount + codFee;

  if (isCodMethod) {
    if (
      totalAmount < db.codSettings.minOrderAmount ||
      totalAmount > db.codSettings.maxOrderAmount
    ) {
      res.status(400).json({
        error: `Cash on Delivery is available for orders between ₹${db.codSettings.minOrderAmount.toLocaleString('en-IN')} and ₹${db.codSettings.maxOrderAmount.toLocaleString('en-IN')}.`,
      });
      return;
    }
  }

  const now = new Date().toISOString();
  const orderId = `ord_${crypto.randomUUID().slice(0, 8)}`;
  const orderNumber = `SK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const receiptNumber = `RCPT-${orderNumber}`;

  // Handle UPI QR Manual Verification flow (NEVER auto-confirm)
  if (isUpiQrMethod) {
    if (!upiReferenceNumber?.trim() || upiReferenceNumber.trim().length < 6) {
      res.status(400).json({
        error: 'Please enter your valid UPI UTR / Transaction Reference ID (minimum 6 characters).',
      });
      return;
    }
    const upiAcc =
      db.upiAccounts.find((u) => u.id === cfg.activeUpiAccountId && u.isActive) ||
      db.upiAccounts.find((u) => u.isDefault && u.isActive) ||
      db.upiAccounts.find((u) => u.isActive);

    if (!upiAcc) {
      res.status(503).json({ error: 'No active UPI account is configured.' });
      return;
    }

    const order: Order = {
      id: orderId,
      orderNumber,
      userId,
      customerName: shippingAddress.fullName.trim(),
      customerEmail: shippingAddress.email.trim(),
      customerPhone: shippingAddress.phone.trim(),
      items: resolvedItems,
      subtotal,
      discountAmount,
      couponCode: appliedCouponCode,
      shippingCharge,
      taxAmount,
      codFee: 0,
      totalAmount,
      shippingAddress,
      orderStatus: 'pending',
      paymentStatus: 'pending_verification',
      paymentMethod: 'upi_qr',
      paymentGatewayLabel: 'UPI QR Manual Verification',
      paymentAccountId: upiAcc.id,
      paymentAccountLabel: upiAcc.label,
      upiReferenceNumber: upiReferenceNumber.trim(),
      transactionId: `UTR-${upiReferenceNumber.trim()}`,
      statusTimeline: [
        {
          status: 'pending',
          note: `UPI QR reference ${upiReferenceNumber.trim()} submitted. Awaiting admin verification.`,
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const payment: PaymentTransaction = {
      id: `pay_${crypto.randomUUID().slice(0, 8)}`,
      orderId,
      orderNumber,
      userId,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      amount: totalAmount,
      refundAmount: 0,
      currency: 'INR',
      method: 'upi_qr',
      gateway: 'upi_qr',
      paymentAccountId: upiAcc.id,
      paymentAccountLabel: upiAcc.label,
      upiReferenceNumber: upiReferenceNumber.trim(),
      upiIdUsed: upiAcc.upiId,
      status: 'pending_verification',
      receiptNumber,
      idempotencyKey: idemKey,
      createdAt: now,
      updatedAt: now,
    };

    if (appliedCouponCode) {
      const c = db.coupons.find((cp) => cp.code === appliedCouponCode);
      if (c) c.usageCount += 1;
    }

    db.orders.unshift(order);
    db.payments.unshift(payment);
    if (userId !== 'guest_checkout') db.carts[userId] = [];
    saveDb(db);

    res.status(201).json({
      flow: 'upi_qr',
      order,
      payment,
      message:
        'Order created in Payment Pending status. An administrator will verify your UTR before confirmation.',
    });
    return;
  }

  // Handle Cash on Delivery flow
  if (isCodMethod) {
    const order: Order = {
      id: orderId,
      orderNumber,
      userId,
      customerName: shippingAddress.fullName.trim(),
      customerEmail: shippingAddress.email.trim(),
      customerPhone: shippingAddress.phone.trim(),
      items: resolvedItems,
      subtotal,
      discountAmount,
      couponCode: appliedCouponCode,
      shippingCharge,
      taxAmount,
      codFee,
      totalAmount,
      shippingAddress,
      orderStatus: 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: 'cod',
      paymentGatewayLabel: 'Cash on Delivery',
      paymentAccountId: 'cod_gateway',
      paymentAccountLabel: 'Cash on Delivery Desk',
      transactionId: `COD-${orderNumber}`,
      statusTimeline: [
        {
          status: 'confirmed',
          note: 'Cash on Delivery order confirmed and queued for dispatch.',
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const payment: PaymentTransaction = {
      id: `pay_${crypto.randomUUID().slice(0, 8)}`,
      orderId,
      orderNumber,
      userId,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      amount: totalAmount,
      refundAmount: 0,
      currency: 'INR',
      method: 'cod',
      gateway: 'cod',
      paymentAccountId: 'cod_gateway',
      paymentAccountLabel: 'Cash on Delivery Desk',
      status: 'pending',
      receiptNumber,
      idempotencyKey: idemKey,
      createdAt: now,
      updatedAt: now,
    };

    decrementOrderStock(db, resolvedItems);
    if (appliedCouponCode) {
      const c = db.coupons.find((cp) => cp.code === appliedCouponCode);
      if (c) c.usageCount += 1;
    }
    db.orders.unshift(order);
    db.payments.unshift(payment);
    if (userId !== 'guest_checkout') db.carts[userId] = [];
    saveDb(db);

    res.status(201).json({
      flow: 'cod',
      order,
      payment,
      message: 'Cash on Delivery order confirmed.',
    });
    return;
  }

  // Handle Razorpay Gateway Order Creation
  const rzpAcc =
    db.razorpayAccounts.find(
      (a) => a.id === cfg.activeRazorpayAccountId && a.isActive
    ) || db.razorpayAccounts.find((a) => a.isActive);

  if (!rzpAcc) {
    res.status(503).json({
      error: 'No active Razorpay account configured. Please contact support.',
    });
    return;
  }

  const keySecret = decryptSecret(rzpAcc.encryptedKeySecret);
  const isDemoKey = rzpAcc.keyId.includes('_demo_');
  let razorpayOrderId = `order_sk_${crypto.randomBytes(7).toString('hex')}`;

  if (!isDemoKey) {
    try {
      const instance = new Razorpay({
        key_id: rzpAcc.keyId,
        key_secret: keySecret,
      });
      const rzpOrder = await instance.orders.create({
        amount: totalAmount * 100,
        currency: 'INR',
        receipt: receiptNumber,
        notes: {
          orderNumber,
          shopkartOrderId: orderId,
        },
      });
      razorpayOrderId = rzpOrder.id;
    } catch (err: any) {
      res.status(502).json({
        error: `Razorpay order creation failed: ${err?.error?.description || err?.message || 'Gateway error'}`,
      });
      return;
    }
  }

  const methodLabelMap: Record<string, string> = {
    razorpay_upi: 'Razorpay UPI / GPay / PhonePe',
    razorpay_card: 'Razorpay Debit / Credit Card',
    razorpay_netbanking: 'Razorpay Net Banking',
    razorpay_wallet: 'Razorpay Wallets',
  };

  const order: Order = {
    id: orderId,
    orderNumber,
    userId,
    customerName: shippingAddress.fullName.trim(),
    customerEmail: shippingAddress.email.trim(),
    customerPhone: shippingAddress.phone.trim(),
    items: resolvedItems,
    subtotal,
    discountAmount,
    couponCode: appliedCouponCode,
    shippingCharge,
    taxAmount,
    codFee: 0,
    totalAmount,
    shippingAddress,
    orderStatus: 'pending',
    paymentStatus: 'pending',
    paymentMethod,
    paymentGatewayLabel: methodLabelMap[paymentMethod] || 'Razorpay Checkout',
    paymentAccountId: rzpAcc.id,
    paymentAccountLabel: rzpAcc.label,
    razorpayOrderId,
    statusTimeline: [
      {
        status: 'pending',
        note: `Checkout initialized via ${rzpAcc.label}`,
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const payment: PaymentTransaction = {
    id: `pay_${crypto.randomUUID().slice(0, 8)}`,
    orderId,
    orderNumber,
    userId,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    amount: totalAmount,
    refundAmount: 0,
    currency: 'INR',
    method: paymentMethod,
    gateway: 'razorpay',
    paymentAccountId: rzpAcc.id,
    paymentAccountLabel: rzpAcc.label,
    razorpayOrderId,
    status: 'pending',
    receiptNumber,
    idempotencyKey: idemKey,
    createdAt: now,
    updatedAt: now,
  };

  db.orders.unshift(order);
  db.payments.unshift(payment);
  saveDb(db);

  res.status(201).json({
    flow: 'razorpay',
    isDemoKey,
    razorpay: {
      keyId: rzpAcc.keyId,
      orderId: razorpayOrderId,
      amountPaise: totalAmount * 100,
      currency: 'INR',
      accountLabel: rzpAcc.label,
    },
    order,
    payment,
  });
});

// Sandbox helper ONLY for demo keys (`rzp_test_demo_...`) to generate a real HMAC signature or test failure
paymentRouter.post('/sandbox-complete', rateLimit(30, 60_000), (req, res) => {
  const { orderId, outcome, methodDetail } = req.body as {
    orderId: string;
    outcome: 'success' | 'failed';
    methodDetail?: string;
  };
  const db = getDb();
  const order = db.orders.find((o) => o.id === orderId);
  const payment = db.payments.find((p) => p.orderId === orderId);
  if (!order || !payment) {
    res.status(404).json({ error: 'Order or payment record not found.' });
    return;
  }
  const rzpAcc = db.razorpayAccounts.find(
    (a) => a.id === order.paymentAccountId
  );
  if (!rzpAcc || !rzpAcc.keyId.includes('_demo_')) {
    res.status(403).json({
      error: 'Sandbox signing is disabled for live or production Razorpay keys.',
    });
    return;
  }

  if (outcome === 'failed') {
    const now = new Date().toISOString();
    order.paymentStatus = 'failed';
    order.updatedAt = now;
    order.statusTimeline.push({
      status: 'payment_failed',
      note: `Payment declined in gateway (${methodDetail || 'Customer bank declined'})`,
      timestamp: now,
    });
    payment.status = 'failed';
    payment.failureReason = methodDetail || 'Bank authorization failed';
    payment.updatedAt = now;
    saveDb(db);
    res.json({ verified: false, order, payment });
    return;
  }

  const keySecret = decryptSecret(rzpAcc.encryptedKeySecret);
  const razorpayPaymentId = `pay_sk_${crypto.randomBytes(6).toString('hex')}`;
  const razorpaySignature = createRazorpayTestSignature(
    order.razorpayOrderId || '',
    razorpayPaymentId,
    keySecret
  );

  res.json({
    razorpay_order_id: order.razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  });
});

// Server-side cryptographic payment signature verification (mandatory before confirming order)
paymentRouter.post('/verify', rateLimit(40, 60_000), (req, res) => {
  const {
    orderId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body as {
    orderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };

  if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400).json({ error: 'Missing payment verification parameters.' });
    return;
  }

  const db = getDb();
  const order = db.orders.find((o) => o.id === orderId);
  const payment = db.payments.find((p) => p.orderId === orderId);
  if (!order || !payment) {
    res.status(404).json({ error: 'Order record not found.' });
    return;
  }

  // Prevent duplicate verification
  if (order.paymentStatus === 'paid' && payment.status === 'paid') {
    res.json({ verified: true, duplicatePrevented: true, order, payment });
    return;
  }

  if (order.razorpayOrderId !== razorpay_order_id) {
    res.status(400).json({ error: 'Razorpay Order ID mismatch.' });
    return;
  }

  // Always verify against the exact account bound to this order at creation time
  const rzpAcc = db.razorpayAccounts.find(
    (a) => a.id === order.paymentAccountId
  );
  if (!rzpAcc) {
    res.status(500).json({ error: 'Original payment account record missing.' });
    return;
  }

  const keySecret = decryptSecret(rzpAcc.encryptedKeySecret);
  const valid = verifyRazorpaySignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    keySecret
  );

  const now = new Date().toISOString();

  if (!valid) {
    order.paymentStatus = 'failed';
    order.updatedAt = now;
    order.statusTimeline.push({
      status: 'verification_failed',
      note: 'Cryptographic payment signature verification failed.',
      timestamp: now,
    });
    payment.status = 'failed';
    payment.failureReason = 'Invalid HMAC-SHA256 payment signature';
    payment.updatedAt = now;
    saveDb(db);
    res.status(400).json({ error: 'Payment signature verification failed.' });
    return;
  }

  // Verification succeeded — confirm order and safely decrement stock
  order.paymentStatus = 'paid';
  order.orderStatus = 'confirmed';
  order.transactionId = razorpay_payment_id;
  order.updatedAt = now;
  order.statusTimeline.push({
    status: 'confirmed',
    note: `Payment verified (${razorpay_payment_id}) via ${rzpAcc.label}`,
    timestamp: now,
  });

  payment.status = 'paid';
  payment.razorpayPaymentId = razorpay_payment_id;
  payment.verifiedAt = now;
  payment.updatedAt = now;

  decrementOrderStock(db, order.items);
  if (order.couponCode) {
    const c = db.coupons.find((cp) => cp.code === order.couponCode);
    if (c) c.usageCount += 1;
  }
  if (order.userId !== 'guest_checkout') {
    db.carts[order.userId] = [];
  }

  addAuditLog(db, {
    actorId: order.userId,
    actorEmail: order.customerEmail,
    actorRole: 'customer',
    action: 'PAYMENT_VERIFIED',
    resourceType: 'order',
    resourceId: order.id,
    summary: `Verified Razorpay payment ${razorpay_payment_id} for ${order.orderNumber} (₹${order.totalAmount}).`,
  });

  saveDb(db);
  res.json({ verified: true, order, payment });
});

// Razorpay Webhook endpoint with X-Razorpay-Signature verification
paymentRouter.post('/webhook', (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (typeof signature !== 'string') {
    res.status(400).json({ error: 'Missing X-Razorpay-Signature header.' });
    return;
  }
  const rawBody = JSON.stringify(req.body);
  const event = req.body as any;
  const rzpOrderId = event?.payload?.payment?.entity?.order_id;
  const rzpPaymentId = event?.payload?.payment?.entity?.id;

  const db = getDb();
  const order = db.orders.find((o) => o.razorpayOrderId === rzpOrderId);
  if (!order) {
    res.status(200).json({ received: true, ignored: 'Order not matched' });
    return;
  }
  const rzpAcc = db.razorpayAccounts.find((a) => a.id === order.paymentAccountId);
  const webhookSecret = rzpAcc
    ? decryptSecret(rzpAcc.encryptedWebhookSecret)
    : '';
  if (!webhookSecret || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    res.status(401).json({ error: 'Invalid webhook signature.' });
    return;
  }

  const now = new Date().toISOString();
  const payment = db.payments.find((p) => p.orderId === order.id);

  if (event.event === 'payment.captured' && order.paymentStatus !== 'paid') {
    order.paymentStatus = 'paid';
    order.orderStatus = 'confirmed';
    order.transactionId = rzpPaymentId;
    order.updatedAt = now;
    order.statusTimeline.push({
      status: 'confirmed',
      note: `Webhook payment.captured reconciled (${rzpPaymentId})`,
      timestamp: now,
    });
    if (payment) {
      payment.status = 'paid';
      payment.razorpayPaymentId = rzpPaymentId;
      payment.verifiedAt = now;
      payment.updatedAt = now;
    }
    decrementOrderStock(db, order.items);
    saveDb(db);
  } else if (event.event === 'payment.failed' && order.paymentStatus !== 'paid') {
    order.paymentStatus = 'failed';
    order.updatedAt = now;
    if (payment) {
      payment.status = 'failed';
      payment.failureReason =
        event?.payload?.payment?.entity?.error_description || 'Webhook reported failure';
      payment.updatedAt = now;
    }
    saveDb(db);
  }

  res.json({ received: true });
});
