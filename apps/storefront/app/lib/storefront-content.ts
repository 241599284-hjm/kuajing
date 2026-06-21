export type Locale = "en" | "zh";
export type RegionKey = string;
export type RegionIconKey = "palace" | "skyline" | "pavilion" | "wall" | "mountain" | "bridge" | "tower" | "water" | "statue" | "pagoda";
export type ProductCategoryKey = string;
export type StoryMediaKind = "image" | "gif" | "video";

export type StorefrontProductMediaAsset = {
  assetId: string;
  kind: StoryMediaKind;
  url: string;
  poster: string | null;
  width: number | null;
  height: number | null;
  mimeType: string;
  responsiveSources: Array<{ url: string; width: number }>;
  alt: Record<Locale, string>;
  sortOrder: number;
};

export type ProductContent = {
  name: string;
  tag: string;
  shortDescription: string;
  longDescription: string;
  storyBlocks?: Array<{
    title: string;
    body: string;
    mediaKind?: StoryMediaKind;
    image: string;
    imageAlt: string;
    poster?: string | null;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
    mimeType?: string | null;
    byteSize?: number | null;
  }>;
  highlights: string[];
  details: {
    material: string;
    capacity: string;
    origin: string;
    hsCode: string;
    customsDeclaration?: string;
    packageDimensionsMm?: {
      length: number;
      width: number;
      height: number;
    };
    weightGrams?: number;
  };
};

export type StorefrontProduct = {
  slug: string;
  image: string;
  price: string;
  priceValue: number;
  originalPrice: string;
  originalPriceValue: number;
  monthlySales: number;
  stock: number;
  sales: number;
  category: ProductCategoryKey;
  region: RegionKey;
  skuId?: string;
  sku: string;
  mediaAssets?: StorefrontProductMediaAsset[];
  copy: Record<Locale, ProductContent>;
};

export type RegionContent = {
  name: string;
  landmark: string;
  title: string;
  description: string;
  more: string;
};

export type StorefrontRegion = {
  slug: RegionKey;
  image: string;
  icon: RegionIconKey;
  isVisible: boolean;
  showOnHomepage: boolean;
  sortOrder: number;
  copy: Record<Locale, RegionContent>;
};

export type StorefrontCategory = {
  slug: ProductCategoryKey;
  image: string;
  isVisible: boolean;
  sortOrder: number;
  copy: Record<Locale, { name: string }>;
};

export const storefrontCopy = {
  en: {
    brand: "Demo Teaware",
    nav: ["Teapots", "Cups", "Sets", "Gifts"],
    searchPlaceholder: "Search tea sets",
    searchSr: "Search products",
    wishlist: "Wishlist",
    account: "Account",
    register: "Register",
    createAccount: "Create account",
    cart: "Cart",
    cartAria: "Cart, 0 items",
    show: "Show",
    hide: "Hide",
    collapseHero: "Collapse hero",
    expandHero: "Expand hero",
    heroAlt: "Handcrafted Jingdezhen porcelain tea set in a quiet home tea ritual",
    heroEyebrow: "Handmade in Jingdezhen",
    heroTitle: "Handcrafted Jingdezhen Porcelain Tea Sets",
    heroDescription: "Centuries-old ceramic craftsmanship for your daily tea ritual & elegant home decor.",
    categoryTitle: "Shop Porcelain By Ritual",
    featuredTitle: "Customer Favorite Porcelain Picks",
    featuredDescription: "Handmade teaware, gift porcelain, and daily cups with safe worldwide shipping.",
    viewAll: "View all",
    regionTitle: "Regional custom porcelain",
    regionDescription: "Browse province-inspired porcelain collections by landmark, story, and gift positioning.",
    regionNavTitle: "Regions",
    allRegions: "All regions",
    regionDetail: {
      back: "Back to home",
      products: "Regional products",
      switchHint: "Use the top-left menu to switch regions or product categories."
    },
    collection: {
      search: "Search products",
      searchPlaceholder: "Search by name, material, or tag",
      sort: "Sort",
      category: "Category",
      allCategories: "All",
      resultCount: "Showing {start}-{end} of {total}",
      noResults: "No products found",
      page: "Page {page} of {totalPages}",
      previous: "Previous",
      next: "Next",
      sales: "{count} sold",
      monthlySales: "Monthly sales {count}",
      stock: "Stock {count}",
      sortOptions: {
        featured: "Featured",
        salesDesc: "Best sellers",
        priceAsc: "Price: low to high",
        priceDesc: "Price: high to low",
        nameAsc: "Name A-Z"
      },
      categoryOptions: {
        teapot: "Teapots",
        teacup: "Single teacups",
        travel: "Travel sets",
        gift: "Gift boxes"
      }
    },
    categories: [
      { name: "Tea Sets", image: "/assets/porcelain-tea-set-photo.webp" },
      { name: "Decor Vases", image: "/assets/region-jiangxi-tengwang.webp" },
      { name: "Gift Boxes", image: "/assets/hero-teaware-photo.webp" },
      { name: "Single Teacups", image: "/assets/yixing-teapot-photo.webp" }
    ],
    mobile: {
      open: "Open navigation",
      closeBackdrop: "Close navigation backdrop",
      close: "Close navigation",
      eyebrow: "Demo Teaware",
      title: "Shop menu",
      categoriesTitle: "Categories",
      serviceTitle: "Service",
      shopLinks: ["Teapots", "Teacups", "Travel sets", "Gift sets", "Accessories", "New arrivals"],
      serviceLinks: ["Track order", "Returns", "Wholesale", "Contact"]
    },
    registration: {
      closeBackdrop: "Close registration backdrop",
      close: "Close registration",
      eyebrow: "Account",
      title: "Create account",
      username: "Username",
      email: "Email",
      password: "Password",
      sending: "Sending...",
      submit: "Send verification email",
      sent: "Verification email sent. Open Mailpit and click the link to finish registration.",
      failed: "Registration failed"
    },
    support: {
      title: "Online customer service",
      body: "Live chat shell, email ticket, and after-sales handoff are reserved for mobile, tablet, and desktop.",
      startChat: "Start chat",
      createTicket: "Create ticket"
    },
    detail: {
      back: "Back to shop",
      selected: "Selected product",
      overview: "Overview",
      specifications: "Specifications",
      material: "Material",
      capacity: "Capacity",
      origin: "Origin",
      hsCode: "HS Code",
      packageDimensions: "Package dimensions",
      weight: "Weight",
      customsDeclaration: "Customs declaration",
      addToCart: "Add to cart",
      buyNow: "Buy now",
      shipping: "Ships with export declaration data reserved for checkout.",
      aftersales: "After-sales photos and refund requests can be handled from the user center later."
    }
  },
  zh: {
    brand: "代茶具",
    nav: ["茶壶", "茶杯", "套装", "礼品"],
    searchPlaceholder: "搜索茶具套装",
    searchSr: "搜索商品",
    wishlist: "收藏",
    account: "账户",
    register: "注册",
    createAccount: "创建账户",
    cart: "购物车",
    cartAria: "购物车，0 件商品",
    show: "展开",
    hide: "折叠",
    collapseHero: "折叠主图",
    expandHero: "展开主图",
    heroAlt: "安静家居茶席中的手工景德镇瓷器茶具",
    heroEyebrow: "景德镇手工瓷器",
    heroTitle: "手工景德镇瓷器茶具",
    heroDescription: "把传统陶瓷工艺带入日常茶席、家居陈列和高端礼品场景。",
    categoryTitle: "按茶席场景选瓷器",
    featuredTitle: "全球买家喜爱的瓷器",
    featuredDescription: "手工茶具、礼品瓷器和日用茶杯，突出安全包装与全球配送。",
    viewAll: "查看全部",
    regionTitle: "地域定制瓷器",
    regionDescription: "按省份地标、城市故事和礼品定位浏览定制瓷器系列。",
    regionNavTitle: "地域分类",
    allRegions: "全部地域",
    regionDetail: {
      back: "返回首页",
      products: "地域商品",
      switchHint: "可以从左上角菜单切换其他地域或商品类型。"
    },
    collection: {
      search: "查询商品",
      searchPlaceholder: "按名称、材质或标签查询",
      sort: "排序",
      category: "分类",
      allCategories: "全部",
      resultCount: "显示 {start}-{end} / 共 {total} 件",
      noResults: "没有找到商品",
      page: "第 {page} / {totalPages} 页",
      previous: "上一页",
      next: "下一页",
      sales: "已售 {count}",
      monthlySales: "本月销量 {count}",
      stock: "库存 {count}",
      sortOptions: {
        featured: "默认推荐",
        salesDesc: "销量优先",
        priceAsc: "价格从低到高",
        priceDesc: "价格从高到低",
        nameAsc: "名称排序"
      },
      categoryOptions: {
        teapot: "茶壶",
        teacup: "单杯",
        travel: "旅行茶具",
        gift: "礼品礼盒"
      }
    },
    categories: [
      { name: "整套茶具", image: "/assets/porcelain-tea-set-photo.webp" },
      { name: "陶瓷花瓶", image: "/assets/region-jiangxi-tengwang.webp" },
      { name: "礼品礼盒", image: "/assets/hero-teaware-photo.webp" },
      { name: "单杯单品", image: "/assets/yixing-teapot-photo.webp" }
    ],
    mobile: {
      open: "打开导航",
      closeBackdrop: "关闭导航遮罩",
      close: "关闭导航",
      eyebrow: "代茶具",
      title: "商城菜单",
      categoriesTitle: "商品分类",
      serviceTitle: "服务",
      shopLinks: ["茶壶", "茶杯", "旅行茶具", "礼品套装", "配件", "新品"],
      serviceLinks: ["物流追踪", "退换货", "批发采购", "联系我们"]
    },
    registration: {
      closeBackdrop: "关闭注册遮罩",
      close: "关闭注册",
      eyebrow: "账户",
      title: "创建账户",
      username: "用户名",
      email: "邮箱",
      password: "密码",
      sending: "发送中...",
      submit: "发送验证邮件",
      sent: "验证邮件已发送。打开 Mailpit 并点击邮件链接即可完成注册。",
      failed: "注册失败"
    },
    support: {
      title: "在线客服",
      body: "已为手机、平板和电脑预留在线聊天、邮件工单和售后流转入口。",
      startChat: "开始聊天",
      createTicket: "创建工单"
    },
    detail: {
      back: "返回商城",
      selected: "已选商品",
      overview: "商品介绍",
      specifications: "规格参数",
      material: "材质",
      capacity: "容量",
      origin: "原产地",
      hsCode: "HS Code",
      packageDimensions: "包装尺寸",
      weight: "重量",
      customsDeclaration: "海关说明",
      addToCart: "加入购物车",
      buyNow: "立即购买",
      shipping: "结算时可继续承接出口申报、税费和物流信息。",
      aftersales: "后续可在用户中心处理售后图片、退款和退换货请求。"
    }
  }
} as const;

export const productCategories: StorefrontCategory[] = [
  {
    slug: "teapot",
    image: "/assets/yixing-teapot-photo.webp",
    isVisible: true,
    sortOrder: 10,
    copy: {
      en: { name: "Teapots" },
      zh: { name: "茶壶" }
    }
  },
  {
    slug: "teacup",
    image: "/assets/porcelain-tea-set-photo.webp",
    isVisible: true,
    sortOrder: 20,
    copy: {
      en: { name: "Teacups" },
      zh: { name: "茶杯" }
    }
  },
  {
    slug: "travel",
    image: "/assets/travel-tea-set-photo.webp",
    isVisible: true,
    sortOrder: 30,
    copy: {
      en: { name: "Travel sets" },
      zh: { name: "旅行茶具" }
    }
  },
  {
    slug: "gift",
    image: "/assets/porcelain-tea-set-photo.webp",
    isVisible: true,
    sortOrder: 40,
    copy: {
      en: { name: "Gift sets" },
      zh: { name: "礼品套装" }
    }
  },
  {
    slug: "accessories",
    image: "/assets/travel-tea-set-photo.webp",
    isVisible: true,
    sortOrder: 50,
    copy: {
      en: { name: "Accessories" },
      zh: { name: "配件" }
    }
  },
  {
    slug: "new-arrivals",
    image: "/assets/yixing-teapot-photo.webp",
    isVisible: true,
    sortOrder: 60,
    copy: {
      en: { name: "New arrivals" },
      zh: { name: "新品" }
    }
  }
];

export const products: StorefrontProduct[] = [
  {
    slug: "porcelain-tea-set",
    image: "/assets/porcelain-tea-set-photo.webp",
    price: "$96",
    priceValue: 96,
    originalPrice: "$128",
    originalPriceValue: 128,
    monthlySales: 86,
    stock: 42,
    sales: 326,
    category: "gift",
    region: "jiangxi",
    sku: "DT-SET-001",
    copy: {
      en: {
        name: "Porcelain Tea Set",
        tag: "Gift",
        shortDescription: "White porcelain teapot and cups for gifting and daily brewing.",
        longDescription: "A clean porcelain tea set with a quiet profile for modern tables, gift boxes, and first-time buyers who want a complete brewing setup.",
        storyBlocks: [
          {
            title: "Gift-ready table setting",
            body: "The set is photographed and arranged for a compact gift page: teapot, cups, and a neutral porcelain finish that works across Western home interiors.",
            image: "/assets/porcelain-tea-set-photo.webp",
            imageAlt: "Porcelain teapot and teacups arranged for a gift table"
          },
          {
            title: "Responsive product storytelling",
            body: "On mobile, images and text stack for reading. On desktop, they alternate into a clean editorial layout so the same content can be maintained once in the admin.",
            image: "/assets/hero-teaware-photo.webp",
            imageAlt: "Minimal white teapot detail"
          }
        ],
        highlights: ["Gift-ready set", "Neutral white finish", "Tea room and home display friendly"],
        details: {
          material: "Porcelain ceramic",
          capacity: "Teapot 180 ml, cups 40 ml",
          origin: "China",
          hsCode: "6911.10"
        }
      },
      zh: {
        name: "白瓷功夫茶具套装",
        tag: "礼品",
        shortDescription: "适合送礼和日常冲泡的白瓷茶壶与茶杯组合。",
        longDescription: "这套白瓷茶具线条干净，适合现代家居、礼盒组合和入门用户，一套即可完成基础冲泡场景。",
        storyBlocks: [
          {
            title: "适合礼品陈列的茶席",
            body: "整套茶具以白瓷、金边和完整茶杯组合呈现，适合做欧美礼品页、家庭茶席和入门套装展示。",
            image: "/assets/porcelain-tea-set-photo.webp",
            imageAlt: "白瓷茶壶与茶杯礼品茶席"
          },
          {
            title: "自动适配手机和电脑",
            body: "手机端图文上下排列，电脑端图文左右交错排版，后台只需要维护一次内容，前台按屏幕尺寸自动适配。",
            image: "/assets/hero-teaware-photo.webp",
            imageAlt: "极简白瓷茶壶细节"
          }
        ],
        highlights: ["适合礼盒销售", "中性白瓷釉面", "适合茶室与家用陈列"],
        details: {
          material: "白瓷陶瓷",
          capacity: "茶壶 180 ml，茶杯 40 ml",
          origin: "中国",
          hsCode: "6911.10"
        }
      }
    }
  },
  {
    slug: "yixing-clay-pot",
    image: "/assets/yixing-teapot-photo.webp",
    price: "$128",
    priceValue: 128,
    originalPrice: "$168",
    originalPriceValue: 168,
    monthlySales: 54,
    stock: 18,
    sales: 214,
    category: "teapot",
    region: "beijing",
    sku: "DT-POT-002",
    copy: {
      en: {
        name: "Yixing Clay Pot",
        tag: "Collector",
        shortDescription: "A Yixing-style clay teapot for collectors and focused brewing.",
        longDescription: "A compact clay teapot positioned for collectors, tea enthusiasts, and premium listings where material declaration and customs data matter.",
        highlights: ["Collector positioning", "Clay material profile", "Strong detail page storytelling"],
        details: {
          material: "Yixing-style stoneware clay",
          capacity: "Approx. 150 ml",
          origin: "China",
          hsCode: "6912.00"
        }
      },
      zh: {
        name: "宜兴紫砂壶",
        tag: "收藏",
        shortDescription: "面向收藏与专注冲泡场景的紫砂风格茶壶。",
        longDescription: "紧凑型紫砂风格茶壶，适合收藏用户、茶爱好者和高客单商品页展示，材质申报与清关字段可直接落库。",
        highlights: ["收藏属性明确", "紫砂材质标签", "适合做高端详情页叙事"],
        details: {
          material: "紫砂风格陶土",
          capacity: "约 150 ml",
          origin: "中国",
          hsCode: "6912.00"
        }
      }
    }
  },
  {
    slug: "travel-tea-kit",
    image: "/assets/travel-tea-set-photo.webp",
    price: "$72",
    priceValue: 72,
    originalPrice: "$96",
    originalPriceValue: 96,
    monthlySales: 119,
    stock: 63,
    sales: 489,
    category: "travel",
    region: "shanghai",
    sku: "DT-TRV-003",
    copy: {
      en: {
        name: "Travel Tea Kit",
        tag: "Travel",
        shortDescription: "Portable tea pieces for travel, office, and outdoor brewing.",
        longDescription: "A compact travel tea kit concept for customers who want portable brewing, lightweight packing, and a clear accessory-style product page.",
        highlights: ["Portable positioning", "Easy to bundle with accessories", "Good for travel and office buyers"],
        details: {
          material: "Ceramic and fitted storage case",
          capacity: "Compact travel format",
          origin: "China",
          hsCode: "6912.00"
        }
      },
      zh: {
        name: "旅行茶具套装",
        tag: "旅行",
        shortDescription: "适合差旅、办公室和户外冲泡的便携茶具。",
        longDescription: "便携旅行茶具概念，适合需要轻量收纳、户外冲泡和配件组合销售的用户场景。",
        highlights: ["便携定位清晰", "可与茶巾茶包捆绑", "适合差旅和办公室用户"],
        details: {
          material: "陶瓷与收纳盒",
          capacity: "便携旅行规格",
          origin: "中国",
          hsCode: "6912.00"
        }
      }
    }
  },
  {
    slug: "celadon-teacup-set",
    image: "/assets/porcelain-tea-set-photo.webp",
    price: "$54",
    priceValue: 54,
    originalPrice: "$69",
    originalPriceValue: 69,
    monthlySales: 148,
    stock: 96,
    sales: 612,
    category: "teacup",
    region: "jiangxi",
    sku: "DT-CUP-004",
    copy: {
      en: {
        name: "Celadon Teacup Set",
        tag: "Entry",
        shortDescription: "Compact cup set for everyday tea tables and entry buyers.",
        longDescription: "A practical cup set concept for daily brewing, lightweight gift bundles, and customers building their first tea table.",
        highlights: ["Entry-level price point", "Easy to bundle", "Small parcel friendly"],
        details: {
          material: "Glazed ceramic",
          capacity: "Cups 45 ml",
          origin: "China",
          hsCode: "6912.00"
        }
      },
      zh: {
        name: "青瓷茶杯组",
        tag: "入门",
        shortDescription: "适合日常茶席和入门买家的小杯组。",
        longDescription: "实用茶杯组概念，适合日常冲泡、轻量礼品组合和刚开始搭建茶席的用户。",
        highlights: ["入门价格带", "适合捆绑销售", "小包裹友好"],
        details: {
          material: "釉面陶瓷",
          capacity: "茶杯 45 ml",
          origin: "中国",
          hsCode: "6912.00"
        }
      }
    }
  },
  {
    slug: "gongfu-brewing-set",
    image: "/assets/porcelain-tea-set-photo.webp",
    price: "$118",
    priceValue: 118,
    originalPrice: "$148",
    originalPriceValue: 148,
    monthlySales: 61,
    stock: 31,
    sales: 278,
    category: "gift",
    region: "beijing",
    sku: "DT-SET-005",
    copy: {
      en: {
        name: "Gongfu Brewing Set",
        tag: "Gift",
        shortDescription: "A complete brewing set for gift boxes and premium listings.",
        longDescription: "A gift-oriented gongfu brewing set for customers who want a complete product bundle with clear customs and material attributes.",
        highlights: ["Complete set positioning", "Gift box friendly", "Good product detail storytelling"],
        details: {
          material: "Porcelain ceramic",
          capacity: "Teapot 170 ml, cups 35 ml",
          origin: "China",
          hsCode: "6911.10"
        }
      },
      zh: {
        name: "功夫茶具组合",
        tag: "礼品",
        shortDescription: "适合礼盒和高端商品页的完整冲泡套装。",
        longDescription: "面向礼品场景的功夫茶具组合，适合完整套装销售，并保留清关和材质属性。",
        highlights: ["完整套装定位", "适合礼盒包装", "适合详情页叙事"],
        details: {
          material: "白瓷陶瓷",
          capacity: "茶壶 170 ml，茶杯 35 ml",
          origin: "中国",
          hsCode: "6911.10"
        }
      }
    }
  },
  {
    slug: "clay-side-handle-pot",
    image: "/assets/yixing-teapot-photo.webp",
    price: "$142",
    priceValue: 142,
    originalPrice: "$188",
    originalPriceValue: 188,
    monthlySales: 32,
    stock: 12,
    sales: 151,
    category: "teapot",
    region: "beijing",
    sku: "DT-POT-006",
    copy: {
      en: {
        name: "Clay Side Handle Pot",
        tag: "Collector",
        shortDescription: "Clay teapot variant for collector-oriented catalog pages.",
        longDescription: "A clay teapot variant for premium catalog filtering, collector tags, and material-sensitive customs declarations.",
        highlights: ["Collector catalogue fit", "Material-forward listing", "Premium margin positioning"],
        details: {
          material: "Stoneware clay",
          capacity: "Approx. 160 ml",
          origin: "China",
          hsCode: "6912.00"
        }
      },
      zh: {
        name: "侧把陶土壶",
        tag: "收藏",
        shortDescription: "面向收藏型目录页的陶土茶壶款式。",
        longDescription: "陶土茶壶扩展款，适合高端筛选、收藏标签和材质敏感的出口申报。",
        highlights: ["适合收藏目录", "材质卖点明确", "高毛利定位"],
        details: {
          material: "陶土炻器",
          capacity: "约 160 ml",
          origin: "中国",
          hsCode: "6912.00"
        }
      }
    }
  },
  {
    slug: "compact-travel-case",
    image: "/assets/travel-tea-set-photo.webp",
    price: "$88",
    priceValue: 88,
    originalPrice: "$108",
    originalPriceValue: 108,
    monthlySales: 77,
    stock: 44,
    sales: 357,
    category: "travel",
    region: "shanghai",
    sku: "DT-TRV-007",
    copy: {
      en: {
        name: "Compact Travel Case",
        tag: "Travel",
        shortDescription: "Portable teaware with a compact case for travel buyers.",
        longDescription: "A compact case product for mobile buyers, travel campaigns, and lightweight overseas fulfillment.",
        highlights: ["Travel campaign ready", "Compact case format", "Good mobile conversion fit"],
        details: {
          material: "Ceramic set with case",
          capacity: "Portable case format",
          origin: "China",
          hsCode: "6912.00"
        }
      },
      zh: {
        name: "便携旅行收纳茶具",
        tag: "旅行",
        shortDescription: "带收纳盒的便携茶具，适合旅行用户。",
        longDescription: "紧凑收纳款，适合移动端转化、旅行主题活动和轻量跨境履约。",
        highlights: ["适合旅行活动", "收纳盒规格", "适合移动端转化"],
        details: {
          material: "陶瓷套装与收纳盒",
          capacity: "便携盒装规格",
          origin: "中国",
          hsCode: "6912.00"
        }
      }
    }
  },
  {
    slug: "porcelain-gift-cups",
    image: "/assets/porcelain-tea-set-photo.webp",
    price: "$64",
    priceValue: 64,
    originalPrice: "$82",
    originalPriceValue: 82,
    monthlySales: 132,
    stock: 88,
    sales: 533,
    category: "teacup",
    region: "jiangxi",
    sku: "DT-CUP-008",
    copy: {
      en: {
        name: "Porcelain Gift Cups",
        tag: "Gift",
        shortDescription: "Porcelain cups for gift add-ons and bundle sales.",
        longDescription: "A porcelain cup listing for add-on purchases, gift kits, and product recommendation modules.",
        highlights: ["Good add-on SKU", "Gift bundle friendly", "Simple customs attributes"],
        details: {
          material: "Porcelain ceramic",
          capacity: "Cups 40 ml",
          origin: "China",
          hsCode: "6911.10"
        }
      },
      zh: {
        name: "白瓷礼品茶杯",
        tag: "礼品",
        shortDescription: "适合作为加购和组合销售的白瓷茶杯。",
        longDescription: "白瓷杯类商品，适合加购、礼品套装和推荐模块。",
        highlights: ["适合加购 SKU", "适合礼品组合", "清关属性简单"],
        details: {
          material: "白瓷陶瓷",
          capacity: "茶杯 40 ml",
          origin: "中国",
          hsCode: "6911.10"
        }
      }
    }
  },
  {
    slug: "minimal-office-tea-set",
    image: "/assets/travel-tea-set-photo.webp",
    price: "$82",
    priceValue: 82,
    originalPrice: "$99",
    originalPriceValue: 99,
    monthlySales: 104,
    stock: 55,
    sales: 401,
    category: "travel",
    region: "shanghai",
    sku: "DT-TRV-009",
    copy: {
      en: {
        name: "Minimal Office Tea Set",
        tag: "Entry",
        shortDescription: "Compact tea set for office desks and small apartments.",
        longDescription: "A compact tea set concept for office workers, apartment living, and customers who want a simple daily brewing setup.",
        highlights: ["Office buyer fit", "Compact footprint", "Entry catalogue coverage"],
        details: {
          material: "Ceramic set",
          capacity: "Compact daily format",
          origin: "China",
          hsCode: "6912.00"
        }
      },
      zh: {
        name: "办公室极简茶具",
        tag: "入门",
        shortDescription: "适合办公室桌面和小户型的紧凑茶具。",
        longDescription: "适合办公人群、小户型生活和日常冲泡的紧凑茶具概念。",
        highlights: ["适合办公用户", "占用空间小", "覆盖入门目录"],
        details: {
          material: "陶瓷套装",
          capacity: "紧凑日用规格",
          origin: "中国",
          hsCode: "6912.00"
        }
      }
    }
  }
];

const iconImages: Record<RegionIconKey, string> = {
  palace: "/assets/region-beijing-tiananmen.webp",
  skyline: "/assets/region-shanghai-oriental-pearl.webp",
  pavilion: "/assets/region-jiangxi-tengwang.webp",
  wall: "/assets/region-beijing-tiananmen.webp",
  mountain: "/assets/region-jiangxi-tengwang.webp",
  bridge: "/assets/region-shanghai-oriental-pearl.webp",
  tower: "/assets/region-shanghai-oriental-pearl.webp",
  water: "/assets/region-jiangxi-tengwang.webp",
  statue: "/assets/region-beijing-tiananmen.webp",
  pagoda: "/assets/region-jiangxi-tengwang.webp"
};

function region(input: {
  slug: RegionKey;
  icon: RegionIconKey;
  sortOrder: number;
  showOnHomepage?: boolean;
  nameEn: string;
  nameZh: string;
  landmarkEn: string;
  landmarkZh: string;
  image?: string;
}): StorefrontRegion {
  return {
    slug: input.slug,
    image: input.image ?? iconImages[input.icon],
    icon: input.icon,
    isVisible: true,
    showOnHomepage: input.showOnHomepage ?? false,
    sortOrder: input.sortOrder,
    copy: {
      en: {
        name: input.nameEn,
        landmark: input.landmarkEn,
        title: `${input.nameEn} Custom Porcelain`,
        description: `${input.landmarkEn}-inspired teaware for regional gifts, cultural storytelling, and custom porcelain collections.`,
        more: "More"
      },
      zh: {
        name: input.nameZh,
        landmark: input.landmarkZh,
        title: `${input.nameZh}地域定制瓷器`,
        description: `以${input.landmarkZh}为视觉线索，面向地域礼品、城市故事和定制茶具系列。`,
        more: "更多"
      }
    }
  };
}

export const regions: StorefrontRegion[] = [
  region({ slug: "beijing", icon: "palace", sortOrder: 10, showOnHomepage: true, nameEn: "Beijing", nameZh: "北京", landmarkEn: "Tiananmen", landmarkZh: "天安门", image: "/assets/region-beijing-tiananmen.webp" }),
  region({ slug: "shanghai", icon: "skyline", sortOrder: 20, showOnHomepage: true, nameEn: "Shanghai", nameZh: "上海", landmarkEn: "Oriental Pearl Tower", landmarkZh: "东方明珠", image: "/assets/region-shanghai-oriental-pearl.webp" }),
  region({ slug: "jiangxi", icon: "pavilion", sortOrder: 30, showOnHomepage: true, nameEn: "Jiangxi", nameZh: "江西", landmarkEn: "Tengwang Pavilion", landmarkZh: "滕王阁", image: "/assets/region-jiangxi-tengwang.webp" }),
  region({ slug: "guangdong", icon: "tower", sortOrder: 40, showOnHomepage: true, nameEn: "Guangdong", nameZh: "广东", landmarkEn: "Canton Tower", landmarkZh: "广州塔" }),
  region({ slug: "tianjin", icon: "bridge", sortOrder: 50, nameEn: "Tianjin", nameZh: "天津", landmarkEn: "Tianjin Eye", landmarkZh: "天津之眼" }),
  region({ slug: "chongqing", icon: "skyline", sortOrder: 60, nameEn: "Chongqing", nameZh: "重庆", landmarkEn: "Mountain City Skyline", landmarkZh: "山城天际线" }),
  region({ slug: "hebei", icon: "bridge", sortOrder: 70, nameEn: "Hebei", nameZh: "河北", landmarkEn: "Zhaozhou Bridge", landmarkZh: "赵州桥" }),
  region({ slug: "shanxi", icon: "statue", sortOrder: 80, nameEn: "Shanxi", nameZh: "山西", landmarkEn: "Yungang Grottoes", landmarkZh: "云冈石窟" }),
  region({ slug: "liaoning", icon: "palace", sortOrder: 90, nameEn: "Liaoning", nameZh: "辽宁", landmarkEn: "Shenyang Imperial Palace", landmarkZh: "沈阳故宫" }),
  region({ slug: "jilin", icon: "mountain", sortOrder: 100, nameEn: "Jilin", nameZh: "吉林", landmarkEn: "Changbai Mountain", landmarkZh: "长白山" }),
  region({ slug: "heilongjiang", icon: "tower", sortOrder: 110, nameEn: "Heilongjiang", nameZh: "黑龙江", landmarkEn: "Saint Sophia Cathedral", landmarkZh: "圣索菲亚教堂" }),
  region({ slug: "jiangsu", icon: "pagoda", sortOrder: 120, nameEn: "Jiangsu", nameZh: "江苏", landmarkEn: "Suzhou Gardens", landmarkZh: "苏州园林" }),
  region({ slug: "zhejiang", icon: "water", sortOrder: 130, nameEn: "Zhejiang", nameZh: "浙江", landmarkEn: "West Lake", landmarkZh: "西湖" }),
  region({ slug: "anhui", icon: "mountain", sortOrder: 140, nameEn: "Anhui", nameZh: "安徽", landmarkEn: "Huangshan", landmarkZh: "黄山" }),
  region({ slug: "fujian", icon: "palace", sortOrder: 150, nameEn: "Fujian", nameZh: "福建", landmarkEn: "Tulou", landmarkZh: "土楼" }),
  region({ slug: "shandong", icon: "palace", sortOrder: 160, nameEn: "Shandong", nameZh: "山东", landmarkEn: "Confucius Temple", landmarkZh: "孔庙" }),
  region({ slug: "henan", icon: "statue", sortOrder: 170, nameEn: "Henan", nameZh: "河南", landmarkEn: "Longmen Grottoes", landmarkZh: "龙门石窟" }),
  region({ slug: "hubei", icon: "pagoda", sortOrder: 180, nameEn: "Hubei", nameZh: "湖北", landmarkEn: "Yellow Crane Tower", landmarkZh: "黄鹤楼" }),
  region({ slug: "hunan", icon: "mountain", sortOrder: 190, nameEn: "Hunan", nameZh: "湖南", landmarkEn: "Zhangjiajie", landmarkZh: "张家界" }),
  region({ slug: "guangxi", icon: "water", sortOrder: 200, nameEn: "Guangxi", nameZh: "广西", landmarkEn: "Guilin Karst", landmarkZh: "桂林山水" }),
  region({ slug: "hainan", icon: "statue", sortOrder: 210, nameEn: "Hainan", nameZh: "海南", landmarkEn: "Nanshan Guanyin", landmarkZh: "南山观音" }),
  region({ slug: "sichuan", icon: "statue", sortOrder: 220, nameEn: "Sichuan", nameZh: "四川", landmarkEn: "Leshan Giant Buddha", landmarkZh: "乐山大佛" }),
  region({ slug: "guizhou", icon: "water", sortOrder: 230, nameEn: "Guizhou", nameZh: "贵州", landmarkEn: "Huangguoshu Waterfall", landmarkZh: "黄果树瀑布" }),
  region({ slug: "yunnan", icon: "mountain", sortOrder: 240, nameEn: "Yunnan", nameZh: "云南", landmarkEn: "Stone Forest", landmarkZh: "石林" }),
  region({ slug: "shaanxi", icon: "statue", sortOrder: 250, nameEn: "Shaanxi", nameZh: "陕西", landmarkEn: "Terracotta Army", landmarkZh: "兵马俑" }),
  region({ slug: "gansu", icon: "palace", sortOrder: 260, nameEn: "Gansu", nameZh: "甘肃", landmarkEn: "Jiayuguan Pass", landmarkZh: "嘉峪关" }),
  region({ slug: "qinghai", icon: "water", sortOrder: 270, nameEn: "Qinghai", nameZh: "青海", landmarkEn: "Qinghai Lake", landmarkZh: "青海湖" }),
  region({ slug: "ningxia", icon: "pagoda", sortOrder: 280, nameEn: "Ningxia", nameZh: "宁夏", landmarkEn: "Western Xia Pagodas", landmarkZh: "西夏王陵" }),
  region({ slug: "xinjiang", icon: "mountain", sortOrder: 290, nameEn: "Xinjiang", nameZh: "新疆", landmarkEn: "Tianshan", landmarkZh: "天山" }),
  region({ slug: "tibet", icon: "palace", sortOrder: 300, nameEn: "Tibet", nameZh: "西藏", landmarkEn: "Potala Palace", landmarkZh: "布达拉宫" }),
  region({ slug: "inner-mongolia", icon: "mountain", sortOrder: 310, nameEn: "Inner Mongolia", nameZh: "内蒙古", landmarkEn: "Grassland Yurt", landmarkZh: "草原毡房" }),
  region({ slug: "hong-kong", icon: "skyline", sortOrder: 320, nameEn: "Hong Kong", nameZh: "香港", landmarkEn: "Victoria Harbour", landmarkZh: "维多利亚港" }),
  region({ slug: "macau", icon: "palace", sortOrder: 330, nameEn: "Macau", nameZh: "澳门", landmarkEn: "Ruins of Saint Paul", landmarkZh: "大三巴牌坊" }),
  region({ slug: "taiwan", icon: "tower", sortOrder: 340, nameEn: "Taiwan", nameZh: "台湾", landmarkEn: "Taipei 101", landmarkZh: "台北 101" })
];

export function getProductBySlug(slug: string) {
  return products.find((product) => product.slug === slug);
}

export function getRegionBySlug(slug: string) {
  return regions.find((region) => region.slug === slug);
}

export function getCategoryBySlug(slug: string) {
  return productCategories.find((category) => category.slug === slug);
}
