"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Check, CheckCircle2, Download, Eye, FileText, Globe, KeyRound, Landmark, Layers, LayoutGrid, Network, Package, Pencil, Plus, Receipt, RefreshCw, SlidersHorizontal, Trash2, Upload, User } from "lucide-react";
import { DataExportCard } from "@/components/ui/data-export-card";
import { VisualProductBuilder } from "@/components/settings/visual-product-builder";
import { Paged } from "@/components/ui/pagination";
import { toast } from "sonner";
import {
  changeMyPasswordAction,
  createCustomFieldAction,
  deleteCustomFieldAction,
  deleteVariantAxisAction,
  getBackupDownloadUrlAction,
  toggleDeviceActiveAction,
  triggerManualBackupAction,
  updateBrandConfigAction,
  updateBusinessBillingProfileAction,
  updateCategoryTemplatesAction,
  updateCustomFieldAction,
  updateLedgerConfigAction,
  updateMyProfileAction,
  updateTaxConfigAction,
  upsertVariantAxisAction,
} from "@/actions/settings";
import {
  FOOTWEAR_CATEGORY_STARTERS,
  parseCommaList,
  removeCategoryTemplate,
  resolveCategoryTemplates,
  resolveColoursForCategory,
  resolveCustomFieldsForCategory,
  resolveSizesForCategory,
  upsertCategoryTemplate,
  VERTICAL_CATEGORY_PRESETS,
} from "@/lib/catalog/category-templates";
import { GstinInput } from "@/components/ui/dynamic-fields";
import { compressLogoImage, IMAGE_CACHE_CONTROL } from "@/lib/storage/image-compress";
import { fileToLogoPngDataUrl } from "@/lib/storage/logo-data-url";
import { Form,
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  Input,
  Label,
  Select,
  Switch,
  Tabs,
} from "@/components/ui/primitives";
import { resolveLedgerConfig } from "@/lib/ledger/defaults";
import { INDIAN_STATES, type PermissionKey } from "@/lib/constants/saas";
import type {
  BranchRow,
  CategoryTemplate,
  CustomFieldRow,
  TenantRow,
  UiStyleKey,
  VariantAxisRow,
} from "@/types/database";

export function SettingsHubClient({
  tenant,
  branches,
  userRole,
  currentUser,
  initialTab = "brand",
  permissions,
  axes,
  fields,
  devices,
  backups,
  stockEnabled,
  categoryPresetsEnabled = true,
  visualBuilderEnabled = true,
  backupsEnabled,
}: {
  tenant: TenantRow;
  branches: BranchRow[];
  userRole: string;
  currentUser: {
    id: string;
    full_name: string;
    username: string | null;
    email: string | null;
    phone: string | null;
    role: "owner" | "branch_admin" | "worker";
  };
  initialTab?: string;
  permissions: Record<PermissionKey, boolean>;
  axes: VariantAxisRow[];
  fields: CustomFieldRow[];
  devices: Array<{
    id: string;
    branch_id: string;
    device_no: number;
    label: string;
    last_seq: number;
    is_active: boolean;
  }>;
  backups: Array<{
    id: string;
    file_size_bytes: string;
    trigger_type: string;
    checksum_sha256: string;
    created_at: string;
  }>;
  stockEnabled: boolean;
  categoryPresetsEnabled?: boolean;
  visualBuilderEnabled?: boolean;
  backupsEnabled: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);

  // My Profile state
  const [myName, setMyName] = useState(currentUser.full_name);
  const [myEmail, setMyEmail] = useState(currentUser.email ?? "");
  const [myPhone, setMyPhone] = useState(currentUser.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // Business & Bank Details (for Bills) inside My Profile
  const bp = tenant.brand_config?.business_profile;
  const defaultBranch = branches.find((b) => b.is_default) ?? branches[0];
  const [bizName, setBizName] = useState(bp?.business_name ?? tenant.name ?? "");
  const [bizAddress, setBizAddress] = useState(
    bp?.address ?? tenant.brand_config?.address ?? defaultBranch?.address ?? ""
  );
  const [bizPhone, setBizPhone] = useState(
    bp?.phone ?? tenant.brand_config?.phone ?? defaultBranch?.phone ?? ""
  );
  const [bizEmail, setBizEmail] = useState(bp?.email ?? tenant.brand_config?.email ?? "");
  const [bizGstin, setBizGstin] = useState(bp?.gstin ?? defaultBranch?.gstin ?? "");
  const [bizSignatory, setBizSignatory] = useState(bp?.signatory_name ?? bp?.business_name ?? tenant.name ?? "");
  const [bankHolder, setBankHolder] = useState(bp?.bank_details?.account_holder ?? bp?.business_name ?? tenant.name ?? "");
  const [bankName, setBankName] = useState(bp?.bank_details?.bank_name ?? "");
  const [bankAccNo, setBankAccNo] = useState(bp?.bank_details?.account_number ?? "");
  const [bankIfsc, setBankIfsc] = useState(bp?.bank_details?.ifsc_code ?? "");
  const [bankBranch, setBankBranch] = useState(bp?.bank_details?.branch_name ?? "");
  const [bankUpi, setBankUpi] = useState(bp?.bank_details?.upi_id ?? "");
  const [savingBizProfile, setSavingBizProfile] = useState(false);
  const canEditBusinessProfile = userRole === "owner" || userRole === "branch_admin";

  // Brand state
  const [uiStyle, setUiStyle] = useState<UiStyleKey>(tenant.brand_config?.ui_style ?? "style_4");
  const [primaryColor, setPrimaryColor] = useState(tenant.brand_config?.primary_color ?? "#0284c7");
  const [tagline, setTagline] = useState(tenant.brand_config?.tagline ?? "");
  const [mfgInfo, setMfgInfo] = useState(tenant.brand_config?.manufacturer_info ?? "");
  const [care, setCare] = useState(tenant.brand_config?.customer_care ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(
    tenant.brand_config?.logo_pdf_data_url ?? null
  );

  // Simple dynamic Ledger Statement Fields (Owner & Branch Admin)
  const initialLedger = resolveLedgerConfig(tenant.brand_config);
  const [ledgerItemCols, setLedgerItemCols] = useState(initialLedger.item_columns);
  const [ledgerHeaderFields, setLedgerHeaderFields] = useState(initialLedger.header_fields);
  const [newItemColLabel, setNewItemColLabel] = useState("");
  const [newHeaderFieldLabel, setNewHeaderFieldLabel] = useState("");
  const [savingLedgerFields, setSavingLedgerFields] = useState(false);
  const canEditLedgerFields = userRole === "owner" || userRole === "branch_admin";

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const pdfPngDataUrl = await fileToLogoPngDataUrl(file);
      let uploadedKey: string | undefined;
      try {
        const { blob, hash } = await compressLogoImage(file);
        const presign = await fetch("/api/storage/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purpose: "brand_logo",
            hash,
            contentLength: blob.size,
            contentType: blob.type,
          }),
        }).then((r) => r.json());
        if (!presign.error && presign.uploadUrl && presign.key) {
          const putRes = await fetch(presign.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": blob.type, "Cache-Control": IMAGE_CACHE_CONTROL },
            body: blob,
          });
          if (putRes.ok) uploadedKey = presign.key;
        }
      } catch {
        // Fallback to inline PNG data URL if object storage is not configured
      }

      await updateBrandConfigAction(
        {
          ui_style: uiStyle,
          primary_color: primaryColor,
          tagline,
          manufacturer_info: mfgInfo,
          customer_care: care,
          logo_pdf_data_url: pdfPngDataUrl,
        },
        uploadedKey
      );
      setLogoPreviewUrl(pdfPngDataUrl);
      toast.success("Company logo saved! It will appear by default on all bills, PDFs, and your website.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemove = async () => {
    setLogoUploading(true);
    try {
      await updateBrandConfigAction(
        {
          ui_style: uiStyle,
          primary_color: primaryColor,
          tagline,
          manufacturer_info: mfgInfo,
          customer_care: care,
          logo_pdf_data_url: null,
        },
        null
      );
      setLogoPreviewUrl(null);
      toast.success("Company logo removed.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  // Tax state
  const [gstEnabled, setGstEnabled] = useState(tenant.tax_config.gst_enabled);
  const [taxMode, setTaxMode] = useState<"inclusive" | "exclusive">(tenant.tax_config.default_tax_mode);
  const [allowEstimate, setAllowEstimate] = useState(tenant.tax_config.allow_estimate_mode);
  const [allowNegStock, setAllowNegStock] = useState(tenant.tax_config.allow_negative_stock);
  const [hsnDigits, setHsnDigits] = useState<4 | 6>(tenant.tax_config.hsn_digits ?? 4);
  const [stateCode, setStateCode] = useState(tenant.tax_config.default_state_code ?? "33");

  // Product Categories (Category -> Sizes, Colours, Pack & Attached Fields)
  const [catTemplates, setCatTemplates] = useState<CategoryTemplate[]>(() =>
    resolveCategoryTemplates(tenant.brand_config, tenant.vertical_key)
  );
  const [catEditingOrig, setCatEditingOrig] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catSizes, setCatSizes] = useState("");
  const [catColours, setCatColours] = useState("");
  const [catPack, setCatPack] = useState("20");
  const [catAttachedFields, setCatAttachedFields] = useState<string[]>([]);
  const [catCustomFieldInput, setCatCustomFieldInput] = useState("");
  const [savingCatTemplates, setSavingCatTemplates] = useState(false);
  const [previewCategory, setPreviewCategory] = useState<string>(() => {
    const initial = resolveCategoryTemplates(tenant.brand_config, tenant.vertical_key);
    return initial[0]?.category ?? "";
  });
  const [builderMode, setBuilderMode] = useState<"normal" | "visual">("normal");

  // Schema state (Add New inline forms + dedicated Edit Popup Modals)
  const [axisName, setAxisName] = useState("");
  const [axisVals, setAxisVals] = useState("");
  const [editAxisModal, setEditAxisModal] = useState<{ id: string; name: string; vals: string } | null>(null);
  const [cfLabel, setCfLabel] = useState("");
  const [cfType, setCfType] = useState<"text" | "number" | "select" | "boolean" | "date">("text");
  const [cfOpts, setCfOpts] = useState("");
  const [cfShowOnBill, setCfShowOnBill] = useState(false);
  const [cfShowOnWebsite, setCfShowOnWebsite] = useState(true);
  const [cfShowInCatalogue, setCfShowInCatalogue] = useState(true);
  const [editFieldModal, setEditFieldModal] = useState<{
    id: string;
    label: string;
    fieldType: "text" | "number" | "select" | "boolean" | "date";
    opts: string;
    showOnBill: boolean;
    showOnWebsite: boolean;
    showInCatalogue: boolean;
  } | null>(null);
  const [savingSchemaEdit, setSavingSchemaEdit] = useState(false);
  const [previewSurface, setPreviewSurface] = useState<"product_form" | "website" | "bill">("product_form");
  const [previewSelected, setPreviewSelected] = useState<Record<string, string[]>>({});
  const [previewFieldValues, setPreviewFieldValues] = useState<Record<string, string | boolean>>({});
  const [previewWebsitePick, setPreviewWebsitePick] = useState<Record<string, string>>({});
  const [previewWebsiteQty, setPreviewWebsiteQty] = useState(1);
  const [previewShowWaMsg, setPreviewShowWaMsg] = useState(false);
  const [previewSampleName, setPreviewSampleName] = useState("Classic Runner");
  const [previewSampleCode, setPreviewSampleCode] = useState("IMR-101");
  const [previewSamplePrice, setPreviewSamplePrice] = useState(1599);

  return (
    <div className="space-y-4">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "profile", label: "My Profile, Bank & GST" },
          { id: "brand", label: "Shop Look" },
          { id: "schema", label: "Product Options" },
          { id: "devices", label: "Offline Counters" },
          { id: "backups", label: "Backups" },
        ]}
      />

      {tab === "profile" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#171717] text-white">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">Shop &amp; Bank Details (Printed on Every Bill)</h3>
                    <p className="text-xs text-[#77777d]">
                      Save your shop name, address, phone, email, GST number, and bank account once here. Every GST Bill, Normal Bill, and PDF will use these automatically.
                    </p>
                  </div>
                </div>
                <Link
                  href="/dashboard/bill-designer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open Bill Designs →
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {!canEditBusinessProfile && (
                <Alert variant="info" className="mb-4">
                  Only the Shop Owner or Branch Manager can edit shop &amp; bank details. You can still update your personal details below.
                </Alert>
              )}
              {/* Company Logo (Default for all Bills, PDFs & Website) */}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#ececee] bg-[#fafafa] p-3.5">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e5e5e7] bg-white p-1.5">
                    {logoPreviewUrl ? (
                      <img src={logoPreviewUrl} alt={bizName || tenant.name} className="h-full w-full object-contain" />
                    ) : (
                      <Building2 className="h-5 w-5 text-[#a1a1aa]" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#171717]">Company Logo (Default)</p>
                    <p className="mt-0.5 text-[11.5px] text-[#77777d]">
                      Printed automatically on every GST Bill, Normal Bill, PDF, and your Website. You can still override it on any individual bill.
                    </p>
                  </div>
                </div>
                {canEditBusinessProfile && (
                  <div className="flex items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#171717] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2a2a2a]">
                      <Upload className="h-3.5 w-3.5" />
                      <span>{logoUploading ? "Uploading..." : logoPreviewUrl ? "Change Logo" : "Upload Logo"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={logoUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleLogoUpload(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {logoPreviewUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={logoUploading}
                        onClick={() => void handleLogoRemove()}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <Form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSavingBizProfile(true);
                  try {
                    await updateBusinessBillingProfileAction({
                      business_name: bizName,
                      address: bizAddress,
                      phone: bizPhone,
                      email: bizEmail,
                      gstin: bizGstin,
                      signatory_name: bizSignatory,
                      bank_details: {
                        account_holder: bankHolder,
                        bank_name: bankName,
                        account_number: bankAccNo,
                        ifsc_code: bankIfsc,
                        branch_name: bankBranch,
                        upi_id: bankUpi,
                      },
                    });
                    toast.success("Shop & bank details saved! All bills will now show these details.");
                    router.refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not save shop details.");
                  } finally {
                    setSavingBizProfile(false);
                  }
                }}
                className="space-y-5"
              >
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-[#171717]">1. Your Shop / Business Information (Seller)</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Shop / Business Name *</Label>
                      <Input
                        value={bizName}
                        onChange={(e) => setBizName(e.target.value)}
                        placeholder="e.g. HAYATH ENTERPRISES"
                        disabled={!canEditBusinessProfile}
                        required
                      />
                    </div>
                    <div>
                      <Label>GST Number (GSTIN)</Label>
                      {canEditBusinessProfile ? (
                        <GstinInput value={bizGstin} onChange={setBizGstin} />
                      ) : (
                        <Input value={bizGstin} disabled />
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Shop Full Address</Label>
                      <Input
                        value={bizAddress}
                        onChange={(e) => setBizAddress(e.target.value)}
                        placeholder="e.g. No. 19, Kattur Sadayappan Street, Periamet, Chennai - 600003, Tamil Nadu, India"
                        disabled={!canEditBusinessProfile}
                      />
                    </div>
                    <div>
                      <Label>Shop Phone Number</Label>
                      <Input
                        value={bizPhone}
                        onChange={(e) => setBizPhone(e.target.value)}
                        placeholder="e.g. +91 7010345550"
                        disabled={!canEditBusinessProfile}
                      />
                    </div>
                    <div>
                      <Label>Shop Email</Label>
                      <Input
                        type="email"
                        value={bizEmail}
                        onChange={(e) => setBizEmail(e.target.value)}
                        placeholder="e.g. yourshop@gmail.com"
                        disabled={!canEditBusinessProfile}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Signature Name (Shown at Bottom Right as &quot;For ...&quot;)</Label>
                      <Input
                        value={bizSignatory}
                        onChange={(e) => setBizSignatory(e.target.value)}
                        placeholder="e.g. Hayath Enterprises"
                        disabled={!canEditBusinessProfile}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border-t border-[#ececee] pt-4">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-[#1d528a]" />
                    <p className="text-xs font-semibold text-[#171717]">2. Bank &amp; Payment Details (Printed on Bills)</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <Label>Account Holder Name</Label>
                      <Input
                        value={bankHolder}
                        onChange={(e) => setBankHolder(e.target.value)}
                        placeholder="e.g. HAYATH ENTERPRISES"
                        disabled={!canEditBusinessProfile}
                      />
                    </div>
                    <div>
                      <Label>Bank Name</Label>
                      <Input
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="e.g. J&K BANK"
                        disabled={!canEditBusinessProfile}
                      />
                    </div>
                    <div>
                      <Label>Account Number</Label>
                      <Input
                        value={bankAccNo}
                        onChange={(e) => setBankAccNo(e.target.value)}
                        placeholder="e.g. 2222010100000960"
                        disabled={!canEditBusinessProfile}
                      />
                    </div>
                    <div>
                      <Label>IFSC Code</Label>
                      <Input
                        value={bankIfsc}
                        onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                        placeholder="e.g. JAKA0PARRYS"
                        disabled={!canEditBusinessProfile}
                      />
                    </div>
                    <div>
                      <Label>Bank Branch (Optional)</Label>
                      <Input
                        value={bankBranch}
                        onChange={(e) => setBankBranch(e.target.value)}
                        placeholder="e.g. Parrys Corner, Chennai"
                        disabled={!canEditBusinessProfile}
                      />
                    </div>
                    <div>
                      <Label>UPI ID (Optional)</Label>
                      <Input
                        value={bankUpi}
                        onChange={(e) => setBankUpi(e.target.value)}
                        placeholder="e.g. shop@upi"
                        disabled={!canEditBusinessProfile}
                      />
                    </div>
                  </div>
                </div>

                {canEditBusinessProfile && (
                  <Button type="submit" disabled={savingBizProfile}>
                    {savingBizProfile ? "Saving..." : "Save Shop & Bank Details"}
                  </Button>
                )}
              </Form>
            </CardContent>
          </Card>

          {/* ── Tax, GST & Billing Rules (Merged into Profile) ── */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#171717] text-white">
                    <Receipt className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">Tax, GST &amp; Billing Rules</h3>
                    <p className="text-xs text-[#77777d]">
                      Control whether your shop charges GST and how prices are calculated. Your GST number above automatically applies to your main shop.
                    </p>
                  </div>
                </div>
                <Link
                  href="/dashboard/bill-designer"
                  className="inline-flex items-center gap-1 rounded-lg border border-[#e5e5e7] bg-white px-3 py-1.5 text-xs font-semibold text-[#171717] hover:bg-[#fafafa]"
                >
                  Open Bill Designs →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* GST Readiness Strip */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 text-xs">
                <div className="flex items-start gap-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                  {gstEnabled ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <p className="font-semibold text-[#171717]">1. GST Billing</p>
                    <p className="text-[11px] text-[#77777d]">
                      {gstEnabled ? "Enabled for GST bills" : "Currently OFF — turn on below"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                  <div className="flex items-start gap-2">
                    {bizGstin.trim() || branches.some((b) => Boolean(b.gstin)) ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <div>
                      <p className="font-semibold text-[#171717]">2. Shop GSTIN</p>
                      <p className="text-[11px] text-[#77777d]">
                        {bizGstin.trim()
                          ? "Set above in Shop & Bank Details"
                          : "Enter your GSTIN above if registered"}
                      </p>
                    </div>
                  </div>
                  {branches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTab("branches")}
                      className="shrink-0 cursor-pointer text-[11px] font-semibold text-[#171717] underline underline-offset-2 hover:text-[#52525b]"
                    >
                      Other shops →
                    </button>
                  )}
                </div>
                <div className="flex items-start gap-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-[#171717]">3. Shop State &amp; HSN</p>
                    <p className="text-[11px] text-[#77777d]">
                      State {stateCode} · {hsnDigits}-digit HSN
                    </p>
                  </div>
                </div>
              </div>

              {/* Billing Switches & Price / State / HSN Rules */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                  <Switch checked={gstEnabled} onCheckedChange={setGstEnabled} label="Charge GST on Bills" />
                  <p className="mt-1 text-[11px] text-[#77777d]">Turn OFF if your shop does not charge GST.</p>
                </div>
                <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                  <Switch checked={allowEstimate} onCheckedChange={setAllowEstimate} label="Allow Non-GST Estimates" />
                  <p className="mt-1 text-[11px] text-[#77777d]">Lets staff create simple Normal Bills without GST.</p>
                </div>
                <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                  <Switch checked={allowNegStock} onCheckedChange={setAllowNegStock} label="Allow Billing at 0 Stock" />
                  <p className="mt-1 text-[11px] text-[#77777d]">Shows a warning instead of stopping billing at 0 stock.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <Label>How are your product prices set?</Label>
                  <Select value={taxMode} onChange={(e) => setTaxMode(e.target.value as "inclusive" | "exclusive")}>
                    <option value="inclusive">Tax Included in Price (Retail MRP)</option>
                    <option value="exclusive">Add Tax on Top of Price (Wholesale / B2B)</option>
                  </Select>
                </div>
                <div>
                  <Label>HSN Code Length on Bills</Label>
                  <Select value={String(hsnDigits)} onChange={(e) => setHsnDigits(Number(e.target.value) as 4 | 6)}>
                    <option value="4">4 Digits (Turnover up to ₹5 Cr)</option>
                    <option value="6">6 Digits (Turnover above ₹5 Cr)</option>
                  </Select>
                </div>
                <div>
                  <Label>Your Shop State (CGST/SGST vs IGST)</Label>
                  <Select value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
                    {Object.entries(INDIAN_STATES).map(([c, n]) => (
                      <option key={c} value={c}>{c} — {n}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <Button
                disabled={!permissions["settings.tax_and_hsn"]}
                onClick={async () => {
                  await updateTaxConfigAction({
                    gst_enabled: gstEnabled,
                    default_tax_mode: taxMode,
                    allow_estimate_mode: allowEstimate,
                    allow_negative_stock: allowNegStock,
                    hsn_digits: hsnDigits,
                    costing: "weighted_avg",
                    default_state_code: stateCode,
                  });
                  toast.success("Tax & GST settings saved.");
                  router.refresh();
                }}
              >
                Save Tax &amp; GST Settings
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#171717] text-xs font-bold text-white">
                  {currentUser.full_name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? "")
                    .join("") || <User className="h-4 w-4" />}
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{currentUser.full_name}</h3>
                  <p className="text-xs text-[#77777d]">
                    {currentUser.username ? `@${currentUser.username} · ` : ""}
                    <span className="capitalize">{currentUser.role.replace("_", " ")}</span> · {tenant.name}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSavingProfile(true);
                  try {
                    await updateMyProfileAction({
                      fullName: myName,
                      email: myEmail || undefined,
                      phone: myPhone || undefined,
                    });
                    toast.success("Profile updated!");
                    router.refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not update profile.");
                  } finally {
                    setSavingProfile(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <Label>Full Name *</Label>
                  <Input value={myName} onChange={(e) => setMyName(e.target.value)} required />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Email (Optional)</Label>
                    <Input
                      type="email"
                      value={myEmail}
                      onChange={(e) => setMyEmail(e.target.value)}
                      placeholder="you@shop.com"
                    />
                  </div>
                  <div>
                    <Label>Phone (Optional)</Label>
                    <Input
                      value={myPhone}
                      onChange={(e) => setMyPhone(e.target.value)}
                      placeholder="9876543210"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-[#ececee] bg-[#fafafa] px-3 py-2 text-[11.5px] text-[#77777d]">
                  Username: <strong className="font-mono text-[#171717]">@{currentUser.username || "—"}</strong> · Role:{" "}
                  <strong className="capitalize text-[#171717]">{currentUser.role.replace("_", " ")}</strong>
                </div>
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save My Profile"}
                </Button>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold">Change My Password</h3>
              <p className="mt-0.5 text-xs text-[#77777d]">
                Keep your account secure with a strong password (minimum 8 characters).
              </p>
            </CardHeader>
            <CardContent>
              <Form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (newPw !== confirmPw) {
                    toast.error("New password and confirm password do not match.");
                    return;
                  }
                  setSavingPw(true);
                  try {
                    await changeMyPasswordAction({
                      currentPassword: curPw,
                      newPassword: newPw,
                    });
                    setCurPw("");
                    setNewPw("");
                    setConfirmPw("");
                    toast.success("Password updated successfully!");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not change password.");
                  } finally {
                    setSavingPw(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <Label>Current Password *</Label>
                  <Input
                    type="password"
                    value={curPw}
                    onChange={(e) => setCurPw(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>New Password (min 8 chars) *</Label>
                  <Input
                    type="password"
                    minLength={8}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Confirm New Password *</Label>
                  <Input
                    type="password"
                    minLength={8}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={savingPw}>
                  <KeyRound className="h-3.5 w-3.5" />
                  {savingPw ? "Updating..." : "Update Password"}
                </Button>
              </Form>
            </CardContent>
          </Card>
          </div>
        </div>
      )}

      {tab === "brand" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold">Shop Appearance &amp; Business Details</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <Label>Dashboard Look</Label>
                  <Select value={uiStyle} onChange={(e) => setUiStyle(e.target.value as UiStyleKey)}>
                    <option value="style_1">Clean Light Theme (Recommended)</option>
                    <option value="style_2">Dark Sidebar Theme</option>
                    <option value="style_3">Minimalist Operations Theme</option>
                    <option value="style_4">Full ERP Suite Theme</option>
                    <option value="style_5">High-Contrast Financial Theme</option>
                  </Select>
                  <p className="mt-1 text-[11px] text-[#77777d]">Pick the sidebar and dashboard color mood you prefer.</p>
                </div>
                <div>
                  <Label>Brand Accent Color</Label>
                  <div className="flex items-center gap-2.5">
                    <Input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="!w-14 h-9 p-1 cursor-pointer" />
                    <span className="font-mono text-xs text-[#55555b]">{primaryColor.toUpperCase()}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#77777d]">Used as the highlight color on your printed bills and website.</p>
                </div>
                <div className="sm:col-span-2">
                  <Label>Shop Tagline (Optional)</Label>
                  <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="e.g. Direct Factory Footwear & Wholesale" />
                </div>
                <div>
                  <Label>Manufacturer / Box Label Address (Optional)</Label>
                  <Input value={mfgInfo} onChange={(e) => setMfgInfo(e.target.value)} placeholder="Printed on barcode / box stickers" />
                </div>
                <div>
                  <Label>Customer Support Phone / Email (Optional)</Label>
                  <Input value={care} onChange={(e) => setCare(e.target.value)} placeholder="e.g. +91 98765 43210" />
                </div>
                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ececee] bg-[#fafafa] p-3.5 text-xs">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[#171717]">Shop Logo</p>
                    <p className="text-[11.5px] text-[#77777d]">
                      {tenant.brand_config?.logo_key
                        ? "Active logo uploaded — shown on bills, PDF catalogues, and your website."
                        : "Upload your shop logo (PNG or JPG) to show on bills, PDFs, and your website."}
                    </p>
                  </div>
                  <label className={`inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-semibold text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.09)] hover:bg-[#fafafa] cursor-pointer ${!permissions["settings.tax_and_hsn"] || logoUploading ? "opacity-50 pointer-events-none" : ""}`}>
                    <Upload className="h-3.5 w-3.5" />
                    {logoUploading ? "Uploading..." : "Upload Logo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoUpload(f);
                      }}
                    />
                  </label>
                </div>
              </div>
              <Button
                disabled={!permissions["settings.tax_and_hsn"]}
                onClick={async () => {
                  await updateBrandConfigAction({
                    ui_style: uiStyle,
                    primary_color: primaryColor,
                    tagline,
                    manufacturer_info: mfgInfo,
                    customer_care: care,
                  });
                  toast.success("Brand settings saved.");
                  router.refresh();
                }}
              >
                Save Brand Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "brand" && canEditLedgerFields && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">Customer &amp; Supplier Ledger Statement Fields</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Turn columns ON or OFF, or type a new field name to add it to your PDF, Excel &amp; CSV ledger statements.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-800">1. Item Table Columns (Item &amp; Amount are always shown)</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ledgerItemCols.map((col, idx) => (
                  <div
                    key={col.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <Switch
                      checked={col.enabled}
                      onCheckedChange={(v) =>
                        setLedgerItemCols((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, enabled: v } : c))
                        )
                      }
                      label={col.label}
                    />
                    {col.isCustom && (
                      <button
                        type="button"
                        onClick={() => setLedgerItemCols((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-rose-500 hover:text-rose-700"
                        title="Remove custom column"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex max-w-md gap-2">
                <Input
                  value={newItemColLabel}
                  onChange={(e) => setNewItemColLabel(e.target.value)}
                  placeholder="Add column (e.g. Box, Grade, Pattern)"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const label = newItemColLabel.trim();
                    if (!label) return;
                    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                    if (ledgerItemCols.some((c) => c.key === key)) {
                      toast.error("This column already exists.");
                      return;
                    }
                    setLedgerItemCols((prev) => [...prev, { key, label, enabled: true, isCustom: true }]);
                    setNewItemColLabel("");
                  }}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>

            <div className="space-y-2.5 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-800">2. Bill / Transport Details (shown under Particulars)</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ledgerHeaderFields.map((field, idx) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <Switch
                      checked={field.enabled}
                      onCheckedChange={(v) =>
                        setLedgerHeaderFields((prev) =>
                          prev.map((f, i) => (i === idx ? { ...f, enabled: v } : f))
                        )
                      }
                      label={field.label}
                    />
                    {field.isCustom && (
                      <button
                        type="button"
                        onClick={() => setLedgerHeaderFields((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-rose-500 hover:text-rose-700"
                        title="Remove custom field"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex max-w-md gap-2">
                <Input
                  value={newHeaderFieldLabel}
                  onChange={(e) => setNewHeaderFieldLabel(e.target.value)}
                  placeholder="Add detail field (e.g. Driver, Godown, Mark)"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const label = newHeaderFieldLabel.trim();
                    if (!label) return;
                    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                    if (ledgerHeaderFields.some((f) => f.key === key)) {
                      toast.error("This field already exists.");
                      return;
                    }
                    setLedgerHeaderFields((prev) => [...prev, { key, label, enabled: true, isCustom: true }]);
                    setNewHeaderFieldLabel("");
                  }}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>

            <Button
              disabled={savingLedgerFields}
              onClick={async () => {
                setSavingLedgerFields(true);
                try {
                  await updateLedgerConfigAction({
                    item_columns: ledgerItemCols,
                    header_fields: ledgerHeaderFields,
                  });
                  toast.success("Ledger statement fields saved!");
                  router.refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not save ledger fields.");
                } finally {
                  setSavingLedgerFields(false);
                }
              }}
            >
              {savingLedgerFields ? "Saving..." : "Save Ledger Statement Fields"}
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === "schema" && (() => {
        // Build live preview lists that include saved items + live modal edits or new drafts!
        const draftCatSizes = parseCommaList(catSizes);
        const draftCatColours = parseCommaList(catColours);
        const hasDraftCat = catName.trim().length > 0;
        const effectiveCatTemplates = hasDraftCat
          ? upsertCategoryTemplate(
              catTemplates,
              {
                category: catName.trim(),
                default_sizes: draftCatSizes,
                default_colours: draftCatColours,
                default_pieces_per_carton: Math.max(1, Number(catPack || 20)),
                extra_fields: catAttachedFields,
              },
              catEditingOrig
            )
          : catTemplates;
        const activePreviewCat =
          effectiveCatTemplates.find((t) => t.category.toLowerCase() === previewCategory.trim().toLowerCase())
            ?.category ??
          effectiveCatTemplates[0]?.category ??
          "";

        const draftAxisVals = Array.from(new Set(axisVals.split(",").map((s) => s.trim()).filter(Boolean)));
        const hasDraftAxis = axisName.trim().length > 0 && draftAxisVals.length > 0;
        const modalAxisVals = editAxisModal
          ? Array.from(new Set(editAxisModal.vals.split(",").map((s) => s.trim()).filter(Boolean)))
          : [];
        const basePreviewAxes: Array<{ id: string; name: string; preset_values: string[]; isDraft?: boolean }> = [
          ...axes.map((a) =>
            editAxisModal && editAxisModal.id === a.id && editAxisModal.name.trim() && modalAxisVals.length > 0
              ? { id: a.id, name: editAxisModal.name.trim(), preset_values: modalAxisVals, isDraft: true }
              : { id: a.id, name: a.name, preset_values: a.preset_values }
          ),
          ...(hasDraftAxis
            ? [{ id: "__draft_axis__", name: axisName.trim(), preset_values: draftAxisVals, isDraft: true }]
            : []),
        ];

        const catSizeRes = resolveSizesForCategory(effectiveCatTemplates, activePreviewCat, basePreviewAxes);
        const catColourRes = resolveColoursForCategory(effectiveCatTemplates, activePreviewCat, basePreviewAxes);
        const previewAxes: Array<{ id: string; name: string; preset_values: string[]; isDraft?: boolean; badge?: string }> = [];
        if (catSizeRes.sizes.length > 0) {
          previewAxes.push({
            id: `__cat_size_${activePreviewCat || "general"}__`,
            name: "Size",
            preset_values: catSizeRes.sizes,
            badge: catSizeRes.source === "category" && activePreviewCat ? `${activePreviewCat} sizes` : undefined,
          });
        }
        if (catColourRes.colours.length > 0) {
          previewAxes.push({
            id: `__cat_colour_${activePreviewCat || "general"}__`,
            name: "Colour",
            preset_values: catColourRes.colours,
            badge: catColourRes.source === "category" && activePreviewCat ? `${activePreviewCat} colours` : undefined,
          });
        }
        for (const ax of basePreviewAxes) {
          const lower = ax.name.trim().toLowerCase();
          if (lower === "size" || lower === "sizes" || lower === "colour" || lower === "color") continue;
          previewAxes.push(ax);
        }

        const draftFieldOpts = Array.from(new Set(cfOpts.split(",").map((s) => s.trim()).filter(Boolean)));
        const hasDraftField = cfLabel.trim().length > 0;
        const modalFieldOpts = editFieldModal
          ? Array.from(new Set(editFieldModal.opts.split(",").map((s) => s.trim()).filter(Boolean)))
          : [];
        const allPreviewFields: Array<{
          id: string;
          label: string;
          field_type: "text" | "number" | "select" | "boolean" | "date";
          options: string[];
          show_on_bill: boolean;
          show_on_website: boolean;
          show_in_catalogue: boolean;
          isDraft?: boolean;
        }> = [
          ...fields.map((f) =>
            editFieldModal && editFieldModal.id === f.id && editFieldModal.label.trim()
              ? {
                  id: f.id,
                  label: editFieldModal.label.trim(),
                  field_type: editFieldModal.fieldType,
                  options: modalFieldOpts,
                  show_on_bill: editFieldModal.showOnBill,
                  show_on_website: editFieldModal.showOnWebsite,
                  show_in_catalogue: editFieldModal.showInCatalogue,
                  isDraft: true,
                }
              : {
                  id: f.id,
                  label: f.label,
                  field_type: f.field_type,
                  options: Array.isArray(f.options) ? f.options : [],
                  show_on_bill: f.show_on_bill,
                  show_on_website: f.show_on_website,
                  show_in_catalogue: f.show_in_catalogue,
                }
          ),
          ...(hasDraftField
            ? [
                {
                  id: "__draft_field__",
                  label: cfLabel.trim(),
                  field_type: cfType,
                  options: draftFieldOpts,
                  show_on_bill: cfShowOnBill,
                  show_on_website: cfShowOnWebsite,
                  show_in_catalogue: cfShowInCatalogue,
                  isDraft: true,
                },
              ]
            : []),
        ];

        const catFieldsResolved = resolveCustomFieldsForCategory(
          effectiveCatTemplates,
          activePreviewCat,
          fields
        );
        const previewFields = catFieldsResolved.isCategoryFiltered
          ? [
              ...catFieldsResolved.fields.map((cf) => {
                const live = allPreviewFields.find((p) => p.id === cf.id);
                return (
                  live ?? {
                    id: cf.id,
                    label: cf.label,
                    field_type: cf.field_type,
                    options: Array.isArray(cf.options) ? cf.options : [],
                    show_on_bill: cf.show_on_bill,
                    show_on_website: cf.show_on_website,
                    show_in_catalogue: cf.show_in_catalogue,
                  }
                );
              }),
              ...(hasDraftField ? allPreviewFields.filter((p) => p.id === "__draft_field__") : []),
            ]
          : allPreviewFields;

        const getSelectedForAxis = (ax: { id: string; preset_values: string[] }) => {
          const picked = previewSelected[ax.id];
          if (picked && picked.length > 0) {
            const valid = picked.filter((v) => ax.preset_values.includes(v));
            if (valid.length > 0) return valid;
          }
          return ax.preset_values.slice(0, Math.min(2, ax.preset_values.length));
        };

        const togglePreviewChip = (axisId: string, val: string, currentSelected: string[]) => {
          setPreviewSelected((prev) => {
            const current = prev[axisId] ?? currentSelected;
            const exists = current.includes(val);
            const next = exists ? current.filter((x) => x !== val) : [...current, val];
            return { ...prev, [axisId]: next.length > 0 ? next : [val] };
          });
        };

        // Cartesian product of currently selected chips to generate real live SKU previews
        const generateSkuCombos = (): string[][] => {
          if (previewAxes.length === 0) return [];
          let combos: string[][] = [[]];
          for (const ax of previewAxes) {
            const sel = getSelectedForAxis(ax);
            if (sel.length === 0) continue;
            const next: string[][] = [];
            for (const c of combos) {
              for (const val of sel) {
                next.push([...c, val]);
              }
            }
            combos = next;
          }
          return combos;
        };

        const liveSkuCombos = generateSkuCombos();
        const liveComboCount = Math.max(1, liveSkuCombos.length);
        const cleanCode = (previewSampleCode.trim() || "IMR-101").toUpperCase();
        const safePrice = Number.isFinite(previewSamplePrice) && previewSamplePrice >= 0 ? previewSamplePrice : 0;

        // Website single-choice picker per axis
        const getWebsitePick = (ax: { id: string; preset_values: string[] }) => {
          const picked = previewWebsitePick[ax.id];
          if (picked && ax.preset_values.includes(picked)) return picked;
          return getSelectedForAxis(ax)[0] ?? ax.preset_values[0] ?? "";
        };

        // Read live user-entered value for a preview field (falls back to clean default)
        const getFieldDisplayVal = (f: { id: string; field_type: string; options: string[] }) => {
          const raw = previewFieldValues[f.id];
          if (f.field_type === "boolean") {
            const boolVal = typeof raw === "boolean" ? raw : true;
            return boolVal ? "Yes" : "No";
          }
          if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
          if (f.field_type === "select") return f.options[0] || "Option 1";
          if (f.field_type === "number") return "12";
          if (f.field_type === "date") return "2026-04-01";
          return "Genuine Leather";
        };

        const quickAxisPresets = [
          { label: "+ Footwear Sizes", name: "Size", vals: "UK 6, UK 7, UK 8, UK 9, UK 10" },
          { label: "+ Colours", name: "Colour", vals: "Black, Tan, Brown, White" },
          { label: "+ Clothing Sizes", name: "Size", vals: "S, M, L, XL, XXL" },
          { label: "+ Pack / Carton", name: "Pack", vals: "Single, 6-Pair Set, 12-Pair Carton" },
        ];

        const quickFieldPresets: Array<{
          label: string;
          name: string;
          type: "text" | "number" | "select" | "boolean" | "date";
          opts: string;
          bill: boolean;
          web: boolean;
          pdf: boolean;
        }> = [
          { label: "+ Sole Type", name: "Sole Type", type: "select", opts: "PU, EVA, TPR, Airmax, Leather", bill: false, web: true, pdf: true },
          { label: "+ Upper Material", name: "Upper Material", type: "select", opts: "Genuine Leather, Mesh, Rexine, Suede", bill: false, web: true, pdf: true },
          { label: "+ Pairs / Carton", name: "Pairs per Carton", type: "number", opts: "", bill: true, web: true, pdf: true },
          { label: "+ Warranty", name: "Warranty", type: "text", opts: "", bill: true, web: true, pdf: false },
        ];

        const activeWebsiteSummary = previewAxes.map((ax) => `${ax.name}: ${getWebsitePick(ax)}`).filter(Boolean).join(", ");
        const canManageCategories = userRole === "owner" || userRole === "branch_admin" || permissions["settings.catalog_schema"];

        const startEditCategory = (t: CategoryTemplate) => {
          setCatEditingOrig(t.category);
          setCatName(t.category);
          setCatSizes(t.default_sizes.join(", "));
          setCatColours(t.default_colours.join(", "));
          setCatPack(String(t.default_pieces_per_carton || 20));
          setCatAttachedFields([...t.extra_fields]);
          setPreviewCategory(t.category);
        };

        const resetCategoryForm = () => {
          setCatEditingOrig(null);
          setCatName("");
          setCatSizes("");
          setCatColours("");
          setCatPack("20");
          setCatAttachedFields([]);
          setCatCustomFieldInput("");
        };

        const saveCategoryForm = async (e: React.FormEvent) => {
          e.preventDefault();
          const clean = catName.trim();
          if (!clean) {
            toast.error("Please enter a category name (e.g. Men's Footwear).");
            return;
          }
          const nextEntry: CategoryTemplate = {
            category: clean,
            default_sizes: parseCommaList(catSizes),
            default_colours: parseCommaList(catColours),
            default_pieces_per_carton: Math.max(1, Number(catPack || 20)),
            extra_fields: Array.from(new Set(catAttachedFields.map((f) => f.trim()).filter(Boolean))),
          };
          const nextList = upsertCategoryTemplate(catTemplates, nextEntry, catEditingOrig);
          setSavingCatTemplates(true);
          try {
            await updateCategoryTemplatesAction(nextList);
            setCatTemplates(nextList);
            setPreviewCategory(clean);
            toast.success(catEditingOrig ? `Updated "${clean}"!` : `Added "${clean}"!`);
            resetCategoryForm();
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save category.");
          } finally {
            setSavingCatTemplates(false);
          }
        };

        const deleteCategoryItem = async (targetName: string) => {
          if (!confirm(`Remove category "${targetName}"? Existing products won't be deleted.`)) return;
          const nextList = removeCategoryTemplate(catTemplates, targetName);
          setSavingCatTemplates(true);
          try {
            await updateCategoryTemplatesAction(nextList);
            setCatTemplates(nextList);
            if (previewCategory.toLowerCase() === targetName.toLowerCase()) {
              setPreviewCategory(nextList[0]?.category ?? "");
            }
            if (catEditingOrig?.toLowerCase() === targetName.toLowerCase()) {
              resetCategoryForm();
            }
            toast.success(`Removed "${targetName}".`);
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not remove category.");
          } finally {
            setSavingCatTemplates(false);
          }
        };

        const toggleAttachedField = (fieldLabel: string) => {
          setCatAttachedFields((prev) =>
            prev.some((x) => x.toLowerCase() === fieldLabel.toLowerCase())
              ? prev.filter((x) => x.toLowerCase() !== fieldLabel.toLowerCase())
              : [...prev, fieldLabel]
          );
        };

        const totalConfiguredSizes = catTemplates.reduce((sum, t) => sum + t.default_sizes.length, 0);

        const saveVisualTemplates = async (nextList: CategoryTemplate[], successMessage?: string) => {
          setSavingCatTemplates(true);
          try {
            await updateCategoryTemplatesAction(nextList);
            setCatTemplates(nextList);
            if (successMessage) toast.success(successMessage);
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save categories.");
          } finally {
            setSavingCatTemplates(false);
          }
        };

        const createVisualField = async (input: {
          label: string;
          fieldType: "text" | "number" | "select" | "boolean" | "date";
          options: string[];
        }) => {
          await createCustomFieldAction({
            fieldKey: input.label,
            label: input.label,
            fieldType: input.fieldType,
            options: input.options,
            showOnBill: false,
            showOnWebsite: true,
            showInCatalogue: true,
          });
          router.refresh();
        };

        return (
          <div className="space-y-4">
            {!stockEnabled && !categoryPresetsEnabled && !visualBuilderEnabled ? (
              <Alert variant="warning">Product Options are not active on your current plan.</Alert>
            ) : (
              <>
                {/* Builder Mode Switcher + Plain-English Overview */}
                <div className="rounded-2xl border border-[#e5e5e7] bg-[#fafafa] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#171717]">How Your Products Are Organized</p>
                      <p className="mt-0.5 text-xs text-[#77777d]">
                        When adding stock, you pick a <strong>Category</strong> first — the right <strong>Sizes</strong>,{" "}
                        <strong>Colours</strong>, and <strong>Extra Details</strong> for that category appear automatically.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Normal Builder / Visual Builder Toggle */}
                      <div
                        role="tablist"
                        aria-label="Product builder view"
                        className="inline-flex rounded-full bg-[#e7e7e9] p-1 text-xs font-semibold"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={builderMode === "normal"}
                          onClick={() => setBuilderMode("normal")}
                          className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-all ${
                            builderMode === "normal"
                              ? "bg-white text-[#171717] shadow-xs"
                              : "text-[#77777d] hover:text-[#171717]"
                          }`}
                        >
                          <LayoutGrid className="h-3.5 w-3.5" /> Normal Builder
                        </button>
                        {visualBuilderEnabled && (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={builderMode === "visual"}
                            onClick={() => setBuilderMode("visual")}
                            className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-all ${
                              builderMode === "visual"
                                ? "bg-white text-[#171717] shadow-xs"
                                : "text-[#77777d] hover:text-[#171717]"
                            }`}
                          >
                            <Network className="h-3.5 w-3.5" /> Visual Builder
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[#171717] border border-[#e5e5e7]">
                          {catTemplates.length} Categories
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[#171717] border border-[#e5e5e7]">
                          {totalConfiguredSizes} Sizes
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[#171717] border border-[#e5e5e7]">
                          {fields.length} Fields
                        </span>
                      </div>
                    </div>
                  </div>
                  {builderMode === "normal" && (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
                      <div className="rounded-xl border border-[#ececee] bg-white px-3 py-2">
                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#77777d]">Step 1 · Product</p>
                        <p className="mt-0.5 font-semibold text-[#171717]">Name, Code &amp; Price</p>
                        <p className="text-[11px] text-[#77777d]">Example: Classic Runner · IMR-101</p>
                      </div>
                      <div className="rounded-xl border border-[#ececee] bg-white px-3 py-2">
                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#77777d]">Step 2 · Pick Category</p>
                        <p className="mt-0.5 font-semibold text-[#171717]">Men&apos;s, Women&apos;s, Kids, Baby…</p>
                        <p className="text-[11px] text-[#77777d]">Each category has its own size list</p>
                      </div>
                      <div className="rounded-xl border border-[#ececee] bg-white px-3 py-2">
                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#77777d]">Step 3 · Sizes &amp; Details</p>
                        <p className="mt-0.5 font-semibold text-[#171717]">Right Sizes + Attached Fields</p>
                        <p className="text-[11px] text-[#77777d]">Only shows what belongs to that category</p>
                      </div>
                    </div>
                  )}
                </div>

                {builderMode === "visual" ? (
                  <VisualProductBuilder
                    templates={catTemplates}
                    customFields={fields}
                    canManage={canManageCategories}
                    saving={savingCatTemplates}
                    onSaveTemplates={saveVisualTemplates}
                    onCreateField={createVisualField}
                  />
                ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
                  {/* LEFT COLUMN: BUILDER (7 cols) */}
                  <div className="space-y-4 lg:col-span-7">
                    {/* Card 1: Product Categories & Their Sizes (Visual Cards + Dynamic Editor) */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#171717] text-white">
                            <Package className="h-4 w-4" />
                          </span>
                          <div>
                            <h3 className="text-sm font-semibold">
                              1. Product Categories &amp; Sizes ({catTemplates.length})
                            </h3>
                            <p className="text-[11.5px] text-[#77777d]">
                              Click any category to preview it on the right, or edit its sizes, colours, and attached details.
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {catTemplates.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-[#d4d4d8] bg-[#fafafa] p-4 text-center text-xs text-[#77777d]">
                            No categories yet. Click a starter button below (like Men&apos;s Footwear) or add your own.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {catTemplates.map((t) => {
                              const isSelected = activePreviewCat.toLowerCase() === t.category.toLowerCase();
                              return (
                                <div
                                  key={t.category}
                                  onClick={() => setPreviewCategory(t.category)}
                                  className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                                    isSelected
                                      ? "border-[#171717] bg-white ring-1 ring-[#171717]/15"
                                      : "border-[#ececee] bg-[#fafafa] hover:border-[#d4d4d8]"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <p className="font-semibold text-[#171717] truncate">{t.category}</p>
                                        <span className="rounded-full bg-[#f4f4f5] px-2 py-0.5 text-[10px] font-medium text-[#52525b]">
                                          {t.default_pieces_per_carton} / box
                                        </span>
                                      </div>
                                    </div>
                                    {canManageCategories && (
                                      <div
                                        className="flex items-center gap-1 shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          type="button"
                                          title={`Edit ${t.category}`}
                                          onClick={() => startEditCategory(t)}
                                          className="rounded-lg bg-white p-1.5 text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#f4f4f5] cursor-pointer"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          title={`Remove ${t.category}`}
                                          disabled={savingCatTemplates}
                                          onClick={() => deleteCategoryItem(t.category)}
                                          className="rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50 cursor-pointer"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Sizes visual chips */}
                                  <div className="mt-2.5 space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#77777d]">
                                      Sizes ({t.default_sizes.length})
                                    </p>
                                    {t.default_sizes.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {t.default_sizes.map((s) => (
                                          <span
                                            key={s}
                                            className="rounded-md border border-[#e5e5e7] bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[#171717]"
                                          >
                                            {s}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-[10.5px] text-[#77777d] italic">Uses general sizes</p>
                                    )}
                                  </div>

                                  {/* Attached Fields visual badges */}
                                  <div className="mt-2 space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#77777d]">
                                      Attached Fields ({t.extra_fields.length})
                                    </p>
                                    {t.extra_fields.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {t.extra_fields.map((ef) => (
                                          <span
                                            key={ef}
                                            className="rounded-md bg-[#171717]/5 border border-[#e5e5e7] px-2 py-0.5 text-[10px] font-medium text-[#171717]"
                                          >
                                            {ef}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-[10.5px] text-[#77777d] italic">Shows all general extra details</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 1-Click Business Presets (Multiple Verticals) */}
                        <div className="space-y-2 border-t border-[#ececee] pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <p className="text-[11px] font-semibold text-[#171717]">
                              Ready-Made Business Presets (1-click setup):
                            </p>
                            <span className="text-[10.5px] text-[#77777d]">
                              Loads categories, sizes &amp; fields — you can edit anything after
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {VERTICAL_CATEGORY_PRESETS.map((preset) => (
                              <button
                                key={preset.key}
                                type="button"
                                disabled={!canManageCategories || savingCatTemplates}
                                title={preset.description}
                                onClick={async () => {
                                  if (
                                    !confirm(
                                      `Load the "${preset.label}" preset (${preset.categories
                                        .map((c) => c.category)
                                        .join(", ")})? This replaces your category list above (existing products are not affected).`
                                    )
                                  ) {
                                    return;
                                  }
                                  const nextList = preset.categories.map((c) => ({
                                    ...c,
                                    default_sizes: [...c.default_sizes],
                                    default_colours: [...c.default_colours],
                                    extra_fields: [...c.extra_fields],
                                  }));
                                  setSavingCatTemplates(true);
                                  try {
                                    await updateCategoryTemplatesAction(nextList);
                                    setCatTemplates(nextList);
                                    setPreviewCategory(nextList[0]?.category ?? "");
                                    resetCategoryForm();
                                    toast.success(`Loaded ${preset.label} preset (${nextList.length} categories)!`);
                                    router.refresh();
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : "Could not load preset.");
                                  } finally {
                                    setSavingCatTemplates(false);
                                  }
                                }}
                                className="cursor-pointer rounded-full border border-[#171717]/20 bg-white px-3 py-1 text-[11px] font-semibold text-[#171717] transition-colors hover:bg-[#171717] hover:text-white disabled:opacity-50"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <div className="pt-1 space-y-1">
                            <p className="text-[10.5px] font-medium text-[#77777d]">
                              Or add one footwear category to the form below:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {FOOTWEAR_CATEGORY_STARTERS.map((starter) => (
                                <button
                                  key={starter.category}
                                  type="button"
                                  onClick={() => {
                                    setCatEditingOrig(null);
                                    setCatName(starter.category);
                                    setCatSizes(starter.default_sizes.join(", "));
                                    setCatColours(starter.default_colours.join(", "));
                                    setCatPack(String(starter.default_pieces_per_carton));
                                    setCatAttachedFields([...starter.extra_fields]);
                                    setPreviewCategory(starter.category);
                                  }}
                                  className="cursor-pointer rounded-full border border-[#e5e5e7] bg-[#fafafa] px-2.5 py-1 text-[11px] font-medium text-[#171717] transition-colors hover:bg-[#171717] hover:text-white hover:border-[#171717]"
                                >
                                  + {starter.category}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Add / Edit Category Form */}
                        <Form
                          onSubmit={saveCategoryForm}
                          className="space-y-3 rounded-xl border border-[#ececee] bg-[#fafafa] p-3.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Label className="mb-0">
                              {catEditingOrig ? `Editing Category: ${catEditingOrig}` : "Add New Category"}
                            </Label>
                            <div className="flex items-center gap-2">
                              {hasDraftCat && (
                                <span className="rounded-full bg-[#171717] px-2 py-0.5 text-[10px] font-semibold text-white">
                                  Live in preview →
                                </span>
                              )}
                              {catEditingOrig && (
                                <button
                                  type="button"
                                  onClick={resetCategoryForm}
                                  className="text-[11px] font-medium text-[#77777d] hover:text-[#171717] cursor-pointer"
                                >
                                  Cancel edit
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                            <div className="sm:col-span-8">
                              <Label className="text-[11px]">Category Name *</Label>
                              <Input
                                placeholder="e.g. Men's Footwear, Baby Footwear, School Shoes"
                                value={catName}
                                onChange={(e) => {
                                  setCatName(e.target.value);
                                  if (e.target.value.trim()) setPreviewCategory(e.target.value.trim());
                                }}
                                required
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <Label className="text-[11px]">Pairs per Box / Carton</Label>
                              <Input
                                type="text"
                                inputMode="numeric"
                                placeholder="20"
                                value={catPack}
                                onChange={(e) => setCatPack(e.target.value.replace(/\D/g, ""))}
                              />
                            </div>
                          </div>

                          <div>
                            <Label className="text-[11px]">
                              Sizes for this Category (separate with commas)
                            </Label>
                            <Input
                              placeholder="e.g. 6, 7, 8, 9, 10, 11  or  0-3M, 3-6M, 6-12M"
                              value={catSizes}
                              onChange={(e) => setCatSizes(e.target.value)}
                            />
                            {draftCatSizes.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {draftCatSizes.map((s) => (
                                  <span
                                    key={s}
                                    className="rounded-md bg-white border border-[#e5e5e7] px-2 py-0.5 text-[10.5px] font-semibold text-[#171717]"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <Label className="text-[11px]">
                              Colours for this Category (optional, separate with commas)
                            </Label>
                            <Input
                              placeholder="e.g. Black, Brown, Tan, White (leave empty to use general colours)"
                              value={catColours}
                              onChange={(e) => setCatColours(e.target.value)}
                            />
                          </div>

                          {/* Attach Extra Fields to this Category */}
                          <div className="space-y-2 rounded-lg border border-[#e5e5e7] bg-white p-3">
                            <p className="text-[11px] font-semibold text-[#171717]">
                              Fields Attached to This Category (optional)
                            </p>
                            <p className="text-[10.5px] text-[#77777d]">
                              Tap fields to attach them to this category, or type a new field name below. Leave empty to show all general fields.
                            </p>
                            {fields.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {fields.map((f) => {
                                  const active = catAttachedFields.some(
                                    (x) => x.toLowerCase() === f.label.toLowerCase()
                                  );
                                  return (
                                    <button
                                      key={f.id}
                                      type="button"
                                      onClick={() => toggleAttachedField(f.label)}
                                      className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                                        active
                                          ? "bg-[#171717] text-white border-[#171717]"
                                          : "bg-[#fafafa] text-[#52525b] border-[#e5e5e7] hover:border-[#171717]"
                                      }`}
                                    >
                                      {active ? "✓ " : "+ "}
                                      {f.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {catAttachedFields.filter(
                              (lbl) => !fields.some((f) => f.label.toLowerCase() === lbl.toLowerCase())
                            ).length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {catAttachedFields
                                  .filter((lbl) => !fields.some((f) => f.label.toLowerCase() === lbl.toLowerCase()))
                                  .map((lbl) => (
                                    <button
                                      key={lbl}
                                      type="button"
                                      onClick={() => toggleAttachedField(lbl)}
                                      className="cursor-pointer rounded-lg bg-[#171717] px-2.5 py-1 text-[11px] font-medium text-white"
                                      title="Click to remove"
                                    >
                                      ✓ {lbl} ×
                                    </button>
                                  ))}
                              </div>
                            )}
                            <div className="flex gap-1.5">
                              <Input
                                value={catCustomFieldInput}
                                onChange={(e) => setCatCustomFieldInput(e.target.value)}
                                placeholder="Add custom field for this category (e.g. Heel Height, Soft Sole)"
                                className="h-8 text-xs"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const raw = catCustomFieldInput.trim();
                                    if (!raw) return;
                                    const parts = parseCommaList(raw);
                                    setCatAttachedFields((prev) => Array.from(new Set([...prev, ...parts])));
                                    setCatCustomFieldInput("");
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const raw = catCustomFieldInput.trim();
                                  if (!raw) return;
                                  const parts = parseCommaList(raw);
                                  setCatAttachedFields((prev) => Array.from(new Set([...prev, ...parts])));
                                  setCatCustomFieldInput("");
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" /> Attach
                              </Button>
                            </div>
                          </div>

                          <Button type="submit" size="sm" disabled={!canManageCategories || savingCatTemplates}>
                            <Plus className="h-3.5 w-3.5" />{" "}
                            {savingCatTemplates
                              ? "Saving..."
                              : catEditingOrig
                              ? "Save Category Changes"
                              : "Save Category"}
                          </Button>
                        </Form>
                      </CardContent>
                    </Card>

                    {/* Card 2: General Sizes, Colours & Options */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#171717] text-white">
                            <Layers className="h-4 w-4" />
                          </span>
                          <div>
                            <h3 className="text-sm font-semibold">2. General Sizes, Colours &amp; Options ({axes.length})</h3>
                            <p className="text-[11.5px] text-[#77777d]">
                              Shared choices used across all categories (like Colours or Pack Type, or fallback Sizes).
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                    <CardContent className="space-y-4">
                      {axes.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#d4d4d8] bg-[#fafafa] p-4 text-center text-xs text-[#77777d]">
                          No option groups yet. Pick a starter idea below or type your own.
                        </div>
                      ) : (
                        <Paged items={axes} size={6}>
                          {(pagedRows) => (
                            <div className="space-y-2.5">
                              {pagedRows.map((a) => (
                                <div
                                  key={a.id}
                                  className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3 text-xs flex items-start justify-between gap-2 transition-colors hover:border-[#d4d4d8]"
                                >
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-[#171717]">{a.name}</p>
                                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#77777d] border border-[#ececee]">
                                        {a.preset_values.length} {a.preset_values.length === 1 ? "choice" : "choices"}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {a.preset_values.map((v) => (
                                        <span
                                          key={v}
                                          className="rounded-lg bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#171717] border border-[#e5e5e7]"
                                        >
                                          {v}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  {permissions["settings.catalog_schema"] && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        title="Edit Option Group"
                                        onClick={() =>
                                          setEditAxisModal({
                                            id: a.id,
                                            name: a.name,
                                            vals: a.preset_values.join(", "),
                                          })
                                        }
                                        className="rounded-lg bg-white p-1.5 text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#f4f4f5] cursor-pointer"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        title="Delete Option Group"
                                        onClick={async () => {
                                          if (!confirm(`Delete "${a.name}"?`)) return;
                                          await deleteVariantAxisAction(a.id);
                                          toast.success("Option group deleted.");
                                          router.refresh();
                                        }}
                                        className="rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50 cursor-pointer"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </Paged>
                      )}

                      {/* Quick-Fill Starters */}
                      <div className="space-y-1.5 border-t border-[#ececee] pt-3">
                        <p className="text-[11px] font-medium text-[#77777d]">Quick starters (click to pre-fill &amp; preview):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {quickAxisPresets.map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => {
                                setAxisName(p.name);
                                setAxisVals(p.vals);
                              }}
                              className="cursor-pointer rounded-full border border-[#e5e5e7] bg-[#fafafa] px-2.5 py-1 text-[11px] font-medium text-[#171717] transition-colors hover:bg-[#171717] hover:text-white hover:border-[#171717]"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <Form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await upsertVariantAxisAction({
                              name: axisName,
                              presetValues: axisVals.split(",").map((s) => s.trim()).filter(Boolean),
                            });
                            toast.success("Option group added!");
                            setAxisName("");
                            setAxisVals("");
                            router.refresh();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Could not add option group.");
                          }
                        }}
                        className="space-y-2.5 rounded-xl border border-[#ececee] bg-[#fafafa] p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Label className="mb-0">Add New Option Group</Label>
                          {hasDraftAxis && (
                            <span className="rounded-full bg-[#171717] px-2 py-0.5 text-[10px] font-semibold text-white">
                              Previewing {draftAxisVals.length} {draftAxisVals.length === 1 ? "choice" : "choices"} →
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                          <div className="sm:col-span-4">
                            <Input
                              placeholder="Name (e.g. Size)"
                              value={axisName}
                              onChange={(e) => setAxisName(e.target.value)}
                              required
                            />
                          </div>
                          <div className="sm:col-span-8">
                            <Input
                              placeholder="Choices separated by comma (e.g. UK 6, UK 7, UK 8)"
                              value={axisVals}
                              onChange={(e) => setAxisVals(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <Button type="submit" size="sm" disabled={!permissions["settings.catalog_schema"]}>
                          <Plus className="h-3.5 w-3.5" /> Add Option Group
                        </Button>
                      </Form>
                    </CardContent>
                  </Card>

                  {/* Card 2: Extra Product Details */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#171717] text-white">
                          <SlidersHorizontal className="h-4 w-4" />
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold">3. Extra Product Details ({fields.length})</h3>
                          <p className="text-[11.5px] text-[#77777d]">
                            Reusable detail fields (like Sole Type, Material, or Warranty). You can attach them to any category above.
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {fields.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#d4d4d8] bg-[#fafafa] p-4 text-center text-xs text-[#77777d]">
                          No extra detail fields yet. Pick a starter idea below or create your own.
                        </div>
                      ) : (
                        <Paged items={fields} size={6}>
                          {(pagedRows) => (
                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                              {pagedRows.map((f) => (
                                <div
                                  key={f.id}
                                  className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3 text-xs flex items-start justify-between gap-2 transition-colors hover:border-[#d4d4d8]"
                                >
                                  <div className="space-y-1.5 min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="font-semibold text-[#171717] truncate">{f.label}</p>
                                      <span className="rounded-md bg-white border border-[#e5e5e7] px-1.5 py-0.5 text-[10px] font-medium text-[#52525b] capitalize">
                                        {f.field_type === "select" ? "Dropdown" : f.field_type === "boolean" ? "Yes / No" : f.field_type}
                                      </span>
                                    </div>
                                    {f.field_type === "select" && Array.isArray(f.options) && f.options.length > 0 && (
                                      <p className="text-[10.5px] text-[#77777d] truncate" title={f.options.join(", ")}>
                                        Options: {f.options.join(", ")}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-1">
                                      {f.show_on_bill && (
                                        <span className="rounded bg-[#171717] px-1.5 py-0.5 text-[10px] font-medium text-white">
                                          Bill
                                        </span>
                                      )}
                                      {f.show_on_website && (
                                        <span className="rounded bg-white border border-[#d4d4d8] px-1.5 py-0.5 text-[10px] font-medium text-[#171717]">
                                          Website
                                        </span>
                                      )}
                                      {f.show_in_catalogue && (
                                        <span className="rounded bg-white border border-[#d4d4d8] px-1.5 py-0.5 text-[10px] font-medium text-[#171717]">
                                          PDF
                                        </span>
                                      )}
                                      {!f.show_on_bill && !f.show_on_website && !f.show_in_catalogue && (
                                        <span className="text-[10px] text-[#77777d]">Form only</span>
                                      )}
                                    </div>
                                  </div>
                                  {permissions["settings.catalog_schema"] && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        title="Edit Detail Field"
                                        onClick={() =>
                                          setEditFieldModal({
                                            id: f.id,
                                            label: f.label,
                                            fieldType: f.field_type,
                                            opts: Array.isArray(f.options) ? f.options.join(", ") : "",
                                            showOnBill: f.show_on_bill,
                                            showOnWebsite: f.show_on_website,
                                            showInCatalogue: f.show_in_catalogue,
                                          })
                                        }
                                        className="rounded-lg bg-white p-1.5 text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#f4f4f5] cursor-pointer"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        title="Delete Detail Field"
                                        onClick={async () => {
                                          if (!confirm(`Delete field "${f.label}"?`)) return;
                                          await deleteCustomFieldAction(f.id);
                                          toast.success("Field deleted.");
                                          router.refresh();
                                        }}
                                        className="rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50 cursor-pointer"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </Paged>
                      )}

                      {/* Quick-Fill Starters */}
                      <div className="space-y-1.5 border-t border-[#ececee] pt-3">
                        <p className="text-[11px] font-medium text-[#77777d]">Quick starters (click to pre-fill &amp; preview):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {quickFieldPresets.map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => {
                                setCfLabel(p.name);
                                setCfType(p.type);
                                setCfOpts(p.opts);
                                setCfShowOnBill(p.bill);
                                setCfShowOnWebsite(p.web);
                                setCfShowInCatalogue(p.pdf);
                              }}
                              className="cursor-pointer rounded-full border border-[#e5e5e7] bg-[#fafafa] px-2.5 py-1 text-[11px] font-medium text-[#171717] transition-colors hover:bg-[#171717] hover:text-white hover:border-[#171717]"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <Form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            const opts = cfOpts.split(",").map((s) => s.trim()).filter(Boolean);
                            await createCustomFieldAction({
                              fieldKey: cfLabel,
                              label: cfLabel,
                              fieldType: cfType,
                              options: opts,
                              showOnBill: cfShowOnBill,
                              showOnWebsite: cfShowOnWebsite,
                              showInCatalogue: cfShowInCatalogue,
                            });
                            toast.success("Detail field added!");
                            setCfLabel("");
                            setCfOpts("");
                            setCfShowOnBill(false);
                            setCfShowOnWebsite(true);
                            setCfShowInCatalogue(true);
                            router.refresh();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Could not add detail field.");
                          }
                        }}
                        className="space-y-3 rounded-xl border border-[#ececee] bg-[#fafafa] p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Label className="mb-0">Add New Detail Field</Label>
                          {hasDraftField && (
                            <span className="rounded-full bg-[#171717] px-2 py-0.5 text-[10px] font-semibold text-white">
                              Live in preview →
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Input
                            placeholder="Field Name (e.g. Sole Type)"
                            value={cfLabel}
                            onChange={(e) => setCfLabel(e.target.value)}
                            required
                          />
                          <Select value={cfType} onChange={(e) => setCfType(e.target.value as typeof cfType)}>
                            <option value="text">Text Box</option>
                            <option value="number">Number</option>
                            <option value="select">Dropdown List</option>
                            <option value="boolean">Yes / No Switch</option>
                            <option value="date">Date Picker</option>
                          </Select>
                        </div>
                        {cfType === "select" && (
                          <Input
                            placeholder="Dropdown choices separated by comma (e.g. EVA, TPR, Leather)"
                            value={cfOpts}
                            onChange={(e) => setCfOpts(e.target.value)}
                          />
                        )}
                        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white px-3 py-2 border border-[#e5e5e7]">
                          <span className="text-[11px] font-semibold text-[#52525b]">Show on:</span>
                          <Switch checked={cfShowOnBill} onCheckedChange={setCfShowOnBill} label="Bill" />
                          <Switch checked={cfShowOnWebsite} onCheckedChange={setCfShowOnWebsite} label="Website" />
                          <Switch checked={cfShowInCatalogue} onCheckedChange={setCfShowInCatalogue} label="PDF Catalogue" />
                        </div>
                        <Button type="submit" size="sm" disabled={!permissions["settings.catalog_schema"]}>
                          <Plus className="h-3.5 w-3.5" /> Add Detail Field
                        </Button>
                      </Form>
                    </CardContent>
                  </Card>
                </div>

                {/* RIGHT COLUMN: INTERACTIVE LIVE PREVIEW (5 cols, sticky, pure Nexus ERP monochrome theme) */}
                <div className="lg:col-span-5 lg:sticky lg:top-6">
                  <Card className="overflow-hidden">
                    <div className="border-b border-[#ececee] bg-[#fafafa] px-4 py-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                          </span>
                          <span className="text-xs font-semibold text-[#171717]">Interactive Live Preview</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#77777d]">
                          <Eye className="h-3.5 w-3.5" /> Try clicking &amp; typing
                        </span>
                      </div>
                      {/* 3-Way Surface Switcher (Matches Nexus ERP pill tabs) */}
                      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-[#e5e5e7] bg-[#f1f1f3] p-1 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={() => setPreviewSurface("product_form")}
                          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition-all cursor-pointer ${
                            previewSurface === "product_form"
                              ? "bg-white text-[#171717] shadow-xs"
                              : "text-[#77777d] hover:text-[#171717]"
                          }`}
                        >
                          <Package className="h-3.5 w-3.5" /> Add Product
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewSurface("website")}
                          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition-all cursor-pointer ${
                            previewSurface === "website"
                              ? "bg-white text-[#171717] shadow-xs"
                              : "text-[#77777d] hover:text-[#171717]"
                          }`}
                        >
                          <Globe className="h-3.5 w-3.5" /> Website
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewSurface("bill")}
                          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition-all cursor-pointer ${
                            previewSurface === "bill"
                              ? "bg-white text-[#171717] shadow-xs"
                              : "text-[#77777d] hover:text-[#171717]"
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5" /> Bill / PDF
                        </button>
                      </div>
                    </div>

                    <CardContent className="p-4 bg-white space-y-4">
                      {/* PREVIEW 1: INTERACTIVE ADD PRODUCT FORM */}
                      {previewSurface === "product_form" && (
                        <div className="space-y-4">
                          {/* Editable Sample Product Header */}
                          <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#77777d]">
                                Sample Product (Editable)
                              </span>
                              <span className="rounded-full bg-[#171717] px-2 py-0.5 text-[10px] font-semibold text-white">
                                {liveComboCount} item code{liveComboCount === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              <div className="col-span-5">
                                <Input
                                  value={previewSampleName}
                                  onChange={(e) => setPreviewSampleName(e.target.value)}
                                  placeholder="Product name"
                                  className="h-8 text-xs bg-white"
                                />
                              </div>
                              <div className="col-span-4">
                                <Input
                                  value={previewSampleCode}
                                  onChange={(e) => setPreviewSampleCode(e.target.value)}
                                  placeholder="Model code"
                                  className="h-8 text-xs font-mono bg-white"
                                />
                              </div>
                              <div className="col-span-3">
                                <Input
                                  type="number"
                                  min={0}
                                  value={previewSamplePrice}
                                  onChange={(e) => setPreviewSamplePrice(Number(e.target.value))}
                                  placeholder="Price"
                                  className="h-8 text-xs bg-white"
                                />
                              </div>
                            </div>
                            {/* Category Switcher in Live Preview */}
                            {effectiveCatTemplates.length > 0 && (
                              <div className="border-t border-[#ececee] pt-2.5 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#77777d]">
                                    Category (Tap to test sizes &amp; fields)
                                  </span>
                                  {activePreviewCat && (
                                    <span className="text-[10px] font-medium text-[#52525b]">
                                      {catSizeRes.sizes.length} sizes · {previewFields.length} fields
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {effectiveCatTemplates.map((t) => {
                                    const active = activePreviewCat.toLowerCase() === t.category.toLowerCase();
                                    return (
                                      <button
                                        key={t.category}
                                        type="button"
                                        onClick={() => setPreviewCategory(t.category)}
                                        className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                                          active
                                            ? "bg-[#171717] text-white"
                                            : "bg-white text-[#52525b] border border-[#e5e5e7] hover:border-[#171717] hover:text-[#171717]"
                                        }`}
                                      >
                                        {t.category}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Interactive Variant Option Chips */}
                          <div className="space-y-2.5">
                            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#77777d]">
                              Tap options to test item codes
                            </p>
                            {previewAxes.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-[#d4d4d8] bg-[#fafafa] p-3 text-xs text-[#77777d]">
                                Add a Size or Colour option group on the left to test interactive chips here.
                              </div>
                            ) : (
                              previewAxes.map((ax) => {
                                const selected = getSelectedForAxis(ax);
                                return (
                                  <div
                                    key={ax.id}
                                    className={`rounded-xl p-3 border transition-all ${
                                      ax.isDraft
                                        ? "border-[#171717] bg-[#fafafa] ring-1 ring-[#171717]/10"
                                        : "border-[#ececee] bg-[#fafafa]"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-[#171717]">{ax.name}</span>
                                      {ax.isDraft ? (
                                        <span className="rounded-full bg-[#171717] px-2 py-0.5 text-[9.5px] font-semibold text-white">
                                          Typing Preview
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-[#77777d]">{selected.length} selected</span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {ax.preset_values.map((val) => {
                                        const active = selected.includes(val);
                                        return (
                                          <button
                                            key={val}
                                            type="button"
                                            onClick={() => togglePreviewChip(ax.id, val, selected)}
                                            className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                                              active
                                                ? "bg-[#171717] text-white"
                                                : "bg-white text-[#52525b] border border-[#e5e5e7] hover:border-[#171717] hover:text-[#171717]"
                                            }`}
                                          >
                                            {val}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })
                            )}

                            {/* Live Generated SKU Matrix Preview */}
                            {liveSkuCombos.length > 0 && (
                              <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-2.5 space-y-1.5">
                                <p className="text-[10.5px] font-semibold text-[#52525b]">
                                  Auto-generated stock rows ({liveSkuCombos.length}):
                                </p>
                                <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                                  {liveSkuCombos.slice(0, 12).map((combo, idx) => {
                                    const skuSuffix = combo.map((v) => v.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase().slice(0, 4)).join("-");
                                    return (
                                      <div
                                        key={idx}
                                        className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1 text-[11px] border border-[#ececee]"
                                      >
                                        <span className="font-medium text-[#171717] truncate">
                                          {combo.join(" / ")}
                                        </span>
                                        <span className="font-mono text-[10px] text-[#77777d] shrink-0 ml-2">
                                          {cleanCode}-{skuSuffix}
                                        </span>
                                      </div>
                                    );
                                  })}
                                  {liveSkuCombos.length > 12 && (
                                    <p className="text-center text-[10.5px] text-[#77777d] pt-0.5">
                                      + {liveSkuCombos.length - 12} more variants
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Real Working Extra Product Detail Inputs */}
                          <div className="space-y-2.5 border-t border-[#ececee] pt-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#77777d]">
                                Extra Product Details (Interactive)
                              </p>
                              <span className="text-[10px] text-[#77777d]">Values sync to Website &amp; Bill →</span>
                            </div>
                            {previewFields.length === 0 ? (
                              <p className="text-xs text-[#77777d] italic">
                                Add a detail field on the left (e.g. Sole Type) to test it live here.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                {previewFields.map((f) => {
                                  const rawVal = previewFieldValues[f.id];
                                  return (
                                    <div
                                      key={f.id}
                                      className={`rounded-xl p-2.5 border ${
                                        f.isDraft
                                          ? "border-[#171717] bg-[#fafafa] ring-1 ring-[#171717]/10"
                                          : "border-[#ececee] bg-[#fafafa]"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1 mb-1.5">
                                        <span className="text-[11px] font-semibold text-[#171717] truncate">{f.label}</span>
                                        {f.isDraft && (
                                          <span className="rounded bg-[#171717] px-1.5 py-0.5 text-[9px] font-semibold text-white shrink-0">
                                            New
                                          </span>
                                        )}
                                      </div>
                                      {f.field_type === "select" ? (
                                        <Select
                                          value={typeof rawVal === "string" ? rawVal : f.options[0] || ""}
                                          onChange={(e) =>
                                            setPreviewFieldValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                                          }
                                          className="h-8 text-xs bg-white"
                                        >
                                          {(f.options.length > 0 ? f.options : ["Option 1", "Option 2"]).map((opt) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                          ))}
                                        </Select>
                                      ) : f.field_type === "boolean" ? (
                                        <div className="pt-0.5">
                                          <Switch
                                            checked={typeof rawVal === "boolean" ? rawVal : true}
                                            onCheckedChange={(v) =>
                                              setPreviewFieldValues((prev) => ({ ...prev, [f.id]: v }))
                                            }
                                            label={typeof rawVal === "boolean" ? (rawVal ? "Yes" : "No") : "Yes"}
                                          />
                                        </div>
                                      ) : (
                                        <Input
                                          type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                                          value={typeof rawVal === "string" ? rawVal : ""}
                                          onChange={(e) =>
                                            setPreviewFieldValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                                          }
                                          placeholder={
                                            f.field_type === "number"
                                              ? "e.g. 12"
                                              : `Enter ${f.label.toLowerCase()}...`
                                          }
                                          className="h-8 text-xs bg-white"
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* PREVIEW 2: INTERACTIVE ONLINE WEBSITE CARD */}
                      {previewSurface === "website" && (
                        <div className="rounded-xl border border-[#ececee] bg-white overflow-hidden">
                          <div className="flex items-center justify-between bg-[#fafafa] px-3 py-2 text-[10.5px] text-[#77777d] border-b border-[#ececee]">
                            <span className="font-mono truncate">/s/{tenant.slug}</span>
                            <span className="rounded-full border border-[#e5e5e7] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#171717]">
                              Customer View
                            </span>
                          </div>
                          <div className="p-4 space-y-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#171717] text-white">
                                <Package className="h-6 w-6" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77777d] truncate">{tenant.name}</p>
                                <h4 className="text-sm font-bold text-[#171717] truncate">
                                  {previewSampleName.trim() || "Classic Runner"} ({cleanCode})
                                </h4>
                                <p className="text-sm font-bold text-[#171717] mt-0.5">
                                  ₹{safePrice.toLocaleString("en-IN")}
                                </p>
                              </div>
                            </div>

                            {/* Interactive Customer Option Picker */}
                            {previewAxes.map((ax) => {
                              const currentPick = getWebsitePick(ax);
                              return (
                                <div key={ax.id} className="space-y-1.5">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-semibold text-[#171717]">Select {ax.name}</span>
                                    <span className="text-[#77777d]">{currentPick}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {ax.preset_values.map((v) => {
                                      const isPicked = currentPick === v;
                                      return (
                                        <button
                                          key={v}
                                          type="button"
                                          onClick={() =>
                                            setPreviewWebsitePick((prev) => ({ ...prev, [ax.id]: v }))
                                          }
                                          className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                                            isPicked
                                              ? "border-[#171717] bg-[#171717] text-white"
                                              : "border-[#e5e5e7] bg-white text-[#52525b] hover:border-[#171717] hover:text-[#171717]"
                                          }`}
                                        >
                                          {v}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Interactive Qty Stepper */}
                            <div className="flex items-center justify-between rounded-xl border border-[#ececee] bg-[#fafafa] px-3 py-2">
                              <span className="text-xs font-medium text-[#171717]">Quantity</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPreviewWebsiteQty((q) => Math.max(1, q - 1))}
                                  className="cursor-pointer flex h-6 w-6 items-center justify-center rounded-md border border-[#e5e5e7] bg-white text-xs font-bold text-[#171717] hover:bg-[#171717] hover:text-white"
                                >
                                  −
                                </button>
                                <span className="w-6 text-center text-xs font-semibold text-[#171717]">
                                  {previewWebsiteQty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPreviewWebsiteQty((q) => q + 1)}
                                  className="cursor-pointer flex h-6 w-6 items-center justify-center rounded-md border border-[#e5e5e7] bg-white text-xs font-bold text-[#171717] hover:bg-[#171717] hover:text-white"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Live Specifications from Extra Product Details */}
                            <div className="rounded-xl bg-[#fafafa] p-3 border border-[#ececee] space-y-1.5">
                              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#77777d]">
                                Product Details Shown to Buyers
                              </p>
                              {previewFields.filter((f) => f.show_on_website).length === 0 ? (
                                <p className="text-[11px] text-[#77777d] italic">
                                  No detail fields have &ldquo;Website&rdquo; turned ON yet.
                                </p>
                              ) : (
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                                  {previewFields
                                    .filter((f) => f.show_on_website)
                                    .map((f) => (
                                      <div key={f.id}>
                                        <span className="text-[#77777d]">{f.label}: </span>
                                        <span className="font-semibold text-[#171717]">{getFieldDisplayVal(f)}</span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>

                            <Button
                              type="button"
                              className="w-full"
                              onClick={() => setPreviewShowWaMsg((v) => !v)}
                            >
                              {previewShowWaMsg
                                ? "Hide WhatsApp Enquiry Preview"
                                : `Preview WhatsApp Enquiry (₹${(safePrice * previewWebsiteQty).toLocaleString("en-IN")})`}
                            </Button>

                            {previewShowWaMsg && (
                              <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3 text-[11px] font-mono text-[#171717] whitespace-pre-line">
                                {`Hello ${tenant.name},\nI want to order:\n• ${previewSampleName.trim() || "Classic Runner"} (${cleanCode})${activeWebsiteSummary ? `\n  ${activeWebsiteSummary}` : ""}\n  Qty: ${previewWebsiteQty} × ₹${safePrice.toLocaleString("en-IN")} = ₹${(safePrice * previewWebsiteQty).toLocaleString("en-IN")}`}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* PREVIEW 3: BILL & PDF CATALOGUE */}
                      {previewSurface === "bill" && (
                        <div className="space-y-3">
                          {/* Mini Bill Line */}
                          <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-[#ececee] pb-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#171717]">
                                Printed Bill Line
                              </span>
                              <span className="rounded-full bg-[#171717] px-2 py-0.5 text-[10px] font-medium text-white">
                                On Invoice
                              </span>
                            </div>
                            <div className="rounded-lg bg-white p-3 border border-[#ececee] flex items-start justify-between gap-2 text-xs">
                              <div>
                                <p className="font-semibold text-[#171717]">
                                  {previewSampleName.trim() || "Classic Runner"}
                                  {previewAxes.length > 0 && (
                                    <span className="font-normal text-[#77777d]">
                                      {" "}({previewAxes.map((ax) => getWebsitePick(ax)).filter(Boolean).join(" / ")})
                                    </span>
                                  )}
                                </p>
                                <p className="text-[10.5px] text-[#77777d] mt-0.5">
                                  Qty: {previewWebsiteQty} × ₹{safePrice.toLocaleString("en-IN")}
                                </p>
                                {previewFields.filter((f) => f.show_on_bill).length > 0 ? (
                                  <p className="mt-1 text-[11px] font-medium text-[#171717]">
                                    {previewFields
                                      .filter((f) => f.show_on_bill)
                                      .map((f) => `${f.label}: ${getFieldDisplayVal(f)}`)
                                      .join(" · ")}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-[10.5px] text-[#77777d] italic">
                                    Turn ON &ldquo;Bill&rdquo; on any detail field to print it under the item name.
                                  </p>
                                )}
                              </div>
                              <p className="font-bold text-[#171717] shrink-0">
                                ₹{(safePrice * previewWebsiteQty).toLocaleString("en-IN")}
                              </p>
                            </div>
                          </div>

                          {/* Mini PDF Catalogue Badge Preview */}
                          <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-[#ececee] pb-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#171717]">
                                PDF Catalogue Details
                              </span>
                              <span className="rounded-full border border-[#d4d4d8] bg-white px-2 py-0.5 text-[10px] font-medium text-[#171717]">
                                In PDF
                              </span>
                            </div>
                            {previewFields.filter((f) => f.show_in_catalogue).length === 0 ? (
                              <p className="text-[11px] text-[#77777d] italic">
                                No detail fields have &ldquo;PDF Catalogue&rdquo; turned ON yet.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {previewFields
                                  .filter((f) => f.show_in_catalogue)
                                  .map((f) => (
                                    <span
                                      key={f.id}
                                      className={`rounded-lg px-2.5 py-1 text-[11px] border ${
                                        f.isDraft
                                          ? "border-[#171717] bg-[#171717] text-white font-medium"
                                          : "border-[#e5e5e7] bg-white text-[#171717]"
                                      }`}
                                    >
                                      <strong>{f.label}:</strong> {getFieldDisplayVal(f)}
                                    </span>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
                )}
              </>
            )}

            {/* Popup Edit Modal: Option Group (Sizes, Colours & Options) */}
            <Dialog
              open={Boolean(editAxisModal)}
              onClose={() => setEditAxisModal(null)}
              title="Edit Option Group"
              maxWidth="max-w-lg"
            >
              {editAxisModal && (
                <Form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingSchemaEdit(true);
                    try {
                      await upsertVariantAxisAction({
                        id: editAxisModal.id,
                        name: editAxisModal.name,
                        presetValues: editAxisModal.vals.split(",").map((s) => s.trim()).filter(Boolean),
                      });
                      toast.success("Option group updated!");
                      setEditAxisModal(null);
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not update option group.");
                    } finally {
                      setSavingSchemaEdit(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <Label>Option Group Name *</Label>
                    <Input
                      value={editAxisModal.name}
                      onChange={(e) => setEditAxisModal((prev) => (prev ? { ...prev, name: e.target.value } : null))}
                      placeholder="e.g. Size, Colour, Pack"
                      required
                    />
                  </div>
                  <div>
                    <Label>Choices (separated by comma) *</Label>
                    <Input
                      value={editAxisModal.vals}
                      onChange={(e) => setEditAxisModal((prev) => (prev ? { ...prev, vals: e.target.value } : null))}
                      placeholder="e.g. UK 6, UK 7, UK 8, UK 9, UK 10"
                      required
                    />
                    {modalAxisVals.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {modalAxisVals.map((v) => (
                          <span
                            key={v}
                            className="rounded-lg border border-[#e5e5e7] bg-[#fafafa] px-2.5 py-0.5 text-[11px] font-medium text-[#171717]"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-[#ececee] pt-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditAxisModal(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={savingSchemaEdit}>
                      <Check className="h-3.5 w-3.5" />
                      {savingSchemaEdit ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </Form>
              )}
            </Dialog>

            {/* Popup Edit Modal: Extra Product Detail Field */}
            <Dialog
              open={Boolean(editFieldModal)}
              onClose={() => setEditFieldModal(null)}
              title="Edit Extra Product Detail"
              maxWidth="max-w-lg"
            >
              {editFieldModal && (
                <Form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingSchemaEdit(true);
                    try {
                      await updateCustomFieldAction({
                        id: editFieldModal.id,
                        label: editFieldModal.label,
                        fieldType: editFieldModal.fieldType,
                        options: editFieldModal.opts.split(",").map((s) => s.trim()).filter(Boolean),
                        showOnBill: editFieldModal.showOnBill,
                        showOnWebsite: editFieldModal.showOnWebsite,
                        showInCatalogue: editFieldModal.showInCatalogue,
                      });
                      toast.success("Detail field updated!");
                      setEditFieldModal(null);
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not update detail field.");
                    } finally {
                      setSavingSchemaEdit(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Field Name *</Label>
                      <Input
                        value={editFieldModal.label}
                        onChange={(e) =>
                          setEditFieldModal((prev) => (prev ? { ...prev, label: e.target.value } : null))
                        }
                        placeholder="e.g. Sole Type"
                        required
                      />
                    </div>
                    <div>
                      <Label>Input Type</Label>
                      <Select
                        value={editFieldModal.fieldType}
                        onChange={(e) =>
                          setEditFieldModal((prev) =>
                            prev ? { ...prev, fieldType: e.target.value as typeof prev.fieldType } : null
                          )
                        }
                      >
                        <option value="text">Text Box</option>
                        <option value="number">Number</option>
                        <option value="select">Dropdown List</option>
                        <option value="boolean">Yes / No Switch</option>
                        <option value="date">Date Picker</option>
                      </Select>
                    </div>
                  </div>
                  {editFieldModal.fieldType === "select" && (
                    <div>
                      <Label>Dropdown Choices (separated by comma)</Label>
                      <Input
                        value={editFieldModal.opts}
                        onChange={(e) =>
                          setEditFieldModal((prev) => (prev ? { ...prev, opts: e.target.value } : null))
                        }
                        placeholder="e.g. EVA, TPR, PU, Leather"
                      />
                      {modalFieldOpts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {modalFieldOpts.map((opt) => (
                            <span
                              key={opt}
                              className="rounded-lg border border-[#e5e5e7] bg-[#fafafa] px-2.5 py-0.5 text-[11px] font-medium text-[#171717]"
                            >
                              {opt}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                    <p className="text-[11px] font-semibold text-[#52525b]">Where should this detail appear?</p>
                    <div className="flex flex-wrap items-center gap-4">
                      <Switch
                        checked={editFieldModal.showOnBill}
                        onCheckedChange={(v) =>
                          setEditFieldModal((prev) => (prev ? { ...prev, showOnBill: v } : null))
                        }
                        label="Bill"
                      />
                      <Switch
                        checked={editFieldModal.showOnWebsite}
                        onCheckedChange={(v) =>
                          setEditFieldModal((prev) => (prev ? { ...prev, showOnWebsite: v } : null))
                        }
                        label="Website"
                      />
                      <Switch
                        checked={editFieldModal.showInCatalogue}
                        onCheckedChange={(v) =>
                          setEditFieldModal((prev) => (prev ? { ...prev, showInCatalogue: v } : null))
                        }
                        label="PDF Catalogue"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-[#ececee] pt-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditFieldModal(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={savingSchemaEdit}>
                      <Check className="h-3.5 w-3.5" />
                      {savingSchemaEdit ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </Form>
              )}
            </Dialog>
          </div>
        );
      })()}

      {tab === "devices" && (
        <Card>
          <CardHeader><h3 className="text-sm font-semibold">Registered Offline POS Devices</h3></CardHeader>
          <CardContent className="space-y-2">
            <Paged items={devices} size={8}>{(pagedRows) => pagedRows.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs">
                <div>
                  <p className="font-bold">Device #{d.device_no} — {d.label}</p>
                  <p className="text-slate-500">Last offline seq: {d.last_seq}</p>
                </div>
                <Switch
                  checked={d.is_active}
                  disabled={!permissions["settings.staff_and_roles"]}
                  onCheckedChange={async (val) => {
                    await toggleDeviceActiveAction(d.id, val);
                    toast.success("Device status updated.");
                    router.refresh();
                  }}
                />
              </div>
            ))}</Paged>
          </CardContent>
        </Card>
      )}

      {tab === "backups" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Cloud Backups (Auto Every 2 Days + 1-Click Backup Now)</h3>
              <p className="text-xs text-slate-500">
                R2 Media Used: {(tenant.storage_used_bytes / (1024 * 1024)).toFixed(2)} / {tenant.max_storage_mb} MB
              </p>
            </div>
            {backupsEnabled && permissions["backups.manage"] && (
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    const res = await triggerManualBackupAction();
                    toast.success(res.skipped ? "No changes since last backup." : "Backup uploaded to private R2.");
                    router.refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Backup failed");
                  }
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Backup Now
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <DataExportCard endpoint="/api/exports/all" title="Export All Business Data" />
            {backups.length === 0 ? (
              <p className="text-xs text-slate-500">No backups recorded yet.</p>
            ) : (
              <Paged items={backups} size={8}>{(pagedRows) => pagedRows.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs">
                  <div>
                    <p className="font-semibold">
                      {new Date(b.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} ({b.trigger_type})
                    </p>
                    <p className="text-slate-500">
                      {(Number(b.file_size_bytes) / 1024).toFixed(1)} KB • SHA-256: {b.checksum_sha256.slice(0, 12)}…
                    </p>
                  </div>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {(["excel", "restore"] as const).map((format) => (
                      <Button
                        key={format}
                        size="sm"
                        variant="outline"
                        aria-label={`Download ${format === "excel" ? "Excel" : "restore file"}`}
                        onClick={async () => {
                          try {
                            window.location.href = await getBackupDownloadUrlAction(b.id, format);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Download failed.");
                          }
                        }}
                      >
                        <Download className="h-3.5 w-3.5" /> {format === "excel" ? "Excel" : "Restore File"}
                      </Button>
                    ))}
                  </span>
                </div>
              ))}</Paged>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
