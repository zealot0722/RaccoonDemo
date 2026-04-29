insert into faq_articles (code, title, question, keywords, answer) values
('F001', '退換貨政策', '商品可以退貨或換貨嗎？', array['退貨','換貨','七天','不合適'], '請提供您的送貨貨號、名稱、電話號碼等資料，以及商品的照片。收到資料後，客服人員會協助確認退貨處理。'),
('F002', '付款方式', '可以用哪些方式付款？', array['付款','刷卡','信用卡','轉帳','超商'], '目前支援信用卡、銀行轉帳與超商付款。完成付款後，系統會寄送訂單確認通知。'),
('F003', '配送時間', '下單後多久會收到？', array['配送','到貨','物流','運送','幾天'], '現貨商品通常會在 2-4 個工作天內出貨；偏遠地區或活動期間可能再增加 1-2 個工作天。'),
('F004', '保固與維修', '商品有保固嗎？', array['保固','維修','故障','一年'], '標示保固的商品享有一年有限保固。若遇到故障，請提供商品代號、購買時間與問題描述。')
on conflict (code) do update set
  title = excluded.title,
  question = excluded.question,
  keywords = excluded.keywords,
  answer = excluded.answer,
  is_active = true;

insert into products (
  code, name_zh, name_original, category, price, image_url, product_url,
  description_zh, tags, use_cases, stock_status
) values
('P001', '入門保養組', 'Raccoon Starter Care Kit', '保養', 890, '/assets/p001.png', '/products/P001', '適合第一次嘗試保養的新手組合，包含基礎清潔、保濕與日常修護。', array['新手','送禮','預算友善','日常'], array['新手入門','日常使用','送禮'], '有庫存'),
('P002', '行動辦公耳機', 'Raccoon Focus Buds', '3C', 1680, '/assets/p002.png', '/products/P002', '適合通勤與遠距會議的輕量耳機，主打清楚收音與長時間配戴舒適。', array['通勤','遠距會議','工作','3C'], array['工作','通勤','線上會議'], '有庫存'),
('P003', '高效清潔組', 'Raccoon Home Clean Set', '生活用品', 520, '/assets/p003.png', '/products/P003', '小空間與租屋族適用的清潔組合，方便收納，適合日常快速整理。', array['租屋','清潔','預算友善','居家'], array['居家清潔','租屋生活','日常使用'], '有庫存'),
('P004', '質感禮品杯', 'Raccoon Daily Mug', '生活用品', 680, '/assets/p004.png', '/products/P004', '適合辦公室與日常使用的質感馬克杯，包裝簡潔，適合作為小禮物。', array['送禮','辦公室','日常','預算友善'], array['送禮','辦公室','日常使用'], '少量庫存')
on conflict (code) do update set
  name_zh = excluded.name_zh,
  name_original = excluded.name_original,
  category = excluded.category,
  price = excluded.price,
  image_url = excluded.image_url,
  product_url = excluded.product_url,
  description_zh = excluded.description_zh,
  tags = excluded.tags,
  use_cases = excluded.use_cases,
  stock_status = excluded.stock_status,
  is_active = true;

insert into order_statuses (
  order_no, tracking_no, customer_id, customer_phone_last3, status, status_label,
  current_location, estimated_delivery, last_event_at, items, note, is_mock
) values
(
  'RAC1001',
  'RC123456789TW',
  'web-demo',
  '123',
  'in_transit',
  '配送中',
  '桃園轉運中心',
  '2026-05-02T10:00:00+08:00',
  '2026-04-29T09:30:00+08:00',
  '[{"code":"P001","name":"入門保養組","qty":1}]'::jsonb,
  '包裹已完成分揀，等待下一段配送。',
  true
),
(
  'RAC1002',
  'RC987654321TW',
  'web-demo',
  '456',
  'delivered',
  '已送達',
  '台北信義營業所',
  '2026-04-28T18:00:00+08:00',
  '2026-04-28T15:10:00+08:00',
  '[{"code":"P003","name":"高效清潔組","qty":1},{"code":"P004","name":"質感禮品杯","qty":1}]'::jsonb,
  '包裹已由管理室代收，若未取得請聯繫客服協助確認。',
  true
)
on conflict (order_no) do update set
  tracking_no = excluded.tracking_no,
  customer_id = excluded.customer_id,
  customer_phone_last3 = excluded.customer_phone_last3,
  status = excluded.status,
  status_label = excluded.status_label,
  current_location = excluded.current_location,
  estimated_delivery = excluded.estimated_delivery,
  last_event_at = excluded.last_event_at,
  items = excluded.items,
  note = excluded.note,
  is_mock = excluded.is_mock;

insert into tickets (
  id, ticket_no, customer_id, status, summary, intent, priority, handoff_reason
) values (
  '11111111-1111-4111-8111-111111111111',
  'T001',
  'seed-demo',
  'needs_review',
  '使用者要求真人客服',
  'human_handoff',
  'normal',
  '使用者明確要求真人客服，建立待處理工單。'
) on conflict (ticket_no) do nothing;

insert into messages (id, ticket_id, role, content) values
('22222222-2222-4222-8222-222222222221', '11111111-1111-4111-8111-111111111111', 'customer', '我要找真人客服'),
('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'system', '我已經幫你建立待處理工單，真人客服會接手確認。')
on conflict (id) do nothing;

insert into ai_decisions (
  id, ticket_id, intent, confidence, tone, decision, reasons, risk_flags,
  matched_faq_code, recommended_product_codes, handoff_reason, raw_classification
) values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'human_handoff',
  0.920,
  'neutral',
  'needs_review',
  '["使用者明確要求真人客服，建立待處理工單。"]'::jsonb,
  '[]'::jsonb,
  null,
  '[]'::jsonb,
  '使用者明確要求真人客服，建立待處理工單。',
  '{"intent":"human_handoff","confidence":0.92,"tone":"neutral","need_human":true}'::jsonb
) on conflict (id) do nothing;
