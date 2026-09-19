"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectFinancialView, type ProjectFinancials } from "@/components/projects/financial-view";
import { TaskPanel } from "@/components/projects/followup-panel";
import { MilestonePanel } from "@/components/projects/milestone-panel";
import {
  WeeklyWorkspace,
  type WeeklyData,
} from "@/components/projects/weekly-workspace";
import { ClosingPanel } from "@/components/projects/closing-panel";
import { DocumentsPanel } from "@/components/projects/documents-panel";
import { SCurvePanel } from "@/components/projects/s-curve-panel";
import { ProgressReportDocumentsPanel } from "@/components/projects/progress-report-documents-panel";
import { formatCurrency } from "@/lib/utils";
import type { TaskStatus, UserRole } from "@prisma/client";
import type {
  SCurvePoint,
  BillingTimelineStep,
} from "@/lib/workflows/calculations";

interface Props {
  weekly: WeeklyData;
  projectId: string;
  customerId: string;
  purchaseOrderFolderId: string | null;
  status: string;
  canManage: boolean;
  role: UserRole;
  profitability: ProjectFinancials;
  tasks: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: string;
    dueDate: Date | null;
    progressPercent: number;
    assignedTo: { name: string } | null;
    assignedToId?: string | null;
    description?: string | null;
    notes?: string | null;
  }[];
  milestones: {
    id: string;
    name: string;
    status: string;
    dueDate: Date | null;
    progressPercent: number;
    weightPercent: unknown;
    description: string | null;
    sourcePurchaseOrderId: string | null;
    dateBasis: string | null;
    sourcePurchaseOrder: { number: string } | null;
  }[];
  sCurve: {
    points: SCurvePoint[];
    totalWeight: number;
    asOfToday: { planned: number; actual: number; billed: number };
  };
  expenses: {
    id: string;
    number: string;
    category: string;
    description: string;
    date: Date;
    total: unknown;
    paymentStatus: string;
    approvalStatus: string;
    submittedById: string | null;
    rejectionReason: string | null;
    createdBy: { name: string };
    vendorPurchaseOrderId: string | null;
  }[];
  assignees: { id: string; name: string }[];
  closing: {
    checklist: { key: string; label: string; passed: boolean }[];
    canClose: boolean;
  };
  opportunity: { id: string; number: string } | null;
  quotation: {
    id: string;
    number: string;
    revision: number;
    grandTotal: unknown;
  } | null;
  purchaseOrders: {
    id: string;
    number: string;
    poDate: Date;
    poValue: unknown;
    status: string;
    paymentTerms: string | null;
    deliveryTerms: string | null;
    estimatedDeliveryDate: Date | null;
  }[];
  vendorPurchaseOrders: {
    id: string;
    number: string;
    vendorName: string;
    poDate: Date;
    grandTotal: unknown;
    status: string;
  }[];
  invoices: {
    id: string;
    number: string;
    invoiceDate: Date;
    dueDate: Date;
    grandTotal: unknown;
    dpPercent: unknown;
    paidAmount: unknown;
    status: string;
    payments: { paymentDate: Date; amount: unknown }[];
  }[];
  salesOrigin: {
    items: {
      key: string;
      label: string;
      complete: boolean;
      folderId: string | null;
    }[];
    complete: boolean;
  };
  billingTimeline: BillingTimelineStep[];
  progressReportFolderId: string | null;
  progressReportDocuments: {
    id: string;
    originalName: string;
    displayName: string;
    fileSize: number;
    reportDate: Date;
    dateFromFileName: boolean;
    uploadedBy: { name: string };
    progressReport: {
      id: string;
      summary: string | null;
      overallPercent: number | null;
      aiGenerated: boolean;
      items: {
        id: string;
        sectionName: string | null;
        partName: string;
        quantity: string | null;
        notes: string | null;
        isDone: boolean;
      }[];
    } | null;
  }[];
}

const TABS = [
  { value: "progress", label: "Progres Mingguan" },
  { value: "tasks", label: "Tindak Lanjut" },
  { value: "documents", label: "Dokumen & Riwayat" },
  { value: "finance", label: "Keuangan" },
];

export function ProjectDetailTabs(props: Props) {
  const params = useSearchParams();
  const requested = params.get("tab") ?? "progress";
  const [active, setActive] = useState(
    TABS.some((t) => t.value === requested) ? requested : "progress",
  );
  useEffect(() => {
    setActive(TABS.some((t) => t.value === requested) ? requested : "progress");
  }, [requested]);
  function changeTab(value: string) {
    setActive(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.pushState(null, "", url);
  }

  const weeklyView = (historyOnly = false) => (
    <WeeklyWorkspace
      projectId={props.projectId}
      folderId={props.progressReportFolderId}
      data={props.weekly}
      documents={props.progressReportDocuments}
      role={props.role}
      assignees={props.assignees}
      historyOnly={historyOnly}
    />
  );
  return (
    <div className="space-y-5">
      <Tabs tabs={TABS} active={active} onChange={changeTab} />
      {active === "progress" && weeklyView()}
      {active === "tasks" && (
        <TaskPanel
          role={props.role}
          projectId={props.projectId}
          tasks={props.tasks}
          assignees={props.assignees}
          actorId={props.weekly.actorId}
        />
      )}
      {active === "finance" && <ProjectFinancialView data={props.profitability} />}
      {active === "documents" && (
        <div className="space-y-5">
          {weeklyView(true)}
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Dokumen kontrak dan transaksi terkait
            </summary>
            <div className="mt-4">
              <DocumentsPanel
                projectId={props.projectId}
                customerId={props.customerId}
                purchaseOrderFolderId={props.purchaseOrderFolderId}
                opportunity={props.opportunity}
                quotation={props.quotation}
                purchaseOrders={props.purchaseOrders}
                vendorPurchaseOrders={props.vendorPurchaseOrders}
                invoices={props.invoices}
                salesOrigin={props.salesOrigin}
                billingTimeline={props.billingTimeline}
              />
            </div>
          </details>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Tahapan yang sudah tercatat & penutupan proyek
            </summary>
            <div className="mt-4 space-y-6">
              <p className="text-xs text-muted-foreground">
                Tahapan lama tetap tersedia. Tahapan pembayaran tidak mewakili
                kemajuan fisik pekerjaan.
              </p>
              <MilestonePanel
                role={props.role}
                projectId={props.projectId}
                milestones={props.milestones}
              />
              <ClosingPanel
                projectId={props.projectId}
                checklist={props.closing.checklist}
                canClose={props.closing.canClose}
                status={props.status}
                canManage={props.canManage}
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
