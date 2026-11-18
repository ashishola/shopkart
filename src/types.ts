export type UserRole = 'customer';
export type AdminRole = 'super_admin' | 'admin' | 'manager';

export interface Address {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  isVerified: boolean;
  isBlocked: boolean;
  wishlist: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
  productCount?: number;
}

export interface ProductVariant {
  id: string;
  label: string;
  colorHex?: string;
  priceDelta: number;
  stock: number;
  sku: string;
}

export type SpatialModelType =
  | 'headphones'
  | 'smartwatch'
  | 'laptop'
  | 'chair'
  | 'espresso'
  | 'sneakers'
  | 'camera';

export interface Product {
  id: string;
  name: string;
  slug: string;
  brand: string;
  categoryId: string;
  categoryName: string;
  description: string;
  specs: string[];
  images: string[];
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  stock: number;
  sku: string;
  variants: ProductVariant[];
  tags: ('trending' | 'best_seller' | 'new_arrival' | 'featured' | 'deal')[];
  rating: number;
  reviewCount: number;
  isActive: boolean;
  spatialModel: SpatialModelType;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  productId: string;
  productName: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  comment: string;
  verifiedPurchase: boolean;
  isApproved: boolean;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderValue: number;
  maxDiscount?: number;
  expiryDate: string;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
}

export interface RazorpayAccountPublic {
  id: string;
  label: string;
  keyId: string;
  hasSecret: boolean;
  maskedSecret: string;
  hasWebhookSecret: boolean;
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

export interface UpiAccount {
  id: string;
  label: string;
  upiId: string;
  payeeName: string;
  qrImageUrl: string;
  instructions: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CodSettings {
  enabled: boolean;
  minOrderAmount: number;
  maxOrderAmount: number;
  codFee: number;
  availabilityNote: string;
}

export type ActivePaymentMode =
  | 'razorpay'
  | 'upi_qr'
  | 'cod'
  | 'multiple';

export interface ActivePaymentConfig {
  mode: ActivePaymentMode;
  activeRazorpayAccountId: string | null;
  activeUpiAccountId: string | null;
  allowRazorpay: boolean;
  allowUpiQr: boolean;
  allowCod: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface PaymentConfigSnapshot {
  config: ActivePaymentConfig;
  previousConfig?: ActivePaymentConfig | null;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus =
  | 'pending'
  | 'pending_verification'
  | 'paid'
  | 'failed'
  | 'refunded';

export type PaymentMethodType =
  | 'razorpay_upi'
  | 'razorpay_card'
  | 'razorpay_netbanking'
  | 'razorpay_wallet'
  | 'upi_qr'
  | 'cod';

export interface OrderItem {
  productId: string;
  productName: string;
  image: string;
  variantLabel: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderShippingAddress {
  fullName: string;
  phone: string;
  email: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  couponCode?: string;
  shippingCharge: number;
  taxAmount: number;
  codFee: number;
  totalAmount: number;
  shippingAddress: OrderShippingAddress;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodType;
  paymentGatewayLabel: string;
  paymentAccountId?: string;
  paymentAccountLabel?: string;
  transactionId?: string;
  razorpayOrderId?: string;
  upiReferenceNumber?: string;
  trackingNumber?: string;
  carrierName?: string;
  statusTimeline: {
    status: string;
    note: string;
    timestamp: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  refundAmount: number;
  currency: string;
  method: PaymentMethodType;
  gateway: 'razorpay' | 'upi_qr' | 'cod';
  paymentAccountId?: string;
  paymentAccountLabel: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  upiReferenceNumber?: string;
  upiIdUsed?: string;
  status: PaymentStatus;
  failureReason?: string;
  verifiedByAdminId?: string;
  verifiedAt?: string;
  receiptNumber: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  reason: string;
  status: 'requested' | 'approved' | 'rejected' | 'refunded';
  refundAmount: number;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaTarget: string;
  image: string;
  placement: 'hero' | 'promo';
  isActive: boolean;
}

export interface WebsiteSettings {
  storeName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  gstRatePercent: number;
  freeShippingThreshold: number;
  standardShippingFee: number;
  currencySymbol: string;
  maintenanceMode: boolean;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface CheckoutPaymentOptionsResponse {
  activeMode: ActivePaymentMode;
  razorpay: {
    enabled: boolean;
    accountId: string;
    accountLabel: string;
    keyId: string;
    mode: 'test' | 'live';
    isDemoKey: boolean;
  } | null;
  upiQr: {
    enabled: boolean;
    accountId: string;
    label: string;
    upiId: string;
    payeeName: string;
    qrImageUrl: string;
    instructions: string;
  } | null;
  cod: CodSettings;
}
