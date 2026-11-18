import React, { useState } from 'react';
import {
  Download,
  Heart,
  LogOut,
  MapPin,
  Package,
  RotateCcw,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import type { Address, Order, Product, User } from '../types';
import { apiFetch, downloadOrderInvoice, formatInr, setCustomerToken } from '../lib/api';

interface CustomerPortalProps {
  user: User | null;
  orders: Order[];
  addresses: Address[];
  products: Product[];
  onAuthSuccess: (user: User, orders: Order[], addresses: Address[]) => void;
  onLogout: () => void;
  onRefreshMe: () => Promise<void>;
  onSelectProduct: (product: Product) => void;
  onToggleWishlist: (productId: string) => Promise<void>;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({
  user,
  orders,
  addresses,
  products,
  onAuthSuccess,
  onLogout,
  onRefreshMe,
  onSelectProduct,
  onToggleWishlist,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [dashTab, setDashTab] = useState<'orders' | 'wishlist' | 'addresses' | 'profile'>('orders');

  // Auth form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('customer@shopkart.in');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('Shop@1234');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyHint, setVerifyHint] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetHint, setResetHint] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Profile / address forms
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone || '');
  const [newAddr, setNewAddr] = useState({
    fullName: user?.name || '',
    phone: user?.phone || '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
  });
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setBusy(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>(
        '/api/customer/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) }
      );
      setCustomerToken(res.token);
      const me = await apiFetch<{ user: User; orders: Order[]; addresses: Address[] }>(
        '/api/customer/me',
        { authMode: 'customer' }
      );
      onAuthSuccess(me.user, me.orders, me.addresses);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setBusy(true);
    try {
      const res = await apiFetch<{
        token: string;
        user: User;
        verificationHint?: string;
      }>('/api/customer/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, phone, password }),
      });
      setCustomerToken(res.token);
      if (res.verificationHint) setVerifyHint(res.verificationHint);
      const me = await apiFetch<{ user: User; orders: Order[]; addresses: Address[] }>(
        '/api/customer/me',
        { authMode: 'customer' }
      );
      onAuthSuccess(me.user, me.orders, me.addresses);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMsg('');
    try {
      const res = await apiFetch<{ sent: boolean; message: string; resetTokenHint?: string }>(
        '/api/customer/auth/forgot-password',
        { method: 'POST', body: JSON.stringify({ email }) }
      );
      setAuthMsg(res.message);
      if (res.resetTokenHint) setResetHint(res.resetTokenHint);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMsg('');
    try {
      const res = await apiFetch<{ success: boolean; message: string }>(
        '/api/customer/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({ email, token: resetToken, newPassword }),
        }
      );
      setAuthMsg(res.message);
      setAuthTab('login');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleVerifyEmail = async () => {
    setAuthError('');
    try {
      await apiFetch('/api/customer/auth/verify-email', {
        method: 'POST',
        authMode: 'customer',
        body: JSON.stringify({ code: verifyCode }),
      });
      await onRefreshMe();
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/customer/me', {
      method: 'PUT',
      authMode: 'customer',
      body: JSON.stringify({ name: profileName, phone: profilePhone }),
    });
    await onRefreshMe();
    setAuthMsg('Profile updated.');
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/customer/addresses', {
      method: 'POST',
      authMode: 'customer',
      body: JSON.stringify({ ...newAddr, isDefault: addresses.length === 0 }),
    });
    setNewAddr({
      fullName: user?.name || '',
      phone: user?.phone || '',
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalCode: '',
    });
    await onRefreshMe();
  };

  const handleDeleteAddress = async (id: string) => {
    await apiFetch(`/api/customer/addresses/${id}`, {
      method: 'DELETE',
      authMode: 'customer',
    });
    await onRefreshMe();
  };

  const handleRequestReturn = async (orderId: string) => {
    if (!returnReason.trim()) return;
    await apiFetch(`/api/customer/orders/${orderId}/return`, {
      method: 'POST',
      authMode: 'customer',
      body: JSON.stringify({ reason: returnReason }),
    });
    setReturnOrderId(null);
    setReturnReason('');
    setAuthMsg('Return request submitted for admin review.');
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="border border-slate-200 rounded-2xl p-7 bg-white">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-6">
            {(
              [
                ['login', 'Sign In'],
                ['register', 'Register'],
                ['forgot', 'Reset'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => {
                  setAuthTab(k);
                  setAuthError('');
                  setAuthMsg('');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                  authTab === k
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {authError}
            </div>
          )}
          {authMsg && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
              {authMsg}
            </div>
          )}

          {authTab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900">
                  Welcome back to SHOPKART
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Demo customer: customer@shopkart.in / Shop@1234
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800"
              >
                {busy ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {authTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <h1 className="font-display text-xl font-bold text-slate-900">
                Create SHOPKART Account
              </h1>
              <input
                required
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
              <input
                required
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
              <input
                required
                placeholder="Phone (+91 98XXXXXXXX)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
              <input
                required
                type="password"
                placeholder="Password (min 6 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800"
              >
                {busy ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}

          {authTab === 'forgot' && (
            <div className="space-y-4">
              <h1 className="font-display text-xl font-bold text-slate-900">
                Password Recovery
              </h1>
              <form onSubmit={handleRequestReset} className="space-y-3">
                <input
                  required
                  type="email"
                  placeholder="Registered Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
                >
                  Generate Reset Code
                </button>
              </form>
              {resetHint && (
                <p className="text-xs font-mono bg-slate-100 p-2 rounded text-slate-800">
                  Generated Code: {resetHint}
                </p>
              )}
              <form onSubmit={handleResetPassword} className="space-y-3 pt-3 border-t border-slate-200">
                <input
                  required
                  placeholder="Reset Code"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
                <input
                  required
                  type="password"
                  placeholder="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg"
                >
                  Reset Password
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  const wishlistProducts = products.filter((p) => user.wishlist.includes(p.id));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {user.name}
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            {user.email} · {user.phone} ·{' '}
            {user.isVerified ? 'Verified Account' : 'Verification Pending'}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 self-start"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>

      {!user.isVerified && (
        <div className="mt-6 p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-amber-900">
            <span className="font-semibold">Verify your email:</span> Enter the 6-digit code
            {verifyHint ? ` (${verifyHint})` : ''} to complete account verification.
          </div>
          <div className="flex items-center gap-2">
            <input
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="6-digit code"
              className="px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white font-mono"
            />
            <button
              onClick={handleVerifyEmail}
              className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg"
            >
              Verify
            </button>
          </div>
        </div>
      )}

      {authMsg && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {authMsg}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-6 border-b border-slate-200 pb-3">
        {(
          [
            ['orders', `My Orders (${orders.length})`, Package],
            ['wishlist', `Wishlist (${wishlistProducts.length})`, Heart],
            ['addresses', `Saved Addresses (${addresses.length})`, MapPin],
            ['profile', 'Profile Settings', UserIcon],
          ] as const
        ).map(([k, lbl, Icon]) => (
          <button
            key={k}
            onClick={() => setDashTab(k)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition-colors ${
              dashTab === k
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {lbl}
          </button>
        ))}
      </div>

      {dashTab === 'orders' && (
        <div className="space-y-4 mt-6">
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500 py-8">No orders placed yet.</p>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="border border-slate-200 rounded-xl p-5 bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <p className="font-mono text-sm font-bold text-slate-900">
                      {order.orderNumber}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Placed {new Date(order.createdAt).toLocaleDateString('en-IN')} ·{' '}
                      {order.paymentGatewayLabel} · {order.paymentStatus.replace('_', ' ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      {order.orderStatus}
                    </span>
                    <button
                      onClick={() => downloadOrderInvoice(order)}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Invoice
                    </button>
                    {order.orderStatus === 'delivered' && (
                      <button
                        onClick={() => setReturnOrderId(order.id)}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Return
                      </button>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-slate-100 my-3">
                  {order.items.map((item, i) => (
                    <div key={i} className="py-2.5 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-slate-900">{item.productName}</p>
                        <p className="text-xs text-slate-500">
                          {item.variantLabel} · Qty {item.quantity}
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">
                        {formatInr(item.lineTotal)}
                      </span>
                    </div>
                  ))}
                </div>

                {order.trackingNumber && (
                  <p className="text-xs text-slate-600 mt-2">
                    Tracking: <span className="font-mono font-semibold">{order.carrierName} {order.trackingNumber}</span>
                  </p>
                )}

                {returnOrderId === order.id && (
                  <div className="mt-4 pt-3 border-t border-slate-200 flex gap-2">
                    <input
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      placeholder="Reason for return / refund..."
                      className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      onClick={() => handleRequestReturn(order.id)}
                      className="px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg"
                    >
                      Submit Return
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {dashTab === 'wishlist' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {wishlistProducts.length === 0 ? (
            <p className="text-sm text-slate-500">Your wishlist is empty.</p>
          ) : (
            wishlistProducts.map((p) => (
              <div key={p.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                <img
                  src={p.images[0]}
                  alt={p.name}
                  className="w-full h-44 object-cover rounded-lg bg-slate-50 cursor-pointer"
                  onClick={() => onSelectProduct(p)}
                />
                <h3 className="font-semibold text-sm text-slate-900 mt-3">{p.name}</h3>
                <p className="text-sm font-bold text-slate-900 mt-1 tabular-nums">
                  {formatInr(p.discountedPrice)}
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onSelectProduct(p)}
                    className="flex-1 py-2 text-xs font-semibold bg-blue-700 text-white rounded-lg"
                  >
                    View Product
                  </button>
                  <button
                    onClick={() => onToggleWishlist(p.id)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {dashTab === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="space-y-3">
            {addresses.map((a) => (
              <div
                key={a.id}
                className="border border-slate-200 rounded-xl p-4 bg-white flex justify-between items-start"
              >
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">
                    {a.fullName} {a.isDefault ? '· Default' : ''}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">{a.line1}</p>
                  <p className="text-xs text-slate-600">
                    {a.city}, {a.state} {a.postalCode}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{a.phone}</p>
                </div>
                <button
                  onClick={() => handleDeleteAddress(a.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddAddress}
            className="border border-slate-200 rounded-xl p-5 bg-white space-y-3"
          >
            <h3 className="font-semibold text-sm text-slate-900">
              Add New Shipping Address
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Full Name"
                value={newAddr.fullName}
                onChange={(e) => setNewAddr({ ...newAddr, fullName: e.target.value })}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                required
                placeholder="Phone"
                value={newAddr.phone}
                onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                required
                placeholder="Address Line 1"
                value={newAddr.line1}
                onChange={(e) => setNewAddr({ ...newAddr, line1: e.target.value })}
                className="col-span-2 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                required
                placeholder="City"
                value={newAddr.city}
                onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                required
                placeholder="State"
                value={newAddr.state}
                onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value })}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                required
                placeholder="PIN Code"
                value={newAddr.postalCode}
                onChange={(e) => setNewAddr({ ...newAddr, postalCode: e.target.value })}
                className="col-span-2 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg"
            >
              Save Address
            </button>
          </form>
        </div>
      )}

      {dashTab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="max-w-md mt-6 border border-slate-200 rounded-xl p-6 bg-white space-y-4"
        >
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-blue-700" />
            <span>Customer Profile Information</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Full Name
            </label>
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Phone Number
            </label>
            <input
              value={profilePhone}
              onChange={(e) => setProfilePhone(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg"
          >
            Update Profile
          </button>
        </form>
      )}
    </div>
  );
};
