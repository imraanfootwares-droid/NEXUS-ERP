# Nexus ERP: Footwear Quick Guide

From creating a product to billing and exporting your data.

## How it works

```text
Setup → Add Product → Add Stock → Print Barcodes → Move to Shop → Bill → Reports → Export
```

- **Product (Article):** one shoe model, such as `IF-101 Leather Derby`.
- **Variant (SKU):** one exact pair type, such as `UK 8 / Black`. Stock and barcodes work per variant.
- **Branch:** a factory or shop. Each branch has its own stock.
- **GST:** footwear up to ₹2,500 per pair is 5%. Above ₹2,500 is 18%. Footwear parts are a flat 18%.
- **Offline:** billing continues without internet. Bills sync when the device reconnects.

## Step by step

### 1. Set up the business (one time)

Open **System Settings**:

| Tab | What to do |
|---|---|
| Brand & UI Style | Add business name and logo details |
| Tax & GST | Check GST settings |
| Branches | Add factory and shops, with GSTIN if registered |
| Staff & Resets | Add staff and assign branches |
| Catalog Schema | Check sizes and colours. Add `UK 4` if you sell ladies' sizes |

### 2. Create a product

1. Go to **Stock & Matrix → Add Product**.
2. Enter **Model / Article Code** and **Product Name**.
3. Add category and brand. Keep UOM as **Pair**.
4. Choose the **HSN** code. GST fills in automatically.
5. Enter **Cost, MRP, Retail and Wholesale** prices.
6. Select **Sizes** and **Colours**.
7. Add a photo (optional), then click **Save Product & Generate Variants**.

Example: 5 sizes × 2 colours creates 10 variants.

> Many products? Use **Stock & Matrix → Import**.

### 3. Add stock

**Already have stock:**

1. Go to **Stock & Matrix → Alerts**. New variants appear here with 0 stock.
2. Click **Restock** and choose the branch.
3. Enter the quantity, select **Opening Stock**, then click **Apply Stock Change**.

**Making it in the factory:**

1. Go to **Factory & Transfers → Production Batches**.
2. Choose the factory, stage, cost and karigar, then add variants.
3. Click **Save Production Batch**.
4. When finished, click **Mark Packed**. Only then is stock added.

**Buying from a supplier:** go to **Suppliers & Purchases → Record Purchase Order**.

### 4. Print barcodes

Go to **Stock & Matrix → Barcodes** and print the labels. Stick them on the boxes. One sheet shows up to 60 labels.

### 5. Send stock to a shop

1. Go to **Factory & Transfers → Branch Transfers**.
2. Choose **From** and **To** branches, then add variants and quantity.
3. Click **Dispatch & Print Document**. The app creates a challan or tax invoice automatically.
4. At the shop, click **Receive / Verify** and note any shortage or damage.

### 6. Bill the customer

1. Open **POS Terminal** and check the branch.
2. Scan the barcode, or search and tap the product.
3. Use **− / +** to change quantity.
4. Enter customer **name and phone**. They are saved to **Customer List**.
5. Add a discount if needed.
6. Tap **Cash, UPI or Card**, or type amounts to split the payment.
7. Click **Finalize & Print**. Use **Hold** to save the bill for later.

**Wholesale:** select a wholesale customer, then use **Size-Run**. Choose the article, carton ratio (such as `1:2:3:2:1`), **colour** and number of cartons. For two colours, fill Size-Run once per colour.

### 7. Close the day

Go to **GST & Reports**:

- **Expenses:** record shop expenses.
- **Day-End Cash Reconciliation:** match counter cash and close the day.

### 8. Export your data

| Need | Where | Format |
|---|---|---|
| GST and accounting reports | **GST & Reports → GST & Accounting Exports** | Choose date range and format |
| Current stock value | **Stock & Matrix → Export** | Excel |
| **All business data** | **System Settings → Backups → Export All Business Data** | Excel, CSV or PDF |

- **Excel or CSV** has complete data. Use these for safekeeping.
- **PDF** is a readable summary, limited to 300 rows and 7 columns per table.
- Files save to your computer or phone's **Downloads** folder.

## Automatic backups

- Run about every 8 hours while the app is in use, plus once every night.
- Unchanged data is skipped to stay within the free plan.
- Download past backups from **System Settings → Backups**.
- Keep one Excel export outside the app every week for extra safety.

## Daily checklist

- [ ] Morning: check **Alerts** for low stock
- [ ] Receive any incoming transfers
- [ ] Bill all sales through **POS Terminal**
- [ ] Record expenses
- [ ] Close the day in **Day-End Cash Reconciliation**
- [ ] Weekly: download **Export All Business Data** in Excel
