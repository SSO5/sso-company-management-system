"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoExtractUploadDialog } from "@/components/projects/po-extract-upload-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CheckCircle2, TriangleAlert } from "lucide-react";

type PoRow = { id: string; number: string; poDate: string; poValue: string; status: string; hasDocument: boolean };

/**
 * "Customer PO" panel on the Quotation detail page — where the real PO file
 * gets uploaded pre-Won, since markQuotationWon now refuses to fire without
 * one (spec: "syarat untuk bisa Won adalah dokumen PO asli dari customer
 * harus sudah terupload"). Shows every PO recorded against this quotation
 * and whether each actually has a file on it, not just typed-in numbers.
 */
export function CustomerPoPanel({
  purchaseOrders,
  hasUploadedDocument,
  folderId,
  customerId,
  quotationId,
  canUpload,
}: {
  purchaseOrders: PoRow[];
  hasUploadedDocument: boolean;
  folderId: string | null;
  customerId: string;
  quotationId: string;
  canUpload: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Customer PO</CardTitle>
        {canUpload && folderId && (
          <PoExtractUploadDialog folderId={folderId} customerId={customerId} quotationId={quotationId} buttonLabel="Upload PO" />
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {hasUploadedDocument ? (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> File PO asli sudah ter-upload — syarat Mark Won terpenuhi.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <TriangleAlert className="h-3.5 w-3.5" />
            Belum ada file PO asli yang ter-upload{purchaseOrders.length > 0 ? " (PO di bawah baru data ketikan, belum ada filenya)" : ""} — wajib diupload dulu sebelum Mark Won.
          </p>
        )}
        {purchaseOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada PO customer yang tercatat.</p>
        ) : (
          <div className="space-y-1.5">
            {purchaseOrders.map((po) => (
              <div key={po.id} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm">
                <div>
                  <p className="font-medium">{po.number}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(po.poDate)} — {formatCurrency(po.poValue)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{po.status}</Badge>
                  {po.hasDocument ? (
                    <Badge variant="success">File ada</Badge>
                  ) : (
                    <Badge variant="warning">Tanpa file</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
