export type Locale = 'ar' | 'fr'

export const LOCALE_DIR: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  fr: 'ltr',
}

export interface OrderStatusLabels {
  confirmed: string
  packed: string
  handed_to_courier: string
  delivered: string
  paid: string
  cancelled: string
}

export interface TranslationDictionary {
  appName: string
  appTagline: string
  searchPlaceholder: string
  categoriesAll: string
  stores: string
  products: string
  noProductsFound: string
  trackOrder: string
  home: string
  navLogin: string
  navPricing: string
  navPrivacy: string
  navContact: string
  pricingTitle: string
  pricingTrialBadge: string
  pricingPrice: string
  pricingPricePeriod: string
  pricingFeature1: string
  pricingFeature2: string
  pricingFeature3: string
  pricingFeature4: string
  pricingCta: string
  footerPrivacy: string
  footerContact: string
  footerRights: string
  privacyTitle: string
  privacyBody: string
  contactTitle: string
  contactBody: string
  contactEmailLabel: string
  backToShopping: string
  cart: string
  cartEmpty: string
  subtotal: string
  checkout: string
  delivery: string
  total: string
  fullName: string
  phone: string
  wilaya: string
  commune: string
  address: string
  notesOptional: string
  selectWilaya: string
  confirmOrder: string
  sending: string
  deliveryFeeNote: string
  orderConfirmed: string
  codPayment: string
  trackingCode: string
  backToStore: string
  backToCart: string
  addToCart: string
  outOfStock: string
  inStock: string
  gridView: string
  listView: string
  dimensionsAndDetails: string
  specifications: string
  youMayAlsoLike: string
  tapToZoom: string
  tapToShrink: string
  addWithPrice: string
  noPhoto: string
  trackingCodeLabel: string
  phoneUsedAtOrder: string
  search: string
  searching: string
  noOrderFound: string
  orderStatus: OrderStatusLabels
  langSwitch: string
  merchant: MerchantDictionary
  admin: AdminDictionary
  share: ShareDictionary
}

export interface ShareDictionary {
  moreOptions: string
  email: string
  copyLink: string
  linkCopied: string
  shareProduct: string
  shareApp: string
  defaultShareText: string
  openInTelegram: string
  getTelegram: string
  landingIntro: string
}

export interface MerchantDictionary {
  // Dashboard nav
  products: string
  orders: string
  inventory: string
  subscription: string
  settings: string
  viewMyStore: string
  logout: string
  notPublishedWarning: string
  // Onboarding
  onboardingTitle: string
  onboardingSubtitle: string
  storeName: string
  storeNamePlaceholder: string
  descriptionOptional: string
  creating: string
  createMyStore: string
  // Store settings
  storeSettingsTitle: string
  profile: string
  logo: string
  banner: string
  chooseImage: string
  uploading: string
  name: string
  description: string
  layoutVariant: string
  layoutGeneral: string
  layoutFashion: string
  layoutGrocery: string
  layoutElectronics: string
  layoutFurniture: string
  storePublished: string
  save: string
  saving: string
  deliveryZones: string
  deliveryZonesSubtitle: string
  saveDeliveryFees: string
  saved: string
  createFirstStore: string
  // Products
  productsTitle: string
  addProduct: string
  importExcel: string
  noProductsYet: string
  published: string
  draft: string
  edit: string
  delete: string
  photos: string
  copyProductLink: string
  copyAppLink: string
  linkCopied: string
  shareApp: string
  // Orders
  ordersTitle: string
  searchOrderPlaceholder: string
  allStatuses: string
  noOrders: string
  exportExcel: string
  exporting: string
  orderTracking: string
  buyer: string
  items: string
  markAs: string
  cancelOrder: string
  cancelReason: string
  confirmCancellation: string
  cancel: string
  // Inventory
  inventoryTitle: string
  lowStockOnly: string
  lowStockAlert: string
  adjust: string
  noItems: string
  // Billing
  billingTitle: string
  subscriptionStatus: string
  activeUntil: string
  daysRemaining: string
  expiredWarning: string
  monthlyPrice: string
  payViaBaridiMob: string
  payInstructions: string
  accountHolder: string
  copy: string
  copied: string
  submitReceipt: string
  receiptFile: string
  transactionReference: string
  amount: string
  submit: string
  submitting: string
  submitted: string
  history: string
  noSubmissions: string
  proofPending: string
  proofApproved: string
  proofRejected: string
  // Product form (new/edit)
  sku: string
  price: string
  category: string
  none: string
  continueToPhotos: string
  finish: string
  choosePhotos: string
  takePhoto: string
  variants: string
  variantLabel: string
  priceAdjustment: string
  initialStock: string
  noVariants: string
  addVariant: string
  stock: string
  loading: string
  // Order detail
  orderTrackingTitle: string
  markAsStep: string
  back: string
  subTotalLabel: string
  deliveryLabel: string
  totalLabel: string
  notePrefix: string
  newProductTitle: string
  details: string
  editProductTitle: string
  baridiMobStep1: string
  baridiMobStep2: string
  baridiMobStep3: string
  baridiMobStep4: string
  selectFileError: string
  fillReferenceAndAmount: string
  submitFailed: string
}

export interface AdminDictionary {
  dashboard: string
  merchants: string
  ordersLabel: string
  billing: string
  categories: string
  settingsLabel: string
  logout: string
  // Dashboard stats
  activeMerchants: string
  pendingMerchants: string
  publishedStores: string
  productsCount: string
  ordersLast30: string
  revenueLast30: string
  pendingProofs: string
  // Merchants page
  allMerchants: string
  approve: string
  suspend: string
  viewStore: string
  noMerchants: string
  // Orders page
  allOrders: string
  // Billing queue
  queueTitle: string
  viewReceipt: string
  reject: string
  rejectReason: string
  confirmReject: string
  noPendingProofs: string
  // Categories
  categoriesTitle: string
  addCategory: string
  nameFrench: string
  nameArabic: string
  bothNamesRequired: string
  add: string
  moveUp: string
  moveDown: string
  confirmDeleteCategory: string
  noCategories: string
  // Settings
  settingsTitle: string
  subscriptionSettings: string
  monthlyPriceDzd: string
  freeTrialDays: string
  adminDashboardTitle: string
  saveLabel: string
  cancelLabel: string
}

/**
 * Buyer-facing translation dictionary — marketplace home, storefront (all
 * layout variants), cart, checkout, order lookup. Arabic is the default
 * per spec ("Arabic-first UI"); French is the toggle alternative.
 *
 * Merchant dashboard and admin panel remain French-only for now — flagged
 * honestly rather than silently left half-translated. See translation
 * coverage note in the language switcher component.
 */
export const translations: Record<Locale, TranslationDictionary> = {
  ar: {
    appName: 'AlgerBot',
    appTagline: 'سوق التجار الجزائريين',
    searchPlaceholder: 'ابحث عن منتج...',
    categoriesAll: 'الكل',
    stores: 'المتاجر',
    products: 'المنتجات',
    noProductsFound: 'لم يتم العثور على أي منتج.',
    trackOrder: 'تتبع طلبيتي',
    home: 'الرئيسية',
    navLogin: 'دخول التجار',
    navPricing: 'الأسعار',
    navPrivacy: 'الخصوصية',
    navContact: 'اتصل بنا',
    pricingTitle: 'اشترك في AlgerBot',
    pricingTrialBadge: '🎉 15 يوم مجانًا',
    pricingPrice: '2,500 دج',
    pricingPricePeriod: 'شهريًا بعد الفترة التجريبية',
    pricingFeature1: '✅ منتجات غير محدودة',
    pricingFeature2: '🚀 متجر عبر بوت تيليجرام',
    pricingFeature3: '📦 تتبع الطلبات ولوحة تحكم كاملة',
    pricingFeature4: '🎁 بدون التزام، ألغِ في أي وقت',
    pricingCta: 'ابدأ الآن مجانًا',
    footerPrivacy: 'سياسة الخصوصية',
    footerContact: 'اتصل بنا',
    footerRights: 'جميع الحقوق محفوظة',
    privacyTitle: 'سياسة الخصوصية',
    privacyBody: 'نحن في AlgerBot نلتزم بحماية خصوصيتك. نقوم بجمع فقط المعلومات الضرورية لتشغيل متجرك، مثل بيانات المنتجات والطلبات ومعلومات حسابك على تيليجرام. لا نقوم ببيع بياناتك لأي طرف ثالث. لأي استفسار حول بياناتك، يمكنكم التواصل معنا عبر البريد الإلكتروني.',
    contactTitle: 'اتصل بنا',
    contactBody: 'لأي سؤال أو مساعدة، لا تترددوا في مراسلتنا عبر البريد الإلكتروني وسنرد عليكم في أقرب وقت ممكن.',
    contactEmailLabel: 'البريد الإلكتروني',
    backToShopping: 'متابعة التسوق',
    cart: 'السلة',
    cartEmpty: 'سلتك فارغة.',
    subtotal: 'المجموع الفرعي',
    checkout: 'إتمام الطلب',
    delivery: 'التوصيل',
    total: 'المجموع',
    fullName: 'الاسم الكامل',
    phone: 'رقم الهاتف',
    wilaya: 'الولاية',
    commune: 'البلدية',
    address: 'العنوان',
    notesOptional: 'ملاحظات (اختياري)',
    selectWilaya: '— اختر —',
    confirmOrder: 'تأكيد الطلب (الدفع عند الاستلام)',
    sending: 'جارٍ الإرسال...',
    deliveryFeeNote: 'سيتم احتساب رسوم التوصيل عند التأكيد',
    orderConfirmed: 'تم تأكيد الطلب',
    codPayment: 'الدفع عند الاستلام. احتفظ برمز التتبع الخاص بك.',
    trackingCode: 'رمز التتبع',
    backToStore: 'العودة إلى المتجر',
    backToCart: 'العودة إلى السلة',
    addToCart: 'أضف إلى السلة',
    outOfStock: 'غير متوفر',
    inStock: 'متوفر',
    gridView: 'شبكة',
    listView: 'قائمة',
    dimensionsAndDetails: 'الأبعاد والتفاصيل',
    specifications: 'المواصفات',
    youMayAlsoLike: 'قد يعجبك أيضًا',
    tapToZoom: 'اضغط للتكبير',
    tapToShrink: 'اضغط للتصغير',
    addWithPrice: 'أضف —',
    noPhoto: 'لا توجد صورة',
    trackingCodeLabel: 'رمز التتبع',
    phoneUsedAtOrder: 'رقم الهاتف المستخدم عند الطلب',
    search: 'بحث',
    searching: 'جارٍ البحث...',
    noOrderFound: 'لم يتم العثور على أي طلب بهذه المعلومات.',
    orderStatus: {
      confirmed: 'تم التأكيد',
      packed: 'تم التجهيز',
      handed_to_courier: 'تم التسليم للموصل',
      delivered: 'تم التوصيل',
      paid: 'تم الدفع',
      cancelled: 'ملغاة',
    },
    langSwitch: 'FR',
    merchant: {
      products: 'المنتجات',
      orders: 'الطلبات',
      inventory: 'المخزون',
      subscription: 'الاشتراك',
      settings: 'الإعدادات',
      viewMyStore: 'مشاهدة متجري',
      logout: 'تسجيل الخروج',
      notPublishedWarning:
        'متجرك غير منشور بعد — لا يمكن للمشترين رؤيته. الزر أعلاه يعرض لك معاينة.',
      onboardingTitle: 'أنشئ متجرك',
      onboardingSubtitle: 'أعط اسمًا لمتجرك لتبدأ البيع على AlgerBot.',
      storeName: 'اسم المتجر',
      storeNamePlaceholder: 'مثال: مجوهرات الجزائر',
      descriptionOptional: 'الوصف (اختياري)',
      creating: 'جارٍ الإنشاء...',
      createMyStore: 'إنشاء متجري',
      storeSettingsTitle: 'إعدادات المتجر',
      profile: 'الملف الشخصي',
      logo: 'الشعار',
      banner: 'صورة الغلاف',
      chooseImage: 'اختر صورة',
      uploading: 'جارٍ الرفع...',
      name: 'الاسم',
      description: 'الوصف',
      layoutVariant: 'نوع المتجر (التصميم)',
      layoutGeneral: 'عام — شبكة قياسية',
      layoutFashion: 'أزياء — شبكة صور، متغيرات ظاهرة',
      layoutGrocery: 'بقالة — أيقونات فئات، قائمة مضغوطة',
      layoutElectronics: 'إلكترونيات — مواصفات، فلاتر',
      layoutFurniture: 'أثاث — صور كبيرة، أبعاد',
      storePublished: 'المتجر منشور (مرئي للمشترين)',
      save: 'حفظ',
      saving: 'جارٍ الحفظ...',
      deliveryZones: 'رسوم التوصيل حسب الولاية',
      deliveryZonesSubtitle: 'حدد الولايات التي توصل إليها وأدخل السعر (دج).',
      saveDeliveryFees: 'حفظ رسوم التوصيل',
      saved: 'تم الحفظ.',
      createFirstStore: 'أنشئ متجرك أولاً.',
      productsTitle: 'المنتجات',
      addProduct: '+ إضافة منتج',
      importExcel: 'استيراد Excel',
      noProductsYet: 'لا توجد منتجات حتى الآن. أضف منتجك الأول.',
      published: 'منشور',
      draft: 'مسودة',
      edit: 'تعديل',
      delete: 'حذف',
      photos: 'الصور',
      copyProductLink: 'نسخ رابط المنتج',
      copyAppLink: 'نسخ رابط التطبيق',
      linkCopied: 'تم نسخ الرابط!',
      shareApp: 'مشاركة التطبيق',
      ordersTitle: 'الطلبات',
      searchOrderPlaceholder: 'البحث برمز التتبع أو الهاتف...',
      allStatuses: 'الكل',
      noOrders: 'لا توجد طلبات.',
      exportExcel: 'تصدير إلى Excel',
      exporting: 'جارٍ التصدير...',
      orderTracking: 'تتبع الطلب',
      buyer: 'المشتري',
      items: 'المنتجات',
      markAs: 'تحديد كـ',
      cancelOrder: 'إلغاء الطلب',
      cancelReason: 'سبب الإلغاء',
      confirmCancellation: 'تأكيد الإلغاء',
      cancel: 'إلغاء',
      inventoryTitle: 'المخزون',
      lowStockOnly: 'عرض المخزون المنخفض فقط',
      lowStockAlert: 'منتج (منتجات) بمخزون منخفض',
      adjust: 'تعديل',
      noItems: 'لا توجد عناصر.',
      billingTitle: 'الاشتراك',
      subscriptionStatus: 'الحالة',
      activeUntil: 'نشط حتى',
      daysRemaining: 'يوم متبقٍ',
      expiredWarning:
        'انتهى اشتراكك. لم يعد متجرك مرئيًا في السوق حتى يتم تأكيد الدفع.',
      monthlyPrice: 'التعرفة الشهرية',
      payViaBaridiMob: 'الدفع عبر BaridiMob',
      payInstructions: 'قم بتحويل عبر BaridiMob إلى الحساب أدناه، ثم أرسل الإيصال.',
      accountHolder: 'صاحب الحساب',
      copy: 'نسخ',
      copied: 'تم النسخ!',
      submitReceipt: 'إرسال الإيصال',
      receiptFile: 'الإيصال (صورة أو PDF)',
      transactionReference: 'مرجع المعاملة',
      amount: 'المبلغ (دج)',
      submit: 'إرسال',
      submitting: 'جارٍ الإرسال...',
      submitted: 'تم إرسال الإيصال، في انتظار المراجعة.',
      history: 'السجل',
      noSubmissions: 'لا توجد طلبات.',
      proofPending: 'قيد الانتظار',
      proofApproved: 'موافق عليه',
      proofRejected: 'مرفوض',
      sku: 'SKU',
      price: 'السعر',
      category: 'الفئة',
      none: '— لا شيء —',
      continueToPhotos: 'المتابعة إلى الصور',
      finish: 'إنهاء',
      choosePhotos: 'اختيار صور',
      takePhoto: 'التقاط صورة',
      variants: 'المتغيرات',
      variantLabel: 'اسم المتغير',
      priceAdjustment: 'تعديل السعر',
      initialStock: 'المخزون الأولي',
      noVariants: 'لا توجد متغيرات.',
      addVariant: 'إضافة',
      stock: 'المخزون',
      loading: 'جارٍ التحميل...',
      orderTrackingTitle: 'تتبع الطلب',
      markAsStep: 'تحديد كـ',
      back: 'رجوع',
      subTotalLabel: 'المجموع الفرعي',
      deliveryLabel: 'التوصيل',
      totalLabel: 'المجموع',
      notePrefix: 'سبب الإلغاء',
      newProductTitle: 'إضافة منتج',
      details: 'التفاصيل',
      editProductTitle: 'تعديل',
      baridiMobStep1: 'افتح تطبيق BaridiMob',
      baridiMobStep2: 'قم بتحويل إلى RIB أعلاه بمبلغ التعرفة الشهرية',
      baridiMobStep3: 'التقط لقطة شاشة أو نزّل إيصال PDF',
      baridiMobStep4: 'أرسله أدناه مع مرجع المعاملة',
      selectFileError: 'يرجى اختيار ملف',
      fillReferenceAndAmount: 'يرجى ملء المرجع والمبلغ',
      submitFailed: 'فشل الإرسال',
    },
    admin: {
      dashboard: 'لوحة التحكم',
      merchants: 'التجار',
      ordersLabel: 'الطلبات',
      billing: 'الفوترة',
      categories: 'الفئات',
      settingsLabel: 'الإعدادات',
      logout: 'تسجيل الخروج',
      activeMerchants: 'تجار نشطون',
      pendingMerchants: 'تجار في الانتظار',
      publishedStores: 'متاجر منشورة',
      productsCount: 'المنتجات',
      ordersLast30: 'الطلبات (30 يومًا)',
      revenueLast30: 'الإيرادات (30 يومًا)',
      pendingProofs: 'إيصالات دفع قيد الانتظار',
      allMerchants: 'الكل',
      approve: 'موافقة',
      suspend: 'تعليق',
      viewStore: 'مشاهدة المتجر',
      noMerchants: 'لا يوجد تجار.',
      allOrders: 'جميع الطلبات',
      queueTitle: 'قائمة انتظار الفوترة',
      viewReceipt: 'مشاهدة الإيصال',
      reject: 'رفض',
      rejectReason: 'سبب الرفض',
      confirmReject: 'تأكيد الرفض',
      noPendingProofs: 'لا توجد إيصالات في الانتظار.',
      categoriesTitle: 'الفئات',
      addCategory: 'إضافة فئة',
      nameFrench: 'الاسم (فرنسي)',
      nameArabic: 'الاسم (عربي)',
      bothNamesRequired: 'كلا الاسمين مطلوبان',
      add: 'إضافة',
      moveUp: 'أعلى',
      moveDown: 'أسفل',
      confirmDeleteCategory: 'حذف هذه الفئة؟',
      noCategories: 'لا توجد فئات.',
      settingsTitle: 'الإعدادات',
      subscriptionSettings: 'الاشتراك',
      monthlyPriceDzd: 'التعرفة الشهرية (دج)',
      freeTrialDays: 'الفترة التجريبية (أيام)',
      adminDashboardTitle: 'لوحة تحكم المسؤول',
      saveLabel: 'حفظ',
      cancelLabel: 'إلغاء',
    },
    share: {
      moreOptions: 'المزيد من الخيارات',
      email: 'بريد إلكتروني',
      copyLink: 'نسخ الرابط',
      linkCopied: 'تم نسخ الرابط!',
      shareProduct: 'مشاركة المنتج',
      shareApp: 'مشاركة التطبيق',
      defaultShareText: 'ألق نظرة على هذا!',
      openInTelegram: 'فتح في Telegram',
      getTelegram: 'تحميل Telegram',
      landingIntro: 'يفتح هذا الرابط داخل تطبيق Telegram المصغّر AlgerBot.',
    },
  },
  fr: {
    appName: 'AlgerBot',
    appTagline: 'La marketplace des commerçants algériens',
    searchPlaceholder: 'Rechercher un produit...',
    categoriesAll: 'Tout',
    stores: 'Boutiques',
    products: 'Produits',
    noProductsFound: 'Aucun produit trouvé.',
    trackOrder: 'Suivre une commande',
    home: 'Accueil',
    navLogin: 'Connexion marchands',
    navPricing: 'Tarifs',
    navPrivacy: 'Confidentialité',
    navContact: 'Contact',
    pricingTitle: "S'abonner à AlgerBot",
    pricingTrialBadge: '🎉 15 jours gratuits',
    pricingPrice: '2 500 DZD',
    pricingPricePeriod: "par mois après la période d'essai",
    pricingFeature1: '✅ Produits illimités',
    pricingFeature2: '🚀 Boutique via bot Telegram',
    pricingFeature3: '📦 Suivi des commandes et tableau de bord complet',
    pricingFeature4: '🎁 Sans engagement, annulez à tout moment',
    pricingCta: 'Commencer gratuitement',
    footerPrivacy: 'Politique de confidentialité',
    footerContact: 'Nous contacter',
    footerRights: 'Tous droits réservés',
    privacyTitle: 'Politique de confidentialité',
    privacyBody: "Chez AlgerBot, nous nous engageons à protéger votre vie privée. Nous ne collectons que les informations nécessaires au fonctionnement de votre boutique, telles que les données produits, commandes et votre profil Telegram. Nous ne vendons jamais vos données à des tiers. Pour toute question concernant vos données, contactez-nous par e-mail.",
    contactTitle: 'Nous contacter',
    contactBody: "Pour toute question ou assistance, n'hésitez pas à nous écrire par e-mail, nous vous répondrons dans les meilleurs délais.",
    contactEmailLabel: 'E-mail',
    backToShopping: 'Continuer les achats',
    cart: 'Panier',
    cartEmpty: 'Votre panier est vide.',
    subtotal: 'Sous-total',
    checkout: 'Passer la commande',
    delivery: 'Livraison',
    total: 'Total',
    fullName: 'Nom complet',
    phone: 'Téléphone',
    wilaya: 'Wilaya',
    commune: 'Commune',
    address: 'Adresse',
    notesOptional: 'Notes (optionnel)',
    selectWilaya: '— Sélectionner —',
    confirmOrder: 'Confirmer la commande (paiement à la livraison)',
    sending: 'Envoi...',
    deliveryFeeNote: 'Les frais de livraison seront calculés à la confirmation',
    orderConfirmed: 'Commande confirmée',
    codPayment: 'Paiement à la livraison. Conservez votre code de suivi.',
    trackingCode: 'Code de suivi',
    backToStore: 'Retour à la boutique',
    backToCart: 'Retour au panier',
    addToCart: 'Ajouter au panier',
    outOfStock: 'Rupture de stock',
    inStock: 'En stock',
    gridView: 'Grille',
    listView: 'Liste',
    dimensionsAndDetails: 'Dimensions et détails',
    specifications: 'Caractéristiques',
    youMayAlsoLike: 'Vous pourriez aussi aimer',
    tapToZoom: 'Toucher pour zoomer',
    tapToShrink: 'Toucher pour réduire',
    addWithPrice: 'Ajouter —',
    noPhoto: 'Pas de photo',
    trackingCodeLabel: 'Code de suivi',
    phoneUsedAtOrder: 'Numéro de téléphone utilisé lors de la commande',
    search: 'Rechercher',
    searching: 'Recherche...',
    noOrderFound: 'Aucune commande trouvée avec ces informations.',
    orderStatus: {
      confirmed: 'Confirmée',
      packed: 'Emballée',
      handed_to_courier: 'Remise au livreur',
      delivered: 'Livrée',
      paid: 'Payée',
      cancelled: 'Annulée',
    },
    langSwitch: 'ع',
    merchant: {
      products: 'Produits',
      orders: 'Commandes',
      inventory: 'Inventaire',
      subscription: 'Abonnement',
      settings: 'Paramètres',
      viewMyStore: 'Voir ma boutique',
      logout: 'Déconnexion',
      notPublishedWarning:
        "Votre boutique n'est pas encore publiée — les acheteurs ne peuvent pas la voir. Le bouton ci-dessus vous montre un aperçu.",
      onboardingTitle: 'Créez votre boutique',
      onboardingSubtitle: 'Donnez un nom à votre boutique pour commencer à vendre sur AlgerBot.',
      storeName: 'Nom de la boutique',
      storeNamePlaceholder: "Ex : Bijoux d'Alger",
      descriptionOptional: 'Description (optionnel)',
      creating: 'Création...',
      createMyStore: 'Créer ma boutique',
      storeSettingsTitle: 'Paramètres de la boutique',
      profile: 'Profil',
      logo: 'Logo',
      banner: 'Bannière',
      chooseImage: 'Choisir une image',
      uploading: 'Téléversement...',
      name: 'Nom',
      description: 'Description',
      layoutVariant: 'Type de boutique (mise en page)',
      layoutGeneral: 'Général — grille standard',
      layoutFashion: 'Mode — grille photo, variantes visibles',
      layoutGrocery: 'Épicerie — icônes catégories, liste compacte',
      layoutElectronics: 'Électronique — fiches techniques, filtres',
      layoutFurniture: 'Meubles — grandes images, dimensions',
      storePublished: 'Boutique publiée (visible par les acheteurs)',
      save: 'Enregistrer',
      saving: 'Enregistrement...',
      deliveryZones: 'Frais de livraison par wilaya',
      deliveryZonesSubtitle: 'Cochez les wilayas où vous livrez et indiquez le tarif (DZD).',
      saveDeliveryFees: 'Enregistrer les frais de livraison',
      saved: 'Enregistré.',
      createFirstStore: "Créez d'abord votre boutique.",
      productsTitle: 'Produits',
      addProduct: '+ Ajouter un produit',
      importExcel: 'Import Excel',
      noProductsYet: 'Aucun produit pour le moment. Ajoutez votre premier produit.',
      published: 'Publié',
      draft: 'Brouillon',
      edit: 'Modifier',
      delete: 'Supprimer',
      photos: 'Photos',
      copyProductLink: 'Copier le lien du produit',
      copyAppLink: "Copier le lien de l'application",
      linkCopied: 'Lien copié !',
      shareApp: "Partager l'application",
      ordersTitle: 'Commandes',
      searchOrderPlaceholder: 'Rechercher par code de suivi ou téléphone...',
      allStatuses: 'Toutes',
      noOrders: 'Aucune commande.',
      exportExcel: 'Exporter en Excel',
      exporting: 'Export...',
      orderTracking: 'Suivi de commande',
      buyer: 'Acheteur',
      items: 'Articles',
      markAs: 'Marquer comme',
      cancelOrder: 'Annuler la commande',
      cancelReason: "Motif d'annulation",
      confirmCancellation: "Confirmer l'annulation",
      cancel: 'Annuler',
      inventoryTitle: 'Inventaire',
      lowStockOnly: 'Afficher uniquement le stock bas',
      lowStockAlert: 'article(s) en stock bas',
      adjust: 'Ajuster',
      noItems: 'Aucun article.',
      billingTitle: 'Abonnement',
      subscriptionStatus: 'Statut',
      activeUntil: "Actif jusqu'au",
      daysRemaining: 'jour(s) restant(s)',
      expiredWarning:
        "Votre abonnement a expiré. Votre boutique n'est plus visible sur la marketplace tant que le paiement n'est pas confirmé.",
      monthlyPrice: 'Tarif mensuel',
      payViaBaridiMob: 'Payer via BaridiMob',
      payInstructions:
        'Effectuez un virement BaridiMob vers le RIB ci-dessous, puis soumettez votre reçu.',
      accountHolder: 'Titulaire du compte',
      copy: 'Copier',
      copied: 'Copié !',
      submitReceipt: 'Soumettre un reçu',
      receiptFile: 'Reçu (image ou PDF)',
      transactionReference: 'Référence de transaction',
      amount: 'Montant (DZD)',
      submit: 'Soumettre',
      submitting: 'Envoi...',
      submitted: 'Reçu soumis, en attente de validation.',
      history: 'Historique',
      noSubmissions: 'Aucune soumission.',
      proofPending: 'En attente',
      proofApproved: 'Approuvée',
      proofRejected: 'Rejetée',
      sku: 'SKU',
      price: 'Prix',
      category: 'Catégorie',
      none: '— Aucune —',
      continueToPhotos: 'Continuer vers les photos',
      finish: 'Terminer',
      choosePhotos: 'Choisir des photos',
      takePhoto: 'Prendre une photo',
      variants: 'Variantes',
      variantLabel: 'Libellé',
      priceAdjustment: 'Ajust. prix',
      initialStock: 'Stock initial',
      noVariants: 'Aucune variante.',
      addVariant: 'Ajouter',
      stock: 'Stock',
      loading: 'Chargement...',
      orderTrackingTitle: 'Suivi de commande',
      markAsStep: 'Marquer comme',
      back: 'Retour',
      subTotalLabel: 'Sous-total',
      deliveryLabel: 'Livraison',
      totalLabel: 'Total',
      notePrefix: "Motif d'annulation",
      newProductTitle: 'Ajouter un produit',
      details: 'Détails',
      editProductTitle: 'Modifier',
      baridiMobStep1: "Ouvrez l'application BaridiMob",
      baridiMobStep2: 'Effectuez un virement vers le RIB ci-dessus, montant du tarif mensuel',
      baridiMobStep3: "Prenez une capture d'écran ou téléchargez le reçu PDF",
      baridiMobStep4: 'Soumettez-le ci-dessous avec la référence de transaction',
      selectFileError: 'Veuillez sélectionner un fichier',
      fillReferenceAndAmount: 'Veuillez remplir la référence et le montant',
      submitFailed: 'Échec de la soumission',
    },
    admin: {
      dashboard: 'Tableau de bord',
      merchants: 'Marchands',
      ordersLabel: 'Commandes',
      billing: 'Facturation',
      categories: 'Catégories',
      settingsLabel: 'Paramètres',
      logout: 'Déconnexion',
      activeMerchants: 'Marchands actifs',
      pendingMerchants: 'Marchands en attente',
      publishedStores: 'Boutiques publiées',
      productsCount: 'Produits',
      ordersLast30: 'Commandes (30j)',
      revenueLast30: 'Revenu commandes (30j)',
      pendingProofs: 'Preuves de paiement en attente',
      allMerchants: 'Tous',
      approve: 'Approuver',
      suspend: 'Suspendre',
      viewStore: 'Voir la boutique',
      noMerchants: 'Aucun marchand.',
      allOrders: 'Toutes les commandes',
      queueTitle: 'File de facturation',
      viewReceipt: 'Voir le reçu',
      reject: 'Rejeter',
      rejectReason: 'Motif du rejet',
      confirmReject: 'Confirmer le rejet',
      noPendingProofs: 'Aucune preuve en attente.',
      categoriesTitle: 'Catégories',
      addCategory: 'Ajouter une catégorie',
      nameFrench: 'Nom (français)',
      nameArabic: 'Nom (arabe)',
      bothNamesRequired: 'Les deux noms sont requis',
      add: 'Ajouter',
      moveUp: 'Monter',
      moveDown: 'Descendre',
      confirmDeleteCategory: 'Supprimer cette catégorie ?',
      noCategories: 'Aucune catégorie.',
      settingsTitle: 'Paramètres',
      subscriptionSettings: 'Abonnement',
      monthlyPriceDzd: 'Tarif mensuel (DZD)',
      freeTrialDays: 'Essai gratuit (jours)',
      adminDashboardTitle: 'Tableau de bord admin',
      saveLabel: 'Enregistrer',
      cancelLabel: 'Annuler',
    },
    share: {
      moreOptions: 'Plus d\u2019options',
      email: 'Email',
      copyLink: 'Copier le lien',
      linkCopied: 'Lien copié !',
      shareProduct: 'Partager le produit',
      shareApp: "Partager l'application",
      defaultShareText: 'Jetez un œil à ceci !',
      openInTelegram: 'Ouvrir dans Telegram',
      getTelegram: 'Télécharger Telegram',
      landingIntro: 'Ce lien ouvre la mini-app Telegram AlgerBot.',
    },
  },
}

export type TranslationKey = keyof TranslationDictionary


