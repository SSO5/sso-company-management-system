import { requireUser } from "@/lib/auth/current-user";
import { listCompanyExpenses } from "@/server/finance/company-expenses";
import { listChartOfAccounts } from "@/server/finance/chart-of-accounts";
import { CompanyExpensePanel } from "@/components/finance/company-expense-panel";

export default async function CompanyExpensesPage() {
  const [actor, expenses, accounts] = await Promise.all([
    requireUser(),
    listCompanyExpenses(),
    listChartOfAccounts(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Beban Operasional</h1>
        <p className="text-sm text-muted-foreground">
          Biaya perusahaan yang bukan biaya satu proyek tertentu — gaji, sewa kantor, listrik, dan sejenisnya.
          Untuk biaya proyek, catat dari tab Costs di halaman proyek terkait.
        </p>
      </div>
      <CompanyExpensePanel expenses={expenses} accounts={accounts} role={actor.role} />
    </div>
  );
}
