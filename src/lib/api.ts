import type { Order } from '../types';

export function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function getCustomerToken(): string | null {
  return localStorage.getItem('shopkart_customer_token');
}

export function setCustomerToken(token: string | null): void {
  if (token) localStorage.setItem('shopkart_customer_token', token);
  else localStorage.removeItem('shopkart_customer_token');
}

export function getAdminToken(): string | null {
  return localStorage.getItem('shopkart_admin_token');
}

export function setAdminToken(token: string | null): void {
  if (token) localStorage.setItem('shopkart_admin_token', token);
  else localStorage.removeItem('shopkart_admin_token');
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { authMode?: 'customer' | 'admin' | 'none' } = {}
): Promise<T> {
  const { authMode = 'none', headers, ...rest } = options;
  const reqHeaders = new Headers(headers);
  if (!reqHeaders.has('Content-Type') && rest.body) {
    reqHeaders.set('Content-Type', 'application/json');
  }
  if (authMode === 'customer') {
    const token = getCustomerToken();
    if (token) reqHeaders.set('Authorization', `Bearer ${token}`);
  } else if (authMode === 'admin') {
    const token = getAdminToken();
    if (token) reqHeaders.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...rest, headers: reqHeaders });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function downloadOrderInvoice(order: Order): void {
  const rows = order.items
    .map(
      (item, idx) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;">${idx + 1}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;">
          <strong>${escapeHtml(item.productName)}</strong><br/>
          <span style="font-size:12px;color:#64748b;">Variant: ${escapeHtml(item.variantLabel)} · SKU: ${escapeHtml(item.sku)}</span>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.quantity}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${item.unitPrice.toLocaleString('en-IN')}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${item.lineTotal.toLocaleString('en-IN')}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(order.orderNumber)} — SHOPKART</title>
  <style>
    body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #0f172a; margin: 40px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 24px; }
    .brand { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
    .meta { text-align: right; font-size: 13px; color: #475569; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; font-size: 13px; }
    .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
    th { background: #f8fafc; text-align: left; padding: 10px 8px; border-bottom: 1px solid #cbd5e1; }
    .totals { max-width: 320px; margin-left: auto; font-size: 13px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
    .totals-final { border-top: 2px solid #0f172a; font-weight: 700; font-size: 16px; padding-top: 10px; margin-top: 6px; }
    .footer { margin-top: 40px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">SHOPKART</div>
      <div style="font-size:12px;color:#475569;margin-top:4px;">SHOPKART Retail Pvt. Ltd. · GSTIN 27AABCS1429B1Z5</div>
    </div>
    <div class="meta">
      <div><strong>TAX INVOICE</strong></div>
      <div>Order #: ${escapeHtml(order.orderNumber)}</div>
      <div>Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}</div>
      <div>Payment Status: ${escapeHtml(order.paymentStatus.toUpperCase())}</div>
    </div>
  </div>
  <div class="grid">
    <div class="box">
      <div style="font-weight:600;margin-bottom:6px;">Billed &amp; Shipped To</div>
      <div>${escapeHtml(order.shippingAddress.fullName)}</div>
      <div>${escapeHtml(order.shippingAddress.line1)}</div>
      ${order.shippingAddress.line2 ? `<div>${escapeHtml(order.shippingAddress.line2)}</div>` : ''}
      <div>${escapeHtml(order.shippingAddress.city)}, ${escapeHtml(order.shippingAddress.state)} ${escapeHtml(order.shippingAddress.postalCode)}</div>
      <div>Phone: ${escapeHtml(order.shippingAddress.phone)}</div>
    </div>
    <div class="box">
      <div style="font-weight:600;margin-bottom:6px;">Payment &amp; Gateway Record</div>
      <div>Method: ${escapeHtml(order.paymentGatewayLabel)}</div>
      <div>Account Snapshot: ${escapeHtml(order.paymentAccountLabel || 'Standard')}</div>
      <div>Transaction ID: ${escapeHtml(order.transactionId || order.razorpayOrderId || 'Pending')}</div>
      ${order.trackingNumber ? `<div>Tracking: ${escapeHtml(order.carrierName || '')} ${escapeHtml(order.trackingNumber)}</div>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item &amp; SKU</th>
        <th style="text-align:right;">Qty</th>
        <th style="text-align:right;">Unit Price</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>₹${order.subtotal.toLocaleString('en-IN')}</span></div>
    ${order.discountAmount > 0 ? `<div class="totals-row"><span>Coupon (${escapeHtml(order.couponCode || '')})</span><span>-₹${order.discountAmount.toLocaleString('en-IN')}</span></div>` : ''}
    <div class="totals-row"><span>GST (18%)</span><span>₹${order.taxAmount.toLocaleString('en-IN')}</span></div>
    <div class="totals-row"><span>Shipping</span><span>${order.shippingCharge === 0 ? 'FREE' : `₹${order.shippingCharge.toLocaleString('en-IN')}`}</span></div>
    ${order.codFee > 0 ? `<div class="totals-row"><span>COD Handling Fee</span><span>₹${order.codFee.toLocaleString('en-IN')}</span></div>` : ''}
    <div class="totals-row totals-final"><span>Total Payable</span><span>₹${order.totalAmount.toLocaleString('en-IN')}</span></div>
  </div>
  <div class="footer">
    Computer-generated Tax Invoice &amp; Payment Receipt from SHOPKART. Support: support@shopkart.in
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SHOPKART-Invoice-${order.orderNumber}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
