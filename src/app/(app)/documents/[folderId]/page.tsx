import { Fragment } from "react";
import Link from "next/link";
import { getFolderView } from "@/server/documents/documents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { DocumentsListWithPanel } from "@/components/documents/documents-list-with-panel";
import { formatCurrency, formatDate, formatRevisedNumber } from "@/lib/utils";
import { Folder as FolderIcon, ChevronRight, Plus, Eye } from "lucide-react";
import type { CostingSheetSnapshot, QuotationSnapshot } from "@/lib/workflows/revision-history";

const QUOTATION_STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", SUBMITTED: "warning", UNDER_REVIEW: "warning", APPROVED: "outline",
  REJECTED: "destructive", SENT: "outline", WON: "success", LOST: "destructive",
  EXPIRED: "secondary", CANCELLED: "secondary",
};
const COSTING_STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", FINAL: "outline", CONVERTED: "success",
};

export default async function FolderPage({ params }: { params: { folderId: string } }) {
  const { folder, children, documents, breadcrumbs, costingSheets, quotations, salesOpportunityId } = await getFolderView(params.folderId);

  // True for both the Opportunity's own "3. Costing"/"4. Quotation" folders
  // (pre-Won) and the same folders after they've migrated into the Project
  // (post-Won) — see getFolderView's salesOpportunityId resolution.
  const isCostingFolder = Boolean(salesOpportunityId) && folder?.routeKey === "SALES/COSTING";
  const isQuotationFolder = Boolean(salesOpportunityId) && folder?.routeKey === "SALES/QUOTATION";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/documents" className="hover:underline">Documents</Link>
            {breadcrumbs.map((b) => (
              <span key={b.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <Link href={`/documents/${b.id}`} className="hover:underline">{b.name}</Link>
              </span>
            ))}
          </div>
          <h1 className="text-lg font-semibold">{folder?.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {isCostingFolder && (
            <Link href={`/sales/costing/new?opportunityId=${salesOpportunityId}`}>
              <Button><Plus className="h-4 w-4" /> Buat Costing Baru</Button>
            </Link>
          )}
          {isQuotationFolder && (
            <Link href={`/sales/quotations/new?opportunityId=${salesOpportunityId}`}>
              <Button><Plus className="h-4 w-4" /> Buat Quotation Baru</Button>
            </Link>
          )}
          <UploadDialog folderId={params.folderId} />
        </div>
      </div>

      {isCostingFolder && (
        costingSheets.length === 0 ? (
          <EmptyState title="Belum ada costing sheet" description={'Klik "Buat Costing Baru" untuk mulai menghitung harga jual dari prospek ini.'} />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Project / Job</TableHead><TableHead>Tanggal</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {costingSheets.map((s) => (
                <Fragment key={s.id}>
                  <TableRow>
                    <TableCell className="font-mono text-xs"><Link href={`/sales/costing/${s.id}`} className="hover:underline">{formatRevisedNumber(s.number, s.revision)}</Link></TableCell>
                    <TableCell>{s.projectTitle}</TableCell>
                    <TableCell>{formatDate(s.costingDate)}</TableCell>
                    <TableCell><Badge variant={COSTING_STATUS_VARIANT[s.status]}>{s.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <a href={`/api/costing/${s.id}/pdf?view=1`} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon" title="View / Print PDF"><Eye className="h-3.5 w-3.5" /></Button>
                      </a>
                    </TableCell>
                  </TableRow>
                  {s.revisionHistory.map((h) => {
                    const snap = h.snapshot as unknown as CostingSheetSnapshot;
                    return (
                      <TableRow key={h.id} className="bg-muted/30 text-muted-foreground">
                        <TableCell className="pl-6 font-mono text-xs">
                          <a href={`/api/costing/${s.id}/pdf?view=1&revision=${h.revision}`} target="_blank" rel="noreferrer" className="hover:underline">
                            {formatRevisedNumber(s.number, h.revision)}
                          </a>
                        </TableCell>
                        <TableCell>{snap.projectTitle}</TableCell>
                        <TableCell>{formatDate(snap.costingDate)}</TableCell>
                        <TableCell><Badge variant="outline">Riwayat</Badge></TableCell>
                        <TableCell className="text-right">
                          <a href={`/api/costing/${s.id}/pdf?view=1&revision=${h.revision}`} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="icon" title="View / Print PDF"><Eye className="h-3.5 w-3.5" /></Button>
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )
      )}

      {isQuotationFolder && (
        quotations.length === 0 ? (
          <EmptyState title="Belum ada quotation" description={'Klik "Buat Quotation Baru" untuk membuat penawaran resmi (nomor QUO diterbitkan saat disimpan).'} />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Tanggal</TableHead><TableHead>Grand Total</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {quotations.map((q) => (
                <Fragment key={q.id}>
                  <TableRow>
                    <TableCell className="font-mono text-xs"><Link href={`/sales/quotations/${q.id}`} className="hover:underline">{formatRevisedNumber(q.number, q.revision)}</Link></TableCell>
                    <TableCell>{formatDate(q.quotationDate)}</TableCell>
                    <TableCell>{formatCurrency(Number(q.grandTotal))}</TableCell>
                    <TableCell><Badge variant={QUOTATION_STATUS_VARIANT[q.status]}>{q.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <a href={`/api/quotations/${q.id}/pdf?view=1`} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon" title="View / Print PDF"><Eye className="h-3.5 w-3.5" /></Button>
                      </a>
                    </TableCell>
                  </TableRow>
                  {q.revisionHistory.map((h) => {
                    const snap = h.snapshot as unknown as QuotationSnapshot;
                    return (
                      <TableRow key={h.id} className="bg-muted/30 text-muted-foreground">
                        <TableCell className="pl-6 font-mono text-xs">
                          <a href={`/api/quotations/${q.id}/pdf?view=1&revision=${h.revision}`} target="_blank" rel="noreferrer" className="hover:underline">
                            {formatRevisedNumber(q.number, h.revision)}
                          </a>
                        </TableCell>
                        <TableCell>{snap.quotationDate ? formatDate(snap.quotationDate) : formatDate(h.createdAt)}</TableCell>
                        <TableCell>{formatCurrency(snap.grandTotal)}</TableCell>
                        <TableCell><Badge variant={QUOTATION_STATUS_VARIANT[snap.status]}>{snap.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <a href={`/api/quotations/${q.id}/pdf?view=1&revision=${h.revision}`} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="icon" title="View / Print PDF"><Eye className="h-3.5 w-3.5" /></Button>
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )
      )}

      {children.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {children.map((c) => (
            <Link key={c.id} href={`/documents/${c.id}`}>
              <Card className="transition-colors hover:bg-accent">
                <CardContent className="flex items-center gap-2 p-3">
                  <FolderIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{c.name}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {documents.length === 0 ? (
        <EmptyState title="No files in this folder" description="Upload a document — it stays private and access-controlled." />
      ) : (
        <DocumentsListWithPanel documents={documents} folderId={params.folderId} />
      )}
    </div>
  );
}
