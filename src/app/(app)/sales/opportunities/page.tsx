import { listOpportunities } from "@/server/sales/opportunities";
import { listCustomers } from "@/server/sales/customers";
import { listUsersForPicker } from "@/server/settings/users";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { OpportunityFormDialog } from "@/components/sales/opportunity-form-dialog";
import { OpportunityStageSelect } from "@/components/sales/opportunity-stage-select";
import { can } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, FolderOpen } from "lucide-react";
import type { OpportunityStatus } from "@prisma/client";
import Link from "next/link";

const STAGES: OpportunityStatus[] = [
  "NEW",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
];

export default async function OpportunitiesPage() {
  const [opportunities, customers, salesUsers, contacts, actor] =
    await Promise.all([
      listOpportunities(),
      listCustomers(),
      listUsersForPicker("SALES"),
      prisma.contact.findMany({
        select: { id: true, customerId: true, name: true },
      }),
      requireUser(),
    ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="workspace-eyebrow">Dari peluang menuju pesanan</p>
          <h1 className="text-xl font-semibold">Prospek & Penawaran</h1>
          <p className="text-sm text-muted-foreground">
            {opportunities.length} prospek · buka kartu untuk melanjutkan
            penawaran dan dokumen
          </p>
        </div>
        {can(actor.role, "sales", "create") && (
          <OpportunityFormDialog
            customers={customers}
            contacts={contacts}
            salesUsers={salesUsers}
            defaultSalesPicId={salesUsers.some((user) => user.id === actor.userId) ? actor.userId : undefined}
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> Catat prospek
              </Button>
            }
          />
        )}
      </div>

      {opportunities.length === 0 ? (
        <EmptyState
          title="Belum ada prospek"
          description="Catat kebutuhan pelanggan untuk mulai menyiapkan penawaran dan dokumennya."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STAGES.map((stage) => {
            const items = opportunities.filter((o) => o.status === stage);
            const total = items.reduce(
              (s, o) => s + Number(o.estimatedValue),
              0,
            );
            return (
              <Card key={stage} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <span>
                      {
                        {
                          NEW: "Baru",
                          QUALIFIED: "Terkualifikasi",
                          PROPOSAL: "Penawaran",
                          NEGOTIATION: "Negosiasi",
                          WON: "Dimenangkan",
                          LOST: "Tidak berlanjut",
                        }[stage]
                      }
                    </span>
                    <span className="text-muted-foreground">
                      {items.length}
                    </span>
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    {formatCurrency(total)}
                  </p>
                </CardHeader>
                <CardContent className="flex-1 space-y-2">
                  {items.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-md border border-border p-2"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <Link
                          href={`/sales/opportunities/${o.id}`}
                          className="break-words text-sm font-semibold hover:underline"
                        >
                          {o.name}
                        </Link>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {o.folders[0] && (
                            <Link
                              href={`/sales/opportunities/${o.id}`}
                              title="Buka Opportunity & folder"
                            >
                              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            </Link>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {o.customer.companyName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatCurrency(Number(o.estimatedValue))}
                      </p>
                      <div className="mt-1">
                        <p className="py-2 text-xs text-muted-foreground">
                          PIC: {o.salesPic.name}
                          {o.expectedClosingDate
                            ? ` · Target ${formatDate(o.expectedClosingDate)}`
                            : " · Target belum diisi"}
                        </p>
                        <Link
                          href={`/sales/opportunities/${o.id}`}
                          className="inline-block py-2 text-xs font-medium text-primary"
                        >
                          Buka ruang prospek →
                        </Link>
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
