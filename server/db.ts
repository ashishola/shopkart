import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { encryptSecret } from './crypto.ts';
import type {
  ActivePaymentConfig,
  Address,
  AdminUser,
  AuditLog,
  Banner,
  CartItem,
  Category,
  CodSettings,
  Coupon,
  Order,
  PaymentTransaction,
  Product,
  ReturnRequest,
  Review,
  UpiAccount,
  User,
  WebsiteSettings,
} from '../src/types.ts';

export interface StoredUser extends User {
  passwordHash: string;
  resetToken?: string;
  resetTokenExpiresAt?: string;
  verificationCode?: string;
}

export interface StoredAdmin extends AdminUser {
  passwordHash: string;
}

export interface StoredRazorpayAccount {
  id: string;
  label: string;
  keyId: string;
  encryptedKeySecret: string;
  encryptedWebhookSecret: string;
  mode: 'test' | 'live';
  isActive: boolean;
  connectionStatus: 'connected' | 'untested' | 'error';
  lastTestedAt?: string;
  lastTestMessage?: string;
  settlementBankName: string;
  settlementAccountMasked: string;
  settlementIfscMasked: string;
  settlementStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInquiry {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

export interface ShopkartDatabase {
  users: StoredUser[];
  admins: StoredAdmin[];
  categories: Category[];
  products: Product[];
  orders: Order[];
  payments: PaymentTransaction[];
  razorpayAccounts: StoredRazorpayAccount[];
  upiAccounts: UpiAccount[];
  codSettings: CodSettings;
  paymentConfig: ActivePaymentConfig;
  previousPaymentConfig: ActivePaymentConfig | null;
  carts: Record<string, CartItem[]>;
  coupons: Coupon[];
  reviews: Review[];
  addresses: Address[];
  settings: WebsiteSettings;
  banners: Banner[];
  returns: ReturnRequest[];
  auditLogs: AuditLog[];
  inquiries: ContactInquiry[];
  newsletterEmails: string[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'shopkart_db.json');

function createUpiQrSvgDataUri(upiId: string, label: string): string {
  // Deterministic visual QR matrix seeded from the UPI ID so each UPI account renders a crisp, distinct vector QR
  const hash = crypto.createHash('sha256').update(upiId).digest();
  const gridSize = 21;
  const cells: string[] = [];
  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) ||
    (r < 7 && c >= gridSize - 7) ||
    (r >= gridSize - 7 && c < 7);

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (isFinder(r, c)) continue;
      const bitIndex = (r * gridSize + c) % (hash.length * 8);
      const byte = hash[Math.floor(bitIndex / 8)];
      const on = ((byte >> (bitIndex % 8)) & 1) === 1;
      if (on) {
        cells.push(
          `<rect x="${24 + c * 8}" y="${24 + r * 8}" width="7.4" height="7.4" rx="1" fill="#0F172A"/>`
        );
      }
    }
  }

  const finderBox = (x: number, y: number) => `
    <rect x="${x}" y="${y}" width="56" height="56" rx="6" fill="none" stroke="#0F172A" stroke-width="8"/>
    <rect x="${x + 16}" y="${y + 16}" width="24" height="24" rx="3" fill="#1D4ED8"/>
  `;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 216 240" width="216" height="240">
    <rect width="216" height="240" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
    ${finderBox(24, 24)}
    ${finderBox(136, 24)}
    ${finderBox(24, 136)}
    ${cells.join('')}
    <text x="108" y="216" text-anchor="middle" font-family="monospace" font-size="10" font-weight="600" fill="#0F172A">${upiId}</text>
    <text x="108" y="230" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#64748B">${label}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export { createUpiQrSvgDataUri };

function createSeedDatabase(): ShopkartDatabase {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();

  const superAdminPass = bcrypt.hashSync(
    process.env.DEFAULT_SUPER_ADMIN_PASSWORD || 'Admin@1234',
    10
  );
  const customerPass = bcrypt.hashSync('Shop@1234', 10);

  const razorpayKey1 = process.env.RAZORPAY_KEY_ID || 'rzp_test_demo_primary01';
  const razorpaySec1 =
    process.env.RAZORPAY_KEY_SECRET || 'demo_secret_key_primary_01';
  const razorpayWh1 =
    process.env.RAZORPAY_WEBHOOK_SECRET || 'demo_webhook_secret_01';

  const upi1 = 'shopkart.merchant@okaxis';
  const upi2 = 'shopkart.reserve@ybl';

  const products: Product[] = [
    {
      id: 'prod_headphones_anc',
      name: 'Aether Studio ANC Wireless Headphones',
      slug: 'aether-studio-anc-wireless-headphones',
      brand: 'Aether Acoustics',
      categoryId: 'cat_audio',
      categoryName: 'Audio & Studio',
      description:
        'Flagship hybrid active noise-cancelling over-ear headphones crafted with CNC-milled anodized aluminum yokes, memory-foam lambskin earcups, 40mm planar-inspired drivers, and 45-hour battery endurance with USB-C fast charge.',
      specs: [
        '40mm Custom Dynamic Drivers · Hi-Res LDAC & AAC',
        '-46dB Adaptive Hybrid Active Noise Cancellation',
        '45 Hours ANC Playback · 5 Min Charge = 4 Hours',
        'Dual-Device Multipoint Bluetooth 5.4 + 3.5mm Lossless',
      ],
      images: [
        '/src/assets/images/product_audio_headphones_1795014127358.jpg',
        '/src/assets/images/hero_shopkart_flagship_1795014126869.jpg',
      ],
      originalPrice: 24999,
      discountedPrice: 18499,
      discountPercent: 26,
      stock: 42,
      sku: 'SK-AUD-001',
      variants: [
        {
          id: 'var_hp_obsidian',
          label: 'Obsidian Matte',
          colorHex: '#1E293B',
          priceDelta: 0,
          stock: 24,
          sku: 'SK-AUD-001-OBS',
        },
        {
          id: 'var_hp_cobalt',
          label: 'Cobalt Slate',
          colorHex: '#1D4ED8',
          priceDelta: 500,
          stock: 18,
          sku: 'SK-AUD-001-CBL',
        },
      ],
      tags: ['trending', 'best_seller', 'featured'],
      rating: 4.9,
      reviewCount: 2,
      isActive: true,
      spatialModel: 'headphones',
      createdAt: fiveDaysAgo,
      updatedAt: now,
    },
    {
      id: 'prod_smartwatch_ti',
      name: 'Chrono Ti-Ultra OLED Smartwatch',
      slug: 'chrono-ti-ultra-oled-smartwatch',
      brand: 'Chrono Labs',
      categoryId: 'cat_wearables',
      categoryName: 'Wearables',
      description:
        'Grade-5 titanium chassis engineered for endurance athletes and daily precision. Features a 2,400-nit sapphire LTPO AMOLED display, dual-frequency L1+L5 GPS, ECG & SpO2 telemetry, and 72-hour multi-day autonomy.',
      specs: [
        '47mm Grade-5 Brushed Titanium Case · Sapphire Crystal',
        '1.92" LTPO AMOLED · 2400 Nits Peak Brightness',
        'Dual-Band L1+L5 GNSS · 100m Water Resistance',
        'Up to 72 Hours Battery · Magnetic Fast Charge',
      ],
      images: [
        '/src/assets/images/product_smartwatch_pro_1795014128128.jpg',
        '/src/assets/images/hero_shopkart_flagship_1795014126869.jpg',
      ],
      originalPrice: 34999,
      discountedPrice: 27999,
      discountPercent: 20,
      stock: 28,
      sku: 'SK-WRB-002',
      variants: [
        {
          id: 'var_sw_graphite',
          label: 'Titanium / Carbon Weave',
          colorHex: '#334155',
          priceDelta: 0,
          stock: 18,
          sku: 'SK-WRB-002-GRP',
        },
        {
          id: 'var_sw_ocean',
          label: 'Titanium / Cobalt Loop',
          colorHex: '#2563EB',
          priceDelta: 1000,
          stock: 10,
          sku: 'SK-WRB-002-CBL',
        },
      ],
      tags: ['trending', 'new_arrival', 'featured'],
      rating: 4.8,
      reviewCount: 1,
      isActive: true,
      spatialModel: 'smartwatch',
      createdAt: fiveDaysAgo,
      updatedAt: now,
    },
    {
      id: 'prod_ultrabook_14',
      name: 'ZenithBook Pro 14 CNC Ultrabook',
      slug: 'zenithbook-pro-14-cnc-ultrabook',
      brand: 'Zenith Computing',
      categoryId: 'cat_computing',
      categoryName: 'Laptops & Workstations',
      description:
        'Unibody CNC-machined 6000-series aluminum workstation featuring a 2.8K 120Hz calibrated display, 32GB LPDDR5X unified memory, 1TB PCIe Gen4 NVMe SSD, and whisper-quiet vapor chamber thermals.',
      specs: [
        '14.2" 2880×1800 120Hz Mini-LED · 100% DCI-P3',
        '12-Core Performance Architecture · 32GB LPDDR5X',
        '1TB PCIe 4.0 NVMe SSD · Dual Thunderbolt 4',
        '1.24 kg Unibody Aluminum · 16-Hour Battery Life',
      ],
      images: [
        '/src/assets/images/product_ultrabook_laptop_1795014128990.jpg',
        '/src/assets/images/hero_shopkart_flagship_1795014126869.jpg',
      ],
      originalPrice: 129990,
      discountedPrice: 109990,
      discountPercent: 15,
      stock: 15,
      sku: 'SK-CMP-003',
      variants: [
        {
          id: 'var_lp_1tb',
          label: 'Silver · 32GB / 1TB SSD',
          colorHex: '#CBD5E1',
          priceDelta: 0,
          stock: 10,
          sku: 'SK-CMP-003-1TB',
        },
        {
          id: 'var_lp_2tb',
          label: 'Space Slate · 32GB / 2TB SSD',
          colorHex: '#475569',
          priceDelta: 14000,
          stock: 5,
          sku: 'SK-CMP-003-2TB',
        },
      ],
      tags: ['best_seller', 'featured', 'deal'],
      rating: 4.9,
      reviewCount: 1,
      isActive: true,
      spatialModel: 'laptop',
      createdAt: fiveDaysAgo,
      updatedAt: now,
    },
    {
      id: 'prod_ergo_chair',
      name: 'PostureForm Pro Mesh Studio Chair',
      slug: 'postureform-pro-mesh-studio-chair',
      brand: 'FormLab Ergonomics',
      categoryId: 'cat_furniture',
      categoryName: 'Workspace & Furniture',
      description:
        'Dynamic weight-activated ergonomic task chair engineered with breathable elastomeric tension mesh, 4D micro-adjustable armrests, adaptive lumbar cradle, and cast aluminum 5-star base.',
      specs: [
        'High-Tension Korean Elastomeric Breathable Mesh',
        '4D Soft-Touch Armrests · 135° Synchro-Tilt Lock',
        'Dynamic Self-Adjusting Lumbar Support System',
        'BIFMA X5.1 Certified · 10-Year Structural Warranty',
      ],
      images: ['/src/assets/images/product_ergonomic_chair_1795014128630.jpg'],
      originalPrice: 44999,
      discountedPrice: 32999,
      discountPercent: 27,
      stock: 19,
      sku: 'SK-FRN-004',
      variants: [
        {
          id: 'var_ch_slate',
          label: 'Graphite Mesh',
          colorHex: '#475569',
          priceDelta: 0,
          stock: 12,
          sku: 'SK-FRN-004-SLT',
        },
        {
          id: 'var_ch_onyx',
          label: 'Onyx Frame',
          colorHex: '#0F172A',
          priceDelta: 2000,
          stock: 7,
          sku: 'SK-FRN-004-ONY',
        },
      ],
      tags: ['deal', 'best_seller'],
      rating: 4.7,
      reviewCount: 1,
      isActive: true,
      spatialModel: 'chair',
      createdAt: threeDaysAgo,
      updatedAt: now,
    },
    {
      id: 'prod_espresso_pid',
      name: 'Velocita Dual-Boiler PID Espresso Machine',
      slug: 'velocita-dual-boiler-pid-espresso-machine',
      brand: 'Velocita Atelier',
      categoryId: 'cat_home',
      categoryName: 'Home & Kitchen',
      description:
        'Barista-grade dual stainless steel boiler espresso brewer with digital PID temperature stability (±0.5°C), commercial 58mm brass portafilter, rotary 9-bar pump, and cool-touch articulating steam wand.',
      specs: [
        'Dual Stainless Steel Boilers · Digital PID Controller',
        'Commercial 58mm E61 Grouphead & Brass Portafilter',
        '15-Bar Rotary Pump Calibrated to 9-Bar Extraction',
        '2.5L Removable Reservoir · Built-In Shot Timer',
      ],
      images: ['/src/assets/images/product_espresso_machine_1795014129631.jpg'],
      originalPrice: 68500,
      discountedPrice: 54900,
      discountPercent: 20,
      stock: 11,
      sku: 'SK-HOM-005',
      variants: [
        {
          id: 'var_es_steel',
          label: 'Brushed Steel / Matte Black',
          colorHex: '#64748B',
          priceDelta: 0,
          stock: 11,
          sku: 'SK-HOM-005-STL',
        },
      ],
      tags: ['new_arrival', 'featured'],
      rating: 4.9,
      reviewCount: 0,
      isActive: true,
      spatialModel: 'espresso',
      createdAt: threeDaysAgo,
      updatedAt: now,
    },
    {
      id: 'prod_sneakers_run',
      name: 'Kinetix AeroKnit Carbon Runners',
      slug: 'kinetix-aeroknit-carbon-runners',
      brand: 'Kinetix Athletics',
      categoryId: 'cat_footwear',
      categoryName: 'Footwear & Sport',
      description:
        'Featherweight marathon training shoes pairing supercritical nitrogen-infused PEBA midsole foam with a full-length forked carbon propulsion plate and 3D-mapped breathable mono-mesh upper.',
      specs: [
        'Supercritical Nitrogen-Infused PEBA Cushioning',
        'Full-Length Forked Carbon Fiber Propulsion Plate',
        '212g Ultralight Weight (UK 8) · 8mm Heel-Toe Drop',
        'High-Abrasion Continental Wet-Grip Outsole',
      ],
      images: ['/src/assets/images/product_running_sneakers_1795014130758.jpg'],
      originalPrice: 14999,
      discountedPrice: 10999,
      discountPercent: 27,
      stock: 64,
      sku: 'SK-FTW-006',
      variants: [
        {
          id: 'var_sn_uk8',
          label: 'White / Cobalt · UK 8',
          colorHex: '#2563EB',
          priceDelta: 0,
          stock: 22,
          sku: 'SK-FTW-006-UK8',
        },
        {
          id: 'var_sn_uk9',
          label: 'White / Cobalt · UK 9',
          colorHex: '#2563EB',
          priceDelta: 0,
          stock: 24,
          sku: 'SK-FTW-006-UK9',
        },
        {
          id: 'var_sn_uk10',
          label: 'White / Cobalt · UK 10',
          colorHex: '#2563EB',
          priceDelta: 0,
          stock: 18,
          sku: 'SK-FTW-006-UK10',
        },
      ],
      tags: ['trending', 'deal', 'new_arrival'],
      rating: 4.6,
      reviewCount: 1,
      isActive: true,
      spatialModel: 'sneakers',
      createdAt: yesterday,
      updatedAt: now,
    },
    {
      id: 'prod_camera_ff',
      name: 'Lumix-C 33MP Full-Frame Mirrorless Kit',
      slug: 'lumix-c-33mp-full-frame-mirrorless-kit',
      brand: 'Optica Pro',
      categoryId: 'cat_cameras',
      categoryName: 'Cameras & Optics',
      description:
        'Compact weather-sealed full-frame mirrorless body bundled with a tack-sharp 35mm f/1.8 prime lens. Delivers 15-stop dynamic range, 4K 60p 10-bit 4:2:2 internal capture, and 7-stop 5-axis IBIS.',
      specs: [
        '33MP Back-Illuminated Full-Frame Exmor R CMOS',
        '35mm f/1.8 Prime Lens Included · 759-Pt AI Autofocus',
        '4K 60p 10-Bit 4:2:2 All-Intra · S-Log3 & S-Cinetone',
        'Magnesium Alloy Weather-Sealed Chassis · 5-Axis IBIS',
      ],
      images: ['/src/assets/images/product_mirrorless_camera_1795014130742.jpg'],
      originalPrice: 189990,
      discountedPrice: 164990,
      discountPercent: 13,
      stock: 9,
      sku: 'SK-CAM-007',
      variants: [
        {
          id: 'var_cam_kit',
          label: 'Body + 35mm f/1.8 Prime',
          colorHex: '#0F172A',
          priceDelta: 0,
          stock: 9,
          sku: 'SK-CAM-007-KIT',
        },
      ],
      tags: ['featured', 'new_arrival'],
      rating: 5.0,
      reviewCount: 0,
      isActive: true,
      spatialModel: 'camera',
      createdAt: yesterday,
      updatedAt: now,
    },
    {
      id: 'prod_desk_bundle',
      name: 'SHOPKART Creator Desk Bundle (Audio + Watch)',
      slug: 'shopkart-creator-desk-bundle',
      brand: 'SHOPKART Studio',
      categoryId: 'cat_audio',
      categoryName: 'Audio & Studio',
      description:
        'Curated flagship bundle pairing our Aether Studio ANC Wireless Headphones with the Chrono Ti-Ultra OLED Smartwatch at an exclusive studio bundle rate, complete with braided USB-C interconnect.',
      specs: [
        'Includes Aether Studio ANC Headphones (Obsidian)',
        'Includes Chrono Ti-Ultra OLED Smartwatch (47mm)',
        'Priority Express Insured Dispatch Across India',
        '2-Year Unified SHOPKART Care+ Protection Plan',
      ],
      images: [
        '/src/assets/images/hero_shopkart_flagship_1795014126869.jpg',
        '/src/assets/images/product_audio_headphones_1795014127358.jpg',
      ],
      originalPrice: 59998,
      discountedPrice: 42999,
      discountPercent: 28,
      stock: 14,
      sku: 'SK-BND-008',
      variants: [
        {
          id: 'var_bnd_std',
          label: 'Standard Flagship Bundle',
          colorHex: '#1E293B',
          priceDelta: 0,
          stock: 14,
          sku: 'SK-BND-008-STD',
        },
      ],
      tags: ['deal', 'trending', 'best_seller'],
      rating: 4.9,
      reviewCount: 0,
      isActive: true,
      spatialModel: 'headphones',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const categories: Category[] = [
    {
      id: 'cat_audio',
      name: 'Audio & Studio',
      slug: 'audio-studio',
      description: 'Reference ANC headphones, studio monitors, and acoustic bundles.',
      image: '/src/assets/images/product_audio_headphones_1795014127358.jpg',
      isActive: true,
    },
    {
      id: 'cat_wearables',
      name: 'Wearables',
      slug: 'wearables',
      description: 'Titanium smartwatches and precision biometric telemetry.',
      image: '/src/assets/images/product_smartwatch_pro_1795014128128.jpg',
      isActive: true,
    },
    {
      id: 'cat_computing',
      name: 'Laptops & Workstations',
      slug: 'laptops-workstations',
      description: 'CNC aluminum ultrabooks engineered for creators and developers.',
      image: '/src/assets/images/product_ultrabook_laptop_1795014128990.jpg',
      isActive: true,
    },
    {
      id: 'cat_furniture',
      name: 'Workspace & Furniture',
      slug: 'workspace-furniture',
      description: 'Ergonomic seating and architectural desk hardware.',
      image: '/src/assets/images/product_ergonomic_chair_1795014128630.jpg',
      isActive: true,
    },
    {
      id: 'cat_home',
      name: 'Home & Kitchen',
      slug: 'home-kitchen',
      description: 'Precision espresso brewers and modern countertop appliances.',
      image: '/src/assets/images/product_espresso_machine_1795014129631.jpg',
      isActive: true,
    },
    {
      id: 'cat_footwear',
      name: 'Footwear & Sport',
      slug: 'footwear-sport',
      description: 'Carbon-plated performance runners and training gear.',
      image: '/src/assets/images/product_running_sneakers_1795014130758.jpg',
      isActive: true,
    },
    {
      id: 'cat_cameras',
      name: 'Cameras & Optics',
      slug: 'cameras-optics',
      description: 'Full-frame mirrorless bodies and fast prime lenses.',
      image: '/src/assets/images/product_mirrorless_camera_1795014130742.jpg',
      isActive: true,
    },
  ];

  const razorpayAccounts: StoredRazorpayAccount[] = [
    {
      id: 'rzp_acc_1',
      label: 'Razorpay Account 1 — Primary Retail',
      keyId: razorpayKey1,
      encryptedKeySecret: encryptSecret(razorpaySec1),
      encryptedWebhookSecret: encryptSecret(razorpayWh1),
      mode: razorpayKey1.startsWith('rzp_live_') ? 'live' : 'test',
      isActive: true,
      connectionStatus: 'connected',
      lastTestedAt: now,
      lastTestMessage: 'HMAC signature engine & order API ready',
      settlementBankName: 'HDFC Bank Ltd. (Corporate Current)',
      settlementAccountMasked: '••••••••4821',
      settlementIfscMasked: 'HDFC000••••',
      settlementStatus: 'Verified via Razorpay Dashboard (T+2 Settlement)',
      createdAt: fiveDaysAgo,
      updatedAt: now,
    },
    {
      id: 'rzp_acc_2',
      label: 'Razorpay Account 2 — High-Value Electronics',
      keyId: 'rzp_test_demo_secondary02',
      encryptedKeySecret: encryptSecret('demo_secret_key_secondary_02'),
      encryptedWebhookSecret: encryptSecret('demo_webhook_secret_02'),
      mode: 'test',
      isActive: false,
      connectionStatus: 'untested',
      settlementBankName: 'ICICI Bank Ltd. (Escrow Settlement)',
      settlementAccountMasked: '••••••••9104',
      settlementIfscMasked: 'ICIC000••••',
      settlementStatus: 'Verified via Razorpay Dashboard (T+1 Settlement)',
      createdAt: fiveDaysAgo,
      updatedAt: fiveDaysAgo,
    },
    {
      id: 'rzp_acc_3',
      label: 'Razorpay Account 3 — Reserve Gateway',
      keyId: 'rzp_test_demo_reserve03',
      encryptedKeySecret: encryptSecret('demo_secret_key_reserve_03'),
      encryptedWebhookSecret: encryptSecret('demo_webhook_secret_03'),
      mode: 'test',
      isActive: false,
      connectionStatus: 'untested',
      settlementBankName: 'Axis Bank Ltd. (Merchant Pool)',
      settlementAccountMasked: '••••••••3376',
      settlementIfscMasked: 'UTIB000••••',
      settlementStatus: 'Pending KYC re-verification on provider portal',
      createdAt: fiveDaysAgo,
      updatedAt: fiveDaysAgo,
    },
  ];

  const upiAccounts: UpiAccount[] = [
    {
      id: 'upi_acc_1',
      label: 'Primary Merchant UPI (Axis)',
      upiId: upi1,
      payeeName: 'SHOPKART RETAIL PVT LTD',
      qrImageUrl: createUpiQrSvgDataUri(upi1, 'SHOPKART RETAIL PVT LTD'),
      instructions:
        'Scan QR with Google Pay, PhonePe, Paytm, or BHIM. Enter the exact payable amount and submit your 12-digit UTR reference below. Orders remain pending until verified by our finance desk.',
      isActive: true,
      isDefault: true,
      createdAt: fiveDaysAgo,
      updatedAt: now,
    },
    {
      id: 'upi_acc_2',
      label: 'Backup Merchant UPI (Yes Bank)',
      upiId: upi2,
      payeeName: 'SHOPKART COMMERCE',
      qrImageUrl: createUpiQrSvgDataUri(upi2, 'SHOPKART COMMERCE'),
      instructions:
        'Use this backup UPI handle during bank maintenance windows and attach your 12-digit UTR number.',
      isActive: true,
      isDefault: false,
      createdAt: threeDaysAgo,
      updatedAt: threeDaysAgo,
    },
  ];

  const codSettings: CodSettings = {
    enabled: true,
    minOrderAmount: 499,
    maxOrderAmount: 50000,
    codFee: 49,
    availabilityNote:
      'Cash on Delivery available across 19,000+ Indian pin codes for orders between ₹499 and ₹50,000.',
  };

  const paymentConfig: ActivePaymentConfig = {
    mode: 'multiple',
    activeRazorpayAccountId: 'rzp_acc_1',
    activeUpiAccountId: 'upi_acc_1',
    allowRazorpay: true,
    allowUpiQr: true,
    allowCod: true,
    updatedAt: now,
    updatedBy: 'admin@shopkart.in',
  };

  const sampleCustomerId = 'cust_arjun_01';
  const users: StoredUser[] = [
    {
      id: sampleCustomerId,
      name: 'Arjun Mehta',
      email: 'customer@shopkart.in',
      phone: '+91 98201 44510',
      role: 'customer',
      isVerified: true,
      isBlocked: false,
      wishlist: ['prod_headphones_anc', 'prod_smartwatch_ti'],
      passwordHash: customerPass,
      createdAt: fiveDaysAgo,
      updatedAt: now,
    },
    {
      id: 'cust_priya_02',
      name: 'Priya Nair',
      email: 'priya.nair@example.in',
      phone: '+91 98450 22190',
      role: 'customer',
      isVerified: true,
      isBlocked: false,
      wishlist: ['prod_espresso_pid'],
      passwordHash: customerPass,
      createdAt: threeDaysAgo,
      updatedAt: now,
    },
  ];

  const admins: StoredAdmin[] = [
    {
      id: 'admin_super_01',
      name: 'Vikramaditya Rao',
      email: process.env.DEFAULT_SUPER_ADMIN_EMAIL || 'admin@shopkart.in',
      role: 'super_admin',
      isActive: true,
      passwordHash: superAdminPass,
      createdAt: fiveDaysAgo,
    },
    {
      id: 'admin_ops_02',
      name: 'Ananya Deshmukh',
      email: 'ops@shopkart.in',
      role: 'admin',
      isActive: true,
      passwordHash: superAdminPass,
      createdAt: threeDaysAgo,
    },
  ];

  const addresses: Address[] = [
    {
      id: 'addr_01',
      userId: sampleCustomerId,
      fullName: 'Arjun Mehta',
      phone: '+91 98201 44510',
      line1: '402 Horizon Residency, Linking Road',
      line2: 'Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400050',
      country: 'India',
      isDefault: true,
      createdAt: fiveDaysAgo,
    },
  ];

  const orders: Order[] = [
    {
      id: 'ord_1001',
      orderNumber: 'SK-2026-1001',
      userId: sampleCustomerId,
      customerName: 'Arjun Mehta',
      customerEmail: 'customer@shopkart.in',
      customerPhone: '+91 98201 44510',
      items: [
        {
          productId: 'prod_headphones_anc',
          productName: 'Aether Studio ANC Wireless Headphones',
          image: '/src/assets/images/product_audio_headphones_1795014127358.jpg',
          variantLabel: 'Obsidian Matte',
          sku: 'SK-AUD-001-OBS',
          unitPrice: 18499,
          quantity: 1,
          lineTotal: 18499,
        },
      ],
      subtotal: 18499,
      discountAmount: 1850,
      couponCode: 'SHOP10',
      shippingCharge: 0,
      taxAmount: 2997,
      codFee: 0,
      totalAmount: 19646,
      shippingAddress: {
        fullName: 'Arjun Mehta',
        phone: '+91 98201 44510',
        email: 'customer@shopkart.in',
        line1: '402 Horizon Residency, Linking Road',
        line2: 'Bandra West',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
        country: 'India',
      },
      orderStatus: 'shipped',
      paymentStatus: 'paid',
      paymentMethod: 'razorpay_upi',
      paymentGatewayLabel: 'Razorpay UPI',
      paymentAccountId: 'rzp_acc_1',
      paymentAccountLabel: 'Razorpay Account 1 — Primary Retail',
      transactionId: 'pay_Rzp98421001A',
      razorpayOrderId: 'order_Rzp1001A',
      trackingNumber: 'BLUEDART-IN-8849201',
      carrierName: 'BlueDart Air Express',
      statusTimeline: [
        { status: 'pending', note: 'Order placed via Razorpay UPI', timestamp: threeDaysAgo },
        { status: 'confirmed', note: 'Payment signature verified by server', timestamp: threeDaysAgo },
        { status: 'processing', note: 'Packed at Mumbai Hub', timestamp: yesterday },
        { status: 'shipped', note: 'Dispatched via BlueDart (BLUEDART-IN-8849201)', timestamp: now },
      ],
      createdAt: threeDaysAgo,
      updatedAt: now,
    },
    {
      id: 'ord_1002',
      orderNumber: 'SK-2026-1002',
      userId: 'cust_priya_02',
      customerName: 'Priya Nair',
      customerEmail: 'priya.nair@example.in',
      customerPhone: '+91 98450 22190',
      items: [
        {
          productId: 'prod_espresso_pid',
          productName: 'Velocita Dual-Boiler PID Espresso Machine',
          image: '/src/assets/images/product_espresso_machine_1795014129631.jpg',
          variantLabel: 'Brushed Steel / Matte Black',
          sku: 'SK-HOM-005-STL',
          unitPrice: 54900,
          quantity: 1,
          lineTotal: 54900,
        },
      ],
      subtotal: 54900,
      discountAmount: 0,
      shippingCharge: 0,
      taxAmount: 9882,
      codFee: 0,
      totalAmount: 64782,
      shippingAddress: {
        fullName: 'Priya Nair',
        phone: '+91 98450 22190',
        email: 'priya.nair@example.in',
        line1: '18 Indiranagar 100ft Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560038',
        country: 'India',
      },
      orderStatus: 'pending',
      paymentStatus: 'pending_verification',
      paymentMethod: 'upi_qr',
      paymentGatewayLabel: 'UPI QR Manual Verification',
      paymentAccountId: 'upi_acc_1',
      paymentAccountLabel: 'Primary Merchant UPI (Axis)',
      upiReferenceNumber: '432219884012',
      transactionId: 'UTR-432219884012',
      statusTimeline: [
        {
          status: 'pending',
          note: 'UPI QR UTR 432219884012 submitted — awaiting admin verification',
          timestamp: yesterday,
        },
      ],
      createdAt: yesterday,
      updatedAt: yesterday,
    },
    {
      id: 'ord_1003',
      orderNumber: 'SK-2026-1003',
      userId: sampleCustomerId,
      customerName: 'Arjun Mehta',
      customerEmail: 'customer@shopkart.in',
      customerPhone: '+91 98201 44510',
      items: [
        {
          productId: 'prod_sneakers_run',
          productName: 'Kinetix AeroKnit Carbon Runners',
          image: '/src/assets/images/product_running_sneakers_1795014130758.jpg',
          variantLabel: 'White / Cobalt · UK 9',
          sku: 'SK-FTW-006-UK9',
          unitPrice: 10999,
          quantity: 1,
          lineTotal: 10999,
        },
      ],
      subtotal: 10999,
      discountAmount: 0,
      shippingCharge: 0,
      taxAmount: 1980,
      codFee: 0,
      totalAmount: 12979,
      shippingAddress: {
        fullName: 'Arjun Mehta',
        phone: '+91 98201 44510',
        email: 'customer@shopkart.in',
        line1: '402 Horizon Residency, Linking Road',
        line2: 'Bandra West',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
        country: 'India',
      },
      orderStatus: 'delivered',
      paymentStatus: 'paid',
      paymentMethod: 'razorpay_card',
      paymentGatewayLabel: 'Razorpay Card',
      paymentAccountId: 'rzp_acc_1',
      paymentAccountLabel: 'Razorpay Account 1 — Primary Retail',
      transactionId: 'pay_Rzp98420994C',
      razorpayOrderId: 'order_Rzp0994C',
      trackingNumber: 'DELHIVERY-IN-441092',
      carrierName: 'Delhivery Surface',
      statusTimeline: [
        { status: 'pending', note: 'Order placed via Razorpay Card', timestamp: fiveDaysAgo },
        { status: 'confirmed', note: 'Payment verified', timestamp: fiveDaysAgo },
        { status: 'shipped', note: 'Dispatched via Delhivery', timestamp: threeDaysAgo },
        { status: 'delivered', note: 'Delivered and signed by recipient', timestamp: yesterday },
      ],
      createdAt: fiveDaysAgo,
      updatedAt: yesterday,
    },
  ];

  const payments: PaymentTransaction[] = [
    {
      id: 'pay_txn_1001',
      orderId: 'ord_1001',
      orderNumber: 'SK-2026-1001',
      userId: sampleCustomerId,
      customerName: 'Arjun Mehta',
      customerEmail: 'customer@shopkart.in',
      amount: 19646,
      refundAmount: 0,
      currency: 'INR',
      method: 'razorpay_upi',
      gateway: 'razorpay',
      paymentAccountId: 'rzp_acc_1',
      paymentAccountLabel: 'Razorpay Account 1 — Primary Retail',
      razorpayOrderId: 'order_Rzp1001A',
      razorpayPaymentId: 'pay_Rzp98421001A',
      status: 'paid',
      receiptNumber: 'RCPT-SK-1001',
      idempotencyKey: 'idem_seed_1001',
      createdAt: threeDaysAgo,
      updatedAt: threeDaysAgo,
    },
    {
      id: 'pay_txn_1002',
      orderId: 'ord_1002',
      orderNumber: 'SK-2026-1002',
      userId: 'cust_priya_02',
      customerName: 'Priya Nair',
      customerEmail: 'priya.nair@example.in',
      amount: 64782,
      refundAmount: 0,
      currency: 'INR',
      method: 'upi_qr',
      gateway: 'upi_qr',
      paymentAccountId: 'upi_acc_1',
      paymentAccountLabel: 'Primary Merchant UPI (Axis)',
      upiReferenceNumber: '432219884012',
      upiIdUsed: upi1,
      status: 'pending_verification',
      receiptNumber: 'RCPT-SK-1002',
      idempotencyKey: 'idem_seed_1002',
      createdAt: yesterday,
      updatedAt: yesterday,
    },
    {
      id: 'pay_txn_1003',
      orderId: 'ord_1003',
      orderNumber: 'SK-2026-1003',
      userId: sampleCustomerId,
      customerName: 'Arjun Mehta',
      customerEmail: 'customer@shopkart.in',
      amount: 12979,
      refundAmount: 0,
      currency: 'INR',
      method: 'razorpay_card',
      gateway: 'razorpay',
      paymentAccountId: 'rzp_acc_1',
      paymentAccountLabel: 'Razorpay Account 1 — Primary Retail',
      razorpayOrderId: 'order_Rzp0994C',
      razorpayPaymentId: 'pay_Rzp98420994C',
      status: 'paid',
      receiptNumber: 'RCPT-SK-1003',
      idempotencyKey: 'idem_seed_1003',
      createdAt: fiveDaysAgo,
      updatedAt: fiveDaysAgo,
    },
  ];

  const coupons: Coupon[] = [
    {
      id: 'coup_1',
      code: 'SHOP10',
      type: 'percentage',
      value: 10,
      minOrderValue: 2000,
      maxDiscount: 5000,
      expiryDate: '2027-12-31',
      isActive: true,
      usageCount: 14,
      createdAt: fiveDaysAgo,
    },
    {
      id: 'coup_2',
      code: 'WELCOME500',
      type: 'fixed',
      value: 500,
      minOrderValue: 2999,
      expiryDate: '2027-12-31',
      isActive: true,
      usageCount: 9,
      createdAt: fiveDaysAgo,
    },
  ];

  const reviews: Review[] = [
    {
      id: 'rev_1',
      productId: 'prod_headphones_anc',
      productName: 'Aether Studio ANC Wireless Headphones',
      userId: sampleCustomerId,
      userName: 'Arjun Mehta',
      rating: 5,
      title: 'Studio-grade clarity and zero cabin fatigue',
      comment:
        'Tested on a 6-hour flight from Mumbai to Singapore. The aluminum hinge tension feels rock solid and the ANC completely silences engine drone.',
      verifiedPurchase: true,
      isApproved: true,
      createdAt: yesterday,
    },
    {
      id: 'rev_2',
      productId: 'prod_headphones_anc',
      productName: 'Aether Studio ANC Wireless Headphones',
      userId: 'cust_priya_02',
      userName: 'Priya Nair',
      rating: 5,
      title: 'Seamless multipoint switching',
      comment:
        'Switches effortlessly between my workstation laptop and phone calls. Battery easily lasts a full work week.',
      verifiedPurchase: true,
      isApproved: true,
      createdAt: yesterday,
    },
    {
      id: 'rev_3',
      productId: 'prod_smartwatch_ti',
      productName: 'Chrono Ti-Ultra OLED Smartwatch',
      userId: sampleCustomerId,
      userName: 'Arjun Mehta',
      rating: 5,
      title: 'Visible even under midday glare',
      comment:
        'Dual-band GPS locks in seconds and the titanium bezel still looks spotless after trail runs.',
      verifiedPurchase: true,
      isApproved: true,
      createdAt: threeDaysAgo,
    },
    {
      id: 'rev_4',
      productId: 'prod_ultrabook_14',
      productName: 'ZenithBook Pro 14 CNC Ultrabook',
      userId: 'cust_priya_02',
      userName: 'Priya Nair',
      rating: 5,
      title: 'Silent thermals under heavy builds',
      comment:
        'Compiles massive TypeScript projects without spinning up audible fans. The 120Hz Mini-LED panel is crisp.',
      verifiedPurchase: true,
      isApproved: true,
      createdAt: threeDaysAgo,
    },
  ];

  const banners: Banner[] = [
    {
      id: 'ban_hero_1',
      title: 'Flagship engineering for work, sound, and motion.',
      subtitle:
        'Explore precision-milled electronics, studio gear, and modern workspace hardware with insured pan-India dispatch, instant Razorpay UPI checkout, and interactive 3D XR inspection.',
      ctaLabel: 'Shop Flagship Collection',
      ctaTarget: 'shop',
      image: '/src/assets/images/hero_shopkart_flagship_1795014126869.jpg',
      placement: 'hero',
      isActive: true,
    },
    {
      id: 'ban_promo_1',
      title: 'Flat 10% Off First Order with Code SHOP10',
      subtitle:
        'Applicable on orders above ₹2,000 · Instant Razorpay UPI, Cards & NetBanking supported.',
      ctaLabel: 'Browse Offers',
      ctaTarget: 'deals',
      image: '/src/assets/images/product_audio_headphones_1795014127358.jpg',
      placement: 'promo',
      isActive: true,
    },
  ];

  const settings: WebsiteSettings = {
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

  const auditLogs: AuditLog[] = [
    {
      id: 'aud_1',
      actorId: 'admin_super_01',
      actorEmail: 'admin@shopkart.in',
      actorRole: 'super_admin',
      action: 'PAYMENT_CONFIG_INIT',
      resourceType: 'payment_config',
      resourceId: 'active_config',
      summary:
        'Initialized payment engine with Razorpay Account 1, Primary Merchant UPI QR, and COD.',
      createdAt: fiveDaysAgo,
    },
  ];

  return {
    users,
    admins,
    categories,
    products,
    orders,
    payments,
    razorpayAccounts,
    upiAccounts,
    codSettings,
    paymentConfig,
    previousPaymentConfig: null,
    carts: {},
    coupons,
    reviews,
    addresses,
    settings,
    banners,
    returns: [],
    auditLogs,
    inquiries: [],
    newsletterEmails: [],
  };
}

let cachedDb: ShopkartDatabase | null = null;

export function getDb(): ShopkartDatabase {
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    cachedDb = createSeedDatabase();
    saveDb(cachedDb);
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    cachedDb = JSON.parse(raw) as ShopkartDatabase;
    return cachedDb;
  } catch {
    cachedDb = createSeedDatabase();
    saveDb(cachedDb);
    return cachedDb;
  }
}

export function saveDb(db: ShopkartDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
  cachedDb = db;
}

export function addAuditLog(
  db: ShopkartDatabase,
  entry: Omit<AuditLog, 'id' | 'createdAt'>
): void {
  db.auditLogs.unshift({
    ...entry,
    id: `aud_${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  });
  if (db.auditLogs.length > 500) {
    db.auditLogs = db.auditLogs.slice(0, 500);
  }
}
