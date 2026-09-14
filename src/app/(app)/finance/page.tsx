import { getFinanceWorkspace } from "@/server/finance/workspace";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
export default async function FinancePage() {
  return <FinanceWorkspace data={await getFinanceWorkspace()} />;
}
