"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, KeyRound, Pencil, Plus, RefreshCw, Trash2, Upload, UserX } from "lucide-react";
import { toast } from "sonner";
import {
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
  updateStaffAction,
  updateTaxConfigAction,
  updateTenantRolePermissionAction,
  upsertVariantAxisAction,
} from "@/actions/settings";
import { GstinInput } from "@/components/ui/dynamic-fields";
import { compressLogoImage } from "@/lib/storage/image-compress";
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
  const [tab, setTab] = useState("brand");

  // Brand state
  const [uiStyle, setUiStyle] = useState<UiStyleKey>(tenant.brand_config?.ui_style ?? "style_4");
  const [primaryColor, setPrimaryColor] = useState(tenant.brand_config?.primary_color ?? "#0284c7");
  const [tagline, setTagline] = useState(tenant.brand_config?.tagline ?? "");
  const [mfgInfo, setMfgInfo] = useState(tenant.brand_config?.manufacturer_info ?? "");
  const [care, setCare] = useState(tenant.brand_config?.customer_care ?? "");
  const [logoUploading, setLogoUploading] = useState(false);

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const { blob, hash } = await compressLogoImage(file);
      const presign = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "brand_logo",
          hash,
          contentLength: blob.size,
          contentType: "image/webp",
        }),
      }).then((r) => r.json());
      if (presign.error) throw new Error(presign.error);

      const putRes = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/webp", "Content-Length": String(blob.size) },
        body: blob,
      });
      if (!putRes.ok) throw new Error("Failed to upload logo to storage.");

      await updateBrandConfigAction(
        {
          ui_style: uiStyle,
          primary_color: primaryColor,
          tagline,
          manufacturer_info: mfgInfo,
          customer_care: care,
        },
        presign.key
      );
      toast.success("Brand logo uploaded & saved!");
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
          { id: "brand", label: "Brand & UI Style" },
          { id: "schema", label: "Catalog Schema" },
          { id: "tax", label: "Tax & GST" },
          { id: "branches", label: `Branches (${branches.length}/${tenant.max_branches})` },
          { id: "staff", label: `Staff & Resets`, badge: resets.length || undefined },
          { id: "permissions", label: "Role Permissions" },
          { id: "devices", label: "Offline Devices" },
          { id: "backups", label: "Backups" },
        ]}
      />

      {tab === "brand" && (
        <Card>
          <CardHeader><h3 className="text-sm font-semibold">Brand &amp; Dashboard UI Style (1–5)</h3></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>UI Layout Style (from Proposal)</Label>
                <Select value={uiStyle} onChange={(e) => setUiStyle(e.target.value as UiStyleKey)}>
                  <option value="style_1">Style 1: Clean Analytics &amp; Overview</option>
                  <option value="style_2">Style 2: Dark-Sidebar Sales &amp; Ledger</option>
                  <option value="style_3">Style 3: Minimalist Dispatch &amp; Ops</option>
                  <option value="style_4">Style 4: Full ERP &amp; Import/Export Suite</option>
                  <option value="style_5">Style 5: High-Contrast Financial &amp; Cashflow</option>
                </Select>
              </div>
              <div>
                <Label>Brand Accent Color</Label>
                <Input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-11 p-1" />
              </div>
              <div className="sm:col-span-2">
                <Label>Business Tagline</Label>
                <Input value={tagline} onChange={(e) => setTagline(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Manufacturer Name &amp; Address (for Legal Metrology Labels)</Label>
                <Input value={mfgInfo} onChange={(e) => setMfgInfo(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Customer Care Phone / Email</Label>
                <Input value={care} onChange={(e) => setCare(e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div>
                  <p className="font-semibold text-slate-900">Business Logo (WebP ≤ 200 KB, Cloudflare R2)</p>
                  <p className="text-slate-500">
                    {tenant.brand_config?.logo_key ? `Active: ${tenant.brand_config.logo_key}` : "No custom logo uploaded yet"}
                  </p>
                </div>
                <label className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer ${!permissions["settings.tax_and_hsn"] || logoUploading ? "opacity-50 pointer-events-none" : ""}`}>
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
      )}

      {tab === "schema" && (
        <div className="space-y-4">
          {!stockEnabled ? (
            <Alert variant="warning">Dynamic Stock Matrix is not active on your current plan.</Alert>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><h3 className="text-sm font-semibold">Variant Axes ({axes.length})</h3></CardHeader>
                <CardContent className="space-y-3">
                  {axes.map((a) => (
                    <div key={a.id} className="rounded-xl border border-slate-200 p-2.5 text-xs flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold">{a.name}</p>
                        <p className="text-slate-500 mt-0.5">{a.preset_values.join(", ")}</p>
                      </div>
                      {permissions["settings.catalog_schema"] && (
                        <button
                          type="button"
                          title="Delete Variant Axis"
                          onClick={async () => {
                            if (!confirm(`Delete axis "${a.name}"?`)) return;
                            await deleteVariantAxisAction(a.id);
                            toast.success("Variant axis deleted.");
                            router.refresh();
                          }}
                          className="rounded-lg bg-rose-500 p-1.5 text-white hover:bg-rose-600 cursor-pointer shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await upsertVariantAxisAction({
                        name: axisName,
                        presetValues: axisVals.split(",").map((s) => s.trim()).filter(Boolean),
                      });
                      setAxisName("");
                      setAxisVals("");
                      toast.success("Variant axis added.");
                      router.refresh();
                    }}
                    className="space-y-2 border-t border-slate-200 pt-3"
                  >
                    <Input placeholder="Axis Name (e.g. Size, Storage)" value={axisName} onChange={(e) => setAxisName(e.target.value)} required />
                    <Input placeholder="Values comma-separated (e.g. UK 6, UK 7, UK 8)" value={axisVals} onChange={(e) => setAxisVals(e.target.value)} required />
                    <Button type="submit" size="sm" disabled={!permissions["settings.catalog_schema"]}>
                      <Plus className="h-3.5 w-3.5" /> Add Axis
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><h3 className="text-sm font-semibold">Custom Product Fields ({fields.length})</h3></CardHeader>
                <CardContent className="space-y-3">
                  {fields.map((f) => (
                    <div key={f.id} className="rounded-xl border border-slate-200 p-2.5 text-xs flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold">{f.label} <span className="text-slate-400">({f.field_type})</span></p>
                        <p className="text-[11px] text-slate-500">
                          {[f.show_on_bill && "Bill", f.show_on_website && "Website", f.show_in_catalogue && "PDF"].filter(Boolean).join(" • ")}
                        </p>
                      </div>
                      {permissions["settings.catalog_schema"] && (
                        <button
                          type="button"
                          title="Delete Custom Field"
                          onClick={async () => {
                            if (!confirm(`Delete custom field "${f.label}"?`)) return;
                            await deleteCustomFieldAction(f.id);
                            toast.success("Custom field deleted.");
                            router.refresh();
                          }}
                          className="rounded-lg bg-rose-500 p-1.5 text-white hover:bg-rose-600 cursor-pointer shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
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
                      toast.success("Custom field added.");
                      router.refresh();
                    }}
                    className="space-y-2 border-t border-slate-200 pt-3"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Field Label (e.g. Sole Type)" value={cfLabel} onChange={(e) => setCfLabel(e.target.value)} required />
                      <Select value={cfType} onChange={(e) => setCfType(e.target.value as typeof cfType)}>
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="select">Dropdown</option>
                        <option value="boolean">Yes/No</option>
                        <option value="date">Date</option>
                      </Select>
                    </div>
                    {cfType === "select" && (
                      <Input placeholder="Options comma-separated" value={cfOpts} onChange={(e) => setCfOpts(e.target.value)} />
                    )}
                    <Button type="submit" size="sm" disabled={!permissions["settings.catalog_schema"]}>
                      <Plus className="h-3.5 w-3.5" /> Add Custom Field
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {tab === "tax" && (
        <Card>
          <CardHeader><h3 className="text-sm font-semibold">GST &amp; Inventory Rules</h3></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-6">
              <Switch checked={gstEnabled} onCheckedChange={setGstEnabled} label="GST Billing Enabled" />
              <Switch checked={allowEstimate} onCheckedChange={setAllowEstimate} label="Allow Non-GST Estimate / Bill of Supply" />
              <Switch checked={allowNegStock} onCheckedChange={setAllowNegStock} label="Allow Negative Stock (Online POS)" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Default Tax Mode</Label>
                <Select value={taxMode} onChange={(e) => setTaxMode(e.target.value as "inclusive" | "exclusive")}>
                  <option value="inclusive">Tax-Inclusive (Retail MRP)</option>
                  <option value="exclusive">Tax-Exclusive (Wholesale/B2B)</option>
                </Select>
              </div>
              <div>
                <Label>HSN Digits on Invoice</Label>
                <Select value={String(hsnDigits)} onChange={(e) => setHsnDigits(Number(e.target.value) as 4 | 6)}>
                  <option value="4">4 Digits (Turnover &lt;= ₹5 Cr)</option>
                  <option value="6">6 Digits (Turnover &gt; ₹5 Cr)</option>
                </Select>
              </div>
              <div>
                <Label>Default State</Label>
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
                toast.success("Tax settings saved.");
                router.refresh();
              }}
            >
              Save Tax Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === "branches" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Active Branches</h3></CardHeader>
            <CardContent className="space-y-2">
              {branches.map((b) => (
                <div key={b.id} className="rounded-xl border border-slate-200 p-3 text-xs flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{b.name} ({b.code}) {b.is_default && <Badge variant="info" className="ml-1">Default</Badge>}</p>
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
                            className="rounded-lg bg-rose-500 p-1.5 text-white hover:bg-rose-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
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
                {resets.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-amber-200 p-2.5 text-xs">
                    <div>
                      <p className="font-bold">{r.full_name} ({r.role})</p>
                      <p className="text-slate-500">Submitted: {r.identifier_submitted} {r.note ? `• "${r.note}"` : ""}</p>
                    </div>
                    <Button size="sm" onClick={() => setResetTarget({ id: r.user_id, name: r.full_name ?? r.identifier_submitted })}>
                      <KeyRound className="h-3.5 w-3.5" /> Reset Password
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><h3 className="text-sm font-semibold">Team ({staff.length}/{tenant.max_users})</h3></CardHeader>
              <CardContent className="space-y-2">
                {staff.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">
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
                ))}
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

      {tab === "permissions" && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">Staff Role Permissions</h3>
            <p className="text-xs text-slate-500">Showing permissions for features active on your plan (including cross-tier unlocks).</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Module</th>
                  <th className="p-2.5">Permission</th>
                  <th className="p-2.5 text-center">Branch Admin</th>
                  <th className="p-2.5 text-center">Worker</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PERMISSION_DEFINITIONS.filter((p) => isFeatureEnabled(tenant, p.feature)).map((p) => (
                  <tr key={p.key}>
                    <td className="p-2.5 text-slate-500">{p.module}</td>
                    <td className="p-2.5 font-medium text-slate-900">{p.label}</td>
                    {(["branch_admin", "worker"] as const).map((role) => {
                      const val = permLookup.get(`${role}:${p.key}`) ?? p[role];
                      return (
                        <td key={role} className="p-2.5 text-center">
                          <button
                            type="button"
                            disabled={!permissions["settings.staff_and_roles"]}
                            onClick={async () => {
                              await updateTenantRolePermissionAction(role, p.key, !val);
                              toast.success("Permission updated.");
                              router.refresh();
                            }}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border cursor-pointer disabled:opacity-50 ${
                              val ? "bg-sky-600 border-sky-600 text-white" : "bg-white border-slate-300 text-slate-300"
                            }`}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === "devices" && (
        <Card>
          <CardHeader><h3 className="text-sm font-semibold">Registered Offline POS Devices</h3></CardHeader>
          <CardContent className="space-y-2">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs">
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
            ))}
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
          <CardContent className="space-y-2">
            {backups.length === 0 ? (
              <p className="text-xs text-slate-500">No backups recorded yet.</p>
            ) : (
              backups.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs">
                  <div>
                    <p className="font-semibold">
                      {new Date(b.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} ({b.trigger_type})
                    </p>
                    <p className="text-slate-500">
                      {(Number(b.file_size_bytes) / 1024).toFixed(1)} KB • SHA-256: {b.checksum_sha256.slice(0, 12)}…
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const url = await getBackupDownloadUrlAction(b.id);
                      window.open(url, "_blank");
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              ))
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
