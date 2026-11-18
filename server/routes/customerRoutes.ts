import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb, saveDb, type StoredUser } from '../db.ts';
import {
  rateLimit,
  requireCustomer,
  signToken,
  type AuthedRequest,
} from '../auth.ts';

export const customerRouter = Router();

function sanitizeUser(u: StoredUser) {
  const { passwordHash, resetToken, resetTokenExpiresAt, verificationCode, ...safe } = u;
  return safe;
}

customerRouter.post('/auth/register', rateLimit(20, 60_000), (req, res) => {
  const { name, email, phone, password } = req.body as Record<string, string>;
  if (!name?.trim() || !email?.trim() || !phone?.trim() || !password) {
    res.status(400).json({ error: 'Name, email, phone, and password are required.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }
  const now = new Date().toISOString();
  const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
  const user: StoredUser = {
    id: `cust_${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim(),
    email: normalizedEmail,
    phone: phone.trim(),
    role: 'customer',
    isVerified: false,
    isBlocked: false,
    wishlist: [],
    passwordHash: bcrypt.hashSync(password, 10),
    verificationCode,
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(user);
  saveDb(db);

  const token = signToken({
    id: user.id,
    email: user.email,
    role: 'customer',
    type: 'customer',
  });
  res.status(201).json({
    token,
    user: sanitizeUser(user),
    verificationHint: verificationCode,
  });
});

customerRouter.post('/auth/login', rateLimit(25, 60_000), (req, res) => {
  const { email, password } = req.body as Record<string, string>;
  if (!email?.trim() || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const db = getDb();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  if (user.isBlocked) {
    res.status(403).json({
      error: 'This account has been blocked by an administrator.',
    });
    return;
  }
  const token = signToken({
    id: user.id,
    email: user.email,
    role: 'customer',
    type: 'customer',
  });
  res.json({ token, user: sanitizeUser(user) });
});

customerRouter.post('/auth/verify-email', requireCustomer, (req: AuthedRequest, res) => {
  const { code } = req.body as { code?: string };
  const db = getDb();
  const user = db.users.find((u) => u.id === req.auth!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (user.isVerified) {
    res.json({ verified: true, user: sanitizeUser(user) });
    return;
  }
  if (!code || code.trim() !== user.verificationCode) {
    res.status(400).json({ error: 'Invalid verification code.' });
    return;
  }
  user.isVerified = true;
  user.verificationCode = undefined;
  user.updatedAt = new Date().toISOString();
  saveDb(db);
  res.json({ verified: true, user: sanitizeUser(user) });
});

customerRouter.post('/auth/forgot-password', rateLimit(15, 60_000), (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }
  const db = getDb();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (!user) {
    res.json({
      sent: true,
      message: 'If an account exists for that email, a reset token has been generated.',
    });
    return;
  }
  const resetToken = crypto.randomBytes(4).toString('hex').toUpperCase();
  user.resetToken = resetToken;
  user.resetTokenExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  saveDb(db);
  res.json({
    sent: true,
    message: 'Password reset code generated (valid for 15 minutes).',
    resetTokenHint: resetToken,
  });
});

customerRouter.post('/auth/reset-password', rateLimit(15, 60_000), (req, res) => {
  const { email, token, newPassword } = req.body as Record<string, string>;
  if (!email?.trim() || !token?.trim() || !newPassword) {
    res.status(400).json({ error: 'Email, reset token, and new password are required.' });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters.' });
    return;
  }
  const db = getDb();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (
    !user ||
    !user.resetToken ||
    user.resetToken !== token.trim().toUpperCase() ||
    !user.resetTokenExpiresAt ||
    new Date(user.resetTokenExpiresAt).getTime() < Date.now()
  ) {
    res.status(400).json({ error: 'Invalid or expired reset code.' });
    return;
  }
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  user.resetToken = undefined;
  user.resetTokenExpiresAt = undefined;
  user.updatedAt = new Date().toISOString();
  saveDb(db);
  res.json({ success: true, message: 'Password has been reset successfully.' });
});

customerRouter.get('/me', requireCustomer, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = db.users.find((u) => u.id === req.auth!.id)!;
  const addresses = db.addresses.filter((a) => a.userId === user.id);
  const orders = db.orders
    .filter((o) => o.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cart = db.carts[user.id] || [];
  res.json({ user: sanitizeUser(user), addresses, orders, cart });
});

customerRouter.put('/me', requireCustomer, (req: AuthedRequest, res) => {
  const { name, phone } = req.body as { name?: string; phone?: string };
  const db = getDb();
  const user = db.users.find((u) => u.id === req.auth!.id)!;
  if (name?.trim()) user.name = name.trim();
  if (phone?.trim()) user.phone = phone.trim();
  user.updatedAt = new Date().toISOString();
  saveDb(db);
  res.json({ user: sanitizeUser(user) });
});

customerRouter.put('/cart', requireCustomer, (req: AuthedRequest, res) => {
  const { items } = req.body as {
    items?: { productId: string; variantId: string; quantity: number }[];
  };
  if (!Array.isArray(items)) {
    res.status(400).json({ error: 'Invalid cart payload.' });
    return;
  }
  const db = getDb();
  db.carts[req.auth!.id] = items
    .filter((i) => i.productId && i.quantity > 0)
    .slice(0, 50);
  saveDb(db);
  res.json({ cart: db.carts[req.auth!.id] });
});

customerRouter.post('/wishlist/:productId', requireCustomer, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = db.users.find((u) => u.id === req.auth!.id)!;
  const productId = String(req.params.productId);
  if (user.wishlist.includes(productId)) {
    user.wishlist = user.wishlist.filter((id) => id !== productId);
  } else {
    user.wishlist.push(productId);
  }
  user.updatedAt = new Date().toISOString();
  saveDb(db);
  res.json({ wishlist: user.wishlist });
});

customerRouter.post('/addresses', requireCustomer, (req: AuthedRequest, res) => {
  const { fullName, phone, line1, line2, city, state, postalCode, isDefault } =
    req.body as Record<string, any>;
  if (!fullName?.trim() || !phone?.trim() || !line1?.trim() || !city?.trim() || !state?.trim() || !postalCode?.trim()) {
    res.status(400).json({ error: 'All required address fields must be provided.' });
    return;
  }
  const db = getDb();
  const userId = req.auth!.id;
  if (isDefault) {
    db.addresses.forEach((a) => {
      if (a.userId === userId) a.isDefault = false;
    });
  }
  const addr = {
    id: `addr_${crypto.randomUUID().slice(0, 8)}`,
    userId,
    fullName: fullName.trim(),
    phone: phone.trim(),
    line1: line1.trim(),
    line2: line2?.trim() || '',
    city: city.trim(),
    state: state.trim(),
    postalCode: postalCode.trim(),
    country: 'India',
    isDefault: Boolean(isDefault) || !db.addresses.some((a) => a.userId === userId),
    createdAt: new Date().toISOString(),
  };
  db.addresses.push(addr);
  saveDb(db);
  res.status(201).json({ address: addr });
});

customerRouter.delete('/addresses/:id', requireCustomer, (req: AuthedRequest, res) => {
  const db = getDb();
  const before = db.addresses.length;
  db.addresses = db.addresses.filter(
    (a) => !(a.id === req.params.id && a.userId === req.auth!.id)
  );
  if (db.addresses.length === before) {
    res.status(404).json({ error: 'Address not found.' });
    return;
  }
  saveDb(db);
  res.json({ deleted: true });
});

customerRouter.post('/products/:id/reviews', requireCustomer, (req: AuthedRequest, res) => {
  const { rating, title, comment } = req.body as {
    rating?: number;
    title?: string;
    comment?: string;
  };
  const db = getDb();
  const product = db.products.find((p) => p.id === req.params.id);
  if (!product) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }
  if (!rating || rating < 1 || rating > 5 || !comment?.trim()) {
    res.status(400).json({ error: 'Rating (1-5) and comment are required.' });
    return;
  }
  const user = db.users.find((u) => u.id === req.auth!.id)!;
  const verifiedPurchase = db.orders.some(
    (o) =>
      o.userId === user.id &&
      o.orderStatus !== 'cancelled' &&
      o.items.some((i) => i.productId === product.id)
  );
  const review = {
    id: `rev_${crypto.randomUUID().slice(0, 8)}`,
    productId: product.id,
    productName: product.name,
    userId: user.id,
    userName: user.name,
    rating: Math.round(rating),
    title: title?.trim() || 'Verified Customer Review',
    comment: comment.trim(),
    verifiedPurchase,
    isApproved: true,
    createdAt: new Date().toISOString(),
  };
  db.reviews.unshift(review);
  const prodReviews = db.reviews.filter((r) => r.productId === product.id && r.isApproved);
  product.reviewCount = prodReviews.length;
  product.rating = Number(
    (prodReviews.reduce((sum, r) => sum + r.rating, 0) / prodReviews.length).toFixed(1)
  );
  saveDb(db);
  res.status(201).json({ review });
});

customerRouter.post('/orders/:id/return', requireCustomer, (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) {
    res.status(400).json({ error: 'Please specify a return reason.' });
    return;
  }
  const db = getDb();
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.userId === req.auth!.id
  );
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (order.orderStatus !== 'delivered') {
    res.status(400).json({ error: 'Returns can only be requested for delivered orders.' });
    return;
  }
  if (db.returns.some((r) => r.orderId === order.id)) {
    res.status(409).json({ error: 'A return request already exists for this order.' });
    return;
  }
  const now = new Date().toISOString();
  const ret = {
    id: `ret_${crypto.randomUUID().slice(0, 8)}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    customerName: order.customerName,
    reason: reason.trim(),
    status: 'requested' as const,
    refundAmount: order.totalAmount,
    createdAt: now,
    updatedAt: now,
  };
  db.returns.unshift(ret);
  saveDb(db);
  res.status(201).json({ returnRequest: ret });
});
