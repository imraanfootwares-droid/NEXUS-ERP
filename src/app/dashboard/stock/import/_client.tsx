"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { commitImportJobAction, createImportJobAction, stageImportChunkAction } from "@/actions/inventory";
import { Alert, Button, Card, CardContent, Label, Select } from "@/components/ui/primitives";
import { buildStockTemplateWorkbook, parseStockRows, type ParsedStockRow } from "@/lib/import/stock-parser";
import type { BranchRow } from "@/types/database";

export function StockImportClient({
  branches,
  axisNames,
  customFieldKeys,
}: {
  branches: BranchRow[];
  axisNames: string[];
  customFieldKeys: string[];
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [validRows, setValidRows] = useState<ParsedStockRow[]>([]);
  const [errors, setErrors] = useState<Array<{ rowNo: number; message: string }>>([]);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () => {
    const bytes = buildStockTemplateWorkbook(axisNames, customFieldKeys, "Pair");
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexus-erp-stock-template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const parsed = parseStockRows(json, axisNames, customFieldKeys, "Pair");
    setValidRows(parsed.validRows);
    setErrors(parsed.errors);
  };

  const commitImport = async () => {
    if (validRows.length === 0) return;
    setBusy(true);
    try {
      const jobId = await createImportJobAction(branchId, validRows.length);
      for (let i = 0; i < validRows.length; i += 500) {
        const chunk = validRows.slice(i, i + 500).map((r) => ({
          rowNo: r.rowNo,
          payload: r as unknown as Record<string, unknown>,
        }));
        await stageImportChunkAction(jobId, chunk);
      }
      const res = await commitImportJobAction(jobId);
      toast.success(`Imported ${res.committed_rows} rows atomically!`);
      router.push("/dashboard/stock");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import rolled back due to error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="w-full sm:w-64">
              <Label>Target Branch for Opening Stock</Label>
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </Select>
            </div>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Download .xlsx Template
            </Button>
          </div>

          <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center">
            <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-medium text-slate-700 mb-2">Upload Excel (.xlsx) or CSV (.csv)</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="text-xs" />
          </div>

          {errors.length > 0 && (
            <Alert variant="danger" title={`${errors.length} Row Validation Error(s)`}>
              <ul className="list-disc pl-4 text-xs space-y-0.5 max-h-32 overflow-y-auto">
                {errors.map((er, i) => (
                  <li key={i}>Row {er.rowNo}: {er.message}</li>
                ))}
              </ul>
            </Alert>
          )}

          {validRows.length > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <div className="text-sm text-emerald-900">
                <strong>{validRows.length}</strong> valid rows ready to commit atomically.
              </div>
              <Button onClick={commitImport} disabled={busy || errors.length > 0}>
                {busy ? "Committing..." : "Commit All Rows"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
