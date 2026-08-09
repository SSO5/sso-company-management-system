import { listOpportunities } from "@/server/sales/opportunities";
import { listCustomers } from "@/server/sales/customers";
import { listUsersForPicker } from "@/server/settings/users";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { OpportunityFormDialog } from "@/components/sales/opportunity-form-dialog";
import { OpportunityStageSelect } from "@/components/sales/opportunity-stage-select";
import { formatCurrency } from "@/lib/utils";
import { Plus, FolderOpen } from "lucide-react";
import type { OpportunityStatus } from "@prisma/client";
import Link from "next/link";

const STAGES: OpportunityStatus[] = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

export default async function OpportunitiesPage() {
  const [opportunities, customers, salesUsers, contacts] = await Promise.all([
    listOpportunities(), listCustomers(), listUsersForPicker("SALES"),
    prisma.contact.findMany({ select: { id: true, customerId: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Opportunities</h1>
          <p className="text-sm text-muted-foreground">Pipeline view — {opportunities.length} total</p>
        </div>
        <OpportunityFormDialog customers={customers} contacts={contacts} salesUsers={salesUsers} trigger={<Button><Plus className="h-4 w-4" /> New Opportunity</Button>} />
      </div>

      {opportunities.length === 0 ? (
        <EmptyState title="No opportunities yet" description="Log a new opportunity to start tracking it through the pipeline." />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const items = opportunities.filter((o) => o.status === stage);
            const total = items.reduce((s, o) => s + Number(o.estimatedValue), 0);
            return (
              <Card key={stage} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-xs">
                    <span>{stage}</span>
                    <span className="text-muted-foreground">{items.length}</span>
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">{formatCurrency(total)}</p>
                </CardHeader>
                <CardContent className="flex-1 space-y-2">
                  {items.map((o) => (
                    <div key={o.id} className="rounded-md border border-border p-2">
                      <div className="flex items-start justify-between gap-1">
                        <Link href={`/sales/opportunities/${o.id}`} className="text-xs font-medium hover:underline">{o.name}</Link>
                        {o.folders[0] && (
                          <Link href={`/sales/opportunities/${o.id}`} title="Buka Opportunity & folder">
                            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground" />
                          </Link>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{o.customer.companyName}</p>
                      <p className="text-[11px] text-muted-foreground">{formatCurrency(Number(o.estimatedValue))}</p>
                      <div className="mt-1">
                        <OpportunityStageSelect id={o.id} status={o.status} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
