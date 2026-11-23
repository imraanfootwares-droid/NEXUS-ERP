import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { Pool } from "pg";
import { generateTempPassword, hashPassword } from "../src/lib/auth/crypto";
import { VERTICAL_PRESETS } from "../src/lib/catalog/verticals";
import { PERMISSION_DEFINITIONS } from "../src/lib/constants/saas";

async function main() {
  const url =
    process.env.DATABASE_URL_MIGRATE ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL_MIGRATE is required.");

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: string }>(
      "SELECT id FROM public.tenants WHERE slug = 'imraan-footwear'"
    );
    if (existing.rows.length > 0) {
      console.log("✓ Demo tenant 'imraan-footwear' already exists.");
      await client.query("ROLLBACK");
      return;
    }

    // 1. Create Imraan Footwear at Tier 4
    const tenantRes = await client.query<{ id: string }>(
      `INSERT INTO public.tenants (name, slug, vertical_key, tier, max_users, max_branches, brand_config, storefront_config)
       VALUES ($1, $2, 'footwear', 'tier_4', 10, 5, $3, $4)
       RETURNING id`,
      [
        "Imraan Footwear",
        "imraan-footwear",
        JSON.stringify({
          ui_style: "style_4",
          primary_color: "#0284c7",
          tagline: "Handcrafted Leather & Sports Footwear",
          manufacturer_info: "Imraan Footwear Pvt Ltd, Karol Bagh Industrial Area, New Delhi 110005",
          customer_care: "+91 98765 43210",
        }),
        JSON.stringify({
          price_display: "retail",
          catalogue_price_display: "retail",
          whatsapp_number: "919876543210",
          hero_title: "New Arrivals — Direct from Factory",
          hero_subtitle: "Premium leather formals, sneakers & ethnic footwear from New Delhi & Chennai.",
        }),
      ]
    );
    const tenantId = tenantRes.rows[0].id;

    // 2. Seed all 30 x 3 role permissions
    for (const p of PERMISSION_DEFINITIONS) {
      for (const role of ["owner", "branch_admin", "worker"] as const) {
        await client.query(
          `INSERT INTO public.tenant_role_permissions (tenant_id, role, permission_key, allowed)
           VALUES ($1, $2, $3, $4)`,
          [tenantId, role, p.key, p[role]]
        );
      }
    }

    // 3. Seed Footwear Preset (UOM, Axes, Custom Fields)
    const preset = VERTICAL_PRESETS.footwear;
    await client.query(
      "INSERT INTO public.uoms (tenant_id, code, allow_decimal) VALUES ($1, $2, $3)",
      [tenantId, preset.defaultUom, preset.allowDecimal]
    );
    for (let i = 0; i < preset.defaultAxes.length; i++) {
      const ax = preset.defaultAxes[i];
      await client.query(
        `INSERT INTO public.variant_axis_definitions (tenant_id, name, preset_values, ratio_presets, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, ax.name, ax.preset_values, JSON.stringify(ax.ratio_presets), i]
      );
    }
    for (let i = 0; i < preset.defaultCustomFields.length; i++) {
      const cf = preset.defaultCustomFields[i];
      await client.query(
        `INSERT INTO public.custom_field_definitions (tenant_id, field_key, label, field_type, options, show_on_bill, show_on_website, show_in_catalogue, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [tenantId, cf.field_key, cf.label, cf.field_type, cf.options, cf.show_on_bill, cf.show_on_website, cf.show_in_catalogue, i]
      );
    }

    // 4. Branches: New Delhi Factory (07) & Chennai Retail Shop (33)
    const delRes = await client.query<{ id: string }>(
      `INSERT INTO public.branches (tenant_id, name, code, type, gstin, state_code, address, is_default)
       VALUES ($1, 'New Delhi Factory', 'DEL', 'factory', '07AABCI1234F1Z5', '07', 'Karol Bagh Industrial Area, New Delhi', false)
       RETURNING id`,
      [tenantId]
    );
    const chnRes = await client.query<{ id: string }>(
      `INSERT INTO public.branches (tenant_id, name, code, type, gstin, state_code, address, is_default)
       VALUES ($1, 'Chennai Retail Shop', 'CHN', 'retail', '33AABCI1234F1Z2', '33', 'T. Nagar Main Road, Chennai', true)
       RETURNING id`,
      [tenantId]
    );
    const delId = delRes.rows[0].id;
    const chnId = chnRes.rows[0].id;

    // 5. Register initial POS Device #1 for Chennai & Delhi
    await client.query(
      "INSERT INTO public.devices (tenant_id, branch_id, device_no, label) VALUES ($1, $2, 1, 'Chennai Counter 1'), ($1, $3, 1, 'Delhi Dispatch PC')",
      [tenantId, chnId, delId]
    );

    // 6. Staff accounts with random passwords (must_change_password = true)
    const ownerPw = generateTempPassword(10);
    const adminPw = generateTempPassword(10);
    const workerPw = generateTempPassword(10);

    const ownerRes = await client.query<{ id: string }>(
      `INSERT INTO public.profiles (tenant_id, role, full_name, email, username, password_hash, must_change_password)
       VALUES ($1, 'owner', 'Imraan Khan', 'imraan@imraanfootwear.in', 'imraan', $2, true) RETURNING id`,
      [tenantId, hashPassword(ownerPw)]
    );
    const adminRes = await client.query<{ id: string }>(
      `INSERT INTO public.profiles (tenant_id, role, full_name, username, password_hash, must_change_password)
       VALUES ($1, 'branch_admin', 'Delhi Manager', 'delhi_mgr', $2, true) RETURNING id`,
      [tenantId, hashPassword(adminPw)]
    );
    const workerRes = await client.query<{ id: string }>(
      `INSERT INTO public.profiles (tenant_id, role, full_name, username, password_hash, must_change_password)
       VALUES ($1, 'worker', 'Chennai Counter', 'chn_staff', $2, true) RETURNING id`,
      [tenantId, hashPassword(workerPw)]
    );

    await client.query(
      "INSERT INTO public.user_branch_assignments (user_id, branch_id, tenant_id) VALUES ($1, $2, $4), ($3, $5, $4)",
      [adminRes.rows[0].id, delId, workerRes.rows[0].id, tenantId, chnId]
    );

    // 7. Default A4 + 80mm Bill Templates
    await client.query(
      `INSERT INTO public.bill_templates (tenant_id, name, format, is_default, config) VALUES
       ($1, 'Standard A4 GST Invoice', 'a4', true, '{"header_title":"IMRAAN FOOTWEAR","header_subtitle":"New Delhi & Chennai","footer_note":"Thank you for shopping with us!","terms":"Exchange within 7 days with original box & bill.","accent_color":"#0284c7","show_logo":true,"show_hsn":true,"show_gst_summary":true,"show_discount":true,"show_custom_fields":false,"show_upi_qr":true}'::jsonb),
       ($1, '80mm Thermal Counter Receipt', 'thermal_80mm', false, '{"header_title":"IMRAAN FOOTWEAR","header_subtitle":"T. Nagar, Chennai","footer_note":"Visit Again!","terms":"7-day size exchange only.","accent_color":"#0f172a","show_logo":true,"show_hsn":true,"show_gst_summary":true,"show_discount":true,"show_custom_fields":false,"show_upi_qr":false}'::jsonb)`,
      [tenantId]
    );

    // 8. Sample Footwear Models + Variants + Stock
    const sampleModels = [
      { code: "IMR-101", name: "Oxford Classic Derby", cat: "Formal", hsn: "6403", gst: 5, cost: 950, mrp: 2499, sell: 2199, whole: 1450, mat: "Genuine Leather", sole: "TPR", gender: "Men" },
      { code: "IMR-102", name: "Milan Tan Loafer", cat: "Formal", hsn: "6403", gst: 18, cost: 1400, mrp: 3499, sell: 2999, whole: 2100, mat: "Genuine Leather", sole: "Leather", gender: "Men" },
      { code: "IMR-201", name: "AeroStride Runner", cat: "Sports", hsn: "6404", gst: 5, cost: 620, mrp: 1899, sell: 1599, whole: 1050, mat: "Mesh / Knit", sole: "EVA", gender: "Unisex" },
      { code: "IMR-301", name: "Comfort Slide Pro", cat: "Casual", hsn: "6402", gst: 5, cost: 210, mrp: 699, sell: 599, whole: 380, mat: "EVA / Rubber", sole: "EVA", gender: "Unisex" },
    ];

    for (const m of sampleModels) {
      const pRes = await client.query<{ id: string }>(
        `INSERT INTO public.products (tenant_id, model_code, name, category, brand, uom, hsn_code, gst_rate, custom_fields, is_published_web, is_new_arrival)
         VALUES ($1, $2, $3, $4, 'Imraan', 'Pair', $5, $6, $7, true, true) RETURNING id`,
        [tenantId, m.code, m.name, m.cat, m.hsn, m.gst, JSON.stringify({ upper_material: m.mat, sole_type: m.sole, gender: m.gender })]
      );
      const pid = pRes.rows[0].id;
      for (const size of ["UK 7", "UK 8", "UK 9", "UK 10"]) {
        for (const color of ["Black", "Tan"]) {
          const sku = `${m.code}-${size.replace(/\s+/g, "")}-${color.slice(0, 3).toUpperCase()}`;
          const vRes = await client.query<{ id: string }>(
            `INSERT INTO public.product_variants (tenant_id, product_id, sku, barcode, attributes, cost_price, avg_cost, mrp, selling_price, wholesale_price, low_stock_threshold)
             VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, 5) RETURNING id`,
            [tenantId, pid, sku, sku, JSON.stringify({ Size: size, Colour: color }), m.cost, m.mrp, m.sell, m.whole]
          );
          const vid = vRes.rows[0].id;
          // Factory stock 40, Chennai stock 12
          await client.query(
            "INSERT INTO public.branch_stock (tenant_id, branch_id, variant_id, quantity) VALUES ($1, $2, $3, 40), ($1, $4, $3, 12)",
            [tenantId, delId, vid, chnId]
          );
        }
      }
    }

    // 9. Sample Retail & Wholesale Customer + Supplier
    await client.query(
      `INSERT INTO public.customers (tenant_id, name, phone, gstin, state_code, customer_type, default_discount_pct, credit_limit, credit_days)
       VALUES
       ($1, 'South India Shoe Mart (Wholesale)', '9840011223', '33AABCS1234E1Z1', '33', 'wholesale', 5, 200000, 30),
       ($1, 'Karthik R.', '9840099887', NULL, '33', 'retail', 0, 0, 0)`,
      [tenantId]
    );
    await client.query(
      `INSERT INTO public.suppliers (tenant_id, name, phone, gstin, state_code, material_type)
       VALUES ($1, 'Agra Leather & Soles Co.', '9811122334', '09AABCA5678G1Z9', '09', 'Leather & TPR Soles')`,
      [tenantId]
    );

    await client.query("COMMIT");

    console.log("✓ Seeded Demo Tenant: Imraan Footwear (slug: imraan-footwear)");
    console.log(`  Owner   (${ownerRes.rows[0].id}): imraan@imraanfootwear.in / username: imraan | Password: ${ownerPw}`);
    console.log(`  Manager (DEL): username: imraan-footwear/delhi_mgr | Password: ${adminPw}`);
    console.log(`  Worker  (CHN): username: imraan-footwear/chn_staff | Password: ${workerPw}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
