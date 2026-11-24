"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, Download, KeyRound, Pencil, Plus, RefreshCw, Trash2, Upload, User, UserX } from "lucide-react";
import { DataExportCard } from "@/components/ui/data-export-card";
import { Paged } from "@/components/ui/pagination";
import { toast } from "sonner";
import {
  changeMyPasswordAction,
  createBranchAction,
  createCustomFieldAction,
  createStaffAction,
  deleteBranchAction,
  deleteCustomFieldAction,
  deleteVariantAxisAction,
  getBackupDownloadUrlAction,
  resetStaffPasswordAction,
  toggleDeviceActiveAction,
  toggleStaffActiveAction,
  triggerManualBackupAction,
  updateBranchAction,
  updateBrandConfigAction,
  updateLedgerConfigAction,
  updateMyProfileAction,
  updateStaffAction,
  updateTaxConfigAction,
  updateTenantRolePermissionAction,
  upsertVariantAxisAction,
} from "@/actions/settings";
import { GstinInput } from "@/components/ui/dynamic-fields";
import { compressLogoImage, IMAGE_CACHE_CONTROL } from "@/lib/storage/image-compress";
import {
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
import { isFeatureEnabled } from "@/lib/auth/access";
import { resolveLedgerConfig } from "@/lib/ledger/defaults";
import { INDIAN_STATES, PERMISSION_DEFINITIONS, type PermissionKey } from "@/lib/constants/saas";
import type {
  BranchRow,
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
  staff,
  resets,
  rolePermRows,
  devices,
  backups,
  stockEnabled,
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
  staff: Array<{
    id: string;
    full_name: string;
    username: string | null;
    email: string | null;
    role: "owner" | "branch_admin" | "worker";
    is_active: boolean;
  }>;
  resets: Array<{
    id: string;
    user_id: string;
    identifier_submitted: string;
    note: string | null;
    created_at: string;
    full_name: string | null;
    role: string | null;
  }>;
  rolePermRows: Array<{ role: "branch_admin" | "worker"; permission_key: string; allowed: boolean }>;
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

  // Brand state
  const [uiStyle, setUiStyle] = useState<UiStyleKey>(tenant.brand_config?.ui_style ?? "style_4");
  const [primaryColor, setPrimaryColor] = useState(tenant.brand_config?.primary_color ?? "#0284c7");
  const [tagline, setTagline] = useState(tenant.brand_config?.tagline ?? "");
  const [mfgInfo, setMfgInfo] = useState(tenant.brand_config?.manufacturer_info ?? "");
  const [care, setCare] = useState(tenant.brand_config?.customer_care ?? "");
  const [logoUploading, setLogoUploading] = useState(false);

  // Simple dynamic Ledger Statement Fields (Owner & Branch Admin)
  const initialLedger = resolveLedgerConfig(tenant.brand_config);
  const [ledgerItemCols, setLedgerItemCols] = useState(initialLedger.item_columns);
  const [ledgerHeaderFields, setLedgerHeaderFields] = useState(initialLedger.header_fields);
  const [newItemColLabel, setNewItemColLabel] = useState("");
  const [newHeaderFieldLabel, setNewHeaderFieldLabel] = useState("");
  const [savingLedgerFields, setSavingLedgerFields] = useState(false);
  const canEditLedgerFields = userRole === "owner" || userRole === "branch_admin";

  const fileToPdfPngDataUrl = async (file: File): Promise<string> => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Could not read logo image."));
        el.src = objectUrl;
      });
      const maxDim = 220;
      const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) throw new Error("Canvas unavailable");
      ctx2d.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const pdfPngDataUrl = await fileToPdfPngDataUrl(file);
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
      toast.success("Brand logo uploaded & saved to bills and PDFs!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logo upload failed");
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
  const [gstBranchId, setGstBranchId] = useState(branches[0]?.id ?? "");
  const [gstBranchNumber, setGstBranchNumber] = useState(branches[0]?.gstin ?? "");
  const [gstBranchState, setGstBranchState] = useState(branches[0]?.state_code ?? "33");
  const [savingGstBranch, setSavingGstBranch] = useState(false);

  // Schema state
  const [axisName, setAxisName] = useState("");
  const [axisVals, setAxisVals] = useState("");
  const [cfLabel, setCfLabel] = useState("");
  const [cfType, setCfType] = useState<"text" | "number" | "select" | "boolean" | "date">("text");
  const [cfOpts, setCfOpts] = useState("");

  // Branch state
  const [editBranchId, setEditBranchId] = useState<string | null>(null);
  const [bName, setBName] = useState("");
  const [bCode, setBCode] = useState("");
  const [bType, setBType] = useState<"factory" | "retail" | "warehouse">("retail");
  const [bGstin, setBGstin] = useState("");
  const [bState, setBState] = useState("33");

  // Staff state
  const [editStaffTarget, setEditStaffTarget] = useState<{ id: string; full_name: string; email: string; role: "branch_admin" | "worker" } | null>(null);
  const [sName, setSName] = useState("");
  const [sUsername, setSUsername] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sRole, setSRole] = useState<"branch_admin" | "worker">("worker");
  const [sPw, setSPw] = useState("");
  const [sBranch, setSBranch] = useState(branches[0]?.id ?? "");
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetPw, setResetPw] = useState("");

  const permLookup = new Map<string, boolean>();
  for (const r of rolePermRows) {
    permLookup.set(`${r.role}:${r.permission_key}`, r.allowed);
  }

  return (
    <div className="space-y-4">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "profile", label: "My Profile" },
          { id: "brand", label: "Brand & Look" },
          { id: "schema", label: "Product Fields" },
          { id: "tax", label: "Tax & GST" },
          { id: "branches", label: `Branches (${branches.length}/${tenant.max_branches})` },
          { id: "staff", label: `Staff & Resets`, badge: resets.length || undefined },
          { id: "permissions", label: "Role Permissions" },
          { id: "devices", label: "Offline Devices" },
          { id: "backups", label: "Backups" },
        ]}
      />

      {tab === "profile" && (
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
              <form
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
              </form>
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
              <form
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
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "brand" && (
        <div className="space-y-4">
          <Alert variant="info" title="What is Brand & Look?">
            Customize your shop logo, theme look, and business details printed on bills, PDFs, and your online website. Changing these never affects your stock, bills, or accounts.
          </Alert>

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

      {tab === "schema" && (
        <div className="space-y-4">
          <Alert variant="info" title="What are Product Fields?">
            Customize the choices shown when adding a product. <strong>Sizes &amp; Colours</strong> are the clickable buttons (like UK 6–10, Black, Tan). <strong>Extra Product Details</strong> are optional info fields (like Sole Type or Material) shown on your website and PDF catalogue.
          </Alert>
          {!stockEnabled ? (
            <Alert variant="warning">Dynamic Stock Matrix is not active on your current plan.</Alert>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-semibold">Sizes, Colours &amp; Options ({axes.length})</h3>
                  <p className="mt-0.5 text-[11.5px] text-[#77777d]">
                    Quick-pick buttons shown when creating product variants.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Paged items={axes} size={8}>{(pagedRows) => pagedRows.map((a) => (
                    <div key={a.id} className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3 text-xs flex items-start justify-between gap-2">
                      <div className="space-y-1.5">
                        <p className="font-semibold text-[#171717]">{a.name}</p>
                        <div className="flex flex-wrap gap-1">
                          {a.preset_values.map((v) => (
                            <span key={v} className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-[#3f3f46] shadow-[0_0_0_1px_rgba(0,0,0,.07)]">
                              {v}
                            </span>
                          ))}
                        </div>
                      </div>
                      {permissions["settings.catalog_schema"] && (
                        <button
                          type="button"
                          title="Delete Option Group"
                          onClick={async () => {
                            if (!confirm(`Delete "${a.name}"?`)) return;
                            await deleteVariantAxisAction(a.id);
                            toast.success("Option group deleted.");
                            router.refresh();
                          }}
                          className="rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50 cursor-pointer shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}</Paged>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await upsertVariantAxisAction({
                        name: axisName,
                        presetValues: axisVals.split(",").map((s) => s.trim()).filter(Boolean),
                      });
                      setAxisName("");
                      setAxisVals("");
                      toast.success("Option group added.");
                      router.refresh();
                    }}
                    className="space-y-2 border-t border-[#ececee] pt-3"
                  >
                    <Label>Add New Option Group</Label>
                    <Input placeholder="Option Name (e.g. Size, Colour, Pattern)" value={axisName} onChange={(e) => setAxisName(e.target.value)} required />
                    <Input placeholder="Choices separated by comma (e.g. UK 6, UK 7, UK 8)" value={axisVals} onChange={(e) => setAxisVals(e.target.value)} required />
                    <Button type="submit" size="sm" disabled={!permissions["settings.catalog_schema"]}>
                      <Plus className="h-3.5 w-3.5" /> Add Option Group
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="text-sm font-semibold">Extra Product Details ({fields.length})</h3>
                  <p className="mt-0.5 text-[11.5px] text-[#77777d]">
                    Optional details like Sole Type, Upper Material, or Gender shown on your website &amp; PDF.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Paged items={fields} size={8}>{(pagedRows) => pagedRows.map((f) => (
                    <div key={f.id} className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3 text-xs flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#171717]">
                          {f.label}{" "}
                          <span className="font-normal text-[#77777d]">({f.field_type === "select" ? "Dropdown" : f.field_type})</span>
                        </p>
                        <p className="text-[11px] text-[#77777d] mt-0.5">
                          Shown on: {[f.show_on_bill && "Bill", f.show_on_website && "Website", f.show_in_catalogue && "PDF"].filter(Boolean).join(" • ") || "Product form only"}
                        </p>
                      </div>
                      {permissions["settings.catalog_schema"] && (
                        <button
                          type="button"
                          title="Delete Detail Field"
                          onClick={async () => {
                            if (!confirm(`Delete field "${f.label}"?`)) return;
                            await deleteCustomFieldAction(f.id);
                            toast.success("Field deleted.");
                            router.refresh();
                          }}
                          className="rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50 cursor-pointer shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}</Paged>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await createCustomFieldAction({
                        fieldKey: cfLabel,
                        label: cfLabel,
                        fieldType: cfType,
                        options: cfOpts.split(",").map((s) => s.trim()).filter(Boolean),
                        showOnBill: false,
                        showOnWebsite: true,
                        showInCatalogue: true,
                      });
                      setCfLabel("");
                      setCfOpts("");
                      toast.success("Detail field added.");
                      router.refresh();
                    }}
                    className="space-y-2 border-t border-[#ececee] pt-3"
                  >
                    <Label>Add New Detail Field</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Field Name (e.g. Sole Type)" value={cfLabel} onChange={(e) => setCfLabel(e.target.value)} required />
                      <Select value={cfType} onChange={(e) => setCfType(e.target.value as typeof cfType)}>
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="select">Dropdown List</option>
                        <option value="boolean">Yes / No</option>
                        <option value="date">Date</option>
                      </Select>
                    </div>
                    {cfType === "select" && (
                      <Input placeholder="Dropdown choices separated by comma (e.g. EVA, TPR, Leather)" value={cfOpts} onChange={(e) => setCfOpts(e.target.value)} />
                    )}
                    <Button type="submit" size="sm" disabled={!permissions["settings.catalog_schema"]}>
                      <Plus className="h-3.5 w-3.5" /> Add Detail Field
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {tab === "tax" && (
        <div className="space-y-4">
          <Alert variant="info" title="How Tax & GST Settings Work">
            Choose whether your shop charges GST and how prices are calculated. If you don&apos;t charge GST, turn <strong>Charge GST on Bills</strong> OFF or keep product GST at <strong>0%</strong> — bills will automatically hide GST columns. You can also switch between <strong>Normal Bill</strong> and <strong>GST Bill</strong> directly inside the POS Terminal.
          </Alert>

          {/* GST Bill Readiness Checklist */}
          <div className="ui-tray">
            <div className="ui-surface p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[13px] font-semibold text-[#171717]">GST Bill Setup Checklist</h3>
                  <p className="text-[11.5px] text-[#77777d]">
                    Make sure these 3 items are ready before printing GST Tax Invoices.
                  </p>
                </div>
                <Link
                  href="/dashboard/bill-designer"
                  className="inline-flex items-center gap-1 rounded-lg bg-[#171717] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2a2a2a]"
                >
                  Open GST Bill Layout →
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
                <div className="flex items-start gap-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-2.5">
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
                <div className="flex items-start justify-between gap-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-2.5">
                  <div className="flex items-start gap-2">
                    {branches.some((b) => Boolean(b.gstin)) ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <div>
                      <p className="font-semibold text-[#171717]">2. Branch GSTIN</p>
                      <p className="text-[11px] text-[#77777d]">
                        {branches.filter((b) => b.gstin).length} of {branches.length} branches set
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab("branches")}
                    className="shrink-0 cursor-pointer text-[11px] font-semibold text-sky-700 hover:underline"
                  >
                    Edit →
                  </button>
                </div>
                <div className="flex items-start gap-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-[#171717]">3. Shop State &amp; HSN</p>
                    <p className="text-[11px] text-[#77777d]">
                      State {stateCode} · {hsnDigits}-digit HSN
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Inline Shop / Branch GST Number Editor */}
          {branches.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold">Shop / Branch GST Number (GSTIN)</h3>
                <p className="mt-0.5 text-xs text-[#77777d]">
                  Set or change the GSTIN printed on your GST Tax Invoices. Leave empty if a branch does not have a GST number.
                </p>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const b = branches.find((x) => x.id === gstBranchId);
                    if (!b) return;
                    setSavingGstBranch(true);
                    try {
                      await updateBranchAction({
                        id: b.id,
                        name: b.name,
                        code: b.code,
                        type: b.type,
                        gstin: gstBranchNumber.trim() || undefined,
                        stateCode: gstBranchState || b.state_code,
                      });
                      toast.success(
                        gstBranchNumber.trim()
                          ? `GSTIN updated for ${b.name}!`
                          : `GSTIN cleared for ${b.name}.`
                      );
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not update GSTIN.");
                    } finally {
                      setSavingGstBranch(false);
                    }
                  }}
                  className="grid grid-cols-1 items-end gap-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <Label>Branch</Label>
                    <Select
                      value={gstBranchId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setGstBranchId(nextId);
                        const found = branches.find((x) => x.id === nextId);
                        setGstBranchNumber(found?.gstin ?? "");
                        setGstBranchState(found?.state_code ?? "33");
                      }}
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-5">
                    <Label>GST Number (15-digit GSTIN)</Label>
                    <GstinInput
                      value={gstBranchNumber}
                      onChange={setGstBranchNumber}
                      onStateDetected={setGstBranchState}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={!permissions["settings.tax_and_hsn"] || savingGstBranch}
                    >
                      {savingGstBranch ? "Saving..." : "Save GST Number"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold">GST &amp; Billing Rules</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                  <Switch checked={gstEnabled} onCheckedChange={setGstEnabled} label="Charge GST on Bills" />
                  <p className="mt-1 text-[11px] text-[#77777d]">Turn OFF if your shop does not charge GST.</p>
                </div>
                <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                  <Switch checked={allowEstimate} onCheckedChange={setAllowEstimate} label="Allow Non-GST Estimates" />
                  <p className="mt-1 text-[11px] text-[#77777d]">Lets staff create simple estimate bills without GST.</p>
                </div>
                <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                  <Switch checked={allowNegStock} onCheckedChange={setAllowNegStock} label="Allow Billing at 0 Stock" />
                  <p className="mt-1 text-[11px] text-[#77777d]">Shows a warning instead of stopping billing when stock is low.</p>
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
        </div>
      )}

      {tab === "branches" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Active Branches</h3></CardHeader>
            <CardContent className="space-y-2">
              <Paged items={branches} size={8}>{(pagedRows) => pagedRows.map((b) => (
                <div key={b.id} className="rounded-[10px] border border-slate-200 p-3 text-xs flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{b.name} ({b.code}) {b.is_default && <Badge variant="info" className="ml-1">Default</Badge>}</p>
                    <p className="text-slate-500">{b.type} • State {b.state_code} • GSTIN: {b.gstin || "None"}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {b.is_read_only && <Badge variant="warning">Read-Only</Badge>}
                    {permissions["settings.tax_and_hsn"] && (
                      <>
                        <button
                          type="button"
                          title="Edit Branch"
                          onClick={() => {
                            setEditBranchId(b.id);
                            setBName(b.name);
                            setBCode(b.code);
                            setBType(b.type);
                            setBGstin(b.gstin ?? "");
                            setBState(b.state_code);
                          }}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {!b.is_default && (
                          <button
                            type="button"
                            title="Delete Branch"
                            onClick={async () => {
                              if (!confirm(`Delete branch "${b.name}"?`)) return;
                              try {
                                await deleteBranchAction(b.id);
                                toast.success("Branch deleted.");
                                router.refresh();
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Cannot delete branch with existing transactions.");
                              }
                            }}
                            className="rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}</Paged>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">{editBranchId ? "Edit Branch" : "Add Branch"}</h3></CardHeader>
            <CardContent>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    if (editBranchId) {
                      await updateBranchAction({ id: editBranchId, name: bName, code: bCode, type: bType, gstin: bGstin, stateCode: bState });
                      toast.success("Branch updated.");
                    } else {
                      await createBranchAction({ name: bName, code: bCode, type: bType, gstin: bGstin, stateCode: bState });
                      toast.success("Branch created.");
                    }
                    setEditBranchId(null);
                    setBName("");
                    setBCode("");
                    setBGstin("");
                    router.refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed");
                  }
                }}
                className="space-y-3"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Name</Label><Input value={bName} onChange={(e) => setBName(e.target.value)} required /></div>
                  <div><Label>Code (≤4)</Label><Input maxLength={4} value={bCode} onChange={(e) => setBCode(e.target.value.toUpperCase())} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Type</Label>
                    <Select value={bType} onChange={(e) => setBType(e.target.value as typeof bType)}>
                      <option value="retail">Retail Shop</option>
                      <option value="factory">Factory</option>
                      <option value="warehouse">Warehouse</option>
                    </Select>
                  </div>
                  <div>
                    <Label>State</Label>
                    <Select value={bState} onChange={(e) => setBState(e.target.value)}>
                      {Object.entries(INDIAN_STATES).map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Branch GSTIN (optional)</Label>
                  <GstinInput value={bGstin} onChange={setBGstin} onStateDetected={setBState} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={!permissions["settings.tax_and_hsn"]}>
                    {editBranchId ? "Update Branch" : "Create Branch"}
                  </Button>
                  {editBranchId && (
                    <Button variant="outline" onClick={() => { setEditBranchId(null); setBName(""); setBCode(""); setBGstin(""); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "staff" && (
        <div className="space-y-4">
          {resets.length > 0 && permissions["staff.reset_password"] && (
            <Card className="border-amber-300 bg-amber-50/40">
              <CardHeader><h3 className="text-sm font-semibold">Pending Staff Password Reset Requests</h3></CardHeader>
              <CardContent className="space-y-2">
                <Paged items={resets} size={8}>{(pagedRows) => pagedRows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-amber-200 p-2.5 text-xs">
                    <div>
                      <p className="font-bold">{r.full_name} ({r.role})</p>
                      <p className="text-slate-500">Submitted: {r.identifier_submitted} {r.note ? `• "${r.note}"` : ""}</p>
                    </div>
                    <Button size="sm" onClick={() => setResetTarget({ id: r.user_id, name: r.full_name ?? r.identifier_submitted })}>
                      <KeyRound className="h-3.5 w-3.5" /> Reset Password
                    </Button>
                  </div>
                ))}</Paged>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><h3 className="text-sm font-semibold">Team ({staff.length}/{tenant.max_users})</h3></CardHeader>
              <CardContent className="space-y-2">
                <Paged items={staff} size={10}>{(pagedRows) => pagedRows.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-slate-200 p-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {u.full_name} <Badge>{u.role}</Badge>
                        {!u.is_active && <Badge variant="danger" className="ml-1">Disabled</Badge>}
                      </p>
                      <p className="text-slate-500">Username: <code>{u.username ?? "—"}</code> {u.email ? `• ${u.email}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {permissions["staff.reset_password"] && u.role !== "owner" && (userRole === "owner" || u.role === "worker") && (
                        <Button size="sm" variant="outline" onClick={() => setResetTarget({ id: u.id, name: u.full_name })}>
                          <KeyRound className="h-3.5 w-3.5" /> Reset PW
                        </Button>
                      )}
                      {permissions["settings.staff_and_roles"] && u.role !== "owner" && (
                        <>
                          <button
                            type="button"
                            title="Edit Staff"
                            onClick={() =>
                              setEditStaffTarget({
                                id: u.id,
                                full_name: u.full_name,
                                email: u.email ?? "",
                                role: u.role === "branch_admin" ? "branch_admin" : "worker",
                              })
                            }
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title={u.is_active ? "Deactivate Staff" : "Reactivate Staff"}
                            onClick={async () => {
                              if (!confirm(`${u.is_active ? "Deactivate" : "Reactivate"} staff account "${u.full_name}"?`)) return;
                              await toggleStaffActiveAction(u.id, !u.is_active);
                              toast.success(u.is_active ? "Staff deactivated." : "Staff reactivated.");
                              router.refresh();
                            }}
                            className={`rounded-lg p-1.5 text-white cursor-pointer ${u.is_active ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-600 hover:bg-emerald-700"}`}
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}</Paged>
              </CardContent>
            </Card>

            {permissions["staff.create"] && (
              <Card>
                <CardHeader><h3 className="text-sm font-semibold">Add Staff Account</h3></CardHeader>
                <CardContent>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await createStaffAction({
                          fullName: sName,
                          username: sUsername,
                          email: sEmail || undefined,
                          role: sRole,
                          password: sPw,
                          branchIds: sBranch ? [sBranch] : [],
                        });
                        setSName(""); setSUsername(""); setSEmail(""); setSPw("");
                        toast.success("Staff account created.");
                        router.refresh();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed");
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Full Name</Label><Input value={sName} onChange={(e) => setSName(e.target.value)} required /></div>
                      <div><Label>Username</Label><Input value={sUsername} onChange={(e) => setSUsername(e.target.value)} required /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Role</Label>
                        <Select value={sRole} onChange={(e) => setSRole(e.target.value as "branch_admin" | "worker")}>
                          <option value="worker">Worker (Counter / Stock)</option>
                          <option value="branch_admin">Branch / Shop Admin</option>
                        </Select>
                      </div>
                      <div>
                        <Label>Assigned Branch</Label>
                        <Select value={sBranch} onChange={(e) => setSBranch(e.target.value)}>
                          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                      </div>
                    </div>
                    <div><Label>Email (optional)</Label><Input type="email" value={sEmail} onChange={(e) => setSEmail(e.target.value)} /></div>
                    <div><Label>Temporary Password (min 8 chars)</Label><Input type="text" minLength={8} value={sPw} onChange={(e) => setSPw(e.target.value)} required /></div>
                    <Button type="submit">Add Staff Member</Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "permissions" && (() => {
        const activePerms = PERMISSION_DEFINITIONS.filter((p) => isFeatureEnabled(tenant, p.feature));
        const grouped = new Map<string, typeof activePerms>();
        for (const p of activePerms) {
          const list = grouped.get(p.module) ?? [];
          list.push(p);
          grouped.set(p.module, list);
        }
        const modules = Array.from(grouped.entries());

        return (
          <div className="space-y-3">
            <div className="ui-tray">
              <div className="ui-surface flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <h3 className="text-[13px] font-semibold text-[#171717]">
                    Staff Role Permissions ({activePerms.length} permissions · All on One Page)
                  </h3>
                  <p className="text-[11.5px] text-[#77777d]">
                    Click any box to allow or block what Branch Admins and Workers can do. Changes save automatically.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[#77777d]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] bg-[#171717] text-white">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    Allowed
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)]" />
                    Blocked
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {modules.map(([modName, perms]) => (
                <div key={modName} className="ui-tray">
                  <div className="ui-surface overflow-hidden">
                    <div className="grid grid-cols-[1fr_64px_64px] items-center border-b border-[#ececee] bg-[#fafafa] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-[#77777d]">
                      <span className="text-[#171717]">
                        {modName} <span className="font-normal text-[#a3a3a8]">({perms.length})</span>
                      </span>
                      <span className="text-center">Admin</span>
                      <span className="text-center">Worker</span>
                    </div>
                    <div className="divide-y divide-[#f1f1f2]">
                      {perms.map((p) => (
                        <div
                          key={p.key}
                          className="grid grid-cols-[1fr_64px_64px] items-center px-3 py-1.5 text-xs hover:bg-[#fafafa]"
                        >
                          <span className="truncate pr-2 font-medium text-[#171717]">{p.label}</span>
                          {(["branch_admin", "worker"] as const).map((role) => {
                            const val = permLookup.get(`${role}:${p.key}`) ?? p[role];
                            return (
                              <div key={role} className="flex justify-center">
                                <button
                                  type="button"
                                  disabled={!permissions["settings.staff_and_roles"]}
                                  role="checkbox"
                                  aria-checked={val}
                                  aria-label={`${p.label} for ${role === "branch_admin" ? "Branch Admin" : "Worker"}`}
                                  onClick={async () => {
                                    await updateTenantRolePermissionAction(role, p.key, !val);
                                    toast.success("Permission updated.");
                                    router.refresh();
                                  }}
                                  className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] cursor-pointer transition-all active:scale-90 disabled:opacity-50 ${
                                    val
                                      ? "bg-[#171717] text-white shadow-2xs"
                                      : "bg-white text-transparent shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)] hover:bg-[#f4f4f5]"
                                  }`}
                                >
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
              <h3 className="text-sm font-semibold">Automated Daily Backups (Latest 14 Kept)</h3>
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

      <Dialog
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Password — ${resetTarget?.name ?? ""}`}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!resetTarget) return;
            try {
              await resetStaffPasswordAction(resetTarget.id, resetPw);
              toast.success("Staff password updated.");
              setResetTarget(null);
              setResetPw("");
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed");
            }
          }}
          className="space-y-3"
        >
          <div>
            <Label>New Temporary Password (min 8 chars)</Label>
            <Input type="text" minLength={8} value={resetPw} onChange={(e) => setResetPw(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full">Save Password</Button>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(editStaffTarget)}
        onClose={() => setEditStaffTarget(null)}
        title={`Edit Staff — ${editStaffTarget?.full_name ?? ""}`}
      >
        {editStaffTarget && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await updateStaffAction({
                id: editStaffTarget.id,
                fullName: editStaffTarget.full_name,
                email: editStaffTarget.email || undefined,
                role: editStaffTarget.role,
              });
              toast.success("Staff details updated.");
              setEditStaffTarget(null);
              router.refresh();
            }}
            className="space-y-3"
          >
            <div>
              <Label>Full Name</Label>
              <Input
                value={editStaffTarget.full_name}
                onChange={(e) => setEditStaffTarget({ ...editStaffTarget, full_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={editStaffTarget.email}
                onChange={(e) => setEditStaffTarget({ ...editStaffTarget, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={editStaffTarget.role}
                onChange={(e) => setEditStaffTarget({ ...editStaffTarget, role: e.target.value as "branch_admin" | "worker" })}
              >
                <option value="worker">Worker (Counter / Stock)</option>
                <option value="branch_admin">Branch / Shop Admin</option>
              </Select>
            </div>
            <Button type="submit" className="w-full">Save Staff Changes</Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
