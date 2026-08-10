import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { getCostingSheet } from "@/server/sales/costing";
import { listUsersForPicker } from "@/server/settings/users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate, formatRevisedNumber } from "@/lib/utils";
import { calcCostingSummary } from "@/lib/workflows/calculations";
import { ConvertCostingDialog } from "@/components/sales/convert-costing-dialog";
import { ReviseCostingButton } from "@/components/sales/revise-costing-button";
import { Pencil, Eye, Download, FileSpreadsheet } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", FINAL: "outline", CONVERTED: "success",
};

export default async function CostingDetailPage({ params }: { params: { id: string } }) {
  await requireUser();
  const sheet = await getCostingSheet(params.id);
  if (!sheet) notFound();

  const summary = calcCostingSummary(
    sheet.sections.map((s) => ({
      items: s.items.map((i) => ({
        quantity: Number(i.quantity), costUnitPrice: Number(i.costUnitPrice),
        supplierDiscountPercent: Number(i.supplierDiscountPercent), marginPercent: Number(i.marginPercent),
      })),
    })),
    {
      operationalCost: Number(sheet.operationalCost),
      ppnPercent: Number(sheet.ppnPercent),
      pphFinalPercent: Number(sheet.pphFinalPercent),
    }
  );

  const [users, contacts] = await Promise.all([
    listUsersForPicker(),
    prisma.contact.findMany({ where: { customerId: sheet.customerId }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {sheet.opportunity && (
            <Link href={`/sales/opportunities/${sheet.opportunity.id}`} className="text-xs text-primary hover:underline">
              ← Back to Opportunity {sheet.opportunity.number}
            </Link>
          )}
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{formatRevisedNumber(sheet.number, sheet.revision)}</h1>
            <Badge variant={STATUS_VARIANT[sheet.status]}>{sheet.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{sheet.projectTitle} — {sheet.customer.companyName}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/costing/${sheet.id}/pdf?view=1`} target="_blank" rel="noreferrer">
            <Button variant="outline"><Eye className="h-4 w-4" /> View / Print PDF</Button>
          </a>
          <a href={`/api/costing/${sheet.id}/pdf`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="icon" title="Download PDF"><Download className="h-4 w-4" /></Button>
          </a>
          <a href={`/api/costing/${sheet.id}/excel`} target="_blank" rel="noreferrer">
            <Button variant="outline" title="Download Excel"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          </a>
          {sheet.status !== "CONVERTED" && (
            <>
              <Link href={`/sales/costing/${sheet.id}/edit`}><Button variant="outline"><Pencil className="h-4 w-4" /> Edit</Button></Link>
              <ReviseCostingButton costingId={sheet.id} />
            </>
          )}
          {sheet.status === "CONVERTED" && sheet.quotation ? (
            <Link href={`/sales/quotations/${sheet.quotation.id}`}>
              <Button variant="outline">View Quotation {formatRevisedNumber(sheet.quotation.number, sheet.quotation.revision)}</Button>
            </Link>
          ) : (
            <ConvertCostingDialog costingId={sheet.id} users={users} contacts={contacts} defaultSalesPicId={users.find((u) => u.role === "SALES")?.id} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Job No.</p><p className="text-sm font-medium">{sheet.jobNo || "—"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Date</p><p className="text-sm font-medium">{formatDate(sheet.costingDate)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Cost (COGS)</p><p className="text-sm font-medium">{formatCurrency(summary.totalCost)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-sm font-semibold">{formatCurrency(summary.totalRevenue)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Ringkasan Profitabilitas (Profitability Summary)</CardTitle></CardHeader>
        <CardContent className="max-w-sm space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Total Pendapatan (Total Revenue)</span><span>{formatCurrency(summary.totalRevenue)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total Harga Pokok Penjualan (Total COGS)</span><span>{formatCurrency(summary.totalCost)}</span></div>
          <div className="flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">Total Keuntungan Bersih (Gross Profit)</span><span className="font-medium">{formatCurrency(summary.grossProfit)}</span></div>
          <div className="flex justify-between rounded bg-success/10 px-1 py-0.5"><span className="font-medium">Persentase Margin Keuntungan (Gross Margin)</span><span className="font-medium">{summary.grossMarginPercent.toFixed(0)}%</span></div>
          <div className="h-2" />
          <div className="flex justify-between"><span className="text-muted-foreground">operasional</span><span>{formatCurrency(summary.operationalCost)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">PPN ({summary.ppnPercent}% of COGS)</span><span>{formatCurrency(summary.ppnAmount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">PPh Final ({summary.pphFinalPercent}% of COGS)</span><span>{formatCurrency(summary.pphFinalAmount)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>NET PROFIT</span><span>{formatCurrency(summary.netProfit)}</span></div>
          <div className="flex justify-between rounded bg-success/10 px-1 py-0.5"><span className="font-medium">Persentase Margin Keuntungan (Net Margin)</span><span className="font-medium">{summary.netMarginPercent.toFixed(0)}%</span></div>
        </CardContent>
      </Card>

      {sheet.sections.map((section) => (
        <Card key={section.id}>
          <CardHeader><CardTitle>{section.code} — {section.name}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Cost/Unit</TableHead>
                  <TableHead>Disc %</TableHead>
                  <TableHead>Margin %</TableHead>
                  <TableHead>Cost Total</TableHead>
                  <TableHead>Selling/Unit</TableHead>
                  <TableHead>Selling Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{Number(item.quantity)}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{formatCurrency(Number(item.costUnitPrice))}</TableCell>
                    <TableCell>{Number(item.supplierDiscountPercent)}%</TableCell>
                    <TableCell>{Number(item.marginPercent)}%</TableCell>
                    <TableCell>{formatCurrency(Number(item.costTotal))}</TableCell>
                    <TableCell>{formatCurrency(Number(item.sellingUnitPrice))}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(Number(item.sellingTotalPrice))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {sheet.notes && (
        <Card><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{sheet.notes}</CardContent></Card>
      )}
    </div>
  );
}
