"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  Download,
  Grid3X3,
  ImagePlus,
  IndianRupee,
  LayoutGrid,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  adjustStockAction,
  createProductWithVariantsAction,
  deleteProductAction,
  restoreProductAction,
  updateProductAction,
} from "@/actions/inventory";
import { confirmProductImageAction } from "@/actions/storefront";
import { BarcodeLabelSheet } from "@/components/stock/barcode-sheet";
import { CustomFieldRenderer, HsnCombobox, VariantMatrixGrid } from "@/components/ui/dynamic-fields";
import { KpiGrid } from "@/components/ui/kpi-grid";
import { Alert, Badge, Button, Card, CardContent, Dialog, Input, Label, Select, Switch } from "@/components/ui/primitives";
import { generateVariantCombinations } from "@/lib/catalog/verticals";
import { uploadProductPhotoToStorage } from "@/lib/storage/image-compress";
import type { BranchRow, CustomFieldRow, HsnCodeRow, TenantRow, VariantAxisRow } from "@/types/database";

interface VariantRowData {
  variant_id: string;
  product_id: string;
  model_code: string;
  product_name: string;
  category: string | null;
  brand: string | null;
  hsn_code: string | null;
  gst_rate: string;
  is_active: boolean;
  thumb_url?: string | null;
  uom: string;
  sku: string;
  barcode: string | null;
  attributes: Record<string, string>;
  cost_price: string;
  mrp: string;
  selling_price: string;
  wholesale_price: string;
  low_stock_threshold: string;
  branch_id: string | null;
  branch_name: string | null;
  quantity: string | null;
}

interface ProductGroup {
  product_id: string;
  model_code: string;
  product_name: string;
  category: string | null;
  brand: string | null;
  hsn_code: string | null;
  gst_rate: number;
  is_active: boolean;
  thumb_url: string | null;
  uom: string;
  cost_price: number;
  mrp: number;
  selling_price: number;
  wholesale_price: number;
  total_qty: number;
  target_capacity: number;
  unique_variant_count: number;
  status: "active" | "low_stock" | "out_of_stock" | "archived";
  items: VariantRowData[];
}

export function StockHubClient({
  tenant,
  branches,
  axes,
  customFields,
  hsnList,
  uoms = ["Pair", "Piece", "Box"],
  variants,
  ledger,
  canManage,
  canAdjust,
  canBulkImport = false,
  ledgerEnabled,
}: {
  tenant: TenantRow;
  branches: BranchRow[];
  axes: VariantAxisRow[];
  customFields: CustomFieldRow[];
  hsnList: HsnCodeRow[];
  uoms?: string[];
  variants: VariantRowData[];
  ledger: Array<{
    id: string;
    branch_name: string;
    sku: string;
    change_qty: string;
    balance_after: string;
    reason: string;
    notes: string | null;
    created_at: string;
  }>;
  canManage: boolean;
  canAdjust: boolean;
  canBulkImport?: boolean;
  ledgerEnabled: boolean;
}) {
  const router = useRouter();
  const [section, setSection] = useState<"catalog" | "alerts" | "labels" | "ledger">("catalog");
  const [viewMode, setViewMode] = useState<"cards" | "matrix">("cards");
  const [showStats, setShowStats] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "low" | "out" | "archived">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "price_desc" | "stock_asc">("name");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");

  // Create modal state
  const [addOpen, setAddOpen] = useState(false);
  const [modelCode, setModelCode] = useState("");
  const [prodName, setProdName] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [uom, setUom] = useState(uoms[0] || "Pair");
  const [hsnCode, setHsnCode] = useState("6403");
  const [gstRate, setGstRate] = useState(5);
  const [costPrice, setCostPrice] = useState(0);
  const [mrp, setMrp] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [wholesalePrice, setWholesalePrice] = useState(0);
  const [cfValues, setCfValues] = useState<Record<string, string | number | boolean | null>>({});
  const [selectedAxisVals, setSelectedAxisVals] = useState<Record<string, string[]>>({});
  const [newProdPhoto, setNewProdPhoto] = useState<File | null>(null);
  const [uploadingProdId, setUploadingProdId] = useState<string | null>(null);

  // Edit product modal state
  const [editTarget, setEditTarget] = useState<ProductGroup | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editUom, setEditUom] = useState("Pair");
  const [editHsn, setEditHsn] = useState("");
  const [editGst, setEditGst] = useState(5);
  const [editCost, setEditCost] = useState(0);
  const [editMrp, setEditMrp] = useState(0);
  const [editRetail, setEditRetail] = useState(0);
  const [editWholesale, setEditWholesale] = useState(0);

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState<ProductGroup | null>(null);

  // Variant drawer / stock adjustment modal
  const [inspectGroup, setInspectGroup] = useState<ProductGroup | null>(null);
  const [adjTarget, setAdjTarget] = useState<VariantRowData | null>(null);
  const [adjBranch, setAdjBranch] = useState(branches[0]?.id ?? "");
  const [adjQty, setAdjQty] = useState(0);
  const [adjReason, setAdjReason] = useState<"opening" | "adjustment" | "stock_count">("adjustment");

  const openEditModal = (g: ProductGroup) => {
    setEditTarget(g);
    setEditCode(g.model_code);
    setEditName(g.product_name);
    setEditCat(g.category ?? "");
    setEditBrand(g.brand ?? "");
    setEditUom(g.uom);
    setEditHsn(g.hsn_code ?? "");
    setEditGst(g.gst_rate);
    setEditCost(g.cost_price);
    setEditMrp(g.mrp);
    setEditRetail(g.selling_price);
    setEditWholesale(g.wholesale_price);
  };

  const handleUploadProductPhoto = async (productId: string, file: File) => {
    setUploadingProdId(productId);
    try {
      const { fullKey, via } = await uploadProductPhotoToStorage(file);
      await confirmProductImageAction(productId, fullKey, true);
      toast.success(
        via === "r2"
          ? "WebP product photo uploaded to Cloudflare R2!"
          : "Product photo updated (Dev Preview — live on POS & Storefront)!"
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploadingProdId(null);
    }
  };

  const filteredByBranch = useMemo(() => {
    if (branchFilter === "ALL") return variants;
    return variants.filter((v) => v.branch_id === branchFilter || v.branch_id === null);
  }, [variants, branchFilter]);

  const productGroups = useMemo<ProductGroup[]>(() => {
    const byProd = new Map<string, VariantRowData[]>();
    for (const v of filteredByBranch) {
      const arr = byProd.get(v.product_id) ?? [];
      arr.push(v);
      byProd.set(v.product_id, arr);
    }

    const groups: ProductGroup[] = [];
    for (const [product_id, items] of byProd.entries()) {
      const first = items[0];
      const uniqueIds = new Set(items.map((i) => i.variant_id));
      const totalQty = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
      const anyLow = items.some((i) => Number(i.quantity ?? 0) <= Number(i.low_stock_threshold));
      const targetCap = Math.max(totalQty, uniqueIds.size * 30, 50);
      const status: ProductGroup["status"] = !first.is_active
        ? "archived"
        : totalQty <= 0
        ? "out_of_stock"
        : anyLow
        ? "low_stock"
        : "active";

      groups.push({
        product_id,
        model_code: first.model_code,
        product_name: first.product_name,
        category: first.category,
        brand: first.brand,
        hsn_code: first.hsn_code,
        gst_rate: Number(first.gst_rate ?? 5),
        is_active: first.is_active,
        thumb_url: first.thumb_url ?? null,
        uom: first.uom,
        cost_price: Number(first.cost_price ?? 0),
        mrp: Number(first.mrp ?? 0),
        selling_price: Number(first.selling_price ?? 0),
        wholesale_price: Number(first.wholesale_price ?? 0),
        total_qty: totalQty,
        target_capacity: targetCap,
        unique_variant_count: uniqueIds.size,
        status,
        items,
      });
    }
    return groups;
  }, [filteredByBranch]);

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = productGroups.filter((g) => {
      if (statusFilter === "all" && g.status === "archived") return false;
      if (statusFilter === "available" && g.status !== "active") return false;
      if (statusFilter === "low" && g.status !== "low_stock") return false;
      if (statusFilter === "out" && g.status !== "out_of_stock") return false;
      if (statusFilter === "archived" && g.status !== "archived") return false;
      if (!q) return true;
      return (
        g.product_name.toLowerCase().includes(q) ||
        g.model_code.toLowerCase().includes(q) ||
        (g.category ?? "").toLowerCase().includes(q) ||
        g.items.some((i) => i.sku.toLowerCase().includes(q))
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "price_desc") return b.selling_price - a.selling_price;
      if (sortBy === "stock_asc") return a.total_qty - b.total_qty;
      return a.product_name.localeCompare(b.product_name);
    });
  }, [productGroups, statusFilter, search, sortBy]);

  const activeGroups = productGroups.filter((g) => g.is_active);
  const totalUnitsOnHand = activeGroups.reduce((s, g) => s + g.total_qty, 0);
  const totalStockValue = filteredByBranch
    .filter((v) => v.is_active)
    .reduce((s, v) => s + Number(v.quantity ?? 0) * Number(v.cost_price ?? 0), 0);

  const lowStockRows = useMemo(
    () => variants.filter((v) => v.is_active && Number(v.quantity ?? 0) <= Number(v.low_stock_threshold)),
    [variants]
  );

  const brokenSizeModels = useMemo(() => {
    const byModel = new Map<string, Array<{ size: string; qty: number }>>();
    for (const v of variants.filter((x) => x.is_active)) {
      const sz = v.attributes?.Size || v.attributes?.size;
      if (!sz) continue;
      const arr = byModel.get(v.model_code) ?? [];
      arr.push({ size: sz, qty: Number(v.quantity ?? 0) });
      byModel.set(v.model_code, arr);
    }
    const broken: string[] = [];
    for (const [code, list] of byModel.entries()) {
      const total = list.reduce((s, x) => s + x.qty, 0);
      const zeros = list.filter((x) => x.qty <= 0).length;
      if (total > 0 && zeros > 0 && list.length >= 3) broken.push(code);
    }
    return broken;
  }, [variants]);

  const uniqueVariantsForLabels = useMemo(() => {
    const seen = new Set<string>();
    return variants.filter((v) => {
      if (!v.is_active || seen.has(v.variant_id)) return false;
      seen.add(v.variant_id);
      return true;
    });
  }, [variants]);

  const toggleAxisVal = (axisName: string, val: string) => {
    setSelectedAxisVals((prev) => {
      const cur = prev[axisName] ?? [];
      return {
        ...prev,
        [axisName]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val],
      };
    });
  };

  return (
    <div className="space-y-5">
      {/* Catalox-style Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">Products &amp; Stock</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage all your products, pricing, inventory, variants, and R2 media in one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 pr-1">
            <span className="text-xs font-medium text-slate-600">Show Statistic</span>
            <Switch checked={showStats} onCheckedChange={setShowStats} />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              window.open("/api/exports/stock_valuation?format=xlsx", "_blank");
            }}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          {canBulkImport && (
            <Link
              href="/dashboard/stock/import"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </Link>
          )}
          {canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Catalox Sparkline Statistic Cards */}
      {showStats && (
        <KpiGrid
          items={[
            {
              label: "Total Products",
              value: activeGroups.length,
              subtext: `${uniqueVariantsForLabels.length} active SKU variants`,
              icon: <Package className="h-4 w-4" />,
              trend: "up",
            },
            {
              label: "Stock Valuation",
              value: `₹${Math.round(totalStockValue).toLocaleString("en-IN")}`,
              subtext: "Weighted avg inventory cost",
              icon: <IndianRupee className="h-4 w-4" />,
              trend: "up",
            },
            {
              label: "Units On Hand",
              value: totalUnitsOnHand.toLocaleString("en-IN"),
              subtext: `Across ${branches.length} branch(es)`,
              icon: <Boxes className="h-4 w-4" />,
              trend: "up",
            },
            {
              label: "Low & Broken Stock",
              value: lowStockRows.length,
              subtext: `${brokenSizeModels.length} broken size run(s)`,
              icon: <AlertTriangle className="h-4 w-4" />,
              tone: lowStockRows.length > 0 ? "warning" : "success",
              trend: lowStockRows.length > 0 ? "down" : "up",
            },
          ]}
        />
      )}

      {/* Catalox Search + Segmented Status Filter + View Switcher Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, model code or SKU..."
              className="pl-9 bg-white"
            />
          </div>

          <div className="w-44 shrink-0">
            <Select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs min-h-[38px]"
            >
              <option value="ALL">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Status Filter */}
          <div className="inline-flex rounded-xl bg-slate-100/90 p-1 border border-slate-200/70 overflow-x-auto no-scrollbar">
            {[
              { id: "all", label: "All" },
              { id: "available", label: "Available" },
              { id: "low", label: "Low Stock" },
              { id: "out", label: "Out Stock" },
              { id: "archived", label: "Archived" },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSection("catalog");
                  setStatusFilter(s.id as typeof statusFilter);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  section === "catalog" && statusFilter === s.id
                    ? "bg-white text-slate-900 font-semibold shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Grid / 2D Matrix / Tools switcher */}
          <div className="inline-flex rounded-xl border border-slate-200/90 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              title="Product Cards View"
              onClick={() => { setSection("catalog"); setViewMode("cards"); }}
              className={`rounded-lg p-2 cursor-pointer ${section === "catalog" && viewMode === "cards" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-700"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="2D Size × Colour Matrix View"
              onClick={() => { setSection("catalog"); setViewMode("matrix"); }}
              className={`rounded-lg p-2 cursor-pointer ${section === "catalog" && viewMode === "matrix" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-700"}`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs shadow-2xs">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="name">Sort: Name</option>
              <option value="price_desc">Sort: Price ↓</option>
              <option value="stock_asc">Sort: Stock ↑</option>
            </select>
          </div>

          {/* Secondary tabs for Alerts / Labels / Ledger */}
          <div className="inline-flex rounded-xl border border-slate-200/90 bg-white p-0.5 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setSection("alerts")}
              className={`rounded-lg px-2.5 py-1.5 font-medium cursor-pointer ${section === "alerts" ? "bg-amber-50 text-amber-800 font-semibold" : "text-slate-600 hover:text-slate-900"}`}
            >
              Alerts {lowStockRows.length > 0 ? `(${lowStockRows.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setSection("labels")}
              className={`rounded-lg px-2.5 py-1.5 font-medium cursor-pointer ${section === "labels" ? "bg-slate-100 text-slate-900 font-semibold" : "text-slate-600 hover:text-slate-900"}`}
            >
              Barcodes
            </button>
            {ledgerEnabled && (
              <button
                type="button"
                onClick={() => setSection("ledger")}
                className={`rounded-lg px-2.5 py-1.5 font-medium cursor-pointer ${section === "ledger" ? "bg-slate-100 text-slate-900 font-semibold" : "text-slate-600 hover:text-slate-900"}`}
              >
                Ledger
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CATALOX PRODUCT CARDS GRID */}
      {section === "catalog" && viewMode === "cards" && (
        visibleGroups.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-slate-500">
              No products match this filter.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleGroups.map((g) => {
              const stockPct = Math.min(100, Math.round((g.total_qty / Math.max(1, g.target_capacity)) * 100));
              const barColor =
                g.status === "out_of_stock"
                  ? "bg-rose-500"
                  : g.status === "low_stock"
                  ? "bg-amber-500"
                  : "bg-emerald-500";
              const statusBadge =
                g.status === "archived"
                  ? { label: "Archived", cls: "bg-slate-100 text-slate-600" }
                  : g.status === "out_of_stock"
                  ? { label: "Out Stock", cls: "bg-rose-50 text-rose-600" }
                  : g.status === "low_stock"
                  ? { label: "Low Stock", cls: "bg-amber-50 text-amber-700" }
                  : { label: "Active", cls: "bg-emerald-50 text-emerald-600" };

              return (
                <Card key={g.product_id} className="hover:border-slate-300 transition-all">
                  <CardContent className="p-4 space-y-3.5">
                    {/* Top Row: Thumbnail + Title/SKU + Edit/Delete buttons & Status pill */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <label
                          title={canManage ? "Click to upload/replace product photo (Cloudflare R2)" : g.product_name}
                          className={`relative h-16 w-16 rounded-xl border border-slate-200/80 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center group ${canManage ? "cursor-pointer" : ""}`}
                        >
                          {g.thumb_url ? (
                            <img src={g.thumb_url} alt={g.product_name} className="h-full w-full object-cover" />
                          ) : (
                            <ImagePlus className="h-5 w-5 text-slate-400" />
                          )}
                          {canManage && (
                            <>
                              <span className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Upload className="h-4 w-4" />
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadProductPhoto(g.product_id, f);
                                }}
                              />
                            </>
                          )}
                        </label>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm text-slate-900 truncate">{g.product_name}</h3>
                          <p className="text-xs text-slate-500 truncate">{g.category || g.brand || "Footwear"}</p>
                          <p className="text-[11px] font-mono text-slate-400 mt-1">SKU {g.model_code}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {canManage && (
                          <div className="flex items-center gap-1.5">
                            {g.status === "archived" ? (
                              <button
                                type="button"
                                title="Restore Product"
                                onClick={async () => {
                                  await restoreProductAction(g.product_id);
                                  toast.success(`Restored ${g.product_name}`);
                                  router.refresh();
                                }}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  title="Edit Product"
                                  onClick={() => openEditModal(g)}
                                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete / Archive Product"
                                  onClick={() => setDeleteTarget(g)}
                                  className="rounded-lg bg-rose-500 p-1.5 text-white hover:bg-rose-600 shadow-2xs cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusBadge.cls}`}>
                          {uploadingProdId === g.product_id ? "Uploading..." : statusBadge.label}
                        </span>
                      </div>
                    </div>

                    {/* Attribute / Category Pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {g.category && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {g.category}
                        </span>
                      )}
                      {g.hsn_code && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          HSN {g.hsn_code}
                        </span>
                      )}
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        GST {g.gst_rate}%
                      </span>
                      {g.brand && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {g.brand}
                        </span>
                      )}
                    </div>

                    {/* Stock Progress Bar */}
                    <div className="flex items-center gap-2.5 text-[11px]">
                      <span className="text-slate-500 shrink-0">Stock</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(g.total_qty > 0 ? 6 : 0, stockPct)}%` }} />
                      </div>
                      <span className="font-semibold text-slate-700 tabular-nums shrink-0">
                        {g.total_qty}/{g.target_capacity} {g.uom}
                      </span>
                    </div>

                    {/* Bottom Inset 3-Column Pricing & Variants Box */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 grid grid-cols-3 divide-x divide-slate-200/70">
                      <div className="p-2.5">
                        <p className="text-[10px] text-slate-500">Retail Price</p>
                        <p className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                          ₹{g.selling_price.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="p-2.5">
                        <p className="text-[10px] text-slate-500">Wholesale</p>
                        <p className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                          ₹{g.wholesale_price.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInspectGroup(g)}
                        className="p-2.5 text-left hover:bg-slate-100/80 transition-colors rounded-r-xl cursor-pointer"
                      >
                        <p className="text-[10px] text-slate-500 flex items-center gap-1">
                          Variants <SlidersHorizontal className="h-2.5 w-2.5 text-[#4B5A94]" />
                        </p>
                        <p className="text-sm font-bold text-[#4B5A94] mt-0.5 tabular-nums">
                          {g.unique_variant_count}
                        </p>
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* 2D SIZE × COLOUR MATRIX VIEW */}
      {section === "catalog" && viewMode === "matrix" && (
        <div className="space-y-4">
          {visibleGroups.map((g) => {
            const axisNames = axes.map((a) => a.name);
            const colAxis = axisNames[0] ?? Object.keys(g.items[0]?.attributes ?? {})[0] ?? "Size";
            const rowAxis = axisNames[1] ?? Object.keys(g.items[0]?.attributes ?? {})[1] ?? "Colour";
            const cols = Array.from(new Set(g.items.map((it) => it.attributes?.[colAxis] || "Std")));
            const rows = Array.from(new Set(g.items.map((it) => it.attributes?.[rowAxis] || "Default")));
            return (
              <Card key={g.product_id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {g.thumb_url ? (
                        <img src={g.thumb_url} alt={g.product_name} className="h-11 w-11 rounded-xl object-cover border border-slate-200" />
                      ) : (
                        <div className="h-11 w-11 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400">
                          <ImagePlus className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{g.product_name}</p>
                        <p className="text-xs text-slate-500">SKU {g.model_code} • Retail ₹{g.selling_price} • Wholesale ₹{g.wholesale_price}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManage && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openEditModal(g)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setDeleteTarget(g)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Badge variant="info">{g.total_qty} {g.uom}</Badge>
                    </div>
                  </div>
                  <VariantMatrixGrid
                    rowAxisLabel={rowAxis}
                    colAxisLabel={colAxis}
                    rows={rows}
                    cols={cols}
                    readOnly
                    getCellValue={(r, c) =>
                      g.items
                        .filter((it) => (it.attributes?.[rowAxis] || "Default") === r && (it.attributes?.[colAxis] || "Std") === c)
                        .reduce((s, m) => s + Number(m.quantity ?? 0), 0)
                    }
                    getCellHint={(r, c) => {
                      const hit = g.items.find((it) => (it.attributes?.[rowAxis] || "Default") === r && (it.attributes?.[colAxis] || "Std") === c);
                      return hit ? `₹${hit.selling_price}` : undefined;
                    }}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {section === "alerts" && (
        <div className="space-y-4">
          {brokenSizeModels.length > 0 && (
            <Alert variant="warning" title={`Broken Size Runs Detected (${brokenSizeModels.length} articles)`}>
              Articles missing core sizes while other sizes remain in stock: <strong>{brokenSizeModels.join(", ")}</strong>
            </Alert>
          )}
          <div className="space-y-2">
            {lowStockRows.map((v, i) => (
              <div key={`${v.variant_id}-${i}`} className="rounded-xl border border-rose-200 bg-white p-3.5 text-xs flex justify-between items-center shadow-2xs">
                <div>
                  <p className="font-bold text-slate-900">{v.product_name} ({v.sku})</p>
                  <p className="text-slate-500">{v.branch_name || "Branch"} • Threshold: {v.low_stock_threshold}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="danger">{v.quantity ?? 0} left</Badge>
                  {canAdjust && (
                    <Button size="sm" variant="outline" onClick={() => { setAdjTarget(v); setAdjBranch(v.branch_id || branches[0]?.id || ""); }}>
                      Restock
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === "labels" && (
        <BarcodeLabelSheet
          items={uniqueVariantsForLabels.slice(0, 60).map((v) => ({
            sku: v.sku,
            barcode: v.barcode || v.sku,
            productName: v.product_name,
            modelCode: v.model_code,
            attributes: v.attributes,
            mrp: Number(v.mrp),
            uom: v.uom,
          }))}
          manufacturerInfo={tenant.brand_config?.manufacturer_info || tenant.name}
          customerCare={tenant.brand_config?.customer_care || ""}
          mfgMonthYear={new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
        />
      )}

      {section === "ledger" && (
        <Card>
          <CardContent className="p-4 space-y-2">
            {ledger.map((l) => (
              <div key={l.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-xs">
                <div>
                  <span className="font-bold">{l.sku}</span> ({l.branch_name}) — <Badge>{l.reason}</Badge>
                  {l.notes && <span className="ml-2 text-slate-500">{l.notes}</span>}
                </div>
                <div className="font-mono">
                  <span className={Number(l.change_qty) >= 0 ? "text-emerald-700" : "text-rose-600"}>
                    {Number(l.change_qty) >= 0 ? `+${l.change_qty}` : l.change_qty}
                  </span>{" "}
                  → Bal: <strong>{l.balance_after}</strong>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Inspect Variants & Quick Stock Adjust Modal */}
      <Dialog
        open={Boolean(inspectGroup)}
        onClose={() => setInspectGroup(null)}
        title={`Variants & Stock — ${inspectGroup?.product_name ?? ""}`}
        subtitle={`Model: ${inspectGroup?.model_code ?? ""} • Click Adjust to update stock per branch`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {inspectGroup?.items.map((v, i) => (
            <div key={`${v.variant_id}-${v.branch_id ?? i}`} className="rounded-xl border border-slate-200 p-3 text-xs flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-slate-900">
                  {v.sku} • {Object.values(v.attributes).join(" / ")}
                </p>
                <p className="text-slate-500">
                  {v.branch_name || "Branch"} • Retail ₹{v.selling_price} • Wholesale ₹{v.wholesale_price}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={Number(v.quantity ?? 0) <= Number(v.low_stock_threshold) ? "danger" : "success"}>
                  {v.quantity ?? 0} {v.uom}
                </Badge>
                {canAdjust && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setInspectGroup(null);
                      setAdjTarget(v);
                      setAdjBranch(v.branch_id || branches[0]?.id || "");
                    }}
                  >
                    Adjust
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Dialog>

      {/* Create New Product Modal */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add Product & Variant Matrix" maxWidth="max-w-2xl">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const combos = generateVariantCombinations(
              axes.map((a) => ({ name: a.name, values: selectedAxisVals[a.name] ?? [] }))
            );
            const productId = await createProductWithVariantsAction({
              modelCode,
              name: prodName,
              category,
              brand,
              uom,
              hsnCode,
              gstRate,
              customFields: cfValues,
              costPrice,
              mrp,
              sellingPrice,
              wholesalePrice,
              lowStockThreshold: 5,
              combinations: combos,
            });
            if (newProdPhoto && productId) {
              await handleUploadProductPhoto(productId, newProdPhoto);
              setNewProdPhoto(null);
            }
            toast.success(`Created product with ${Math.max(1, combos.length)} variant(s).`);
            setModelCode(""); setProdName(""); setCategory(""); setBrand("");
            setAddOpen(false);
            router.refresh();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div><Label>Model / Article Code *</Label><Input value={modelCode} onChange={(e) => setModelCode(e.target.value.toUpperCase())} required /></div>
            <div className="sm:col-span-2"><Label>Product Name *</Label><Input value={prodName} onChange={(e) => setProdName(e.target.value)} required /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Formal / Sports" /></div>
            <div><Label>Brand</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} /></div>
            <div>
              <Label>UOM</Label>
              <Select value={uom} onChange={(e) => setUom(e.target.value)}>
                {uoms.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>
            <div><Label>Default GST %</Label><Input type="number" value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} /></div>
          </div>
          <div>
            <Label>HSN / SAC Code</Label>
            <HsnCombobox
              hsnList={hsnList}
              value={hsnCode}
              onSelect={(h) => {
                setHsnCode(h.code);
                setGstRate(Number(h.default_gst_rate));
              }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><Label>Cost ₹</Label><Input type="number" value={costPrice} onChange={(e) => setCostPrice(Number(e.target.value))} /></div>
            <div><Label>MRP ₹</Label><Input type="number" value={mrp} onChange={(e) => setMrp(Number(e.target.value))} /></div>
            <div><Label>Retail ₹</Label><Input type="number" value={sellingPrice} onChange={(e) => setSellingPrice(Number(e.target.value))} /></div>
            <div><Label>Wholesale ₹</Label><Input type="number" value={wholesalePrice} onChange={(e) => setWholesalePrice(Number(e.target.value))} /></div>
          </div>

          <CustomFieldRenderer fields={customFields} values={cfValues} onChange={setCfValues} />

          {axes.map((ax) => (
            <div key={ax.id}>
              <Label>Select {ax.name}</Label>
              <div className="flex flex-wrap gap-1.5">
                {ax.preset_values.map((val) => {
                  const active = (selectedAxisVals[ax.name] ?? []).includes(val);
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => toggleAxisVal(ax.name, val)}
                      className={`rounded-lg px-2.5 py-1 text-xs border cursor-pointer ${
                        active ? "bg-[#4B5A94] text-white border-[#4B5A94]" : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <p className="font-semibold text-slate-800">Product Photo (Auto-compressed WebP → Cloudflare R2)</p>
              <p className="text-slate-500">{newProdPhoto ? `Selected: ${newProdPhoto.name}` : "Optional — shown in POS Terminal, Stock & Storefront"}</p>
            </div>
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
              <ImagePlus className="h-3.5 w-3.5" />
              {newProdPhoto ? "Change Image" : "Choose Image"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setNewProdPhoto(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <Button type="submit" className="w-full">Save Product &amp; Generate Variants</Button>
        </form>
      </Dialog>

      {/* Edit Product Modal */}
      <Dialog
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Edit Product — ${editTarget?.product_name ?? ""}`}
        maxWidth="max-w-xl"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editTarget) return;
            try {
              await updateProductAction({
                productId: editTarget.product_id,
                modelCode: editCode,
                name: editName,
                category: editCat,
                brand: editBrand,
                uom: editUom,
                hsnCode: editHsn,
                gstRate: editGst,
                costPrice: editCost,
                mrp: editMrp,
                sellingPrice: editRetail,
                wholesalePrice: editWholesale,
              });
              toast.success("Product updated!");
              setEditTarget(null);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Update failed");
            }
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div><Label>Model Code *</Label><Input value={editCode} onChange={(e) => setEditCode(e.target.value.toUpperCase())} required /></div>
            <div className="sm:col-span-2"><Label>Product Name *</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} required /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><Label>Category</Label><Input value={editCat} onChange={(e) => setEditCat(e.target.value)} /></div>
            <div><Label>Brand</Label><Input value={editBrand} onChange={(e) => setEditBrand(e.target.value)} /></div>
            <div>
              <Label>UOM</Label>
              <Select value={editUom} onChange={(e) => setEditUom(e.target.value)}>
                {uoms.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>
            <div><Label>GST %</Label><Input type="number" value={editGst} onChange={(e) => setEditGst(Number(e.target.value))} /></div>
          </div>
          <div>
            <Label>HSN Code</Label>
            <Input value={editHsn} onChange={(e) => setEditHsn(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><Label>Cost ₹</Label><Input type="number" value={editCost} onChange={(e) => setEditCost(Number(e.target.value))} /></div>
            <div><Label>MRP ₹</Label><Input type="number" value={editMrp} onChange={(e) => setEditMrp(Number(e.target.value))} /></div>
            <div><Label>Retail ₹</Label><Input type="number" value={editRetail} onChange={(e) => setEditRetail(Number(e.target.value))} /></div>
            <div><Label>Wholesale ₹</Label><Input type="number" value={editWholesale} onChange={(e) => setEditWholesale(Number(e.target.value))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Dialog>

      {/* Delete / Archive Confirm Modal */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Archive / Delete Product"
        subtitle={deleteTarget ? `${deleteTarget.product_name} (${deleteTarget.model_code})` : ""}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This will remove <strong>{deleteTarget?.product_name}</strong> from POS, active stock, and the live website while preserving historical GST invoices. You can restore it anytime from the <strong>Archived</strong> tab.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!deleteTarget) return;
                await deleteProductAction(deleteTarget.product_id);
                toast.success(`${deleteTarget.product_name} archived.`);
                setDeleteTarget(null);
                router.refresh();
              }}
            >
              <Trash2 className="h-4 w-4" /> Archive Product
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Adjust Stock Modal */}
      <Dialog open={Boolean(adjTarget)} onClose={() => setAdjTarget(null)} title={`Adjust Stock — ${adjTarget?.sku ?? ""}`}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!adjTarget) return;
            try {
              await adjustStockAction({
                branchId: adjBranch,
                variantId: adjTarget.variant_id,
                changeQty: adjQty,
                reason: adjReason,
              });
              toast.success("Stock adjusted.");
              setAdjTarget(null);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed");
            }
          }}
          className="space-y-3"
        >
          <div>
            <Label>Branch</Label>
            <Select value={adjBranch} onChange={(e) => setAdjBranch(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Delta Qty (+ or -)</Label><Input type="number" value={adjQty} onChange={(e) => setAdjQty(Number(e.target.value))} required /></div>
            <div>
              <Label>Reason</Label>
              <Select value={adjReason} onChange={(e) => setAdjReason(e.target.value as typeof adjReason)}>
                <option value="adjustment">Adjustment</option>
                <option value="opening">Opening Stock</option>
                <option value="stock_count">Physical Stock Count</option>
              </Select>
            </div>
          </div>
          <Button type="submit" className="w-full">Apply Stock Change</Button>
        </form>
      </Dialog>
    </div>
  );
}
