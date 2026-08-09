"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskPanel } from "@/components/projects/task-panel";
import { MilestonePanel } from "@/components/projects/milestone-panel";
import { ExpensePanel } from "@/components/projects/expense-panel";
import { ClosingPanel } from "@/components/projects/closing-panel";
import { formatCurrency } from "@/lib/utils";
import type { TaskStatus } from "@prisma/client";

interface Props {
  projectId: string;
  status: string;
  canManage: boolean;
  profitability: {
    contractValue: number; budget: number; actualCost: number; budgetRemaining: number;
    totalInvoiced: number; totalPaid: number; outstanding: number; grossProfit: number; grossMargin: number;
  };
  tasks: { id: string; title: string; status: TaskStatus; priority: string; dueDate: Date | null; progressPercent: number; assignedTo: { name: string } | null }[];
  milestones: { id: string; name: string; status: string; dueDate: Date | null; progressPercent: number }[];
  expenses: { id: string; number: string; category: string; description: string; date: Date; total: unknown; paymentStatus: string; createdBy: { name: string } }[];
  assignees: { id: string; name: string }[];
  closing: { checklist: { key: string; label: string; passed: boolean }[]; canClose: boolean };
}

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "tasks", label: "Tasks" },
  { value: "milestones", label: "Milestones" },
  { value: "costs", label: "Costs" },
  { value: "closing", label: "Closing" },
];

export function ProjectDetailTabs(props: Props) {
  const [active, setActive] = useState("overview");
  const p = props.profitability;

  const financeCards = [
    { label: "Project Value", value: formatCurrency(p.contractValue) },
    { label: "Total Invoiced", value: formatCurrency(p.totalInvoiced) },
    { label: "Total Paid", value: formatCurrency(p.totalPaid) },
    { label: "Outstanding", value: formatCurrency(p.outstanding) },
    { label: "Budget", value: formatCurrency(p.budget) },
    { label: "Actual Cost", value: formatCurrency(p.actualCost) },
    { label: "Estimated Profit", value: formatCurrency(p.grossProfit) },
    { label: "Gross Margin", value: `${p.grossMargin}%` },
  ];

  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} active={active} onChange={setActive} />

      {active === "overview" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {financeCards.map((c) => (
            <Card key={c.label}>
              <CardHeader className="pb-1"><CardTitle className="text-[11px] font-medium text-muted-foreground">{c.label}</CardTitle></CardHeader>
              <CardContent><p className="text-base font-semibold">{c.value}</p></CardContent>
            </Card>
          ))}
        </div>
      )}

      {active === "tasks" && <TaskPanel projectId={props.projectId} tasks={props.tasks} assignees={props.assignees} />}
      {active === "milestones" && <MilestonePanel projectId={props.projectId} milestones={props.milestones} />}
      {active === "costs" && <ExpensePanel projectId={props.projectId} expenses={props.expenses} />}
      {active === "closing" && (
        <ClosingPanel
          projectId={props.projectId}
          checklist={props.closing.checklist}
          canClose={props.closing.canClose}
          status={props.status}
          canManage={props.canManage}
        />
      )}
    </div>
  );
}
