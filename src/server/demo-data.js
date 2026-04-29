export const demoFaqArticles = [
  {
    code: "F001",
    title: "退換貨政策",
    question: "商品可以退貨或換貨嗎？",
    keywords: ["退貨", "換貨", "七天", "不合適"],
    answer: "請提供您的送貨貨號、名稱、電話號碼等資料，以及商品的照片。收到資料後，客服人員會協助確認退貨處理。"
  },
  {
    code: "F002",
    title: "付款方式",
    question: "可以用哪些方式付款？",
    keywords: ["付款", "刷卡", "信用卡", "轉帳", "超商"],
    answer: "目前支援信用卡、銀行轉帳與超商付款。完成付款後，系統會寄送訂單確認通知。"
  },
  {
    code: "F003",
    title: "配送時間",
    question: "下單後多久會收到？",
    keywords: ["配送", "到貨", "物流", "運送", "幾天"],
    answer: "現貨商品通常會在 2-4 個工作天內出貨；偏遠地區或活動期間可能再增加 1-2 個工作天。"
  },
  {
    code: "F004",
    title: "保固與維修",
    question: "商品有保固嗎？",
    keywords: ["保固", "維修", "故障", "一年"],
    answer: "標示保固的商品享有一年有限保固。若遇到故障，請提供商品代號、購買時間與問題描述。"
  }
];

export const demoProducts = [
  {
    code: "P001",
    name_zh: "入門保養組",
    name_original: "Raccoon Starter Care Kit",
    category: "保養",
    price: 890,
    image_url: "/assets/p001.png",
    product_url: "/products/P001",
    description_zh: "適合第一次嘗試保養的新手組合，包含基礎清潔、保濕與日常修護。",
    tags: ["新手", "送禮", "預算友善", "日常"],
    use_cases: ["新手入門", "日常使用", "送禮"],
    stock_status: "有庫存"
  },
  {
    code: "P002",
    name_zh: "行動辦公耳機",
    name_original: "Raccoon Focus Buds",
    category: "3C",
    price: 1680,
    image_url: "/assets/p002.png",
    product_url: "/products/P002",
    description_zh: "適合通勤與遠距會議的輕量耳機，主打清楚收音與長時間配戴舒適。",
    tags: ["通勤", "遠距會議", "工作", "3C"],
    use_cases: ["工作", "通勤", "線上會議"],
    stock_status: "有庫存"
  },
  {
    code: "P003",
    name_zh: "高效清潔組",
    name_original: "Raccoon Home Clean Set",
    category: "生活用品",
    price: 520,
    image_url: "/assets/p003.png",
    product_url: "/products/P003",
    description_zh: "小空間與租屋族適用的清潔組合，方便收納，適合日常快速整理。",
    tags: ["租屋", "清潔", "預算友善", "居家"],
    use_cases: ["居家清潔", "租屋生活", "日常使用"],
    stock_status: "有庫存"
  },
  {
    code: "P004",
    name_zh: "質感禮品杯",
    name_original: "Raccoon Daily Mug",
    category: "生活用品",
    price: 680,
    image_url: "/assets/p004.png",
    product_url: "/products/P004",
    description_zh: "適合辦公室與日常使用的質感馬克杯，包裝簡潔，適合作為小禮物。",
    tags: ["送禮", "辦公室", "日常", "預算友善"],
    use_cases: ["送禮", "辦公室", "日常使用"],
    stock_status: "少量庫存"
  }
];

export const demoOrderStatuses = [
  {
    order_no: "RAC1001",
    tracking_no: "RC123456789TW",
    customer_id: "web-demo",
    customer_phone_last3: "123",
    status: "in_transit",
    status_label: "配送中",
    current_location: "桃園轉運中心",
    estimated_delivery: "2026-05-02T10:00:00+08:00",
    last_event_at: "2026-04-29T09:30:00+08:00",
    items: [
      {
        code: "P001",
        name: "入門保養組",
        qty: 1
      }
    ],
    note: "包裹已完成分揀，等待下一段配送。",
    is_mock: true
  },
  {
    order_no: "RAC1002",
    tracking_no: "RC987654321TW",
    customer_id: "web-demo",
    customer_phone_last3: "456",
    status: "delivered",
    status_label: "已送達",
    current_location: "台北信義營業所",
    estimated_delivery: "2026-04-28T18:00:00+08:00",
    last_event_at: "2026-04-28T15:10:00+08:00",
    items: [
      {
        code: "P003",
        name: "高效清潔組",
        qty: 1
      },
      {
        code: "P004",
        name: "質感禮品杯",
        qty: 1
      }
    ],
    note: "包裹已由管理室代收，若未取得請聯繫客服協助確認。",
    is_mock: true
  }
];
