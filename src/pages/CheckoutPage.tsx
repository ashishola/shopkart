import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  Lock,
  QrCode,
  ShieldCheck,
  Smartphone,
  Truck,
  AlertCircle,
  X,
} from 'lucide-react';
import type {
  Address,
  CartItem,
  CheckoutPaymentOptionsResponse,
  Order,
  PaymentMethodType,
  Product,
  User,
  WebsiteSettings,
} from '../types';
import { apiFetch, downloadOrderInvoice, formatInr } from '../lib/api';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, any>) => { open: () => void };
  }
}

interface CheckoutPageProps {
  cart: CartItem[];
  products: Product[];
  settings: WebsiteSettings;
  user: User | null;
  addresses: Address[];
  onOrderCompleted: (order: Order) => void;
  onNavigate: (page: string) => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  cart,
  products,
  settings,
  user,
  addresses,
  onOrderCompleted,
  onNavigate,
}) => {
  const [paymentOptions, setPaymentOptions] =
    useState<CheckoutPaymentOptionsResponse | null>(null);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [selectedMethod, setSelectedMethod] =
    useState<PaymentMethodType>('razorpay_upi');
  const [upiReference, setUpiReference] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
  } | null>(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Sandbox Razorpay Checkout Modal state (only used when active Razorpay account is a demo key)
  const [sandboxModal, setSandboxModal] = useState<{
    order: Order;
    keyId: string;
    accountLabel: string;
    amountPaise: number;
    subChannel: 'UPI / GPay / PhonePe' | 'Card' | 'NetBanking' | 'Wallet';
  } | null>(null);

  const defaultAddr = addresses.find((a) => a.isDefault) || addresses[0];
  const [shipping, setShipping] = useState({
    fullName: defaultAddr?.fullName || user?.name || '',
    phone: defaultAddr?.phone || user?.phone || '',
    email: user?.email || '',
    line1: defaultAddr?.line1 || '',
    line2: defaultAddr?.line2 || '',
    city: defaultAddr?.city || '',
    state: defaultAddr?.state || '',
    postalCode: defaultAddr?.postalCode || '',
    country: 'India',
  });

  useEffect(() => {
    if (user && !shipping.email) {
      setShipping((prev) => ({
        ...prev,
        email: user.email,
        fullName: prev.fullName || user.name,
        phone: prev.phone || user.phone,
      }));
    }
  }, [user]);

  useEffect(() => {
    setLoadingOpts(true);
    apiFetch<CheckoutPaymentOptionsResponse>('/api/payment-options')
      .then((opts) => {
        setPaymentOptions(opts);
        if (opts.razorpay?.enabled) {
          setSelectedMethod('razorpay_upi');
        } else if (opts.upiQr?.enabled) {
          setSelectedMethod('upi_qr');
        } else if (opts.cod.enabled) {
          setSelectedMethod('cod');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingOpts(false));
  }, []);

  const lineItems = useMemo(() => {
    return cart
      .map((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return null;
        const variant =
          product.variants.find((v) => v.id === item.variantId) ||
          product.variants[0];
        const unitPrice = product.discountedPrice + (variant?.priceDelta || 0);
        return {
          ...item,
          product,
          variant,
          unitPrice,
          lineTotal: unitPrice * item.quantity,
        };
      })
      .filter(Boolean) as {
      productId: string;
      variantId: string;
      quantity: number;
      product: Product;
      variant: Product['variants'][number];
      unitPrice: number;
      lineTotal: number;
    }[];
  }, [cart, products]);

  const subtotal = lineItems.reduce((s, l) => s + l.lineTotal, 0);
  const discountAmount = appliedCoupon?.discountAmount || 0;
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const shippingCharge =
    discountedSubtotal >= settings.freeShippingThreshold || discountedSubtotal === 0
      ? 0
      : settings.standardShippingFee;
  const taxAmount = Math.round(
    (discountedSubtotal * settings.gstRatePercent) / 100
  );
  const codFee =
    selectedMethod === 'cod' && paymentOptions?.cod.enabled
      ? paymentOptions.cod.codFee
      : 0;
  const totalAmount = discountedSubtotal + shippingCharge + taxAmount + codFee;

  const handleApplyCoupon = async () => {
    setCouponMsg('');
    if (!couponInput.trim()) return;
    try {
      const res = await apiFetch<{
        valid: boolean;
        coupon: { code: string; discountAmount: number };
      }>('/api/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code: couponInput.trim(), subtotal }),
      });
      setAppliedCoupon(res.coupon);
      setCouponMsg(`Applied ${res.coupon.code} (-${formatInr(res.coupon.discountAmount)})`);
    } catch (err: any) {
      setAppliedCoupon(null);
      setCouponMsg(err.message);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const idempotencyKey = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        items: cart,
        shippingAddress: shipping,
        paymentMethod: selectedMethod,
        couponCode: appliedCoupon?.code,
        upiReferenceNumber:
          selectedMethod === 'upi_qr' ? upiReference.trim() : undefined,
        idempotencyKey,
      };

      const res = await apiFetch<any>('/api/payments/create-order', {
        method: 'POST',
        authMode: user ? 'customer' : 'none',
        body: JSON.stringify(payload),
      });

      if (res.flow === 'cod' || res.flow === 'upi_qr') {
        setConfirmedOrder(res.order);
        onOrderCompleted(res.order);
        return;
      }

      if (res.flow === 'razorpay') {
        if (res.isDemoKey || !window.Razorpay) {
          setSandboxModal({
            order: res.order,
            keyId: res.razorpay.keyId,
            accountLabel: res.razorpay.accountLabel,
            amountPaise: res.razorpay.amountPaise,
            subChannel:
              selectedMethod === 'razorpay_card'
                ? 'Card'
                : selectedMethod === 'razorpay_netbanking'
                  ? 'NetBanking'
                  : selectedMethod === 'razorpay_wallet'
                    ? 'Wallet'
                    : 'UPI / GPay / PhonePe',
          });
          return;
        }

        // Live / Official Razorpay Checkout modal
        const rzp = new window.Razorpay({
          key: res.razorpay.keyId,
          amount: res.razorpay.amountPaise,
          currency: res.razorpay.currency,
          name: 'SHOPKART',
          description: `Order ${res.order.orderNumber}`,
          order_id: res.razorpay.orderId,
          prefill: {
            name: shipping.fullName,
            email: shipping.email,
            contact: shipping.phone,
          },
          theme: { color: '#1D4ED8' },
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const verified = await apiFetch<{ verified: boolean; order: Order }>(
                '/api/payments/verify',
                {
                  method: 'POST',
                  body: JSON.stringify({
                    orderId: res.order.id,
                    ...response,
                  }),
                }
              );
              setConfirmedOrder(verified.order);
              onOrderCompleted(verified.order);
            } catch (verErr: any) {
              setError(verErr.message);
            }
          },
        });
        rzp.open();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSandboxOutcome = async (outcome: 'success' | 'failed') => {
    if (!sandboxModal) return;
    setSubmitting(true);
    setError('');
    try {
      const signRes = await apiFetch<any>('/api/payments/sandbox-complete', {
        method: 'POST',
        body: JSON.stringify({
          orderId: sandboxModal.order.id,
          outcome,
          methodDetail: `${sandboxModal.subChannel} sandbox test`,
        }),
      });

      if (outcome === 'failed') {
        setSandboxModal(null);
        setError(
          `Payment failed for order ${sandboxModal.order.orderNumber}. You can retry or select another payment method.`
        );
        return;
      }

      // Now send the HMAC-signed response to the strict server-side verification endpoint
      const verified = await apiFetch<{ verified: boolean; order: Order }>(
        '/api/payments/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            orderId: sandboxModal.order.id,
            razorpay_order_id: signRes.razorpay_order_id,
            razorpay_payment_id: signRes.razorpay_payment_id,
            razorpay_signature: signRes.razorpay_signature,
          }),
        }
      );
      setSandboxModal(null);
      setConfirmedOrder(verified.order);
      onOrderCompleted(verified.order);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmedOrder) {
    const isPendingUpi = confirmedOrder.paymentStatus === 'pending_verification';
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="border border-slate-200 rounded-2xl p-8 bg-white">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-xl ${
                isPendingUpi ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isPendingUpi
                  ? 'Order Recorded · Payment Verification Pending'
                  : 'Order Confirmed'}
              </p>
              <h1 className="font-display text-2xl font-bold text-slate-900 mt-1">
                {isPendingUpi
                  ? `Order ${confirmedOrder.orderNumber} Awaiting UPI Verification`
                  : `Thank you! Order ${confirmedOrder.orderNumber} Confirmed`}
              </h1>
              <p className="text-sm text-slate-600 mt-2">
                {isPendingUpi
                  ? `We received UTR reference ${confirmedOrder.upiReferenceNumber}. An authorized SHOPKART finance admin will verify this transaction before shipping.`
                  : 'Your payment has been verified on our server and your items are queued for dispatch.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-200 text-sm">
            <div>
              <p className="text-xs text-slate-500">Transaction / Reference</p>
              <p className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                {confirmedOrder.transactionId || confirmedOrder.razorpayOrderId || 'COD'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Gateway Account Snapshot</p>
              <p className="font-medium text-slate-900 mt-0.5">
                {confirmedOrder.paymentAccountLabel}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Amount</p>
              <p className="font-bold text-slate-900 mt-0.5 tabular-nums">
                {formatInr(confirmedOrder.totalAmount)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-8">
            <button
              onClick={() => downloadOrderInvoice(confirmedOrder)}
              className="px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Invoice
            </button>
            <button
              onClick={() => onNavigate('track')}
              className="px-4 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
            >
              Track Order Status
            </button>
            <button
              onClick={() => onNavigate('home')}
              className="px-4 py-2.5 border border-slate-300 text-slate-800 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (lineItems.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Your shopping cart is empty
        </h1>
        <p className="text-sm text-slate-600 mt-2">
          Browse our catalog to add flagship hardware or studio essentials before checking out.
        </p>
        <button
          onClick={() => onNavigate('shop')}
          className="mt-6 px-5 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800"
        >
          Browse All Products
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between pb-6 border-b border-slate-200">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">
            Secure Checkout
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Server-verified pricing, taxes, and active gateway routing.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <Lock className="w-4 h-4 text-blue-700" />
          <span>256-bit HMAC Verified Checkout</span>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={handlePlaceOrder}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8 items-start"
      >
        {/* Left: Shipping & Payment Method */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-slate-200 rounded-xl p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                1. Shipping &amp; Contact Information
              </h2>
              {addresses.length > 0 && (
                <select
                  onChange={(e) => {
                    const found = addresses.find((a) => a.id === e.target.value);
                    if (found) {
                      setShipping((prev) => ({
                        ...prev,
                        fullName: found.fullName,
                        phone: found.phone,
                        line1: found.line1,
                        line2: found.line2 || '',
                        city: found.city,
                        state: found.state,
                        postalCode: found.postalCode,
                      }));
                    }
                  }}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Fill from saved addresses
                  </option>
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName} — {a.city} ({a.postalCode})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  required
                  value={shipping.fullName}
                  onChange={(e) =>
                    setShipping({ ...shipping, fullName: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Phone Number *
                </label>
                <input
                  required
                  value={shipping.phone}
                  onChange={(e) =>
                    setShipping({ ...shipping, phone: e.target.value })
                  }
                  placeholder="+91 98XXXXXXXX"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email for Invoice &amp; Tracking *
                </label>
                <input
                  required
                  type="email"
                  value={shipping.email}
                  onChange={(e) =>
                    setShipping({ ...shipping, email: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Street Address / Flat / Building *
                </label>
                <input
                  required
                  value={shipping.line1}
                  onChange={(e) =>
                    setShipping({ ...shipping, line1: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Locality / Landmark
                </label>
                <input
                  value={shipping.line2}
                  onChange={(e) =>
                    setShipping({ ...shipping, line2: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  PIN Code *
                </label>
                <input
                  required
                  value={shipping.postalCode}
                  onChange={(e) =>
                    setShipping({ ...shipping, postalCode: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  City *
                </label>
                <input
                  required
                  value={shipping.city}
                  onChange={(e) =>
                    setShipping({ ...shipping, city: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  State *
                </label>
                <input
                  required
                  value={shipping.state}
                  onChange={(e) =>
                    setShipping({ ...shipping, state: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                />
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                2. Payment Method
              </h2>
              {paymentOptions?.razorpay?.enabled && (
                <span className="text-xs text-slate-500">
                  Active Gateway: {paymentOptions.razorpay.accountLabel}
                </span>
              )}
            </div>

            {loadingOpts ? (
              <div className="py-6 text-sm text-slate-500">
                Loading active payment gateways...
              </div>
            ) : (
              <div className="space-y-3">
                {paymentOptions?.razorpay?.enabled && (
                  <>
                    <label
                      className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                        selectedMethod === 'razorpay_upi'
                          ? 'border-blue-700 bg-blue-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="pm"
                        checked={selectedMethod === 'razorpay_upi'}
                        onChange={() => setSelectedMethod('razorpay_upi')}
                        className="mt-1"
                      />
                      <Smartphone className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-900">
                          Razorpay UPI — Google Pay, PhonePe, BHIM, Paytm
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Instant UPI intent or collect request verified via Razorpay HMAC.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                        selectedMethod === 'razorpay_card' ||
                        selectedMethod === 'razorpay_netbanking' ||
                        selectedMethod === 'razorpay_wallet'
                          ? 'border-blue-700 bg-blue-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="pm"
                        checked={
                          selectedMethod === 'razorpay_card' ||
                          selectedMethod === 'razorpay_netbanking' ||
                          selectedMethod === 'razorpay_wallet'
                        }
                        onChange={() => setSelectedMethod('razorpay_card')}
                        className="mt-1"
                      />
                      <CreditCard className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-900">
                          Credit / Debit Cards, Net Banking &amp; Wallets (Razorpay)
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {(
                            [
                              ['razorpay_card', 'Debit / Credit Card'],
                              ['razorpay_netbanking', 'Net Banking'],
                              ['razorpay_wallet', 'Supported Wallets'],
                            ] as const
                          ).map(([val, lbl]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setSelectedMethod(val)}
                              className={`px-2.5 py-1 text-xs rounded-md border ${
                                selectedMethod === val
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </label>
                  </>
                )}

                {paymentOptions?.upiQr?.enabled && (
                  <div
                    className={`p-4 rounded-xl border transition-colors ${
                      selectedMethod === 'upi_qr'
                        ? 'border-blue-700 bg-blue-50/40'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="pm"
                        checked={selectedMethod === 'upi_qr'}
                        onChange={() => setSelectedMethod('upi_qr')}
                        className="mt-1"
                      />
                      <QrCode className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-900">
                          UPI QR Code Payment (Manual Admin Verification)
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Scan merchant QR ({paymentOptions.upiQr.upiId}) and submit UTR.
                        </p>
                      </div>
                    </label>

                    {selectedMethod === 'upi_qr' && (
                      <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        <div className="flex flex-col items-center bg-white border border-slate-200 rounded-xl p-3">
                          <img
                            src={paymentOptions.upiQr.qrImageUrl}
                            alt="Merchant UPI QR"
                            className="w-44 h-48 object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(
                                paymentOptions.upiQr!.upiId
                              );
                              setCopiedUpi(true);
                              setTimeout(() => setCopiedUpi(false), 2000);
                            }}
                            className="mt-2 text-xs font-mono text-blue-700 hover:underline inline-flex items-center gap-1"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {copiedUpi
                              ? 'Copied UPI ID!'
                              : paymentOptions.upiQr.upiId}
                          </button>
                        </div>
                        <div className="space-y-3">
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {paymentOptions.upiQr.instructions}
                          </p>
                          <div>
                            <label className="block text-xs font-semibold text-slate-800 mb-1">
                              Payable Amount: {formatInr(totalAmount)}
                            </label>
                            <input
                              required={selectedMethod === 'upi_qr'}
                              value={upiReference}
                              onChange={(e) => setUpiReference(e.target.value)}
                              placeholder="Enter 12-digit UTR / Ref Number"
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-blue-700"
                            />
                          </div>
                          <p className="text-[11px] text-amber-700">
                            Security notice: Order remains payment-pending until our admin desk verifies your UTR.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {paymentOptions?.cod.enabled && (
                  <label
                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                      selectedMethod === 'cod'
                        ? 'border-blue-700 bg-blue-50/40'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pm"
                      checked={selectedMethod === 'cod'}
                      onChange={() => setSelectedMethod('cod')}
                      className="mt-1"
                    />
                    <Truck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">
                        Cash on Delivery (COD)
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {paymentOptions.cod.availabilityNote}
                        {paymentOptions.cod.codFee > 0
                          ? ` · COD Fee: ${formatInr(paymentOptions.cod.codFee)}`
                          : ''}
                      </p>
                    </div>
                  </label>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Order Summary */}
        <div className="lg:col-span-5 border border-slate-200 rounded-xl p-6 bg-white sticky top-24">
          <h2 className="font-display text-lg font-bold text-slate-900 pb-4 border-b border-slate-200">
            Order Summary ({lineItems.reduce((s, l) => s + l.quantity, 0)} items)
          </h2>

          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto my-4">
            {lineItems.map((l) => (
              <div
                key={`${l.productId}-${l.variantId}`}
                className="py-3 flex items-center gap-3"
              >
                <img
                  src={l.product.images[0]}
                  alt={l.product.name}
                  className="w-14 h-12 object-cover rounded-lg border border-slate-200 bg-slate-50"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {l.product.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {l.variant?.label} · Qty {l.quantity}
                  </p>
                </div>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">
                  {formatInr(l.lineTotal)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Promo / Coupon Code (Try SHOP10 or WELCOME500)
            </label>
            <div className="flex gap-2">
              <input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="Enter code"
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg uppercase font-mono"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                Apply
              </button>
            </div>
            {couponMsg && (
              <p
                className={`text-xs mt-1.5 ${
                  appliedCoupon ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {couponMsg}
              </p>
            )}
          </div>

          <div className="space-y-2.5 text-sm mt-5 pt-4 border-t border-slate-200 tabular-nums">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatInr(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount ({appliedCoupon?.code})</span>
                <span>-{formatInr(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>GST ({settings.gstRatePercent}%)</span>
              <span>{formatInr(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Shipping</span>
              <span>
                {shippingCharge === 0 ? 'FREE' : formatInr(shippingCharge)}
              </span>
            </div>
            {codFee > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>COD Handling Fee</span>
                <span>{formatInr(codFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 pt-3 border-t border-slate-200">
              <span>Total Payable</span>
              <span>{formatInr(totalAmount)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || loadingOpts}
            className="w-full mt-6 py-3 px-4 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            {submitting
              ? 'Processing Secure Order...'
              : selectedMethod === 'cod'
                ? `Place COD Order · ${formatInr(totalAmount)}`
                : selectedMethod === 'upi_qr'
                  ? `Submit UPI Payment · ${formatInr(totalAmount)}`
                  : `Pay Securely · ${formatInr(totalAmount)}`}
          </button>
        </div>
      </form>

      {/* Razorpay Server-Signed Checkout Simulator Modal (for Demo Keys) */}
      {sandboxModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xl">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-300 font-medium">
                  Razorpay Checkout · {sandboxModal.accountLabel}
                </p>
                <h3 className="font-display text-lg font-bold mt-0.5">
                  SHOPKART · {formatInr(sandboxModal.amountPaise / 100)}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Key: {sandboxModal.keyId}
                </p>
              </div>
              <button
                onClick={() => setSandboxModal(null)}
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  Select Payment Instrument
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      'UPI / GPay / PhonePe',
                      'Card',
                      'NetBanking',
                      'Wallet',
                    ] as const
                  ).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() =>
                        setSandboxModal({ ...sandboxModal, subChannel: ch })
                      }
                      className={`px-3 py-2 text-xs font-medium rounded-lg border text-left ${
                        sandboxModal.subChannel === ch
                          ? 'border-blue-700 bg-blue-50 text-blue-900'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Using sandbox test credentials. Completing payment generates an authentic server-side HMAC-SHA256 signature and verifies it through <span className="font-mono">/api/payments/verify</span>.
              </div>

              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSandboxOutcome('success')}
                  className="w-full py-2.5 px-4 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50"
                >
                  {submitting
                    ? 'Verifying Signature...'
                    : `Authorize ${sandboxModal.subChannel} Payment`}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSandboxOutcome('failed')}
                  className="w-full py-2 px-4 border border-red-200 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-50"
                >
                  Simulate Failed Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
