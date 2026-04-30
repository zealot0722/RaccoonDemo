-- Destructive demo reset: removes current tickets and recreates a small test set.
-- Run this only in the Raccoon demo Supabase project.

truncate table tickets restart identity cascade;

insert into tickets (
  id, ticket_no, customer_id, status, summary, intent, priority, handoff_reason, created_at, updated_at
) values
(
  '11111111-1111-4111-8111-111111111111',
  'T001',
  'seed-demo',
  'needs_review',
  '客戶要求真人客服處理退貨',
  'human_handoff',
  'normal',
  '使用者明確要求真人客服，建立待處理工單。',
  '2026-04-30T09:00:00+08:00',
  '2026-04-30T09:00:00+08:00'
),
(
  '11111111-1111-4111-8111-111111111112',
  'T002',
  'seed-demo',
  'needs_review',
  '收到瑕疵商品，需要退貨資料確認',
  'return_request',
  'high',
  '退貨申請含商品瑕疵，需要客服人員確認照片與資料。',
  '2026-04-30T09:10:00+08:00',
  '2026-04-30T09:10:00+08:00'
),
(
  '11111111-1111-4111-8111-111111111113',
  'T003',
  'seed-demo',
  'in_progress',
  '客戶查詢 RAC1004 目前配送位置',
  'order_status',
  'high',
  null,
  '2026-04-30T09:20:00+08:00',
  '2026-04-30T09:25:00+08:00'
),
(
  '11111111-1111-4111-8111-111111111114',
  'T004',
  'seed-demo',
  'closed',
  '客戶完成 2000 元內商品推薦諮詢',
  'product_recommendation',
  'normal',
  null,
  '2026-04-30T09:30:00+08:00',
  '2026-04-30T09:45:00+08:00'
);

insert into messages (id, ticket_id, role, content, created_at) values
('22222222-2222-4222-8222-222222222221', '11111111-1111-4111-8111-111111111111', 'customer', '我要找真人客服', '2026-04-30T09:00:00+08:00'),
('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'system', '請稍後，客服人員將很快為您服務。', '2026-04-30T09:00:03+08:00'),
('22222222-2222-4222-8222-222222222223', '11111111-1111-4111-8111-111111111112', 'customer', '收到的商品破損，我要退貨', '2026-04-30T09:10:00+08:00'),
('22222222-2222-4222-8222-222222222224', '11111111-1111-4111-8111-111111111112', 'ai', '請提供您的送貨貨號、姓名、電話號碼。若方便，您也可以上傳商品照片供客服參考。', '2026-04-30T09:10:05+08:00'),
('22222222-2222-4222-8222-222222222225', '11111111-1111-4111-8111-111111111113', 'customer', 'RAC1004 的東西在哪', '2026-04-30T09:20:00+08:00'),
('22222222-2222-4222-8222-222222222226', '11111111-1111-4111-8111-111111111113', 'ai', '我幫您查到目前狀態為配送中，目前位置是新北配送站，預計 2026/05/01 到貨。', '2026-04-30T09:20:04+08:00'),
('22222222-2222-4222-8222-222222222227', '11111111-1111-4111-8111-111111111114', 'customer', '我要 2000 以下的送禮商品', '2026-04-30T09:30:00+08:00'),
('22222222-2222-4222-8222-222222222228', '11111111-1111-4111-8111-111111111114', 'ai', '依照您的需求，為您推薦以下選項。\n\nP002｜行動辦公耳機\n價格：NT$ 1,680\n詳情連結：/products/P002', '2026-04-30T09:30:05+08:00');

insert into ai_decisions (
  id, ticket_id, intent, confidence, tone, decision, reasons, risk_flags,
  matched_faq_code, recommended_product_codes, handoff_reason, raw_classification, created_at
) values
(
  '33333333-3333-4333-8333-333333333331',
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
  '{"intent":"human_handoff","confidence":0.92,"need_human":true}'::jsonb,
  '2026-04-30T09:00:02+08:00'
),
(
  '33333333-3333-4333-8333-333333333332',
  '11111111-1111-4111-8111-111111111112',
  'return_request',
  0.900,
  'worried',
  'needs_review',
  '["退貨申請含商品瑕疵，需要客服人員確認照片與資料。"]'::jsonb,
  '["return_photo_review"]'::jsonb,
  'F001',
  '[]'::jsonb,
  '退貨申請含商品瑕疵，需要客服人員確認照片與資料。',
  '{"intent":"return_request","confidence":0.9,"missing_fields":["order_identifier","name","phone"]}'::jsonb,
  '2026-04-30T09:10:03+08:00'
),
(
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111113',
  'order_status',
  0.880,
  'neutral',
  'auto_reply',
  '["命中貨態查詢，已查詢 demo order_statuses。"]'::jsonb,
  '[]'::jsonb,
  null,
  '[]'::jsonb,
  null,
  '{"intent":"order_status","confidence":0.88,"order_no":"RAC1004"}'::jsonb,
  '2026-04-30T09:20:03+08:00'
),
(
  '33333333-3333-4333-8333-333333333334',
  '11111111-1111-4111-8111-111111111114',
  'product_recommendation',
  0.860,
  'neutral',
  'auto_reply',
  '["依照預算與用途推薦符合 DB 價格條件的商品。"]'::jsonb,
  '[]'::jsonb,
  null,
  '["P002"]'::jsonb,
  null,
  '{"intent":"product_recommendation","confidence":0.86,"budget_max":2000,"use_case":"送禮"}'::jsonb,
  '2026-04-30T09:30:03+08:00'
);
