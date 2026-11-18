import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingBag,
  Users,
  CreditCard,
  Sliders,
  KeyRound,
  QrCode,
  Truck,
  Tag,
  Boxes,
  Star,
  RotateCcw,
  Image,
  BarChart3,
  Settings,
  Shield,
  FileText,
  LogOut,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Undo2,
  Power,
  Building2,
  Upload,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type {
  ActivePaymentConfig,
  ActivePaymentMode,
  AdminUser,
  AuditLog,
  Banner,
  Category,
  CodSettings,
  Coupon,
  Order,
  OrderStatus,
  PaymentTransaction,
  Product,
  RazorpayAccountPublic,
  ReturnRequest,
  Review,
  UpiAccount,
  WebsiteSettings,
} from '../types';
import {
  apiFetch,
  downloadOrderInvoice,
  formatInr,
  getAdminToken,
  setAdminToken,
} from '../lib/api';

type AdminTab =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'orders'
  | 'customers'
  | 'payments'
  | 'payment_settings'
  | 'razorpay_accounts'
  | 'upi_qr'
  | 'cod'
  | 'coupons'
  | 'inventory'
  | 'reviews'
  | 'returns'
  | 'banners'
  | 'reports'
  | 'website_settings'
  | 'admin_users'
  | 'audit_logs';

interface AdminConsoleProps {
  onExitAdmin: () => void;
  onStorefrontDataChanged: () => void;
}

const SIDEBAR_ITEMS: { id: AdminTab; label: string; icon: React.FC<any> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'categories', label: 'Categories', icon: FolderTree },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'payment_settings', label: 'Payment Settings', icon: Sliders },
  { id: 'razorpay_accounts', label: 'Razorpay Accounts', icon: KeyRound },
  { id: 'upi_qr', label: 'UPI QR Management', icon: QrCode },
  { id: 'cod', label: 'Cash on Delivery', icon: Truck },
  { id: 'coupons', label: 'Coupons & Discounts', icon: Tag },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'returns', label: 'Return & Refunds', icon: RotateCcw },
  { id: 'banners', label: 'Banners & Homepage', icon: Image },
  { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
  { id: 'website_settings', label: 'Website Settings', icon: Settings },
  { id: 'admin_users', label: 'Admin Users', icon: Shield },
  { id: 'audit_logs', label: 'Audit Logs', icon: FileText },
];

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  onExitAdmin,
  onStorefrontDataChanged,
}) => {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('admin@shopkart.in');
  const [loginPassword, setLoginPassword] = useState('Admin@1234');
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Admin data stores
  const [overview, setOverview] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<any>(null);
  const [paymentConfig, setPaymentConfig] = useState<ActivePaymentConfig | null>(null);
  const [prevPaymentConfig, setPrevPaymentConfig] = useState<ActivePaymentConfig | null>(null);
  const [razorpayAccounts, setRazorpayAccounts] = useState<RazorpayAccountPublic[]>([]);
  const [upiAccounts, setUpiAccounts] = useState<UpiAccount[]>([]);
  const [codSettings, setCodSettings] = useState<CodSettings | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Filter / Form states
  const [paySearch, setPaySearch] = useState('');
  const [payStatusFilter, setPayStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [trackCarrier, setTrackCarrier] = useState('BlueDart Express');
  const [trackCode, setTrackCode] = useState('');

  // New product form
  const [newProd, setNewProd] = useState({
    name: '',
    brand: 'SHOPKART Select',
    categoryId: 'cat_audio',
    originalPrice: 12999,
    discountedPrice: 9999,
    stock: 25,
    description: '',
    image: '/src/assets/images/product_audio_headphones_1795014127358.jpg',
  });

  // New Razorpay account form
  const [newRzp, setNewRzp] = useState({
    label: '',
    keyId: '',
    keySecret: '',
    webhookSecret: '',
    settlementBankName: '',
    settlementAccountMasked: '',
    settlementIfscMasked: '',
    activateNow: false,
  });

  // New UPI account form
  const [newUpi, setNewUpi] = useState({
    label: '',
    upiId: '',
    payeeName: 'SHOPKART RETAIL PVT LTD',
    qrImageUrl: '',
    instructions: '',
    isDefault: false,
  });

  // New coupon form
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    type: 'percentage',
    value: 15,
    minOrderValue: 1500,
    expiryDate: '2027-12-31',
  });

  // New Category & Admin User forms
  const [newCatName, setNewCatName] = useState('');
  const [newAdminForm, setNewAdminForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin',
  });

  const notify = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAllAdminData = async () => {
    try {
      const [
        ov,
        pr,
        ct,
        or,
        cu,
        py,
        ps,
        cp,
        rv,
        rt,
        bn,
        st,
        al,
      ] = await Promise.all([
        apiFetch<any>('/api/admin/overview', { authMode: 'admin' }),
        apiFetch<{ products: Product[] }>('/api/admin/products', { authMode: 'admin' }),
        apiFetch<{ categories: Category[] }>('/api/admin/categories', { authMode: 'admin' }),
        apiFetch<{ orders: Order[] }>('/api/admin/orders', { authMode: 'admin' }),
        apiFetch<{ customers: any[] }>('/api/admin/customers', { authMode: 'admin' }),
        apiFetch<{ payments: PaymentTransaction[]; summary: any }>('/api/admin/payments', { authMode: 'admin' }),
        apiFetch<any>('/api/admin/payment-settings', { authMode: 'admin' }),
        apiFetch<{ coupons: Coupon[] }>('/api/admin/coupons', { authMode: 'admin' }),
        apiFetch<{ reviews: Review[] }>('/api/admin/reviews', { authMode: 'admin' }),
        apiFetch<{ returns: ReturnRequest[] }>('/api/admin/returns', { authMode: 'admin' }),
        apiFetch<{ banners: Banner[] }>('/api/admin/banners', { authMode: 'admin' }),
        apiFetch<{ settings: WebsiteSettings }>('/api/admin/settings', { authMode: 'admin' }),
        apiFetch<{ auditLogs: AuditLog[] }>('/api/admin/audit-logs', { authMode: 'admin' }),
      ]);
      setOverview(ov);
      setProducts(pr.products);
      setCategories(ct.categories);
      setOrders(or.orders);
      setCustomers(cu.customers);
      setPayments(py.payments);
      setPaymentSummary(py.summary);
      setPaymentConfig(ps.paymentConfig);
      setPrevPaymentConfig(ps.previousPaymentConfig);
      setRazorpayAccounts(ps.razorpayAccounts);
      setUpiAccounts(ps.upiAccounts);
      setCodSettings(ps.codSettings);
      setCoupons(cp.coupons);
      setReviews(rv.reviews);
      setReturns(rt.returns);
      setBanners(bn.banners);
      setSettings(st.settings);
      setAuditLogs(al.auditLogs);

      apiFetch<{ admins: AdminUser[] }>('/api/admin/admins', { authMode: 'admin' })
        .then((res) => setAdmins(res.admins))
        .catch(() => {});
    } catch (err: any) {
      if (err.message.includes('session') || err.message.includes('required')) {
        setAdminToken(null);
        setAdminUser(null);
      }
    }
  };

  useEffect(() => {
    if (getAdminToken()) {
      loadAllAdminData();
    }
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await apiFetch<{ token: string; admin: AdminUser }>(
        '/api/admin/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        }
      );
      setAdminToken(res.token);
      setAdminUser(res.admin);
      await loadAllAdminData();
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const handleLogout = () => {
    setAdminToken(null);
    setAdminUser(null);
    onExitAdmin();
  };

  const handleExportPaymentsCsv = () => {
    const header = [
      'Receipt',
      'Order',
      'Customer',
      'Amount',
      'Refund',
      'Gateway',
      'Account Snapshot',
      'Reference / Payment ID',
      'Status',
      'Date',
    ].join(',');
    const rows = payments.map((p) =>
      [
        p.receiptNumber,
        p.orderNumber,
        `"${p.customerName}"`,
        p.amount,
        p.refundAmount,
        p.gateway,
        `"${p.paymentAccountLabel}"`,
        p.razorpayPaymentId || p.upiReferenceNumber || p.razorpayOrderId || '',
        p.status,
        p.createdAt,
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shopkart-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQrFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    targetId?: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      if (targetId) {
        await apiFetch(`/api/admin/upi-accounts/${targetId}`, {
          method: 'PUT',
          authMode: 'admin',
          body: JSON.stringify({ qrImageUrl: dataUrl }),
        });
        notify('UPI QR code image replaced.');
        await loadAllAdminData();
      } else {
        setNewUpi((prev) => ({ ...prev, qrImageUrl: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
  };

  if (!getAdminToken()) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md border border-slate-200 rounded-2xl p-8 bg-white">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-semibold text-blue-700">
                SHOPKART OPERATIONS
              </p>
              <h1 className="font-display text-2xl font-bold text-slate-900 mt-0.5">
                Admin Console Sign In
              </h1>
            </div>
            <button
              onClick={onExitAdmin}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
            >
              Back to Store
            </button>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 mb-5">
            <p className="font-semibold text-slate-800">Default Super Admin Credentials</p>
            <p className="font-mono mt-1">admin@shopkart.in / Admin@1234</p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {loginError}
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Admin Email
              </label>
              <input
                required
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
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
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800"
            >
              Access Admin Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  const filteredPayments = payments.filter((p) => {
    const matchesStatus =
      payStatusFilter === 'all' || p.status === payStatusFilter;
    const q = paySearch.trim().toLowerCase();
    const matchesQuery =
      !q ||
      p.orderNumber.toLowerCase().includes(q) ||
      p.customerName.toLowerCase().includes(q) ||
      (p.razorpayPaymentId || '').toLowerCase().includes(q) ||
      (p.upiReferenceNumber || '').toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* 20-Item Admin Sidebar */}
      <aside className="w-64 shrink-0 bg-slate-950 text-slate-200 flex flex-col border-r border-slate-800">
        <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <span className="font-display text-lg font-bold text-white tracking-tight">
              SHOPKART
            </span>
            <p className="text-[11px] text-slate-400">Admin &amp; Payment Engine</p>
          </div>
          <button
            onClick={onExitAdmin}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-medium"
          >
            Storefront
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                tab === id
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-slate-900 mt-2"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      {/* Main Admin Workspace */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">Admin</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-900">
              {SIDEBAR_ITEMS.find((i) => i.id === tab)?.label}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={loadAllAdminData}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            {adminUser && (
              <span className="text-xs text-slate-600">
                {adminUser.name} · {adminUser.role.replace('_', ' ')}
              </span>
            )}
          </div>
        </header>

        {toast && (
          <div
            className={`mx-6 mt-4 px-4 py-3 rounded-xl text-xs font-medium border ${
              toast.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {toast.msg}
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* 1. DASHBOARD */}
          {tab === 'dashboard' && overview && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  ['Total Revenue', formatInr(overview.metrics.totalRevenue)],
                  ['Total Orders', String(overview.metrics.totalOrders)],
                  ['Total Products', String(overview.metrics.totalProducts)],
                  ['Total Customers', String(overview.metrics.totalCustomers)],
                  ['Pending Orders', String(overview.metrics.pendingOrders)],
                  ['Completed Orders', String(overview.metrics.completedOrders)],
                  ['Cancelled Orders', String(overview.metrics.cancelledOrders)],
                  ['Successful Payments', String(overview.metrics.successfulPayments)],
                  ['Failed Payments', String(overview.metrics.failedPayments)],
                  ['Pending Verification', String(overview.metrics.pendingPayments)],
                ].map(([lbl, val]) => (
                  <div
                    key={lbl}
                    className="bg-white border border-slate-200 rounded-xl p-4"
                  >
                    <p className="text-xs text-slate-500">{lbl}</p>
                    <p className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                      {val}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5">
                  <h2 className="font-display text-base font-bold text-slate-900 mb-4">
                    Monthly Revenue Trend (INR)
                  </h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={overview.monthlySeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#1D4ED8"
                          fill="#DBEAFE"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
                  <h2 className="font-display text-base font-bold text-slate-900 mb-4">
                    Category Sales Mix
                  </h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overview.categorySales}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#0F172A" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="font-display text-base font-bold text-slate-900 mb-3">
                  Recent Orders
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-left">
                        <th className="py-2.5">Order ID</th>
                        <th className="py-2.5">Customer</th>
                        <th className="py-2.5">Gateway Account</th>
                        <th className="py-2.5">Status</th>
                        <th className="py-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overview.recentOrders.map((o: Order) => (
                        <tr key={o.id}>
                          <td className="py-2.5 font-mono font-semibold">{o.orderNumber}</td>
                          <td className="py-2.5">{o.customerName}</td>
                          <td className="py-2.5 text-slate-600">{o.paymentAccountLabel}</td>
                          <td className="py-2.5 uppercase font-semibold text-blue-700">
                            {o.orderStatus}
                          </td>
                          <td className="py-2.5 text-right font-bold tabular-nums">
                            {formatInr(o.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. PRODUCTS */}
          {tab === 'products' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiFetch('/api/admin/products', {
                      method: 'POST',
                      authMode: 'admin',
                      body: JSON.stringify({
                        ...newProd,
                        images: [newProd.image],
                      }),
                    });
                    notify('Product created.');
                    setNewProd({ ...newProd, name: '', description: '' });
                    await loadAllAdminData();
                    onStorefrontDataChanged();
                  } catch (err: any) {
                    notify(err.message, 'err');
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <h2 className="font-display text-base font-bold text-slate-900">
                  Add New Product
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    required
                    placeholder="Product Name"
                    value={newProd.name}
                    onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    placeholder="Brand"
                    value={newProd.brand}
                    onChange={(e) => setNewProd({ ...newProd, brand: e.target.value })}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <select
                    value={newProd.categoryId}
                    onChange={(e) =>
                      setNewProd({ ...newProd, categoryId: e.target.value })
                    }
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Original Price"
                    value={newProd.originalPrice}
                    onChange={(e) =>
                      setNewProd({ ...newProd, originalPrice: Number(e.target.value) })
                    }
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                  />
                  <input
                    type="number"
                    placeholder="Discounted Price"
                    value={newProd.discountedPrice}
                    onChange={(e) =>
                      setNewProd({ ...newProd, discountedPrice: Number(e.target.value) })
                    }
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                  />
                  <input
                    type="number"
                    placeholder="Stock"
                    value={newProd.stock}
                    onChange={(e) =>
                      setNewProd({ ...newProd, stock: Number(e.target.value) })
                    }
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                  />
                  <input
                    placeholder="Image URL"
                    value={newProd.image}
                    onChange={(e) => setNewProd({ ...newProd, image: e.target.value })}
                    className="md:col-span-3 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <textarea
                    placeholder="Product Description"
                    value={newProd.description}
                    onChange={(e) =>
                      setNewProd({ ...newProd, description: e.target.value })
                    }
                    className="md:col-span-3 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Product
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-left">
                      <th className="py-2.5">Product</th>
                      <th className="py-2.5">Category</th>
                      <th className="py-2.5 text-right">Price</th>
                      <th className="py-2.5 text-right">Discount</th>
                      <th className="py-2.5 text-right">Stock</th>
                      <th className="py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 font-medium text-slate-900">{p.name}</td>
                        <td className="py-2.5 text-slate-600">{p.categoryName}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatInr(p.discountedPrice)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {p.discountPercent}%
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{p.stock}</td>
                        <td className="py-2.5 text-right space-x-2">
                          <button
                            onClick={async () => {
                              const nextPrice = p.discountedPrice - 500;
                              if (nextPrice < 100) return;
                              await apiFetch(`/api/admin/products/${p.id}`, {
                                method: 'PUT',
                                authMode: 'admin',
                                body: JSON.stringify({ discountedPrice: nextPrice }),
                              });
                              notify(`Reduced price for ${p.name}`);
                              await loadAllAdminData();
                              onStorefrontDataChanged();
                            }}
                            className="text-blue-700 hover:underline"
                          >
                            -₹500
                          </button>
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/products/${p.id}`, {
                                method: 'DELETE',
                                authMode: 'admin',
                              });
                              notify('Product deleted.');
                              await loadAllAdminData();
                              onStorefrontDataChanged();
                            }}
                            className="text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. CATEGORIES */}
          {tab === 'categories' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex gap-3">
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New Category Name"
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  onClick={async () => {
                    if (!newCatName.trim()) return;
                    await apiFetch('/api/admin/categories', {
                      method: 'POST',
                      authMode: 'admin',
                      body: JSON.stringify({ name: newCatName }),
                    });
                    setNewCatName('');
                    notify('Category added.');
                    await loadAllAdminData();
                    onStorefrontDataChanged();
                  }}
                  className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg"
                >
                  Add Category
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((c) => (
                  <div
                    key={c.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-sm text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500">/{c.slug}</p>
                    </div>
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/admin/categories/${c.id}`, {
                          method: 'DELETE',
                          authMode: 'admin',
                        });
                        await loadAllAdminData();
                        onStorefrontDataChanged();
                      }}
                      className="text-red-600 p-1.5 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. ORDERS */}
          {tab === 'orders' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-left">
                      <th className="py-2.5">Order ID</th>
                      <th className="py-2.5">Customer</th>
                      <th className="py-2.5">Method &amp; Account</th>
                      <th className="py-2.5">Payment</th>
                      <th className="py-2.5">Order Status</th>
                      <th className="py-2.5 text-right">Total</th>
                      <th className="py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td className="py-2.5 font-mono font-semibold">{o.orderNumber}</td>
                        <td className="py-2.5">
                          <div>{o.customerName}</div>
                          <div className="text-slate-400">{o.customerEmail}</div>
                        </td>
                        <td className="py-2.5">
                          <div>{o.paymentGatewayLabel}</div>
                          <div className="text-slate-400">{o.paymentAccountLabel}</div>
                        </td>
                        <td className="py-2.5 uppercase font-semibold">{o.paymentStatus}</td>
                        <td className="py-2.5">
                          <select
                            value={o.orderStatus}
                            onChange={async (e) => {
                              await apiFetch(`/api/admin/orders/${o.id}`, {
                                method: 'PUT',
                                authMode: 'admin',
                                body: JSON.stringify({
                                  orderStatus: e.target.value as OrderStatus,
                                }),
                              });
                              notify(`Order ${o.orderNumber} updated.`);
                              await loadAllAdminData();
                            }}
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
                          >
                            {[
                              'pending',
                              'confirmed',
                              'processing',
                              'shipped',
                              'delivered',
                              'cancelled',
                            ].map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 text-right font-bold tabular-nums">
                          {formatInr(o.totalAmount)}
                        </td>
                        <td className="py-2.5 text-right space-x-2">
                          <button
                            onClick={() => {
                              setSelectedOrder(o);
                              setTrackCode(o.trackingNumber || '');
                              setTrackCarrier(o.carrierName || 'BlueDart Express');
                            }}
                            className="text-blue-700 hover:underline"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => downloadOrderInvoice(o)}
                            className="text-slate-700 hover:underline"
                          >
                            Invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedOrder && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-display text-base font-bold">
                        Order {selectedOrder.orderNumber} — {selectedOrder.customerName}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1">
                        {selectedOrder.shippingAddress.line1},{' '}
                        {selectedOrder.shippingAddress.city},{' '}
                        {selectedOrder.shippingAddress.state}{' '}
                        {selectedOrder.shippingAddress.postalCode} · Phone:{' '}
                        {selectedOrder.shippingAddress.phone}
                      </p>
                      <p className="text-xs font-mono text-slate-500 mt-1">
                        Transaction ID: {selectedOrder.transactionId || 'Pending'}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedOrder(null)}
                      className="text-xs text-slate-500 hover:text-slate-900"
                    >
                      Close
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center pt-3 border-t border-slate-200">
                    <input
                      value={trackCarrier}
                      onChange={(e) => setTrackCarrier(e.target.value)}
                      placeholder="Courier Name"
                      className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    <input
                      value={trackCode}
                      onChange={(e) => setTrackCode(e.target.value)}
                      placeholder="Shipping Tracking Number"
                      className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                    />
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/admin/orders/${selectedOrder.id}`, {
                          method: 'PUT',
                          authMode: 'admin',
                          body: JSON.stringify({
                            orderStatus: 'shipped',
                            carrierName: trackCarrier,
                            trackingNumber: trackCode,
                          }),
                        });
                        notify('Tracking details saved and status updated to shipped.');
                        setSelectedOrder(null);
                        await loadAllAdminData();
                      }}
                      className="px-3.5 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg"
                    >
                      Save Tracking &amp; Mark Shipped
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. CUSTOMERS */}
          {tab === 'customers' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-left">
                    <th className="py-2.5">Customer</th>
                    <th className="py-2.5">Contact</th>
                    <th className="py-2.5 text-right">Orders</th>
                    <th className="py-2.5 text-right">Total Spent</th>
                    <th className="py-2.5">Status</th>
                    <th className="py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 font-medium text-slate-900">{c.name}</td>
                      <td className="py-2.5 text-slate-600">
                        {c.email} · {c.phone}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{c.orderCount}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">
                        {formatInr(c.totalSpent)}
                      </td>
                      <td className="py-2.5">
                        {c.isBlocked ? 'Blocked' : 'Active'}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/admin/customers/${c.id}/block`, {
                              method: 'PATCH',
                              authMode: 'admin',
                            });
                            notify('Customer status updated.');
                            await loadAllAdminData();
                          }}
                          className={`font-semibold ${
                            c.isBlocked ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {c.isBlocked ? 'Unblock' : 'Block'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 6. PAYMENTS DASHBOARD */}
          {tab === 'payments' && paymentSummary && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  ['Total Transactions', String(paymentSummary.totalTransactions)],
                  ['Successful Payments', String(paymentSummary.successfulPayments)],
                  ['Failed Payments', String(paymentSummary.failedPayments)],
                  ['Pending / Verify', String(paymentSummary.pendingPayments)],
                  ['Collected Amount', formatInr(paymentSummary.totalPaymentAmount)],
                  ['Refunded Amount', formatInr(paymentSummary.totalRefundAmount)],
                  ['Active Razorpay', paymentSummary.activeRazorpayAccount],
                  ['Active UPI ID', paymentSummary.activeUpiId],
                ].map(([lbl, val]) => (
                  <div key={lbl} className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500">{lbl}</p>
                    <p className="text-sm font-bold text-slate-900 mt-1 truncate tabular-nums">
                      {val}
                    </p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={paySearch}
                      onChange={(e) => setPaySearch(e.target.value)}
                      placeholder="Search Order #, Customer, UTR, Pay ID..."
                      className="px-3 py-2 text-xs border border-slate-300 rounded-lg w-64"
                    />
                    <select
                      value={payStatusFilter}
                      onChange={(e) => setPayStatusFilter(e.target.value)}
                      className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="all">All Statuses</option>
                      <option value="paid">Paid</option>
                      <option value="pending_verification">Pending Verification</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                  <button
                    onClick={handleExportPaymentsCsv}
                    className="px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Payment CSV
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-left">
                        <th className="py-2.5">Receipt / Order</th>
                        <th className="py-2.5">Customer</th>
                        <th className="py-2.5">Account Snapshot</th>
                        <th className="py-2.5">Txn / UTR Ref</th>
                        <th className="py-2.5">Status</th>
                        <th className="py-2.5 text-right">Amount</th>
                        <th className="py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPayments.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2.5">
                            <div className="font-mono font-semibold">{p.orderNumber}</div>
                            <div className="text-slate-400">{p.receiptNumber}</div>
                          </td>
                          <td className="py-2.5">{p.customerName}</td>
                          <td className="py-2.5 text-slate-600">{p.paymentAccountLabel}</td>
                          <td className="py-2.5 font-mono">
                            {p.razorpayPaymentId || p.upiReferenceNumber || p.razorpayOrderId || 'COD'}
                          </td>
                          <td className="py-2.5 uppercase font-semibold">
                            {p.status.replace('_', ' ')}
                          </td>
                          <td className="py-2.5 text-right font-bold tabular-nums">
                            {formatInr(p.amount)}
                          </td>
                          <td className="py-2.5 text-right space-x-2">
                            {p.status === 'pending_verification' && (
                              <>
                                <button
                                  onClick={async () => {
                                    await apiFetch(`/api/admin/payments/${p.id}/verify-upi`, {
                                      method: 'POST',
                                      authMode: 'admin',
                                      body: JSON.stringify({ decision: 'approve' }),
                                    });
                                    notify(`Verified UTR ${p.upiReferenceNumber}. Order confirmed.`);
                                    await loadAllAdminData();
                                  }}
                                  className="text-emerald-700 font-semibold hover:underline"
                                >
                                  Verify UTR
                                </button>
                                <button
                                  onClick={async () => {
                                    await apiFetch(`/api/admin/payments/${p.id}/verify-upi`, {
                                      method: 'POST',
                                      authMode: 'admin',
                                      body: JSON.stringify({ decision: 'reject' }),
                                    });
                                    notify('Rejected unverified UTR.', 'err');
                                    await loadAllAdminData();
                                  }}
                                  className="text-red-600 font-semibold hover:underline"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {p.status === 'paid' && (
                              <button
                                onClick={async () => {
                                  await apiFetch(`/api/admin/payments/${p.id}/refund`, {
                                    method: 'POST',
                                    authMode: 'admin',
                                    body: JSON.stringify({
                                      amount: p.amount,
                                      reason: 'Admin refund issued',
                                    }),
                                  });
                                  notify(`Issued refund for ${p.orderNumber}.`);
                                  await loadAllAdminData();
                                }}
                                className="text-blue-700 hover:underline"
                              >
                                Refund
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 7. PAYMENT SETTINGS (ACTIVE CONFIG + ROLLBACK + BANK SETTLEMENT) */}
          {tab === 'payment_settings' && paymentConfig && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Active Payment Configuration
                    </h2>
                    <p className="text-xs text-slate-600 mt-1">
                      Switching configuration routes all new customer checkouts immediately without touching source code. Historical orders retain their original payment account snapshot.
                    </p>
                  </div>
                  {prevPaymentConfig && (
                    <button
                      onClick={async () => {
                        try {
                          await apiFetch('/api/admin/payment-settings/rollback', {
                            method: 'POST',
                            authMode: 'admin',
                          });
                          notify('Rolled back to previous payment configuration.');
                          await loadAllAdminData();
                        } catch (err: any) {
                          notify(err.message, 'err');
                        }
                      }}
                      className="px-3.5 py-2 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Rollback Previous Config
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Select Active Payment Mode
                    </label>
                    <select
                      value={paymentConfig.mode}
                      onChange={(e) =>
                        setPaymentConfig({
                          ...paymentConfig,
                          mode: e.target.value as ActivePaymentMode,
                        })
                      }
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="multiple">Multiple Payment Methods (Recommended)</option>
                      <option value="razorpay">Razorpay Only</option>
                      <option value="upi_qr">UPI QR Code Payment Only</option>
                      <option value="cod">Cash on Delivery Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Active Razorpay Account
                    </label>
                    <select
                      value={paymentConfig.activeRazorpayAccountId || ''}
                      onChange={(e) =>
                        setPaymentConfig({
                          ...paymentConfig,
                          activeRazorpayAccountId: e.target.value || null,
                        })
                      }
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {razorpayAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.label} ({acc.keyId})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Active UPI QR Account
                    </label>
                    <select
                      value={paymentConfig.activeUpiAccountId || ''}
                      onChange={(e) =>
                        setPaymentConfig({
                          ...paymentConfig,
                          activeUpiAccountId: e.target.value || null,
                        })
                      }
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {upiAccounts.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.label} ({u.upiId})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col justify-end gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={paymentConfig.allowRazorpay}
                        onChange={(e) =>
                          setPaymentConfig({
                            ...paymentConfig,
                            allowRazorpay: e.target.checked,
                          })
                        }
                      />
                      Allow Razorpay in Multiple Mode
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={paymentConfig.allowUpiQr}
                        onChange={(e) =>
                          setPaymentConfig({
                            ...paymentConfig,
                            allowUpiQr: e.target.checked,
                          })
                        }
                      />
                      Allow UPI QR in Multiple Mode
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={paymentConfig.allowCod}
                        onChange={(e) =>
                          setPaymentConfig({
                            ...paymentConfig,
                            allowCod: e.target.checked,
                          })
                        }
                      />
                      Allow Cash on Delivery in Multiple Mode
                    </label>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    try {
                      await apiFetch('/api/admin/payment-settings/active', {
                        method: 'PUT',
                        authMode: 'admin',
                        body: JSON.stringify(paymentConfig),
                      });
                      notify('Active payment configuration saved and live for new checkouts.');
                      await loadAllAdminData();
                    } catch (err: any) {
                      notify(err.message, 'err');
                    }
                  }}
                  className="px-5 py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
                >
                  Save Active Payment Configuration
                </button>
              </div>

              {/* Bank Settlement Settings */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-5 h-5 text-blue-700" />
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Bank Settlement Account Overview
                  </h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  For security compliance, full bank account numbers are masked. To change your Razorpay settlement bank account, log in to the official Razorpay Dashboard → Account &amp; Settings → Bank Account Details and complete penny-drop + KYC verification.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {razorpayAccounts.map((acc) => (
                    <div key={acc.id} className="border border-slate-200 rounded-xl p-4 text-xs">
                      <p className="font-semibold text-slate-900">{acc.label}</p>
                      <p className="text-slate-600 mt-1">{acc.settlementBankName}</p>
                      <p className="font-mono text-slate-800 mt-1">
                        A/C: {acc.settlementAccountMasked} · IFSC: {acc.settlementIfscMasked}
                      </p>
                      <p className="text-slate-500 mt-2">{acc.settlementStatus}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 8. RAZORPAY ACCOUNTS MANAGEMENT */}
          {tab === 'razorpay_accounts' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {razorpayAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className={`bg-white rounded-xl p-5 border ${
                      acc.isActive ? 'border-blue-700' : 'border-slate-200'
                    } flex flex-col justify-between`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm text-slate-900">
                          {acc.label}
                        </h3>
                        <span
                          className={`text-[11px] font-bold uppercase ${
                            acc.isActive ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {acc.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-slate-600 mt-2">
                        Key ID: {acc.keyId}
                      </p>
                      <p className="font-mono text-xs text-slate-500 mt-0.5">
                        Secret: {acc.maskedSecret} (AES-256 Encrypted)
                      </p>
                      <div className="mt-3 pt-3 border-t border-slate-100 text-xs flex items-center gap-1.5">
                        {acc.connectionStatus === 'connected' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        )}
                        <span className="text-slate-600">
                          {acc.connectionStatus.toUpperCase()}
                          {acc.lastTestMessage ? ` · ${acc.lastTestMessage}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-100">
                      {!acc.isActive ? (
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/admin/razorpay-accounts/${acc.id}/activate`, {
                              method: 'POST',
                              authMode: 'admin',
                            });
                            notify(`Switched active gateway to ${acc.label}.`);
                            await loadAllAdminData();
                          }}
                          className="px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg"
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/admin/razorpay-accounts/${acc.id}/deactivate`, {
                              method: 'POST',
                              authMode: 'admin',
                            });
                            notify(`Deactivated ${acc.label}.`);
                            await loadAllAdminData();
                          }}
                          className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg"
                        >
                          Deactivate
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          const res = await apiFetch<{ account: RazorpayAccountPublic }>(
                            `/api/admin/razorpay-accounts/${acc.id}/test`,
                            { method: 'POST', authMode: 'admin' }
                          );
                          notify(
                            `${res.account.label}: ${res.account.lastTestMessage}`,
                            res.account.connectionStatus === 'error' ? 'err' : 'ok'
                          );
                          await loadAllAdminData();
                        }}
                        className="px-3 py-1.5 border border-slate-300 text-slate-800 text-xs font-medium rounded-lg hover:bg-slate-50"
                      >
                        Test Connection
                      </button>
                      {!acc.isActive && (
                        <button
                          onClick={async () => {
                            try {
                              await apiFetch(`/api/admin/razorpay-accounts/${acc.id}`, {
                                method: 'DELETE',
                                authMode: 'admin',
                              });
                              notify('Deleted unused Razorpay account.');
                              await loadAllAdminData();
                            } catch (err: any) {
                              notify(err.message, 'err');
                            }
                          }}
                          className="px-2.5 py-1.5 text-red-600 text-xs hover:bg-red-50 rounded-lg"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiFetch('/api/admin/razorpay-accounts', {
                      method: 'POST',
                      authMode: 'admin',
                      body: JSON.stringify(newRzp),
                    });
                    notify('New Razorpay account encrypted and saved.');
                    setNewRzp({
                      label: '',
                      keyId: '',
                      keySecret: '',
                      webhookSecret: '',
                      settlementBankName: '',
                      settlementAccountMasked: '',
                      settlementIfscMasked: '',
                      activateNow: false,
                    });
                    await loadAllAdminData();
                  } catch (err: any) {
                    notify(err.message, 'err');
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <h3 className="font-display text-base font-bold text-slate-900">
                  Add New Razorpay Merchant Account
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="Account Label (e.g. Razorpay Account 4 — Apparel)"
                    value={newRzp.label}
                    onChange={(e) => setNewRzp({ ...newRzp, label: e.target.value })}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    required
                    placeholder="Razorpay Key ID (rzp_test_... or rzp_live_...)"
                    value={newRzp.keyId}
                    onChange={(e) => setNewRzp({ ...newRzp, keyId: e.target.value })}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                  <input
                    required
                    type="password"
                    placeholder="Razorpay Secret Key (stored AES-256 encrypted)"
                    value={newRzp.keySecret}
                    onChange={(e) => setNewRzp({ ...newRzp, keySecret: e.target.value })}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                  <input
                    type="password"
                    placeholder="Webhook Secret (Optional)"
                    value={newRzp.webhookSecret}
                    onChange={(e) =>
                      setNewRzp({ ...newRzp, webhookSecret: e.target.value })
                    }
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                  <input
                    placeholder="Linked Settlement Bank Name"
                    value={newRzp.settlementBankName}
                    onChange={(e) =>
                      setNewRzp({ ...newRzp, settlementBankName: e.target.value })
                    }
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    placeholder="Masked Account (e.g. ••••••••7821)"
                    value={newRzp.settlementAccountMasked}
                    onChange={(e) =>
                      setNewRzp({ ...newRzp, settlementAccountMasked: e.target.value })
                    }
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={newRzp.activateNow}
                    onChange={(e) =>
                      setNewRzp({ ...newRzp, activateNow: e.target.checked })
                    }
                  />
                  Activate immediately for new checkouts
                </label>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
                >
                  Save Encrypted Account
                </button>
              </form>
            </div>
          )}

          {/* 9. UPI QR MANAGEMENT */}
          {tab === 'upi_qr' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upiAccounts.map((u) => (
                  <div
                    key={u.id}
                    className={`bg-white rounded-xl p-5 border ${
                      u.isDefault ? 'border-blue-700' : 'border-slate-200'
                    } flex gap-4`}
                  >
                    <img
                      src={u.qrImageUrl}
                      alt={u.label}
                      className="w-28 h-32 object-contain border border-slate-200 rounded-lg bg-white shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="font-semibold text-sm text-slate-900">
                          {u.label}
                        </h3>
                        <span className="text-[11px] font-bold uppercase text-blue-700">
                          {u.isDefault ? 'Default' : u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-slate-700 mt-1">{u.upiId}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {u.instructions}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {!u.isDefault && (
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/upi-accounts/${u.id}`, {
                                method: 'PUT',
                                authMode: 'admin',
                                body: JSON.stringify({ isDefault: true }),
                              });
                              notify(`Set ${u.upiId} as default UPI QR.`);
                              await loadAllAdminData();
                            }}
                            className="px-2.5 py-1 bg-blue-700 text-white text-xs font-semibold rounded-md"
                          >
                            Set Default
                          </button>
                        )}
                        <label className="px-2.5 py-1 border border-slate-300 text-slate-700 text-xs font-medium rounded-md cursor-pointer hover:bg-slate-50 inline-flex items-center gap-1">
                          <Upload className="w-3 h-3" />
                          Replace QR
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleQrFileUpload(e, u.id)}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiFetch('/api/admin/upi-accounts', {
                    method: 'POST',
                    authMode: 'admin',
                    body: JSON.stringify(newUpi),
                  });
                  notify('UPI QR account saved.');
                  setNewUpi({
                    label: '',
                    upiId: '',
                    payeeName: 'SHOPKART RETAIL PVT LTD',
                    qrImageUrl: '',
                    instructions: '',
                    isDefault: false,
                  });
                  await loadAllAdminData();
                }}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
              >
                <h3 className="font-display text-base font-bold text-slate-900">
                  Add New UPI ID &amp; QR Code
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    required
                    placeholder="Account Label"
                    value={newUpi.label}
                    onChange={(e) => setNewUpi({ ...newUpi, label: e.target.value })}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    required
                    placeholder="UPI ID (e.g. merchant@okicici)"
                    value={newUpi.upiId}
                    onChange={(e) => setNewUpi({ ...newUpi, upiId: e.target.value })}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                  <input
                    required
                    placeholder="Payee Legal Name"
                    value={newUpi.payeeName}
                    onChange={(e) => setNewUpi({ ...newUpi, payeeName: e.target.value })}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    placeholder="Customer Payment Instructions"
                    value={newUpi.instructions}
                    onChange={(e) =>
                      setNewUpi({ ...newUpi, instructions: e.target.value })
                    }
                    className="md:col-span-2 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <label className="px-3 py-2 text-xs border border-slate-300 rounded-lg cursor-pointer bg-slate-50 flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{newUpi.qrImageUrl ? 'QR Image Ready' : 'Upload QR PNG/JPG (Optional)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleQrFileUpload(e)}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg"
                >
                  Save UPI Account
                </button>
              </form>
            </div>
          )}

          {/* 10. CASH ON DELIVERY */}
          {tab === 'cod' && codSettings && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-xl space-y-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Cash on Delivery (COD) Settings
              </h2>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={codSettings.enabled}
                  onChange={(e) =>
                    setCodSettings({ ...codSettings, enabled: e.target.checked })
                  }
                />
                Enable Cash on Delivery at Checkout
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Min Order (₹)</label>
                  <input
                    type="number"
                    value={codSettings.minOrderAmount}
                    onChange={(e) =>
                      setCodSettings({
                        ...codSettings,
                        minOrderAmount: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Max Order (₹)</label>
                  <input
                    type="number"
                    value={codSettings.maxOrderAmount}
                    onChange={(e) =>
                      setCodSettings({
                        ...codSettings,
                        maxOrderAmount: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">COD Fee (₹)</label>
                  <input
                    type="number"
                    value={codSettings.codFee}
                    onChange={(e) =>
                      setCodSettings({
                        ...codSettings,
                        codFee: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  Availability Message
                </label>
                <textarea
                  rows={2}
                  value={codSettings.availabilityNote}
                  onChange={(e) =>
                    setCodSettings({ ...codSettings, availabilityNote: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <button
                onClick={async () => {
                  await apiFetch('/api/admin/cod-settings', {
                    method: 'PUT',
                    authMode: 'admin',
                    body: JSON.stringify(codSettings),
                  });
                  notify('COD settings updated.');
                  await loadAllAdminData();
                }}
                className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg"
              >
                Save COD Configuration
              </button>
            </div>
          )}

          {/* 11. COUPONS & DISCOUNTS */}
          {tab === 'coupons' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiFetch('/api/admin/coupons', {
                    method: 'POST',
                    authMode: 'admin',
                    body: JSON.stringify(newCoupon),
                  });
                  notify('Coupon created.');
                  setNewCoupon({ ...newCoupon, code: '' });
                  await loadAllAdminData();
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-5 gap-3"
              >
                <input
                  required
                  placeholder="CODE (e.g. DIWALI20)"
                  value={newCoupon.code}
                  onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg uppercase font-mono"
                />
                <select
                  value={newCoupon.type}
                  onChange={(e) => setNewCoupon({ ...newCoupon, type: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                </select>
                <input
                  type="number"
                  placeholder="Value"
                  value={newCoupon.value}
                  onChange={(e) =>
                    setNewCoupon({ ...newCoupon, value: Number(e.target.value) })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  placeholder="Min Order ₹"
                  value={newCoupon.minOrderValue}
                  onChange={(e) =>
                    setNewCoupon({
                      ...newCoupon,
                      minOrderValue: Number(e.target.value),
                    })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg"
                >
                  Create Coupon
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-left">
                      <th className="py-2">Code</th>
                      <th className="py-2">Discount</th>
                      <th className="py-2">Min Order</th>
                      <th className="py-2">Expiry</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {coupons.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 font-mono font-bold">{c.code}</td>
                        <td className="py-2.5">
                          {c.type === 'percentage' ? `${c.value}%` : formatInr(c.value)}
                        </td>
                        <td className="py-2.5 tabular-nums">{formatInr(c.minOrderValue)}</td>
                        <td className="py-2.5">{c.expiryDate}</td>
                        <td className="py-2.5">{c.isActive ? 'Active' : 'Disabled'}</td>
                        <td className="py-2.5 text-right space-x-2">
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/coupons/${c.id}/toggle`, {
                                method: 'PATCH',
                                authMode: 'admin',
                              });
                              await loadAllAdminData();
                            }}
                            className="text-blue-700 hover:underline"
                          >
                            Toggle
                          </button>
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/coupons/${c.id}`, {
                                method: 'DELETE',
                                authMode: 'admin',
                              });
                              await loadAllAdminData();
                            }}
                            className="text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 12. INVENTORY */}
          {tab === 'inventory' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-left">
                    <th className="py-2.5">SKU</th>
                    <th className="py-2.5">Product</th>
                    <th className="py-2.5 text-right">Stock</th>
                    <th className="py-2.5 text-right">Adjust</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 font-mono">{p.sku}</td>
                      <td className="py-2.5 font-medium">{p.name}</td>
                      <td className="py-2.5 text-right font-bold tabular-nums">
                        {p.stock} {p.stock < 12 ? '· Low Stock' : ''}
                      </td>
                      <td className="py-2.5 text-right space-x-2">
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/admin/products/${p.id}`, {
                              method: 'PUT',
                              authMode: 'admin',
                              body: JSON.stringify({ stock: p.stock + 10 }),
                            });
                            notify(`Restocked ${p.name} (+10)`);
                            await loadAllAdminData();
                          }}
                          className="px-2.5 py-1 bg-slate-900 text-white rounded text-[11px]"
                        >
                          +10 Units
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 13. REVIEWS */}
          {tab === 'reviews' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  className="border border-slate-200 rounded-lg p-4 flex justify-between items-start gap-4 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {r.productName} · {r.rating}/5 ★
                    </p>
                    <p className="text-slate-700 mt-1">{r.comment}</p>
                    <p className="text-slate-400 mt-1">
                      By {r.userName} · {r.isApproved ? 'Approved' : 'Hidden'}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/admin/reviews/${r.id}`, {
                          method: 'PATCH',
                          authMode: 'admin',
                        });
                        await loadAllAdminData();
                      }}
                      className="text-blue-700 hover:underline"
                    >
                      {r.isApproved ? 'Hide' : 'Approve'}
                    </button>
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/admin/reviews/${r.id}`, {
                          method: 'DELETE',
                          authMode: 'admin',
                        });
                        await loadAllAdminData();
                      }}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 14. RETURN & REFUNDS */}
          {tab === 'returns' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              {returns.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No pending customer return requests.
                </p>
              ) : (
                <div className="space-y-3">
                  {returns.map((r) => (
                    <div
                      key={r.id}
                      className="border border-slate-200 rounded-lg p-4 flex justify-between items-center text-xs"
                    >
                      <div>
                        <p className="font-mono font-bold">
                          {r.orderNumber} · {r.customerName}
                        </p>
                        <p className="text-slate-600 mt-1">{r.reason}</p>
                        <p className="text-slate-500 mt-0.5">
                          Status: {r.status} · Refund: {formatInr(r.refundAmount)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/admin/returns/${r.id}`, {
                              method: 'PUT',
                              authMode: 'admin',
                              body: JSON.stringify({ status: 'refunded' }),
                            });
                            notify('Return approved and refund marked issued.');
                            await loadAllAdminData();
                          }}
                          className="px-3 py-1.5 bg-blue-700 text-white rounded-lg font-semibold"
                        >
                          Approve &amp; Refund
                        </button>
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/admin/returns/${r.id}`, {
                              method: 'PUT',
                              authMode: 'admin',
                              body: JSON.stringify({ status: 'rejected' }),
                            });
                            await loadAllAdminData();
                          }}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 15. BANNERS & HOMEPAGE */}
          {tab === 'banners' && (
            <div className="space-y-4">
              {banners.map((b) => (
                <div
                  key={b.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-center"
                >
                  <img
                    src={b.image}
                    alt={b.title}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <div className="md:col-span-2 space-y-2">
                    <input
                      value={b.title}
                      onChange={(e) =>
                        setBanners(
                          banners.map((x) =>
                            x.id === b.id ? { ...x, title: e.target.value } : x
                          )
                        )
                      }
                      className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
                    />
                    <input
                      value={b.subtitle}
                      onChange={(e) =>
                        setBanners(
                          banners.map((x) =>
                            x.id === b.id ? { ...x, subtitle: e.target.value } : x
                          )
                        )
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/admin/banners/${b.id}`, {
                          method: 'PUT',
                          authMode: 'admin',
                          body: JSON.stringify(b),
                        });
                        notify('Homepage banner saved.');
                        onStorefrontDataChanged();
                      }}
                      className="px-4 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg"
                    >
                      Save Banner
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 16. REPORTS & ANALYTICS */}
          {tab === 'reports' && overview && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="font-display text-lg font-bold">
                  Sales &amp; Payment Analytics Report
                </h2>
                <button
                  onClick={handleExportPaymentsCsv}
                  className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Ledger CSV
                </button>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.monthlySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="#1D4ED8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 17. WEBSITE SETTINGS */}
          {tab === 'website_settings' && settings && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-xl space-y-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Website &amp; Tax Settings
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-600 mb-1">Store Name</label>
                  <input
                    value={settings.storeName}
                    onChange={(e) =>
                      setSettings({ ...settings, storeName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Support Email</label>
                  <input
                    value={settings.supportEmail}
                    onChange={(e) =>
                      setSettings({ ...settings, supportEmail: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">GST Rate (%)</label>
                  <input
                    type="number"
                    value={settings.gstRatePercent}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        gstRatePercent: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Free Shipping Threshold (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.freeShippingThreshold}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        freeShippingThreshold: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Standard Shipping Fee (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.standardShippingFee}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        standardShippingFee: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <button
                onClick={async () => {
                  await apiFetch('/api/admin/settings', {
                    method: 'PUT',
                    authMode: 'admin',
                    body: JSON.stringify(settings),
                  });
                  notify('Storefront settings saved.');
                  onStorefrontDataChanged();
                }}
                className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg"
              >
                Save Settings
              </button>
            </div>
          )}

          {/* 18. ADMIN USERS */}
          {tab === 'admin_users' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiFetch('/api/admin/admins', {
                      method: 'POST',
                      authMode: 'admin',
                      body: JSON.stringify(newAdminForm),
                    });
                    notify('Admin user created.');
                    setNewAdminForm({ name: '', email: '', password: '', role: 'admin' });
                    await loadAllAdminData();
                  } catch (err: any) {
                    notify(err.message, 'err');
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-5 gap-3"
              >
                <input
                  required
                  placeholder="Full Name"
                  value={newAdminForm.name}
                  onChange={(e) =>
                    setNewAdminForm({ ...newAdminForm, name: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  required
                  type="email"
                  placeholder="Email"
                  value={newAdminForm.email}
                  onChange={(e) =>
                    setNewAdminForm({ ...newAdminForm, email: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  required
                  type="password"
                  placeholder="Password"
                  value={newAdminForm.password}
                  onChange={(e) =>
                    setNewAdminForm({ ...newAdminForm, password: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <select
                  value={newAdminForm.role}
                  onChange={(e) =>
                    setNewAdminForm({ ...newAdminForm, role: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="super_admin">Super Admin</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
                >
                  Add Admin
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                {admins.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between py-2.5 border-b border-slate-100 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {a.name} · {a.role.replace('_', ' ').toUpperCase()}
                      </p>
                      <p className="text-slate-500">{a.email}</p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/admin/admins/${a.id}/toggle`, {
                            method: 'PATCH',
                            authMode: 'admin',
                          });
                          await loadAllAdminData();
                        } catch (err: any) {
                          notify(err.message, 'err');
                        }
                      }}
                      className="px-3 py-1 border border-slate-300 rounded-lg inline-flex items-center gap-1"
                    >
                      <Power className="w-3 h-3" />
                      {a.isActive ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 19. AUDIT LOGS */}
          {tab === 'audit_logs' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-left">
                    <th className="py-2.5">Timestamp</th>
                    <th className="py-2.5">Actor</th>
                    <th className="py-2.5">Action</th>
                    <th className="py-2.5">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5">
                        {l.actorEmail} ({l.actorRole})
                      </td>
                      <td className="py-2.5 font-mono font-semibold text-blue-700">
                        {l.action}
                      </td>
                      <td className="py-2.5 text-slate-700">{l.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
