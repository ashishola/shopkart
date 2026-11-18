import React, { useState } from 'react';
import { PackageSearch, Send, CheckCircle2 } from 'lucide-react';
import { apiFetch, formatInr } from '../lib/api';

export const OrderTrackingPage: React.FC = () => {
  const [orderNumber, setOrderNumber] = useState('SK-2026-1001');
  const [contact, setContact] = useState('customer@shopkart.in');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ order: any }>('/api/orders/track', {
        method: 'POST',
        body: JSON.stringify({ orderNumber, contact }),
      });
      setResult(res.order);
    } catch (err: any) {
      setResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="font-display text-3xl font-bold text-slate-900">
        Order Tracking
      </h1>
      <p className="text-sm text-slate-600 mt-1">
        Enter your SHOPKART Order ID and billing email or phone to inspect live dispatch milestones.
      </p>

      <form
        onSubmit={handleTrack}
        className="mt-6 border border-slate-200 rounded-xl p-5 bg-white grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <input
          required
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="Order ID (e.g. SK-2026-1001)"
          className="px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono"
        />
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Email or Phone"
          className="px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 inline-flex items-center justify-center gap-2"
        >
          <PackageSearch className="w-4 h-4" />
          {loading ? 'Checking...' : 'Track Order'}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 border border-slate-200 rounded-xl p-6 bg-white">
          <div className="flex flex-wrap justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <p className="font-mono text-base font-bold text-slate-900">
                {result.orderNumber}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {result.paymentGatewayLabel} · Payment: {result.paymentStatus}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase font-bold text-blue-700">
                Status: {result.orderStatus}
              </p>
              <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                {formatInr(result.totalAmount)}
              </p>
            </div>
          </div>

          {result.trackingNumber && (
            <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
              Carrier: <strong>{result.carrierName}</strong> · Tracking ID:{' '}
              <span className="font-mono font-bold">{result.trackingNumber}</span>
            </div>
          )}

          <div className="mt-6 space-y-4">
            {result.statusTimeline.map((step: any, i: number) => (
              <div key={i} className="flex gap-3 items-start">
                <CheckCircle2 className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-900">
                    {step.status.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-slate-600">{step.note}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(step.timestamp).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const InfoPage: React.FC<{
  type: 'about' | 'contact' | 'privacy' | 'terms' | 'returns';
}> = ({ type }) => {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState('');

  const submitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ message: string }>('/api/contact', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setSent(res.message);
    setForm({ name: '', email: '', subject: '', message: '' });
  };

  if (type === 'contact') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">
            Contact SHOPKART Support
          </h1>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">
            Questions about orders, GST invoices, corporate bulk procurement, or UPI payment verification? Reach our Mumbai operations desk directly.
          </p>
          <div className="mt-6 space-y-2 text-sm text-slate-700">
            <p><strong>Email:</strong> support@shopkart.in</p>
            <p><strong>Phone:</strong> +91 22 4890 7100 (Mon–Sat, 9 AM – 8 PM IST)</p>
            <p><strong>Fulfillment HQ:</strong> Bandra Kurla Complex, Mumbai 400051</p>
          </div>
        </div>
        <form
          onSubmit={submitContact}
          className="border border-slate-200 rounded-xl p-6 bg-white space-y-3.5"
        >
          {sent && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {sent}
            </div>
          )}
          <input
            required
            placeholder="Your Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
          />
          <input
            required
            type="email"
            placeholder="Email Address"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
          />
          <input
            placeholder="Order ID / Subject"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
          />
          <textarea
            required
            rows={4}
            placeholder="How can we help?"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
          />
          <button
            type="submit"
            className="w-full py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send Inquiry
          </button>
        </form>
      </div>
    );
  }

  const contentMap = {
    about: {
      title: 'About SHOPKART',
      sections: [
        'SHOPKART is an engineering-first Indian e-commerce platform uniting flagship hardware, studio electronics, ergonomic workspaces, and spatial 3D inspection in one unified retail architecture.',
        'Every order on SHOPKART is backed by server-verified Razorpay UPI/Card/NetBanking processing, audited merchant settlement controls, GST-compliant invoicing, and insured pan-India courier dispatch.',
      ],
    },
    privacy: {
      title: 'Privacy Policy',
      sections: [
        'SHOPKART encrypts payment credentials using AES-256-GCM at rest and never stores raw card numbers, CVVs, or UPI PINs on application servers.',
        'Customer shipping addresses, phone numbers, and order histories are used strictly for order fulfillment, GST invoicing, and delivery notifications.',
      ],
    },
    terms: {
      title: 'Terms & Conditions',
      sections: [
        'All prices displayed on SHOPKART are in Indian Rupees (INR). Applicable 18% GST and shipping charges are transparently calculated on our backend prior to payment authorization.',
        'Manual UPI QR transactions remain in pending verification status until reconciled against bank settlement records by an authorized SHOPKART administrator.',
      ],
    },
    returns: {
      title: 'Return & Refund Policy',
      sections: [
        'Delivered hardware and lifestyle products are eligible for a 7-day replacement or refund request directly from your Customer Dashboard if unopened or found defective on arrival.',
        'Approved refunds for Razorpay and UPI payments are credited back to the original payment source within 5–7 business days and logged with an audit receipt.',
      ],
    },
  };

  const doc = contentMap[type];
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="font-display text-3xl font-bold text-slate-900">{doc.title}</h1>
      <div className="mt-6 space-y-4 text-sm text-slate-700 leading-relaxed border border-slate-200 rounded-xl p-6 bg-white">
        {doc.sections.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
    </div>
  );
};
