import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ShoppingCart,
  User as UserIcon,
  Heart,
  Star,
  Plus,
  Minus,
  Trash2,
  X,
  ArrowRight,
  Box,
  ShieldCheck,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  Address,
  Banner,
  CartItem,
  Category,
  Order,
  Product,
  Review,
  User,
  WebsiteSettings,
} from './types';
import { apiFetch, formatInr, getCustomerToken, setCustomerToken } from './lib/api';
import { SpatialShowroom } from './components/SpatialShowroom';
import { CheckoutPage } from './pages/CheckoutPage';
import { CustomerPortal } from './pages/CustomerPortal';
import { InfoPage, OrderTrackingPage } from './pages/InfoPages';
import { AdminConsole } from './pages/AdminConsole';

type RouteView =
  | 'home'
  | 'shop'
  | 'categories'
  | 'product'
  | 'studio3d'
  | 'checkout'
  | 'account'
  | 'track'
  | 'about'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'returns'
  | 'admin';

const DEFAULT_SETTINGS: WebsiteSettings = {
  storeName: 'SHOPKART',
  tagline: 'Precision Commerce & Spatial Showroom',
  supportEmail: 'support@shopkart.in',
  supportPhone: '+91 22 4890 7100',
  gstRatePercent: 18,
  freeShippingThreshold: 1999,
  standardShippingFee: 99,
  currencySymbol: '₹',
  maintenanceMode: false,
};

export function App() {
  const [route, setRoute] = useState<RouteView>('home');
  const [settings, setSettings] = useState<WebsiteSettings>(DEFAULT_SETTINGS);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  // Catalog & Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [homeTab, setHomeTab] = useState<
    'featured' | 'trending' | 'best_seller' | 'new_arrival' | 'deal'
  >('featured');
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc' | 'rating' | 'discount'>('featured');

  // Product detail state
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [productReviews, setProductReviews] = useState<Review[]>([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', comment: '' });
  const [reviewNotice, setReviewNotice] = useState('');

  // Cart & Drawer state
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('shopkart_cart') || '[]');
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);

  // Customer Auth state
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);

  // Newsletter
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterMsg, setNewsletterMsg] = useState('');

  const loadStorefront = async () => {
    try {
      const data = await apiFetch<{
        settings: WebsiteSettings;
        banners: Banner[];
        categories: Category[];
        products: Product[];
        reviews: Review[];
      }>('/api/storefront');
      setSettings(data.settings);
      setBanners(data.banners);
      setCategories(data.categories);
      setProducts(data.products);
      setReviews(data.reviews);
    } finally {
      setLoading(false);
    }
  };

  const refreshCustomer = async () => {
    if (!getCustomerToken()) return;
    try {
      const me = await apiFetch<{
        user: User;
        orders: Order[];
        addresses: Address[];
        cart: CartItem[];
      }>('/api/customer/me', { authMode: 'customer' });
      setUser(me.user);
      setOrders(me.orders);
      setAddresses(me.addresses);
      if (me.cart && me.cart.length > 0 && cart.length === 0) {
        setCart(me.cart);
      }
    } catch {
      setCustomerToken(null);
      setUser(null);
    }
  };

  useEffect(() => {
    loadStorefront();
    refreshCustomer();
  }, []);

  useEffect(() => {
    localStorage.setItem('shopkart_cart', JSON.stringify(cart));
    if (user) {
      apiFetch('/api/customer/cart', {
        method: 'PUT',
        authMode: 'customer',
        body: JSON.stringify({ items: cart }),
      }).catch(() => {});
    }
  }, [cart, user]);

  const openProductDetail = async (product: Product) => {
    setActiveProduct(product);
    setActiveImageIdx(0);
    setSelectedVariantId(product.variants[0]?.id || '');
    setRoute('product');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const res = await apiFetch<{ product: Product; reviews: Review[] }>(
        `/api/products/${product.id}`
      );
      setActiveProduct(res.product);
      setProductReviews(res.reviews);
    } catch {
      setProductReviews([]);
    }
  };

  const addToCart = (
    product: Product,
    variantId?: string,
    openDrawer = true
  ) => {
    const vid = variantId || product.variants[0]?.id || 'default';
    setCart((prev) => {
      const existing = prev.find(
        (i) => i.productId === product.id && i.variantId === vid
      );
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id && i.variantId === vid
            ? { ...i, quantity: Math.min(10, i.quantity + 1) }
            : i
        );
      }
      return [...prev, { productId: product.id, variantId: vid, quantity: 1 }];
    });
    if (openDrawer) setCartOpen(true);
  };

  const buyNow = (product: Product, variantId?: string) => {
    addToCart(product, variantId, false);
    setCartOpen(false);
    setRoute('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateCartQty = (productId: string, variantId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === productId && i.variantId === variantId
            ? { ...i, quantity: i.quantity + delta }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) {
      setRoute('account');
      return;
    }
    const res = await apiFetch<{ wishlist: string[] }>(
      `/api/customer/wishlist/${productId}`,
      { method: 'POST', authMode: 'customer' }
    );
    setUser({ ...user, wishlist: res.wishlist });
  };

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartItemsResolved = useMemo(() => {
    return cart
      .map((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return null;
        const variant =
          product.variants.find((v) => v.id === item.variantId) ||
          product.variants[0];
        const unitPrice = product.discountedPrice + (variant?.priceDelta || 0);
        return { ...item, product, variant, unitPrice };
      })
      .filter(Boolean) as {
      productId: string;
      variantId: string;
      quantity: number;
      product: Product;
      variant: Product['variants'][number];
      unitPrice: number;
    }[];
  }, [cart, products]);

  const cartSubtotal = cartItemsResolved.reduce(
    (s, i) => s + i.unitPrice * i.quantity,
    0
  );

  const liveSearchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [searchQuery, products]);

  const filteredCatalog = useMemo(() => {
    let list = products;
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.categoryId === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q)
      );
    }
    if (sortBy === 'price_asc') {
      list = [...list].sort((a, b) => a.discountedPrice - b.discountedPrice);
    } else if (sortBy === 'price_desc') {
      list = [...list].sort((a, b) => b.discountedPrice - a.discountedPrice);
    } else if (sortBy === 'rating') {
      list = [...list].sort((a, b) => b.rating - a.rating);
    } else if (sortBy === 'discount') {
      list = [...list].sort((a, b) => b.discountPercent - a.discountPercent);
    }
    return list;
  }, [products, selectedCategory, searchQuery, sortBy]);

  if (route === 'admin') {
    return (
      <AdminConsole
        onExitAdmin={() => setRoute('home')}
        onStorefrontDataChanged={loadStorefront}
      />
    );
  }

  const heroBanner = banners.find((b) => b.placement === 'hero') || banners[0];
  const homeProducts = products.filter((p) => p.tags.includes(homeTab));

  const navigate = (next: RouteView) => {
    setRoute(next);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* Slim Top Promotional Strip (<= 36px) */}
      <div className="bg-slate-950 text-white text-xs py-2 px-4 text-center">
        <span>
          Free Insured Delivery on orders above {formatInr(settings.freeShippingThreshold)} · Use code{' '}
          <strong className="font-mono text-blue-300">SHOP10</strong> for 10% off
        </span>
      </div>

      {/* Three-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <button
            onClick={() => navigate('home')}
            className="font-display text-xl font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0"
          >
            {settings.storeName}
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              onClick={() => {
                setSelectedCategory('all');
                navigate('shop');
              }}
              className={`hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 ${
                route === 'shop' ? 'text-slate-950 font-semibold' : ''
              }`}
            >
              All Products
            </button>
            <button
              onClick={() => navigate('categories')}
              className={`hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 ${
                route === 'categories' ? 'text-slate-950 font-semibold' : ''
              }`}
            >
              Categories
            </button>
            <button
              onClick={() => navigate('studio3d')}
              className={`hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 ${
                route === 'studio3d' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              3D Studio
            </button>
            <button
              onClick={() => navigate('track')}
              className={`hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 ${
                route === 'track' ? 'text-slate-950 font-semibold' : ''
              }`}
            >
              Track Order
            </button>
            <button
              onClick={() => navigate('admin')}
              className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Admin Panel
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search Products"
              className="p-2 text-slate-700 hover:text-slate-950 rounded-lg hover:bg-slate-100"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('account')}
              className="px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-950 rounded-lg hover:bg-slate-100 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <UserIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{user ? user.name.split(' ')[0] : 'Sign In'}</span>
            </button>
            <button
              onClick={() => setCartOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold bg-slate-950 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Cart ({cartCount})</span>
            </button>
          </div>
        </div>

        {/* Expandable Live Search Bar */}
        {searchOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-3">
            <div className="max-w-3xl mx-auto relative">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    navigate('shop');
                  }
                }}
                placeholder="Search headphones, smartwatches, laptops, cameras..."
                className="w-full pl-4 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-blue-700"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>

              {liveSearchMatches.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 shadow-lg">
                  {liveSearchMatches.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openProductDetail(p)}
                      className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={p.images[0]}
                          alt={p.name}
                          className="w-10 h-8 object-cover rounded"
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{p.name}</p>
                          <p className="text-xs text-slate-500">{p.categoryName}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        {formatInr(p.discountedPrice)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {loading ? (
          <div className="max-w-7xl mx-auto px-4 py-20 text-center text-sm text-slate-500">
            Loading SHOPKART catalog...
          </div>
        ) : route === 'home' ? (
          <>
            {/* Hero Section */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                <div className="lg:col-span-5 flex flex-col justify-center py-4">
                  <p className="text-xs font-semibold text-blue-700 tracking-wide">
                    Flagship Hardware &amp; Studio Essentials
                  </p>
                  <h1 className="font-display text-4xl sm:text-5xl font-bold text-slate-950 tracking-tight leading-[1.08] mt-3 text-balance">
                    {heroBanner?.title ||
                      'Flagship engineering for work, sound, and motion.'}
                  </h1>
                  <p className="text-base text-slate-600 mt-4 leading-relaxed">
                    {heroBanner?.subtitle ||
                      'Explore precision hardware with instant Razorpay UPI checkout, pan-India insured shipping, and interactive 3D inspection.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-7">
                    <button
                      onClick={() => navigate('shop')}
                      className="px-6 py-3 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors inline-flex items-center gap-2"
                    >
                      {heroBanner?.ctaLabel || 'Shop Collection'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => navigate('studio3d')}
                      className="px-5 py-3 border border-slate-300 text-slate-800 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors inline-flex items-center gap-2"
                    >
                      <Box className="w-4 h-4 text-blue-700" />
                      Open 3D Studio
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-7 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 min-h-[340px]">
                  <img
                    src={
                      heroBanner?.image ||
                      '/src/assets/images/hero_shopkart_flagship_1795014126869.jpg'
                    }
                    alt="SHOPKART Flagship Showcase"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </section>

            {/* Category Showcase Strip */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-slate-200">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display text-xl font-bold text-slate-900">
                  Shop by Category
                </h2>
                <button
                  onClick={() => navigate('categories')}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  View All Categories
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      navigate('shop');
                    }}
                    className="group text-left border border-slate-200 rounded-xl p-3 bg-white hover:border-blue-700 transition-colors"
                  >
                    <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-50 mb-2.5">
                      <img
                        src={cat.image}
                        alt={cat.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {cat.name}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {cat.productCount || 0} items
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {/* Curated Collections (Featured / Trending / Best Sellers / New Arrivals / Discount Offers) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="font-display text-2xl font-bold text-slate-900">
                    Curated Showcase
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Verified stock · Instant GST invoice · Razorpay, UPI QR &amp; COD
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  {(
                    [
                      ['featured', 'Featured'],
                      ['trending', 'Trending'],
                      ['best_seller', 'Best Sellers'],
                      ['new_arrival', 'New Arrivals'],
                      ['deal', 'Discount Offers'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setHomeTab(key)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        homeTab === key
                          ? 'bg-white text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {(homeProducts.length > 0 ? homeProducts : products.slice(0, 6)).map(
                  (p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      isWishlisted={Boolean(user?.wishlist.includes(p.id))}
                      onSelect={() => openProductDetail(p)}
                      onAddToCart={() => addToCart(p)}
                      onToggleWishlist={() => toggleWishlist(p.id)}
                    />
                  )
                )}
              </div>
            </section>

            {/* Verified Customer Reviews & Newsletter */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7 space-y-4">
                <h2 className="font-display text-xl font-bold text-slate-900">
                  Verified Customer Reviews
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {reviews.slice(0, 4).map((r) => (
                    <div
                      key={r.id}
                      className="border border-slate-200 rounded-xl p-4 bg-white"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-semibold text-slate-900">{r.userName}</span>
                        <span className="text-blue-700 font-semibold tabular-nums">
                          {r.rating}.0 ★
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mt-2">
                        {r.title}
                      </p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {r.comment}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-2 truncate">
                        {r.productName}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5 border border-slate-200 rounded-2xl p-6 bg-slate-50">
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Subscribe to Hardware Drops &amp; Offers
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Receive early access to flagship releases, seasonal coupon codes, and firmware announcements.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const res = await apiFetch<{ message: string }>(
                        '/api/newsletter',
                        {
                          method: 'POST',
                          body: JSON.stringify({ email: newsletterEmail }),
                        }
                      );
                      setNewsletterMsg(res.message);
                      setNewsletterEmail('');
                    } catch (err: any) {
                      setNewsletterMsg(err.message);
                    }
                  }}
                  className="mt-4 flex gap-2"
                >
                  <input
                    required
                    type="email"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Subscribe
                  </button>
                </form>
                {newsletterMsg && (
                  <p className="text-xs text-blue-700 font-medium mt-2">
                    {newsletterMsg}
                  </p>
                )}
              </div>
            </section>
          </>
        ) : route === 'shop' ? (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
              <div>
                <h1 className="font-display text-3xl font-bold text-slate-900">
                  All Products
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Showing {filteredCatalog.length} products
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by name or brand..."
                  className="px-3.5 py-2 text-xs border border-slate-300 rounded-lg w-52"
                />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="inline-flex items-center gap-1.5 text-xs">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="featured">Featured</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="rating">Highest Rated</option>
                    <option value="discount">Biggest Discount</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
              {filteredCatalog.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  isWishlisted={Boolean(user?.wishlist.includes(p.id))}
                  onSelect={() => openProductDetail(p)}
                  onAddToCart={() => addToCart(p)}
                  onToggleWishlist={() => toggleWishlist(p.id)}
                />
              ))}
            </div>
          </section>
        ) : route === 'categories' ? (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <h1 className="font-display text-3xl font-bold text-slate-900">
              Product Categories
            </h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    navigate('shop');
                  }}
                  className="text-left border border-slate-200 rounded-2xl overflow-hidden bg-white hover:border-blue-700 transition-colors"
                >
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="w-full h-48 object-cover bg-slate-50"
                  />
                  <div className="p-5">
                    <div className="flex justify-between items-center">
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        {cat.name}
                      </h2>
                      <span className="text-xs text-blue-700 font-semibold tabular-nums">
                        {cat.productCount || 0} products
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1.5">{cat.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : route === 'product' && activeProduct ? (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <button
              onClick={() => navigate('shop')}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 mb-6"
            >
              ← Back to All Products
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              {/* Left: Multi-image Gallery */}
              <div className="lg:col-span-6 space-y-3">
                <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                  <img
                    src={activeProduct.images[activeImageIdx] || activeProduct.images[0]}
                    alt={activeProduct.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-2.5">
                    {activeProduct.images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImageIdx(i)}
                        className={`w-20 h-16 rounded-lg overflow-hidden border-2 ${
                          activeImageIdx === i ? 'border-blue-700' : 'border-slate-200'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => navigate('studio3d')}
                    className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <Box className="w-3.5 h-3.5 text-blue-700" />
                    Inspect in 3D / XR
                  </button>
                </div>
              </div>

              {/* Right: Contiguous Purchase Module */}
              <div className="lg:col-span-6 space-y-5">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {activeProduct.brand} · {activeProduct.categoryName} · SKU {activeProduct.sku}
                  </p>
                  <h1 className="font-display text-3xl font-bold text-slate-950 mt-1.5">
                    {activeProduct.name}
                  </h1>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {activeProduct.rating}
                    </span>
                    <span>·</span>
                    <span>{productReviews.length} verified reviews</span>
                    <span>·</span>
                    <span
                      className={
                        activeProduct.stock > 0 ? 'text-emerald-700 font-semibold' : 'text-red-600'
                      }
                    >
                      {activeProduct.stock > 0
                        ? `In Stock (${activeProduct.stock} units)`
                        : 'Out of Stock'}
                    </span>
                  </div>
                </div>

                {(() => {
                  const chosenVariant =
                    activeProduct.variants.find((v) => v.id === selectedVariantId) ||
                    activeProduct.variants[0];
                  const finalPrice =
                    activeProduct.discountedPrice + (chosenVariant?.priceDelta || 0);
                  return (
                    <>
                      <div className="flex items-baseline gap-3 tabular-nums pt-2">
                        <span className="font-display text-3xl font-bold text-slate-950">
                          {formatInr(finalPrice)}
                        </span>
                        <span className="text-base text-slate-400 line-through">
                          {formatInr(activeProduct.originalPrice + (chosenVariant?.priceDelta || 0))}
                        </span>
                        <span className="text-xs font-bold text-blue-700">
                          Save {activeProduct.discountPercent}%
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 leading-relaxed">
                        {activeProduct.description}
                      </p>

                      {activeProduct.variants.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-2">
                            Select Variant
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {activeProduct.variants.map((v) => (
                              <button
                                key={v.id}
                                onClick={() => setSelectedVariantId(v.id)}
                                className={`px-3.5 py-2 text-xs font-medium rounded-lg border inline-flex items-center gap-2 ${
                                  selectedVariantId === v.id
                                    ? 'border-blue-700 bg-blue-50 text-blue-900'
                                    : 'border-slate-300 bg-white text-slate-700'
                                }`}
                              >
                                {v.colorHex && (
                                  <span
                                    className="w-3 h-3 rounded-full border border-slate-300"
                                    style={{ backgroundColor: v.colorHex }}
                                  />
                                )}
                                {v.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <ul className="space-y-1.5 pt-2 border-t border-slate-200 text-xs text-slate-700">
                        {activeProduct.specs.map((sp, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                            <span>{sp}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="flex flex-wrap gap-3 pt-4">
                        <button
                          disabled={activeProduct.stock <= 0}
                          onClick={() => addToCart(activeProduct, selectedVariantId)}
                          className="flex-1 py-3 px-5 bg-slate-950 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-40 transition-colors"
                        >
                          Add to Cart
                        </button>
                        <button
                          disabled={activeProduct.stock <= 0}
                          onClick={() => buyNow(activeProduct, selectedVariantId)}
                          className="flex-1 py-3 px-5 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 disabled:opacity-40 transition-colors"
                        >
                          Buy Now
                        </button>
                        <button
                          onClick={() => toggleWishlist(activeProduct.id)}
                          aria-label="Toggle Wishlist"
                          className={`p-3 rounded-xl border ${
                            user?.wishlist.includes(activeProduct.id)
                              ? 'border-red-300 bg-red-50 text-red-600'
                              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <Heart className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                        <span>
                          Razorpay UPI, Cards, NetBanking, UPI QR &amp; Cash on Delivery supported at checkout.
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Product Reviews Section */}
            <div className="mt-14 pt-8 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 space-y-4">
                <h2 className="font-display text-xl font-bold text-slate-900">
                  Customer Reviews ({productReviews.length})
                </h2>
                {productReviews.length === 0 ? (
                  <p className="text-sm text-slate-500">No reviews yet for this item.</p>
                ) : (
                  productReviews.map((r) => (
                    <div key={r.id} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-900">
                          {r.userName} {r.verifiedPurchase ? '· Verified Buyer' : ''}
                        </span>
                        <span className="font-bold text-blue-700">{r.rating} ★</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 mt-1">{r.title}</p>
                      <p className="text-xs text-slate-600 mt-1">{r.comment}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="lg:col-span-5 border border-slate-200 rounded-xl p-5 bg-white">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Write a Review
                </h3>
                {!user ? (
                  <p className="text-xs text-slate-600 mt-2">
                    <button
                      onClick={() => navigate('account')}
                      className="text-blue-700 font-semibold underline"
                    >
                      Sign in
                    </button>{' '}
                    to publish a review for this product.
                  </p>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const res = await apiFetch<{ review: Review }>(
                        `/api/customer/products/${activeProduct.id}/reviews`,
                        {
                          method: 'POST',
                          authMode: 'customer',
                          body: JSON.stringify(reviewForm),
                        }
                      );
                      setProductReviews([res.review, ...productReviews]);
                      setReviewForm({ rating: 5, title: '', comment: '' });
                      setReviewNotice('Review published.');
                    }}
                    className="space-y-3 mt-3"
                  >
                    {reviewNotice && (
                      <p className="text-xs text-emerald-700">{reviewNotice}</p>
                    )}
                    <select
                      value={reviewForm.rating}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, rating: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} Stars
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Headline"
                      value={reviewForm.title}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, title: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <textarea
                      required
                      rows={3}
                      placeholder="Share your experience..."
                      value={reviewForm.comment}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, comment: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
                    >
                      Submit Review
                    </button>
                  </form>
                )}
              </div>
            </div>
          </section>
        ) : route === 'studio3d' ? (
          <SpatialShowroom
            products={products}
            initialProduct={activeProduct}
            onSelectProduct={openProductDetail}
            onAddToCart={(p) => addToCart(p)}
          />
        ) : route === 'checkout' ? (
          <CheckoutPage
            cart={cart}
            products={products}
            settings={settings}
            user={user}
            addresses={addresses}
            onOrderCompleted={() => {
              setCart([]);
              refreshCustomer();
              loadStorefront();
            }}
            onNavigate={(p) => navigate(p as RouteView)}
          />
        ) : route === 'account' ? (
          <CustomerPortal
            user={user}
            orders={orders}
            addresses={addresses}
            products={products}
            onAuthSuccess={(u, o, a) => {
              setUser(u);
              setOrders(o);
              setAddresses(a);
            }}
            onLogout={() => {
              setCustomerToken(null);
              setUser(null);
              setOrders([]);
              setAddresses([]);
            }}
            onRefreshMe={refreshCustomer}
            onSelectProduct={openProductDetail}
            onToggleWishlist={toggleWishlist}
          />
        ) : route === 'track' ? (
          <OrderTrackingPage />
        ) : (
          <InfoPage
            type={
              route === 'about' ||
              route === 'contact' ||
              route === 'privacy' ||
              route === 'terms' ||
              route === 'returns'
                ? route
                : 'about'
            }
          />
        )}
      </main>

      {/* Professional Storefront Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-xs">
          <div>
            <p className="font-display text-base font-bold text-slate-950">
              {settings.storeName}
            </p>
            <p className="text-slate-600 mt-2 leading-relaxed">
              {settings.tagline}. Insured pan-India delivery and server-verified Razorpay &amp; UPI commerce.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-900 mb-3">Shop</p>
            <ul className="space-y-2 text-slate-600">
              <li>
                <button onClick={() => navigate('shop')} className="hover:text-slate-950">
                  All Products
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('categories')}
                  className="hover:text-slate-950"
                >
                  Categories
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('studio3d')}
                  className="hover:text-slate-950"
                >
                  3D XR Studio
                </button>
              </li>
              <li>
                <button onClick={() => navigate('track')} className="hover:text-slate-950">
                  Order Tracking
                </button>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-900 mb-3">Company &amp; Support</p>
            <ul className="space-y-2 text-slate-600">
              <li>
                <button onClick={() => navigate('about')} className="hover:text-slate-950">
                  About Us
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('contact')}
                  className="hover:text-slate-950"
                >
                  Contact Us
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('account')}
                  className="hover:text-slate-950"
                >
                  Customer Dashboard
                </button>
              </li>
              <li>
                <button onClick={() => navigate('admin')} className="hover:text-slate-950">
                  Admin Console
                </button>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-900 mb-3">Policies</p>
            <ul className="space-y-2 text-slate-600">
              <li>
                <button
                  onClick={() => navigate('privacy')}
                  className="hover:text-slate-950"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button onClick={() => navigate('terms')} className="hover:text-slate-950">
                  Terms &amp; Conditions
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('returns')}
                  className="hover:text-slate-950"
                >
                  Return &amp; Refund Policy
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} {settings.storeName} Retail Pvt. Ltd. All rights reserved.
        </div>
      </footer>

      {/* Slide-Over Cart Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full flex flex-col border-l border-slate-200 shadow-2xl">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Shopping Cart ({cartCount})
              </h2>
              <button
                onClick={() => setCartOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 divide-y divide-slate-100">
              {cartItemsResolved.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">
                  Your cart is empty.
                </p>
              ) : (
                cartItemsResolved.map((item) => (
                  <div
                    key={`${item.productId}-${item.variantId}`}
                    className="py-4 flex gap-3.5"
                  >
                    <img
                      src={item.product.images[0]}
                      alt={item.product.name}
                      className="w-20 h-16 object-cover rounded-lg border border-slate-200 bg-slate-50 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-slate-500">{item.variant?.label}</p>
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="inline-flex items-center border border-slate-300 rounded-lg">
                          <button
                            onClick={() =>
                              updateCartQty(item.productId, item.variantId, -1)
                            }
                            className="p-1.5 hover:bg-slate-100"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2.5 text-xs font-semibold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateCartQty(item.productId, item.variantId, 1)
                            }
                            className="p-1.5 hover:bg-slate-100"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-sm font-bold tabular-nums">
                          {formatInr(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        updateCartQty(
                          item.productId,
                          item.variantId,
                          -item.quantity
                        )
                      }
                      className="text-slate-400 hover:text-red-600 self-start"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {cartItemsResolved.length > 0 && (
              <div className="p-5 border-t border-slate-200 bg-slate-50 space-y-3">
                <div className="flex justify-between text-sm font-semibold text-slate-900 tabular-nums">
                  <span>Subtotal (excl. GST)</span>
                  <span>{formatInr(cartSubtotal)}</span>
                </div>
                <button
                  onClick={() => {
                    setCartOpen(false);
                    navigate('checkout');
                  }}
                  className="w-full py-3 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors"
                >
                  Proceed to Checkout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const ProductCard: React.FC<{
  product: Product;
  isWishlisted: boolean;
  onSelect: () => void;
  onAddToCart: () => void;
  onToggleWishlist: () => void;
}> = ({ product, isWishlisted, onSelect, onAddToCart, onToggleWishlist }) => {
  return (
    <div className="group border border-slate-200 rounded-2xl overflow-hidden bg-white hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col">
      <div
        onClick={onSelect}
        className="aspect-[4/3] bg-slate-50 overflow-hidden relative cursor-pointer"
      >
        <img
          src={product.images[0]}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist();
          }}
          aria-label="Wishlist"
          className={`absolute top-3 right-3 p-2 rounded-full bg-white/90 border border-slate-200 ${
            isWishlisted ? 'text-red-600' : 'text-slate-600 hover:text-slate-950'
          }`}
        >
          <Heart className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="truncate">{product.categoryName}</span>
            <span className="tabular-nums font-medium text-slate-700 shrink-0">
              {product.rating} ★
            </span>
          </div>
          <h3
            onClick={onSelect}
            className="font-semibold text-base text-slate-950 mt-1.5 cursor-pointer hover:text-blue-700 line-clamp-1"
          >
            {product.name}
          </h3>
          <div className="flex items-baseline gap-2 mt-2 tabular-nums">
            <span className="text-base font-bold text-slate-950">
              {formatInr(product.discountedPrice)}
            </span>
            <span className="text-xs text-slate-400 line-through">
              {formatInr(product.originalPrice)}
            </span>
            {product.discountPercent > 0 && (
              <span className="text-xs font-semibold text-blue-700">
                {product.discountPercent}% off
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={onAddToCart}
            disabled={product.stock <= 0}
            className="flex-1 py-2 px-3 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {product.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
          </button>
          <button
            onClick={onSelect}
            className="py-2 px-3 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
          >
            Details
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
