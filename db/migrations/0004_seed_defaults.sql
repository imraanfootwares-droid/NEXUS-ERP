-- ==============================================================================
-- Nexus ERP — 0004_seed_defaults.sql
-- Seeds Tiers 1-4, 18 features, 30 permissions, 6 verticals & 60+ HSN/SAC codes
-- ==============================================================================

INSERT INTO public.tier_definitions (tier_key, name, market_price_inr, price_inr, default_max_users, default_max_branches, features, sort_order) VALUES
('tier_1', 'Tier 1 — Simple Billing & GST', 85000, 50000, 5, 1, ARRAY['mobile_pc_access','rbac_logins','bill_designer','gst_billing_pdf','discounts_returns_payments','analytics_basic','data_exports_gst','daily_backups'], 1),
('tier_2', 'Tier 2 — Billing + Stock', 175000, 100000, 5, 1, ARRAY['mobile_pc_access','rbac_logins','bill_designer','gst_billing_pdf','discounts_returns_payments','analytics_basic','data_exports_gst','daily_backups','customer_crm','dynamic_stock_matrix','bulk_excel_import','auto_stock_and_alerts'], 2),
('tier_3', 'Tier 3 — Multi-Branch System', 295000, 150000, 10, 5, ARRAY['mobile_pc_access','rbac_logins','bill_designer','gst_billing_pdf','discounts_returns_payments','analytics_basic','data_exports_gst','daily_backups','customer_crm','dynamic_stock_matrix','bulk_excel_import','auto_stock_and_alerts','multi_branch_ledgers','supplier_and_production','stock_transfers','owner_profit_analytics'], 3),
('tier_4', 'Tier 4 — Complete + Website & PDF', 385000, 190000, 15, 10, ARRAY['mobile_pc_access','rbac_logins','bill_designer','gst_billing_pdf','discounts_returns_payments','analytics_basic','data_exports_gst','daily_backups','customer_crm','dynamic_stock_matrix','bulk_excel_import','auto_stock_and_alerts','multi_branch_ledgers','supplier_and_production','stock_transfers','owner_profit_analytics','public_website_cms','pdf_catalogue_export'], 4)
ON CONFLICT (tier_key) DO UPDATE SET
  name = EXCLUDED.name, market_price_inr = EXCLUDED.market_price_inr, price_inr = EXCLUDED.price_inr, features = EXCLUDED.features;

INSERT INTO public.feature_definitions (feature_key, min_tier, label, category, description) VALUES
('mobile_pc_access', 'tier_1', 'Mobile & PC Access', 'Core', 'Responsive PWA & offline-first remote control'),
('rbac_logins', 'tier_1', 'Owner, Admin & Worker Logins', 'Core', 'Role-based logins, password resets & matrix'),
('bill_designer', 'tier_1', 'Custom Bill Design & Print', 'Billing', 'A4 / 80mm / 58mm designer & POS layout'),
('gst_billing_pdf', 'tier_1', 'GST Bills & PDF Download', 'Billing', 'Local & outstation GST billing + PDFs'),
('discounts_returns_payments', 'tier_1', 'Discounts, Returns & Split Pay', 'Billing', 'Discounts, returns, size exchanges & Cash/UPI/Card'),
('analytics_basic', 'tier_1', 'Sales & Cashflow Dashboards', 'Analytics', 'Daily sales & Day-End cash reconciliation'),
('data_exports_gst', 'tier_1', 'Excel / CSV / PDF GST Reports', 'Reports', 'GSTR-1, HSN, Purchase ITC & e-Way/IRP JSON'),
('daily_backups', 'tier_1', 'Daily Backups + 1-Click Download', 'Core', 'Automated compressed daily backups to R2'),
('customer_crm', 'tier_2', 'Customer & Wholesale CRM', 'CRM', 'Retail & wholesale ledgers, aging & dues'),
('dynamic_stock_matrix', 'tier_2', 'Size, Colour & Attribute Matrix', 'Inventory', 'Dynamic variants, matrix & Legal Metrology labels'),
('bulk_excel_import', 'tier_2', 'Bulk Stock & Price Import', 'Inventory', 'Dynamic Excel/CSV import with atomic commit'),
('auto_stock_and_alerts', 'tier_2', 'Auto Stock Minus & Alerts', 'Inventory', 'Atomic deduction, low-stock & broken-size alerts'),
('multi_branch_ledgers', 'tier_3', 'Separate Branch Stock Ledgers', 'Multi-Branch', 'Independent stock & immutable ledgers per branch'),
('supplier_and_production', 'tier_3', 'Suppliers, Purchases & Factory', 'Operations', 'Suppliers, purchases, dues & production batches'),
('stock_transfers', 'tier_3', 'Factory-to-Shop Transfers', 'Multi-Branch', 'Size-run dispatch, GSTIN invoice/challan & receive'),
('owner_profit_analytics', 'tier_3', 'Combined Owner Profit Analytics', 'Analytics', 'Cross-branch revenue, weighted-avg COGS & net profit'),
('public_website_cms', 'tier_4', 'Live Website & Photo Showcase', 'Storefront', 'WebP R2 gallery & WhatsApp Inquiry Cart'),
('pdf_catalogue_export', 'tier_4', '1-Click PDF Catalogue Export', 'Storefront', 'WhatsApp-ready PDF brochure with price display toggle')
ON CONFLICT (feature_key) DO UPDATE SET label = EXCLUDED.label, min_tier = EXCLUDED.min_tier;

INSERT INTO public.permission_definitions (permission_key, feature_key, module, label, default_owner, default_branch_admin, default_worker) VALUES
('billing.view', 'gst_billing_pdf', 'Billing', 'View Invoices', true, true, true),
('billing.create', 'gst_billing_pdf', 'Billing', 'Create Bills & POS', true, true, true),
('billing.edit', 'gst_billing_pdf', 'Billing', 'Edit Drafts & Estimates', true, true, false),
('billing.apply_discount', 'discounts_returns_payments', 'Billing', 'Apply Discounts', true, true, false),
('billing.cancel', 'discounts_returns_payments', 'Billing', 'Cancel / Void Bills & Day-End Close', true, true, false),
('billing.process_return', 'discounts_returns_payments', 'Billing', 'Returns & Size Exchanges', true, true, false),
('billing.create_estimate', 'gst_billing_pdf', 'Billing', 'Create Non-GST Estimates', true, true, true),
('bill_designer.manage', 'bill_designer', 'Billing', 'Customize Bill & Print Layout', true, false, false),
('analytics.view_sales', 'analytics_basic', 'Analytics', 'View Sales & Cashflow', true, true, false),
('analytics.view_profit', 'owner_profit_analytics', 'Analytics', 'View Cost & Profit Margins', true, false, false),
('reports.export_gst', 'data_exports_gst', 'Reports', 'Export GST & Sales Reports', true, true, false),
('backups.manage', 'daily_backups', 'Settings', 'Trigger & Download Backups', true, false, false),
('customers.view', 'customer_crm', 'Customers', 'View Customer CRM & Dues', true, true, true),
('customers.manage', 'customer_crm', 'Customers', 'Add/Edit Customers & Collect Dues', true, true, true),
('stock.view', 'dynamic_stock_matrix', 'Inventory', 'View Stock Matrix & Alerts', true, true, true),
('stock.manage', 'dynamic_stock_matrix', 'Inventory', 'Create Products, Variants & Labels', true, true, false),
('stock.record_incoming', 'auto_stock_and_alerts', 'Inventory', 'Record Incoming / Stock Count', true, true, true),
('stock.bulk_import', 'bulk_excel_import', 'Inventory', 'Bulk Excel/CSV Import', true, true, false),
('stock.view_ledger', 'multi_branch_ledgers', 'Multi-Branch', 'View Branch Stock Ledgers', true, true, false),
('suppliers.manage', 'supplier_and_production', 'Operations', 'Suppliers, Purchases & Dues', true, true, false),
('production.record', 'supplier_and_production', 'Operations', 'Record Production Batches', true, true, false),
('transfers.dispatch', 'stock_transfers', 'Multi-Branch', 'Dispatch Branch Transfers', true, true, false),
('transfers.receive', 'stock_transfers', 'Multi-Branch', 'Receive Branch Transfers', true, true, true),
('website.manage', 'public_website_cms', 'Storefront', 'Manage Website & Photos', true, false, false),
('catalogue.export', 'pdf_catalogue_export', 'Storefront', 'Export PDF Catalogue', true, true, false),
('settings.catalog_schema', 'dynamic_stock_matrix', 'Settings', 'Edit Variant Axes & Custom Fields', true, false, false),
('settings.tax_and_hsn', 'gst_billing_pdf', 'Settings', 'Edit Tax Mode & HSN Codes', true, false, false),
('settings.staff_and_roles', 'rbac_logins', 'Settings', 'Manage Role Permissions', true, false, false),
('staff.create', 'rbac_logins', 'Settings', 'Add & Manage Staff Accounts', true, false, false),
('staff.reset_password', 'rbac_logins', 'Settings', 'Reset Staff Passwords', true, false, false)
ON CONFLICT (permission_key) DO UPDATE SET label = EXCLUDED.label, default_owner = EXCLUDED.default_owner, default_branch_admin = EXCLUDED.default_branch_admin, default_worker = EXCLUDED.default_worker;

INSERT INTO public.vertical_presets (vertical_key, name, default_uom, allow_decimal, default_hsn_prefixes) VALUES
('footwear', 'Footwear (Factory, Wholesale & Retail)', 'Pair', false, ARRAY['6401','6402','6403','6404','6405','6406']),
('apparel', 'Apparel & Garments', 'Piece', false, ARRAY['6105','6109','6203','6204']),
('electronics', 'Electronics & Mobile', 'Unit', false, ARRAY['8517','8471','8528','8504']),
('fmcg', 'Grocery & FMCG', 'Pack', true, ARRAY['0901','1905','2106','3401']),
('hardware', 'Hardware & Industrial', 'Piece', true, ARRAY['7318','8302','8481','3917']),
('custom', 'Custom Business', 'Unit', true, ARRAY[]::text[])
ON CONFLICT (vertical_key) DO UPDATE SET name = EXCLUDED.name, default_uom = EXCLUDED.default_uom;

-- Master Indian HSN / SAC Directory (including 2025-2026 Footwear Rs 2,500 threshold slabs)
INSERT INTO public.hsn_codes (tenant_id, code, description, category, rate_rule_type, threshold_amount, rate_below_threshold, rate_above_threshold, default_gst_rate) VALUES
-- Footwear Chapter 64 (2025-2026: <= 2500/pair = 5%, > 2500/pair = 18%)
(NULL, '6401', 'Waterproof footwear with outer soles and uppers of rubber or plastics', 'Footwear', 'price_threshold', 2500.00, 5.00, 18.00, 5.00),
(NULL, '6402', 'Other footwear with outer soles & uppers of rubber/plastics (Sports, Slippers, EVA, PVC)', 'Footwear', 'price_threshold', 2500.00, 5.00, 18.00, 5.00),
(NULL, '640299', 'Rubber/plastic casual sandals, slides & clogs', 'Footwear', 'price_threshold', 2500.00, 5.00, 18.00, 5.00),
(NULL, '6403', 'Footwear with leather uppers & rubber/plastic/leather outer soles (Formal, Boots, Safety)', 'Footwear', 'price_threshold', 2500.00, 5.00, 18.00, 5.00),
(NULL, '640399', 'Leather formal shoes, loafers, derby & brogues', 'Footwear', 'price_threshold', 2500.00, 5.00, 18.00, 5.00),
(NULL, '6404', 'Footwear with textile/canvas/mesh uppers (Sneakers & Running shoes)', 'Footwear', 'price_threshold', 2500.00, 5.00, 18.00, 5.00),
(NULL, '640411', 'Sports footwear, tennis/running shoes with textile uppers', 'Footwear', 'price_threshold', 2500.00, 5.00, 18.00, 5.00),
(NULL, '6405', 'Other footwear (Ethnic Juttis, Mojris, handcrafted footwear)', 'Footwear', 'price_threshold', 2500.00, 5.00, 18.00, 5.00),
(NULL, '6406', 'Parts of footwear (Uppers, Soles, Heels, Insoles — flat 18% GST)', 'Footwear Parts', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '640620', 'Outer soles and heels of rubber or plastics', 'Footwear Parts', 'flat', NULL, NULL, NULL, 18.00),
-- Leather & Raw Materials
(NULL, '4107', 'Leather further prepared after tanning or crusting', 'Raw Material', 'flat', NULL, NULL, NULL, 12.00),
(NULL, '3506', 'Prepared glues and adhesives for footwear manufacturing', 'Raw Material', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '4819', 'Cartons, shoe boxes & corrugated packing cases', 'Packaging', 'flat', NULL, NULL, NULL, 12.00),
-- Apparel
(NULL, '6105', 'Men or boys shirts, knitted or crocheted', 'Apparel', 'price_threshold', 1000.00, 5.00, 12.00, 5.00),
(NULL, '6109', 'T-shirts, singlets and other vests', 'Apparel', 'price_threshold', 1000.00, 5.00, 12.00, 5.00),
(NULL, '6203', 'Men trousers, jeans & suits', 'Apparel', 'price_threshold', 1000.00, 5.00, 12.00, 5.00),
(NULL, '6204', 'Women dresses, kurtis & trousers', 'Apparel', 'price_threshold', 1000.00, 5.00, 12.00, 5.00),
(NULL, '6115', 'Socks, hosiery & footwear accessories', 'Apparel', 'price_threshold', 1000.00, 5.00, 12.00, 5.00),
-- Electronics
(NULL, '8517', 'Smartphones, mobile phones & networking equipment', 'Electronics', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '8471', 'Laptops, desktops & POS terminals', 'Electronics', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '8504', 'Chargers, power adapters & UPS', 'Electronics', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '8528', 'Monitors, TVs & display panels', 'Electronics', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '8518', 'Headphones, earbuds & speakers', 'Electronics', 'flat', NULL, NULL, NULL, 18.00),
-- FMCG & Grocery
(NULL, '0901', 'Coffee & roasted coffee beans', 'FMCG', 'flat', NULL, NULL, NULL, 5.00),
(NULL, '0902', 'Tea leaves & packaged tea', 'FMCG', 'flat', NULL, NULL, NULL, 5.00),
(NULL, '1905', 'Biscuits, bakery & rusks', 'FMCG', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '2106', 'Food preparations & packaged mixes', 'FMCG', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '3401', 'Soaps & organic surface-active bars', 'FMCG', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '2202', 'Aerated / sweetened beverages (40% slab item)', 'FMCG', 'flat', NULL, NULL, NULL, 40.00),
-- Hardware & Industrial
(NULL, '7318', 'Screws, bolts, nuts, washers of iron or steel', 'Hardware', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '8302', 'Base metal mountings, hinges & door fittings', 'Hardware', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '8481', 'Taps, cocks, valves & plumbing fittings', 'Hardware', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '3917', 'PVC pipes, tubes and hoses', 'Hardware', 'flat', NULL, NULL, NULL, 18.00),
(NULL, '3208', 'Paints and varnishes', 'Hardware', 'flat', NULL, NULL, NULL, 18.00),
-- Services (SAC)
(NULL, '9965', 'Goods transport / freight charges', 'Services (SAC)', 'flat', NULL, NULL, NULL, 5.00),
(NULL, '9983', 'Software & IT support services', 'Services (SAC)', 'flat', NULL, NULL, NULL, 18.00)
ON CONFLICT DO NOTHING;
