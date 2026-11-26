"use client";

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  Table2,
  Trash2,
  Upload,
  Loader2,
  X,
} from "lucide-react";
import { Paged } from "@/components/ui/pagination";
import { toast } from "sonner";
import {
  adjustStockAction,
  createProductWithVariantsAction,
  deleteProductAction,
  restoreProductAction,
  updateProductAction,
} from "@/actions/inventory";
import { updateCategoryTemplatesAction } from "@/actions/settings";
import { confirmProductImageAction } from "@/actions/storefront";
import { BarcodeLabelSheet } from "@/components/stock/barcode-sheet";
import { CustomFieldRenderer, HsnCombobox, VariantMatrixGrid } from "@/components/ui/dynamic-fields";
import { KpiGrid } from "@/components/ui/kpi-grid";
import { Form, Alert, Badge, Button, Card, CardContent, Dialog, Input, Label, Select, Switch } from "@/components/ui/primitives";
import {
  parseCommaList,
  removeCategoryTemplate,
  resolveCategoryTemplates,
  resolveColoursForCategory,
  resolveCustomFieldsForCategory,
  resolveSizesForCategory,
  upsertCategoryTemplate,
} from "@/lib/catalog/category-templates";
import { generateVariantCombinations } from "@/lib/catalog/verticals";
import { uploadProductPhotoToStorage } from "@/lib/storage/image-compress";
import type { BranchRow, CategoryTemplate, CustomFieldRow, HsnCodeRow, TenantRow, VariantAxisRow } from "@/types/database";

interface VariantRowData {
  variant_id: string;
  product_id: string;
  model_code: string;
  product_name: string;
  category: string | null;
  brand: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
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
  supplier_id: string | null;
  supplier_name: string | null;
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
  initialBranch = "ALL",
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
  suppliers = [],
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
    actor_name?: string | null;
    actor_login?: string | null;
    actor_role?: string | null;
  }>;
  canManage: boolean;
  canAdjust: boolean;
  canBulkImport?: boolean;
  ledgerEnabled: boolean;
  initialBranch?: string;
  suppliers?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [section, setSection] = useState<"catalog" | "alerts" | "labels" | "ledger">("catalog");
  const [viewMode, setViewMode] = useState<"cards" | "table" | "matrix">("cards");
  const [showStats, setShowStats] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "low" | "out" | "archived">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "price_desc" | "stock_asc">("name");
  const [branchFilter, setBranchFilter] = useState<string>(initialBranch);

  // Create modal state
  const [addOpen, setAddOpen] = useState(false);
  const [modelCode, setModelCode] = useState("");
  const [prodName, setProdName] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [uom, setUom] = useState(uoms[0] || "Pair");
  const [hsnCode, setHsnCode] = useState("6403");
  const [gstRate, setGstRate] = useState(0);
  const [costPrice, setCostPrice] = useState(0);
  const [mrp, setMrp] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [wholesalePrice, setWholesalePrice] = useState(0);
  const [cfValues, setCfValues] = useState<Record<string, string | number | boolean | null>>({});
  const [selectedAxisVals, setSelectedAxisVals] = useState<Record<string, string[]>>({});
  const [customAxisInput, setCustomAxisInput] = useState<Record<string, string>>({});
  const [openingBranchId, setOpeningBranchId] = useState(branches[0]?.id ?? "");
  const [openingMode, setOpeningMode] = useState<"pairs" | "cartons">("pairs");
  const [openingQty, setOpeningQty] = useState("");
  const [piecesPerCarton, setPiecesPerCarton] = useState("20");
  const [showAdvancedProd, setShowAdvancedProd] = useState(false);
  const [customCategoryMode, setCustomCategoryMode] = useState(false);
  const [newProdPhoto, setNewProdPhoto] = useState<File | null>(null);
  const [uploadingProdId, setUploadingProdId] = useState<string | null>(null);

  // Product Categories & Category-Specific Sizes/Fields (synced with Settings -> Product Options)
  const [catTemplates, setCatTemplates] = useState<CategoryTemplate[]>(() =>
    resolveCategoryTemplates(tenant.brand_config, tenant.vertical_key)
  );
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [editCatOrigName, setEditCatOrigName] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSizes, setNewCatSizes] = useState("");
  const [newCatColours, setNewCatColours] = useState("");
  const [newCatFields, setNewCatFields] = useState("");
  const [newCatPack, setNewCatPack] = useState("20");
  const [savingCats, setSavingCats] = useState(false);

  const applyCategoryTemplate = (catName: string) => {
    setCategory(catName);
    const tpl = catTemplates.find((t) => t.category.toLowerCase() === catName.trim().toLowerCase());
    if (tpl) {
      setPiecesPerCarton(String(tpl.default_pieces_per_carton || 20));
      if (tpl.default_sizes.length > 0) {
        const allowed = new Set(tpl.default_sizes.map((s) => s.toLowerCase()));
        setSelectedAxisVals((prev) => {
          const curSizes = prev["Size"] ?? [];
          const kept = curSizes.filter((v) => allowed.has(v.toLowerCase()));
          return { ...prev, Size: kept };
        });
      }
    }
  };

  // Stock Adjust Carton mode
  const [adjMode, setAdjMode] = useState<"pairs" | "cartons">("pairs");
  const [adjCartons, setAdjCartons] = useState("1");
  const [adjPack, setAdjPack] = useState("20");
  const [adjDirection, setAdjDirection] = useState<"add" | "remove">("add");

  // Edit product modal state
  const [editTarget, setEditTarget] = useState<ProductGroup | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editSupplierId, setEditSupplierId] = useState("");
  const [editUom, setEditUom] = useState("Pair");
  const [editHsn, setEditHsn] = useState("");
  const [editGst, setEditGst] = useState(0);
  const [editCost, setEditCost] = useState(0);
  const [editMrp, setEditMrp] = useState(0);
  const [editRetail, setEditRetail] = useState(0);
  const [editWholesale, setEditWholesale] = useState(0);

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState<ProductGroup | null>(null);

  // Variant drawer / stock adjustment modal
  const [inspectGroup, setInspectGroup] = useState<ProductGroup | null>(null);
  const [drawerBranchFilter, setDrawerBranchFilter] = useState<string>("all");
  const [drawerActiveKey, setDrawerActiveKey] = useState<string | null>(null);
  const [drawerSaving, setDrawerSaving] = useState(false);
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
    setEditSupplierId(g.supplier_id ?? "");
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
      await confirmProductImageAction(productId, fullKey, true, true);
      toast.success(via === "r2" ? "Photo saved. It now shows in POS and Stock." : "Photo updated in preview.");
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
        supplier_id: first.supplier_id ?? null,
        supplier_name: first.supplier_name ?? null,
        hsn_code: first.hsn_code,
        gst_rate: Number(first.gst_rate ?? 0),
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
        (g.supplier_name ?? "").toLowerCase().includes(q) ||
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
          <h1>Products &amp; Stock</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Add products, set prices, and check remaining stock.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 pr-1">
            <span className="text-xs font-medium text-slate-600">Show Summary</span>
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
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <Upload className="h-3.5 w-3.5" /> Upload Excel
            </Link>
          )}
          {canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Statistic Cards */}
      {showStats && (
        <KpiGrid
          items={[
            {
              label: "Total Products",
              value: activeGroups.length,
              subtext: `${uniqueVariantsForLabels.length} size / colour items`,
              icon: <Package className="h-4 w-4" />,
              trend: "up",
            },
            {
              label: "Stock Value",
              value: `₹${Math.round(totalStockValue).toLocaleString("en-IN")}`,
              subtext: "Total stock value at cost",
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
              placeholder="Search product name or code..."
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
          <div className="inline-flex rounded-[10px] bg-slate-100/90 p-1 border border-slate-200/70 overflow-x-auto no-scrollbar">
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

          {/* Cards / Table / 2D Matrix switcher */}
          <div className="inline-flex rounded-[10px] border border-slate-200/90 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              title="Cards View"
              aria-label="Cards View"
              onClick={() => { setSection("catalog"); setViewMode("cards"); }}
              className={`rounded-lg p-2 cursor-pointer ${section === "catalog" && viewMode === "cards" ? "bg-[#171717] text-white" : "text-slate-500 hover:text-slate-900"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Table View"
              aria-label="Table View"
              onClick={() => { setSection("catalog"); setViewMode("table"); }}
              className={`rounded-lg p-2 cursor-pointer ${section === "catalog" && viewMode === "table" ? "bg-[#171717] text-white" : "text-slate-500 hover:text-slate-900"}`}
            >
              <Table2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Size × Colour Matrix View"
              aria-label="Size × Colour Matrix View"
              onClick={() => { setSection("catalog"); setViewMode("matrix"); }}
              className={`rounded-lg p-2 cursor-pointer ${section === "catalog" && viewMode === "matrix" ? "bg-[#171717] text-white" : "text-slate-500 hover:text-slate-900"}`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
          </div>

          <div className="inline-flex items-center gap-1 rounded-[10px] border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs shadow-2xs">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <Select
              aria-label="Sort products"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="!min-h-0 !w-[116px] !bg-transparent !px-1 !py-0 !text-xs !font-medium !shadow-none"
            >
              <option value="name">Sort: Name</option>
              <option value="price_desc">Sort: Price ↓</option>
              <option value="stock_asc">Sort: Stock ↑</option>
            </Select>
          </div>

          {/* Secondary tabs for Alerts / Labels / Ledger */}
          <div className="inline-flex rounded-[10px] border border-slate-200/90 bg-white p-0.5 text-xs shadow-2xs">
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
            {canManage && (
              <button
                type="button"
                onClick={() => setCatManagerOpen(true)}
                className="rounded-lg px-2.5 py-1.5 font-medium text-[#171717] hover:bg-slate-100 cursor-pointer"
                title="Manage product categories"
              >
                Categories
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
            <Paged items={visibleGroups} size={9}>{(pagedRows) => pagedRows.map((g) => {
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
                          title={canManage ? (g.thumb_url ? "Change product photo" : "Add product photo") : g.product_name}
                          className={`relative h-16 w-16 rounded-[10px] border border-slate-200/80 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center group ${canManage ? "cursor-pointer" : ""}`}
                        >
                          {g.thumb_url ? (
                            <img src={g.thumb_url} alt={g.product_name} className="h-full w-full object-cover" />
                          ) : canManage ? (
                            <span className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-slate-500">
                              <ImagePlus className="h-4 w-4" />
                              Add photo
                            </span>
                          ) : (
                            <ImagePlus className="h-5 w-5 text-slate-400" />
                          )}
                          {uploadingProdId === g.product_id ? (
                            <span className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-white">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </span>
                          ) : null}
                          {canManage && (
                            <>
                              <span className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Upload className="h-4 w-4" />
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                aria-label={`Upload photo for ${g.product_name}`}
                                className="hidden"
                                disabled={uploadingProdId !== null}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = "";
                                  if (f) handleUploadProductPhoto(g.product_id, f);
                                }}
                              />
                            </>
                          )}
                        </label>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm text-slate-900 truncate">{g.product_name}</h3>
                          <p className="text-xs text-slate-500 truncate">{g.category || g.brand || "Footwear"}</p>
                          <p className="text-[11px] font-mono text-slate-400 mt-1">Code {g.model_code}</p>
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
                                  className="rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50 shadow-2xs cursor-pointer"
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
                      {g.supplier_name && (
                        <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700" title="Bought from">
                          From: {g.supplier_name}
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
                    <div className="rounded-[10px] border border-slate-100 bg-slate-50/70 grid grid-cols-3 divide-x divide-slate-200/70">
                      <div className="p-2.5">
                        <p className="text-[10px] text-slate-500">Retail Price</p>
                        <p className="text-sm font-semibold text-slate-900 mt-0.5 tabular-nums">
                          ₹{g.selling_price.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="p-2.5">
                        <p className="text-[10px] text-slate-500">Wholesale</p>
                        <p className="text-sm font-semibold text-slate-900 mt-0.5 tabular-nums">
                          ₹{g.wholesale_price.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="p-2 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => setInspectGroup(g)}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-colors hover:bg-[#171717] hover:text-white hover:border-[#171717] cursor-pointer"
                          title="Open sizes & add/deduct stock"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                          <span>Sizes ({g.unique_variant_count})</span>
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}</Paged>
          </div>
        )
      )}

      {/* TABLE VIEW */}
      {section === "catalog" && viewMode === "table" && (
        visibleGroups.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-slate-500">
              No products match this filter.
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Paged items={visibleGroups} size={15}>
              {(pagedRows) => (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#ececee] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#77777d]">
                        <th className="px-4 py-3">Product</th>
                        <th className="px-3 py-3">Category / Supplier</th>
                        <th className="px-3 py-3">HSN &amp; GST</th>
                        <th className="px-3 py-3 text-right">Retail</th>
                        <th className="px-3 py-3 text-right">Wholesale</th>
                        <th className="px-3 py-3 text-right">Stock</th>
                        <th className="px-3 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f0f0f1]">
                      {pagedRows.map((g) => {
                        const statusPill =
                          g.status === "archived"
                            ? { label: "Archived", cls: "bg-slate-100 text-slate-600" }
                            : g.status === "out_of_stock"
                            ? { label: "Out Stock", cls: "bg-rose-50 text-rose-700" }
                            : g.status === "low_stock"
                            ? { label: "Low Stock", cls: "bg-amber-50 text-amber-800" }
                            : { label: "Available", cls: "bg-emerald-50 text-emerald-700" };

                        return (
                          <tr key={g.product_id} className="transition-colors hover:bg-[#fafafa]">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {g.thumb_url ? (
                                  <img
                                    src={g.thumb_url}
                                    alt={g.product_name}
                                    className="h-10 w-10 shrink-0 rounded-lg border border-[#ececee] object-cover"
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-[#d4d4d8] bg-[#fafafa] text-[#a1a1aa]">
                                    <Package className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-[#171717]">{g.product_name}</p>
                                  <p className="font-mono text-[11px] text-[#77777d]">
                                    Code {g.model_code}{g.brand ? ` · ${g.brand}` : ""}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-medium text-[#171717]">{g.category || "—"}</p>
                              {g.supplier_name && (
                                <p className="truncate text-[11px] text-[#77777d] max-w-[180px]">
                                  From: {g.supplier_name}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3 font-mono text-[11px] text-[#52525b]">
                              <div>{g.hsn_code ? `HSN ${g.hsn_code}` : "—"}</div>
                              <div className="text-[#77777d]">GST {g.gst_rate}%</div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-semibold text-[#171717]">
                              ₹{g.selling_price.toLocaleString("en-IN")}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-[#52525b]">
                              ₹{g.wholesale_price.toLocaleString("en-IN")}
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-semibold text-[#171717]">
                              {g.total_qty.toLocaleString("en-IN")}{" "}
                              <span className="font-sans text-[10.5px] font-normal text-[#77777d]">{g.uom}</span>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${statusPill.cls}`}>
                                {statusPill.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setInspectGroup(g)}
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#e5e5e7] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#171717] transition-colors hover:border-[#171717] hover:bg-[#171717] hover:text-white"
                                >
                                  <SlidersHorizontal className="h-3 w-3" />
                                  Sizes ({g.unique_variant_count})
                                </button>
                                {canManage && g.is_active && (
                                  <>
                                    <button
                                      type="button"
                                      title="Edit product"
                                      onClick={() => openEditModal(g)}
                                      className="cursor-pointer rounded-lg border border-[#e5e5e7] bg-white p-1.5 text-[#171717] hover:bg-[#f4f4f5]"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Archive product"
                                      onClick={() => setDeleteTarget(g)}
                                      className="cursor-pointer rounded-lg border border-[#e5e5e7] bg-white p-1.5 text-rose-600 hover:bg-rose-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                                {canManage && !g.is_active && (
                                  <button
                                    type="button"
                                    title="Restore product"
                                    onClick={async () => {
                                      await restoreProductAction(g.product_id);
                                      toast.success(`Restored "${g.product_name}".`);
                                      router.refresh();
                                    }}
                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#e5e5e7] bg-white px-2 py-1 text-[11px] font-semibold text-[#171717] hover:bg-[#f4f4f5]"
                                  >
                                    <RotateCcw className="h-3 w-3" /> Restore
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Paged>
          </Card>
        )
      )}

      {/* 2D SIZE × COLOUR MATRIX VIEW */}
      {section === "catalog" && viewMode === "matrix" && (
        <div className="space-y-4">
          <Paged items={visibleGroups} size={4}>{(pagedRows) => pagedRows.map((g) => {
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
                        <img src={g.thumb_url} alt={g.product_name} className="h-11 w-11 rounded-[10px] object-cover border border-slate-200" />
                      ) : (
                        <div className="h-11 w-11 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400">
                          <ImagePlus className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{g.product_name}</p>
                        <p className="text-xs text-slate-500">Code {g.model_code} • Retail ₹{g.selling_price} • Wholesale ₹{g.wholesale_price}</p>
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
          })}</Paged>
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
            <Paged items={lowStockRows} size={12}>{(pagedRows) => pagedRows.map((v, i) => (
              <div key={`${v.variant_id}-${i}`} className="rounded-[10px] border border-rose-200 bg-white p-3.5 text-xs flex justify-between items-center shadow-2xs">
                <div>
                  <p className="font-semibold text-slate-900">{v.product_name} ({v.sku})</p>
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
            ))}</Paged>
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
            <Paged items={ledger} size={12}>{(pagedRows) => pagedRows.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs">
                <div className="space-y-0.5">
                  <div>
                    <span className="font-bold">{l.sku}</span> ({l.branch_name}) — <Badge>{l.reason}</Badge>
                    {l.notes && <span className="ml-2 text-slate-500">{l.notes}</span>}
                  </div>
                  <div className="text-[11px] text-slate-500" suppressHydrationWarning>
                    {new Date(l.created_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {l.actor_name && (
                      <span>
                        {" "}• Stocked by <strong className="text-slate-700">{l.actor_name}</strong>
                        {l.actor_login ? ` (@${l.actor_login})` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="font-mono">
                  <span className={Number(l.change_qty) >= 0 ? "text-emerald-700" : "text-rose-600"}>
                    {Number(l.change_qty) >= 0 ? `+${l.change_qty}` : l.change_qty}
                  </span>{" "}
                  → Bal: <strong>{l.balance_after}</strong>
                </div>
              </div>
            ))}</Paged>
          </CardContent>
        </Card>
      )}

      {/* Full-Height Right-Side Sidebar Drawer for Sizes & Stock Updates */}
      {inspectGroup && typeof document !== "undefined" && (() => {
        const liveGroup = productGroups.find((g) => g.product_id === inspectGroup.product_id) ?? inspectGroup;
        const drawerBranches = Array.from(
          new Map(
            liveGroup.items
              .filter((v) => v.branch_id && v.branch_name)
              .map((v) => [v.branch_id!, v.branch_name!])
          ).entries()
        );
        const visibleVariants =
          drawerBranchFilter === "all"
            ? liveGroup.items
            : liveGroup.items.filter((v) => v.branch_id === drawerBranchFilter);

        return createPortal(
          <div
            className="spark-ui fixed inset-0 z-[9998] flex justify-end bg-black/35 backdrop-blur-[2px]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setInspectGroup(null);
                setDrawerActiveKey(null);
              }
            }}
          >
            <aside className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl border-l border-slate-200">
              {/* Drawer Header */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {liveGroup.thumb_url ? (
                      <img src={liveGroup.thumb_url} alt={liveGroup.product_name} className="h-full w-full object-contain p-1" />
                    ) : (
                      <Boxes className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-[#171717]">
                      {liveGroup.product_name}
                    </h2>
                    <p className="text-xs text-[#77777d]">
                      Code: <span className="font-mono font-medium text-slate-700">{liveGroup.model_code}</span>
                      {" · "}Total Stock: <strong className="text-slate-900">{Math.round(liveGroup.total_qty).toLocaleString("en-IN")} {liveGroup.uom}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInspectGroup(null);
                    setDrawerActiveKey(null);
                  }}
                  aria-label="Close sidebar"
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Branch Filter Bar */}
              {drawerBranches.length > 1 && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-100 bg-white px-5 py-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setDrawerBranchFilter("all")}
                    className={`rounded-full px-3 py-1 font-semibold cursor-pointer ${
                      drawerBranchFilter === "all"
                        ? "bg-[#171717] text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    All Branches ({liveGroup.items.length})
                  </button>
                  {drawerBranches.map(([bId, bName]) => (
                    <button
                      key={bId}
                      type="button"
                      onClick={() => setDrawerBranchFilter(bId)}
                      className={`rounded-full px-3 py-1 font-semibold cursor-pointer ${
                        drawerBranchFilter === bId
                          ? "bg-[#171717] text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {bName}
                    </button>
                  ))}
                </div>
              )}

              {/* Scrollable Sizes & Inline Stock Update List */}
              <div className="flex-1 space-y-2.5 overflow-y-auto p-5">
                {visibleVariants.map((v, i) => {
                  const rowKey = `${v.variant_id}-${v.branch_id ?? i}`;
                  const qtyNum = Number(v.quantity ?? 0);
                  const isExpanded = drawerActiveKey === rowKey;
                  const attrText = Object.values(v.attributes).filter(Boolean).join(" / ");
                  return (
                    <div
                      key={rowKey}
                      className={`rounded-xl border transition-all ${
                        isExpanded
                          ? "border-[#171717] bg-slate-50/70 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-slate-900">
                              {attrText || v.sku}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">{v.sku}</span>
                          </div>
                          <p className="mt-0.5 text-[11.5px] text-slate-500">
                            {v.branch_name || "Main Branch"} · Retail ₹{Number(v.selling_price).toLocaleString("en-IN")} · Wholesale ₹{Number(v.wholesale_price).toLocaleString("en-IN")}
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <Badge variant={qtyNum <= 0 ? "danger" : qtyNum <= Number(v.low_stock_threshold) ? "warning" : "success"}>
                            {Number.isInteger(qtyNum) ? qtyNum.toLocaleString("en-IN") : qtyNum.toFixed(1)} {v.uom}
                          </Badge>
                          {canAdjust && (
                            <Button
                              size="sm"
                              variant={isExpanded ? "primary" : "outline"}
                              onClick={() => {
                                if (isExpanded) {
                                  setDrawerActiveKey(null);
                                } else {
                                  setDrawerActiveKey(rowKey);
                                  setAdjBranch(v.branch_id || branches[0]?.id || "");
                                  setAdjDirection("add");
                                  setAdjMode("pairs");
                                  setAdjQty(0);
                                  setAdjCartons("1");
                                  setAdjReason("adjustment");
                                }
                              }}
                            >
                              {isExpanded ? "Close" : "+ / − Stock"}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Inline Add / Deduct Stock Panel inside the Sidebar */}
                      {isExpanded && canAdjust && (
                        <Form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const sign = adjDirection === "remove" ? -1 : 1;
                            const computedQty =
                              adjMode === "cartons"
                                ? sign * Math.max(1, Number(adjCartons || 0)) * Math.max(1, Number(adjPack || 20))
                                : sign * Math.abs(Number(adjQty || 0));
                            if (!computedQty) {
                              toast.error("Enter how many pairs or cartons.");
                              return;
                            }
                            setDrawerSaving(true);
                            try {
                              await adjustStockAction({
                                branchId: adjBranch || v.branch_id || branches[0]?.id || "",
                                variantId: v.variant_id,
                                changeQty: computedQty,
                                reason: adjReason,
                                notes:
                                  adjMode === "cartons"
                                    ? `${adjDirection === "remove" ? "Deducted" : "Added"} ${adjCartons} cartons × ${adjPack} pcs`
                                    : `${adjDirection === "remove" ? "Deducted" : "Added"} ${Math.abs(computedQty)} ${v.uom}`,
                              });
                              toast.success(
                                adjDirection === "remove"
                                  ? `Deducted ${Math.abs(computedQty)} ${v.uom} from ${attrText || v.sku}`
                                  : `Added ${Math.abs(computedQty)} ${v.uom} to ${attrText || v.sku}`
                              );
                              setAdjQty(0);
                              setDrawerActiveKey(null);
                              router.refresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Could not update stock.");
                            } finally {
                              setDrawerSaving(false);
                            }
                          }}
                          className="space-y-3 border-t border-slate-200 bg-white p-3.5 rounded-b-xl"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="inline-flex rounded-lg bg-[#f1f1f2] p-0.5 text-xs">
                              <button
                                type="button"
                                onClick={() => setAdjDirection("add")}
                                className={`rounded-md px-3 py-1.5 font-semibold cursor-pointer ${
                                  adjDirection === "add"
                                    ? "bg-white text-emerald-700 shadow-2xs"
                                    : "text-[#55555b]"
                                }`}
                              >
                                + Add Stock
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjDirection("remove");
                                  if (adjReason === "opening") setAdjReason("adjustment");
                                }}
                                className={`rounded-md px-3 py-1.5 font-semibold cursor-pointer ${
                                  adjDirection === "remove"
                                    ? "bg-white text-rose-700 shadow-2xs"
                                    : "text-[#55555b]"
                                }`}
                              >
                                − Deduct Stock
                              </button>
                            </div>

                            <div className="inline-flex rounded-lg bg-[#f1f1f2] p-0.5 text-xs">
                              <button
                                type="button"
                                onClick={() => setAdjMode("pairs")}
                                className={`rounded-md px-2.5 py-1 font-medium cursor-pointer ${
                                  adjMode === "pairs" ? "bg-white text-[#171717] shadow-2xs" : "text-[#55555b]"
                                }`}
                              >
                                Pairs
                              </button>
                              <button
                                type="button"
                                onClick={() => setAdjMode("cartons")}
                                className={`rounded-md px-2.5 py-1 font-medium cursor-pointer ${
                                  adjMode === "cartons" ? "bg-white text-[#171717] shadow-2xs" : "text-[#55555b]"
                                }`}
                              >
                                Cartons
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            {adjMode === "pairs" ? (
                              <div>
                                <Label>{adjDirection === "remove" ? "Pairs to deduct" : "Pairs to add"}</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={adjQty ? String(Math.abs(adjQty)) : ""}
                                  placeholder="e.g. 50"
                                  onChange={(e) => setAdjQty(Number(e.target.value.replace(/\D/g, "")) || 0)}
                                  required
                                />
                              </div>
                            ) : (
                              <>
                                <div>
                                  <Label>Cartons</Label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    value={adjCartons}
                                    placeholder="e.g. 5"
                                    onChange={(e) => setAdjCartons(e.target.value.replace(/\D/g, ""))}
                                  />
                                </div>
                                <div>
                                  <Label>Pcs / Carton</Label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    value={adjPack}
                                    placeholder="20"
                                    onChange={(e) => setAdjPack(e.target.value.replace(/\D/g, ""))}
                                  />
                                </div>
                              </>
                            )}
                            <div>
                              <Label>Reason</Label>
                              <Select value={adjReason} onChange={(e) => setAdjReason(e.target.value as typeof adjReason)}>
                                <option value="adjustment">
                                  {adjDirection === "remove" ? "Damaged / Lost / Taken out" : "New stock arrived"}
                                </option>
                                {adjDirection === "add" && <option value="opening">Old / Starting stock</option>}
                                <option value="stock_count">Counted in shop (fix count)</option>
                              </Select>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="text-xs font-medium text-slate-600">
                              {adjMode === "cartons"
                                ? `Total: ${adjDirection === "remove" ? "−" : "+"}${(
                                    Number(adjCartons || 0) * Math.max(1, Number(adjPack || 20))
                                  ).toLocaleString("en-IN")} ${v.uom}`
                                : adjQty > 0
                                ? `New balance: ${Math.max(0, qtyNum + (adjDirection === "remove" ? -adjQty : adjQty)).toLocaleString("en-IN")} ${v.uom}`
                                : ""}
                            </span>
                            <Button type="submit" size="sm" disabled={drawerSaving}>
                              {drawerSaving ? "Saving..." : adjDirection === "remove" ? "Save Deduction" : "Save Added Stock"}
                            </Button>
                          </div>
                        </Form>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>,
          document.body
        );
      })()}

      {/* Create New Product Modal — Simple, spacious & user-focused */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add New Product"
        subtitle="Enter product name, stock quantity (pairs or cartons), price and sizes."
        maxWidth="max-w-3xl"
      >
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            // Deduplicate axes by lowercase name so duplicate "Size" axes never split combinations
            const dedupMap = new Map<string, string[]>();
            const sourceAxisNames = axes.map((a) => a.name);
            for (const rawName of sourceAxisNames) {
              const norm = rawName.trim().toLowerCase();
              const canonical =
                norm === "size" ? "Size" : norm === "colour" || norm === "color" ? "Colour" : rawName.trim();
              const vals = selectedAxisVals[canonical] ?? selectedAxisVals[rawName] ?? [];
              dedupMap.set(canonical, Array.from(new Set([...(dedupMap.get(canonical) ?? []), ...vals])));
            }
            const effectiveAxes = Array.from(dedupMap.entries()).map(([name, values]) => ({ name, values }));
            const combos = generateVariantCombinations(effectiveAxes);
            const packSize = Math.max(1, Number(piecesPerCarton || 20));
            const rawOpenQty = Number(openingQty || 0);
            const finalOpeningPairs =
              rawOpenQty > 0
                ? openingMode === "cartons"
                  ? rawOpenQty * packSize
                  : rawOpenQty
                : 0;
            const openingNote =
              finalOpeningPairs > 0
                ? openingMode === "cartons"
                  ? `Opening stock: ${rawOpenQty} cartons × ${packSize} pcs = ${finalOpeningPairs} ${uom}`
                  : `Opening stock: ${finalOpeningPairs} ${uom}`
                : undefined;

            const created = await createProductWithVariantsAction({
              modelCode,
              name: prodName,
              category,
              brand,
              uom,
              hsnCode,
              gstRate,
              customFields: {
                ...cfValues,
                pieces_per_carton: packSize,
              },
              costPrice,
              mrp,
              sellingPrice,
              wholesalePrice,
              lowStockThreshold: 5,
              combinations: combos,
              supplierId: supplierId || null,
              openingStock:
                finalOpeningPairs > 0 && openingBranchId
                  ? { branchId: openingBranchId, quantity: finalOpeningPairs, note: openingNote }
                  : undefined,
            });
            if (!created.ok) {
              toast.error(created.error);
              return;
            }
            const productId = created.productId;
            if (newProdPhoto && productId) {
              await handleUploadProductPhoto(productId, newProdPhoto);
              setNewProdPhoto(null);
            }
            toast.success(
              `Saved "${prodName}"${
                finalOpeningPairs > 0 ? ` with ${finalOpeningPairs.toLocaleString("en-IN")} ${uom} in stock` : ""
              }.`
            );
            setModelCode(""); setProdName(""); setCategory(""); setBrand(""); setSupplierId("");
            setOpeningQty(""); setSelectedAxisVals({}); setCfValues({});
            setCustomCategoryMode(false); setShowAdvancedProd(false);
            setAddOpen(false);
            router.refresh();
          }}
          className="space-y-5"
        >
          {/* 0. Product Photo at the Top (Optional) */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            <div>
              <p className="font-semibold text-slate-900">Product Photo <span className="font-normal text-slate-500">(Optional)</span></p>
              <p className="text-[11px] text-slate-500">
                {newProdPhoto ? `Selected: ${newProdPhoto.name}` : "Shown in POS Billing, Stock & Public Catalogue"}
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100">
              <ImagePlus className="h-3.5 w-3.5" />
              {newProdPhoto ? "Change Image" : "Choose Image"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setNewProdPhoto(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          {/* 1. Product Name, Code & Category */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Product Name *</Label>
              <Input
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="e.g. Don Slipper"
                required
              />
            </div>
            <div>
              <Label>Model / Article Code *</Label>
              <Input
                value={modelCode}
                onChange={(e) => setModelCode(e.target.value.toUpperCase())}
                placeholder="e.g. DON-6X9"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Category</Label>
                <button
                  type="button"
                  onClick={() => setCatManagerOpen(true)}
                  className="mb-1 text-[11px] font-medium text-sky-700 hover:underline cursor-pointer"
                >
                  Manage
                </button>
              </div>
              {customCategoryMode ? (
                <div className="flex gap-1.5">
                  <Input
                    value={category}
                    onChange={(e) => applyCategoryTemplate(e.target.value)}
                    placeholder="Type category name"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomCategoryMode(false)}
                    className="shrink-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    List
                  </button>
                </div>
              ) : (
                <Select
                  value={category}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setCustomCategoryMode(true);
                      setCategory("");
                    } else {
                      applyCategoryTemplate(e.target.value);
                    }
                  }}
                >
                  <option value="">Choose category (Slipper, Shoe…)</option>
                  {catTemplates.map((t) => (
                    <option key={t.category} value={t.category}>
                      {t.category}
                    </option>
                  ))}
                  <option value="__custom__">+ Type another category…</option>
                </Select>
              )}
            </div>
          </div>
          {/* Bought from (optional) */}
          <div>
            <Label>
              Bought From (Supplier / Company){" "}
              <span className="font-normal text-slate-500">— Optional</span>
            </Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier or company">
              <option value="">Not set / Made by us</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-slate-500">
              {suppliers.length === 0
                ? "No suppliers yet. Add them in Customers → Suppliers, then pick here."
                : "Pick the company you buy this product from. You can leave it empty."}
            </p>
          </div>

          {/* 2. Stock Quantity (Front and Center — Pairs or Cartons!) */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Stock Quantity</p>
                <p className="text-xs text-slate-600">
                  Enter how many pairs/pieces or cartons/boxes you have right now.
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setOpeningMode("pairs")}
                  className={`rounded-md px-3 py-1.5 font-semibold cursor-pointer ${
                    openingMode === "pairs" ? "bg-[#171717] text-white" : "text-slate-600"
                  }`}
                >
                  Pairs / Pieces
                </button>
                <button
                  type="button"
                  onClick={() => setOpeningMode("cartons")}
                  className={`rounded-md px-3 py-1.5 font-semibold cursor-pointer ${
                    openingMode === "cartons" ? "bg-[#171717] text-white" : "text-slate-600"
                  }`}
                >
                  Cartons / Boxes
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>{openingMode === "cartons" ? "How many Cartons / Boxes?" : `How many ${uom}s?`}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={openingQty}
                  onChange={(e) => setOpeningQty(e.target.value.replace(/\D/g, ""))}
                  placeholder={openingMode === "cartons" ? "e.g. 20" : "e.g. 100"}
                />
              </div>
              {openingMode === "cartons" ? (
                <div>
                  <Label>Pieces in 1 Carton / Box</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={piecesPerCarton}
                    onChange={(e) => setPiecesPerCarton(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 20"
                  />
                </div>
              ) : (
                <div>
                  <Label>Unit (Pair / Piece / Box)</Label>
                  <Select value={uom} onChange={(e) => setUom(e.target.value)}>
                    {uoms.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Select>
                </div>
              )}
              <div>
                <Label>Branch</Label>
                <Select value={openingBranchId} onChange={(e) => setOpeningBranchId(e.target.value)}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </div>
            </div>

            {Number(openingQty || 0) > 0 && (
              <p className="text-xs font-semibold text-emerald-800">
                {openingMode === "cartons"
                  ? `Total stock to add: ${openingQty} cartons × ${piecesPerCarton || 20} pcs = ${(
                      Number(openingQty) * Math.max(1, Number(piecesPerCarton || 20))
                    ).toLocaleString("en-IN")} ${uom}s`
                  : `Total stock to add: ${Number(openingQty).toLocaleString("en-IN")} ${uom}s`}
              </p>
            )}
          </div>

          {/* 3. Simple Pricing, HSN & GST */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><Label>Retail Price ₹</Label><Input type="number" value={sellingPrice || ""} placeholder="e.g. 250" onChange={(e) => setSellingPrice(Number(e.target.value) || 0)} /></div>
            <div><Label>Wholesale Price ₹</Label><Input type="number" value={wholesalePrice || ""} placeholder="e.g. 180" onChange={(e) => setWholesalePrice(Number(e.target.value) || 0)} /></div>
            <div><Label>Cost Price ₹</Label><Input type="number" value={costPrice || ""} placeholder="Optional" onChange={(e) => setCostPrice(Number(e.target.value) || 0)} /></div>
            <div><Label>MRP ₹</Label><Input type="number" value={mrp || ""} placeholder="Optional" onChange={(e) => setMrp(Number(e.target.value) || 0)} /></div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
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
            <div>
              <Label>GST %</Label>
              <Input type="number" value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} />
            </div>
          </div>

          {/* 4. Sizes, Colours & Options — Dynamic per selected Category */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  Sizes, Colours &amp; Options
                  {category.trim() ? ` — for ${category.trim()}` : ""}
                </p>
                <p className="text-[11px] text-slate-500">
                  {category.trim()
                    ? `Tap the sizes and colours you have in stock for ${category.trim()}.`
                    : "Pick a Category above first to see its exact sizes, or choose from general sizes below."}
                </p>
              </div>
              <Link
                href="/dashboard/settings?tab=schema"
                className="text-[11px] font-semibold text-[#171717] underline underline-offset-2 hover:text-[#52525b]"
              >
                Edit Categories &amp; Sizes →
              </Link>
            </div>
            {(() => {
              const merged = new Map<string, string[]>();
              const addPreset = (label: string, vals: string[]) => {
                merged.set(label, Array.from(new Set([...(merged.get(label) ?? []), ...vals])));
              };
              const sizeRes = resolveSizesForCategory(catTemplates, category, axes);
              const colourRes = resolveColoursForCategory(catTemplates, category, axes);

              if (sizeRes.sizes.length > 0 || (selectedAxisVals["Size"]?.length ?? 0) > 0) {
                addPreset("Size", sizeRes.sizes);
              }
              if (colourRes.colours.length > 0 || (selectedAxisVals["Colour"]?.length ?? 0) > 0) {
                addPreset("Colour", colourRes.colours);
              }
              for (const a of axes) {
                const norm = a.name.trim().toLowerCase();
                if (norm === "size" || norm === "sizes" || norm === "colour" || norm === "color") continue;
                addPreset(a.name.trim(), a.preset_values);
              }
              for (const [k, vals] of Object.entries(selectedAxisVals)) {
                if (merged.has(k)) addPreset(k, vals);
              }
              if (merged.size === 0) {
                return (
                  <p className="text-xs text-slate-500">
                    No sizes or options set for this category yet. You can save as a single item, or{" "}
                    <Link href="/dashboard/settings?tab=schema" className="font-semibold text-[#171717] underline">
                      add Category Sizes in Product Options
                    </Link>
                    .
                  </p>
                );
              }
              return Array.from(merged.entries()).map(([axisName, presets]) => (
                <div key={axisName} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="mb-0">{axisName}</Label>
                    {axisName === "Size" && sizeRes.source === "category" && category.trim() && (
                      <span className="rounded-full bg-[#171717]/10 px-2 py-0.5 text-[10px] font-semibold text-[#171717]">
                        {category.trim()} sizes
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map((val) => {
                      const active = (selectedAxisVals[axisName] ?? []).includes(val);
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => toggleAxisVal(axisName, val)}
                          className={`rounded-lg px-2.5 py-1 text-xs border cursor-pointer transition-colors ${
                            active
                              ? "bg-[#171717] text-white border-[#171717]"
                              : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex max-w-md items-center gap-2 pt-1">
                    <Input
                      value={customAxisInput[axisName] ?? ""}
                      onChange={(e) => setCustomAxisInput((prev) => ({ ...prev, [axisName]: e.target.value }))}
                      placeholder={`Quick add custom ${axisName.toLowerCase()} for this product`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const raw = (customAxisInput[axisName] ?? "").trim();
                          if (!raw) return;
                          const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
                          setSelectedAxisVals((prev) => ({
                            ...prev,
                            [axisName]: Array.from(new Set([...(prev[axisName] ?? []), ...parts])),
                          }));
                          setCustomAxisInput((prev) => ({ ...prev, [axisName]: "" }));
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const raw = (customAxisInput[axisName] ?? "").trim();
                        if (!raw) return;
                        const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
                        setSelectedAxisVals((prev) => ({
                          ...prev,
                          [axisName]: Array.from(new Set([...(prev[axisName] ?? []), ...parts])),
                        }));
                        setCustomAxisInput((prev) => ({ ...prev, [axisName]: "" }));
                      }}
                      className="inline-flex h-[34px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </div>
              ));
            })()}
          </div>

          {/* Extra Product Details — Dynamic per selected Category */}
          {(() => {
            const catFields = resolveCustomFieldsForCategory(catTemplates, category, customFields);
            if (catFields.fields.length === 0) return null;
            return (
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-800">Extra Product Details</p>
                    {catFields.isCategoryFiltered && category.trim() && (
                      <span className="rounded-full bg-[#171717]/10 px-2 py-0.5 text-[10px] font-semibold text-[#171717]">
                        Attached to {category.trim()}
                      </span>
                    )}
                  </div>
                  <Link
                    href="/dashboard/settings?tab=schema"
                    className="text-[11px] font-semibold text-[#171717] underline underline-offset-2 hover:text-[#52525b]"
                  >
                    Edit Fields →
                  </Link>
                </div>
                <CustomFieldRenderer fields={catFields.fields} values={cfValues} onChange={setCfValues} />
              </div>
            );
          })()}

          {/* 5. Collapsible Optional Details (Brand & Default Pcs/Carton) */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setShowAdvancedProd((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer rounded-xl"
            >
              <span>More Options (Brand &amp; Default Pcs/Carton)</span>
              <span className="text-[11px] text-[#171717]">{showAdvancedProd ? "Hide ▲" : "Show ▼"}</span>
            </button>
            {showAdvancedProd && (
              <div className="space-y-3 border-t border-slate-100 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><Label>Brand</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Optional" /></div>
                  <div>
                    <Label>Pcs per Carton (Default)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={piecesPerCarton}
                      onChange={(e) => setPiecesPerCarton(e.target.value.replace(/\D/g, ""))}
                      placeholder="20"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Compact Footer Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" size="sm" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              <Plus className="h-3.5 w-3.5" /> Save Product
            </Button>
          </div>
        </Form>
      </Dialog>

      {/* Dynamic Product Categories, Sizes & Fields Manager Modal */}
      <Dialog
        open={catManagerOpen}
        onClose={() => setCatManagerOpen(false)}
        title="Product Categories & Sizes"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            Set up each category (like <strong>Men&apos;s Footwear</strong>, <strong>Women&apos;s Footwear</strong>,{" "}
            <strong>Children&apos;s Footwear</strong>, <strong>Baby Footwear</strong>) with its own sizes and extra details.
            You can also load full business presets in{" "}
            <Link href="/dashboard/settings?tab=schema" className="font-semibold text-[#171717] underline">
              Profile &amp; Settings → Product Options
            </Link>
            .
          </p>

          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {catTemplates.map((t, idx) => (
              <div key={t.category + idx} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {t.category} <Badge variant="default" className="ml-1.5">{t.default_pieces_per_carton} / box</Badge>
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditCatOrigName(t.category);
                        setNewCatName(t.category);
                        setNewCatSizes(t.default_sizes.join(", "));
                        setNewCatColours(t.default_colours.join(", "));
                        setNewCatFields(t.extra_fields.join(", "));
                        setNewCatPack(String(t.default_pieces_per_carton || 20));
                      }}
                      className="px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-white rounded-md border border-slate-200 cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatTemplates((prev) => removeCategoryTemplate(prev, t.category))}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                      title="Remove category"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {t.default_sizes.length > 0 && (
                  <p className="text-[11px] text-slate-600">
                    <strong>Sizes:</strong> {t.default_sizes.join(", ")}
                  </p>
                )}
                {t.extra_fields.length > 0 && (
                  <p className="text-[11px] text-slate-600">
                    <strong>Fields:</strong> {t.extra_fields.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-800">
                {editCatOrigName ? `Edit Category: ${editCatOrigName}` : "Add New Category"}
              </p>
              {editCatOrigName && (
                <button
                  type="button"
                  onClick={() => {
                    setEditCatOrigName(null);
                    setNewCatName("");
                    setNewCatSizes("");
                    setNewCatColours("");
                    setNewCatFields("");
                    setNewCatPack("20");
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancel edit
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label>Category Name *</Label>
                <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="e.g. Men's Footwear, Baby Footwear" />
              </div>
              <div>
                <Label>Pairs / Box</Label>
                <Input type="text" inputMode="numeric" value={newCatPack} onChange={(e) => setNewCatPack(e.target.value.replace(/\D/g, ""))} placeholder="20" />
              </div>
            </div>
            <div>
              <Label>Sizes for this Category (comma-separated)</Label>
              <Input value={newCatSizes} onChange={(e) => setNewCatSizes(e.target.value)} placeholder="e.g. 6, 7, 8, 9, 10, 11  or  0-3M, 3-6M, 6-12M" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label>Colours (optional, comma-separated)</Label>
                <Input value={newCatColours} onChange={(e) => setNewCatColours(e.target.value)} placeholder="e.g. Black, Brown, Tan" />
              </div>
              <div>
                <Label>Attached Fields (optional, comma-separated)</Label>
                <Input value={newCatFields} onChange={(e) => setNewCatFields(e.target.value)} placeholder="e.g. Sole Type, Heel Type" />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const name = newCatName.trim();
                if (!name) return;
                const entry: CategoryTemplate = {
                  category: name,
                  default_sizes: parseCommaList(newCatSizes),
                  default_colours: parseCommaList(newCatColours),
                  default_pieces_per_carton: Math.max(1, Number(newCatPack || 20)),
                  extra_fields: parseCommaList(newCatFields),
                };
                setCatTemplates((prev) => upsertCategoryTemplate(prev, entry, editCatOrigName));
                setEditCatOrigName(null);
                setNewCatName("");
                setNewCatSizes("");
                setNewCatColours("");
                setNewCatFields("");
                setNewCatPack("20");
              }}
            >
              <Plus className="h-3.5 w-3.5" /> {editCatOrigName ? "Update in List" : "Add Category to List"}
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCatManagerOpen(false)}>Close</Button>
            <Button
              type="button"
              disabled={savingCats}
              onClick={async () => {
                setSavingCats(true);
                try {
                  await updateCategoryTemplatesAction(catTemplates);
                  toast.success("Categories & sizes saved!");
                  setCatManagerOpen(false);
                  router.refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not save categories.");
                } finally {
                  setSavingCats(false);
                }
              }}
            >
              {savingCats ? "Saving..." : "Save Categories"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Product Modal */}
      <Dialog
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Edit Product — ${editTarget?.product_name ?? ""}`}
        maxWidth="max-w-xl"
      >
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editTarget) return;
            try {
              const res = await updateProductAction({
                productId: editTarget.product_id,
                modelCode: editCode,
                name: editName,
                category: editCat,
                brand: editBrand,
                supplierId: editSupplierId || null,
                uom: editUom,
                hsnCode: editHsn,
                gstRate: editGst,
                costPrice: editCost,
                mrp: editMrp,
                sellingPrice: editRetail,
                wholesalePrice: editWholesale,
              });
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label>HSN Code</Label>
              <Input value={editHsn} onChange={(e) => setEditHsn(e.target.value)} />
            </div>
            <div>
              <Label>Bought From <span className="font-normal text-slate-500">— Optional</span></Label>
              <Select value={editSupplierId} onChange={(e) => setEditSupplierId(e.target.value)} aria-label="Supplier or company">
                <option value="">Not set / Made by us</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><Label>Cost ₹</Label><Input type="number" value={editCost} onChange={(e) => setEditCost(Number(e.target.value))} /></div>
            <div><Label>MRP ₹</Label><Input type="number" value={editMrp} onChange={(e) => setEditMrp(Number(e.target.value))} /></div>
            <div><Label>Retail ₹</Label><Input type="number" value={editRetail} onChange={(e) => setEditRetail(Number(e.target.value))} /></div>
            <div><Label>Wholesale ₹</Label><Input type="number" value={editWholesale} onChange={(e) => setEditWholesale(Number(e.target.value))} /></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            <div>
              <p className="font-semibold text-slate-900">Need to add or deduct stock for this product?</p>
              <p className="text-[11px] text-slate-500">Current total: {editTarget?.total_qty ?? 0} {editTarget?.uom ?? "Pair"}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!editTarget) return;
                const grp = editTarget;
                setEditTarget(null);
                setInspectGroup(grp);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-[#171717] hover:bg-[#171717] hover:text-white transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Add / Deduct Stock
            </button>
          </div>
          {editTarget ? (() => {
            const photo = productGroups.find((g) => g.product_id === editTarget.product_id)?.thumb_url ?? editTarget.thumb_url;
            const busy = uploadingProdId === editTarget.product_id;
            return (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {photo ? <img src={photo} alt={editTarget.product_name} className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-slate-400" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-800">Product Photo</span>
                    <span className="block text-slate-500">Shown in POS, Stock and your website</span>
                  </span>
                </div>
                <label className={`inline-flex items-center gap-1.5 rounded-[10px] border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 ${busy ? "cursor-wait opacity-60" : "cursor-pointer"}`}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {busy ? "Uploading..." : photo ? "Change Photo" : "Add Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    aria-label={`Upload photo for ${editTarget.product_name}`}
                    className="hidden"
                    disabled={uploadingProdId !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleUploadProductPhoto(editTarget.product_id, f);
                    }}
                  />
                </label>
              </div>
            );
          })() : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </Form>
      </Dialog>

      {/* Delete / Archive Confirm Modal */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Archive / Delete Product"
        subtitle={deleteTarget ? `${deleteTarget.product_name} (${deleteTarget.model_code})` : ""}
      >
        <div className="space-y-4">
          <p className="mt-0.5 text-[12.5px] text-[#77777d]">
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

      {/* Add or Deduct Stock Modal — Plain English for everyday shop users */}
      <Dialog
        open={Boolean(adjTarget)}
        onClose={() => setAdjTarget(null)}
        title={`Add or Deduct Stock — ${adjTarget?.sku ?? ""}`}
      >
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!adjTarget) return;
            const sign = adjDirection === "remove" ? -1 : 1;
            const computedQty =
              adjMode === "cartons"
                ? sign * Math.max(1, Number(adjCartons || 0)) * Math.max(1, Number(adjPack || 20))
                : sign * Math.abs(Number(adjQty || 0));
            if (!computedQty) {
              toast.error("Please enter how many pairs or cartons.");
              return;
            }
            try {
              await adjustStockAction({
                branchId: adjBranch,
                variantId: adjTarget.variant_id,
                changeQty: computedQty,
                reason: adjReason,
                notes:
                  adjMode === "cartons"
                    ? `${adjDirection === "remove" ? "Deducted" : "Added"} ${adjCartons} cartons × ${adjPack} pcs`
                    : `${adjDirection === "remove" ? "Deducted" : "Added"} ${Math.abs(computedQty)} pairs`,
              });
              toast.success(
                adjDirection === "remove"
                  ? `Deducted ${Math.abs(computedQty)} from stock.`
                  : `Added ${Math.abs(computedQty)} to stock.`
              );
              setAdjTarget(null);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not update stock.");
            }
          }}
          className="space-y-4"
        >
          {/* 1. Sleek Add Stock vs Deduct Stock segmented switch */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#f1f1f2] p-1">
            <button
              type="button"
              onClick={() => setAdjDirection("add")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer transition-all ${
                adjDirection === "add"
                  ? "bg-white text-emerald-700 shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                  : "text-[#55555b] hover:text-[#171717]"
              }`}
            >
              + Add Stock
            </button>
            <button
              type="button"
              onClick={() => {
                setAdjDirection("remove");
                if (adjReason === "opening") setAdjReason("adjustment");
              }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer transition-all ${
                adjDirection === "remove"
                  ? "bg-white text-rose-700 shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                  : "text-[#55555b] hover:text-[#171717]"
              }`}
            >
              − Deduct Stock
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#55555b]">Count By</span>
            <div className="inline-flex rounded-lg bg-[#f1f1f2] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setAdjMode("pairs")}
                className={`rounded-md px-3 py-1 font-medium cursor-pointer transition-all ${
                  adjMode === "pairs" ? "bg-white text-[#171717] shadow-2xs" : "text-[#55555b]"
                }`}
              >
                Pairs / Pieces
              </button>
              <button
                type="button"
                onClick={() => setAdjMode("cartons")}
                className={`rounded-md px-3 py-1 font-medium cursor-pointer transition-all ${
                  adjMode === "cartons" ? "bg-white text-[#171717] shadow-2xs" : "text-[#55555b]"
                }`}
              >
                Cartons / Boxes
              </button>
            </div>
          </div>

          <div>
            <Label>Branch</Label>
            <Select value={adjBranch} onChange={(e) => setAdjBranch(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>

          {adjMode === "pairs" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>{adjDirection === "remove" ? "Pairs to deduct" : "Pairs to add"}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={adjQty ? String(Math.abs(adjQty)) : ""}
                  placeholder="e.g. 50"
                  onChange={(e) => setAdjQty(Number(e.target.value.replace(/\D/g, "")) || 0)}
                  required
                />
              </div>
              <div>
                <Label>Reason</Label>
                <Select value={adjReason} onChange={(e) => setAdjReason(e.target.value as typeof adjReason)}>
                  <option value="adjustment">
                    {adjDirection === "remove" ? "Damaged / Lost / Taken out" : "New stock arrived"}
                  </option>
                  {adjDirection === "add" && (
                    <option value="opening">Old / Starting stock</option>
                  )}
                  <option value="stock_count">Counted in shop (fix count)</option>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Number of Cartons</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={adjCartons}
                    placeholder="e.g. 5"
                    onChange={(e) => setAdjCartons(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div>
                  <Label>Pieces in 1 Carton</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={adjPack}
                    placeholder="e.g. 20"
                    onChange={(e) => setAdjPack(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>
              <p className={`text-xs font-semibold ${adjDirection === "remove" ? "text-rose-700" : "text-emerald-700"}`}>
                Total to {adjDirection === "remove" ? "deduct" : "add"}:{" "}
                {(Number(adjCartons || 0) * Math.max(1, Number(adjPack || 20))).toLocaleString("en-IN")} pairs
              </p>
              <div>
                <Label>Reason</Label>
                <Select value={adjReason} onChange={(e) => setAdjReason(e.target.value as typeof adjReason)}>
                  <option value="adjustment">
                    {adjDirection === "remove" ? "Damaged / Lost / Taken out" : "New stock arrived"}
                  </option>
                  {adjDirection === "add" && (
                    <option value="opening">Old / Starting stock</option>
                  )}
                  <option value="stock_count">Counted in shop (fix count)</option>
                </Select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => setAdjTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {adjDirection === "remove" ? "Save Deduction" : "Save Added Stock"}
            </Button>
          </div>
        </Form>
      </Dialog>
    </div>
  );
}
