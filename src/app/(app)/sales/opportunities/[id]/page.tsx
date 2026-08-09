import Link from "next/link";
import { getOpportunityDetail } from "@/server/sales/opportunities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OpportunityStageSelect } from "@/components/sales/opportunity-stage-select";
import { formatCurrency, formatRevisedNumber } from "@/lib/utils";
import { Folder as FolderIcon, FolderKanban } from "lucide-react";

const QUOTATION_STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", SUBMITTED: "warning", UNDER_REVIEW: "warning", APPROVED: "outline",
  REJECTED: "destructive", SENT: "outline", WON: "success", LOST: "destructive",
  EXPIRED: "secondary", CANCELLED: "secondary",
};

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const { opportunity: o, folders } = await getOpportunityDetail(params.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{o.number}</p>
          <h1 className="text-xl font-semibold">{o.name}</h1>
          <p className="text-sm text-muted-foreground">{o.customer.companyName}{o.contact ? ` — Attn: ${o.contact.name}${o.contact.position ? ` (${o.contact.position})` : ""}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Stage:</span>
          <OpportunityStageSelect id={o.id} status={o.status} />
        </div>
      </div>

      {o.projects.length > 0 && (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">
          Won — Project <Link href={`/projects/${o.projects[0].id}`} className="font-medium underline">{o.projects[0].number}</Link> was created and this Opportunity&apos;s folders were merged into it automatically.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Estimated Value</p><p className="text-sm font-semibold">{formatCurrency(Number(o.estimatedValue))}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Probability</p><p className="text-sm font-medium">{o.probability}%</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sales PIC</p><p className="text-sm font-medium">{o.salesPic.name}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Source</p><p className="text-sm font-medium">{o.source ?? "—"}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Folders</CardTitle></CardHeader>
        <CardContent>
          {folders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No folders yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {folders.map((f) => (
                <Link key={f.id} href={`/documents/${f.id}`}>
                  <Card className="transition-colors hover:bg-accent">
                    <CardContent className="flex items-center gap-2 p-3">
                      <FolderIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{f.name}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {o.quotations.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Quotations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {o.quotations.map((q) => (
              <Link key={q.id} href={`/sales/quotations/${q.id}`} className="flex items-center justify-between rounded-md border border-border p-2 text-sm hover:bg-accent">
                <span className="font-mono text-xs">{formatRevisedNumber(q.number, q.revision)}</span>
                <span>{formatCurrency(Number(q.grandTotal))}</span>
                <Badge variant={QUOTATION_STATUS_VARIANT[q.status]}>{q.status}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {o.projects.length === 0 && o.quotations.length === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          <FolderKanban className="h-4 w-4" />
          Open the &quot;4. Quotation&quot; folder above to draft the first quotation for this prospect — its number is issued the moment you save it.
        </div>
      )}
    </div>
  );
}
