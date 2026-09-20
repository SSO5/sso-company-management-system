import { ExpenseReviewQueue } from "@/components/finance/expense-review-queue";
import { loadExpenseReview } from "@/lib/expense-review";
import { requireUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";

/**
 * Keuangan > Tinjauan Biaya.
 *
 * Masih memakai data tiruan; saat kuerinya ditulis, hanya isi
 * loadExpenseReview() yang berubah.
 */
export default async function ExpenseReviewPage() {
  const actor = await requireUser();
  requirePermission(actor.role, "finance", "view");
  const data = await loadExpenseReview();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Tinjauan Biaya</h1>
        <p className="text-sm text-muted-foreground">
          Pengeluaran proyek yang menunggu keputusan, diurutkan dari yang paling lama
          menunggu. Selama belum diputuskan, angkanya belum masuk hitungan mana pun.
        </p>
      </div>
      <ExpenseReviewQueue data={data} />
    </div>
  );
}
