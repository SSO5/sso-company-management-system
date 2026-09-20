import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseCapture } from "@/components/projects/expense-capture";
import { loadExpenseCapture } from "@/lib/expense-capture";
import { requireUser } from "@/lib/auth/current-user";

/**
 * Rute Smart Expense Capture per proyek.
 *
 * Masih memakai data tiruan; saat unggahan dan pembacaannya tersambung,
 * hanya isi loadExpenseCapture() yang berubah.
 */
export default async function ExpenseCapturePage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser();
  const data = await loadExpenseCapture(params.id);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/cost-board`}
        className="inline-block py-2 text-sm text-primary"
      >
        ← Papan biaya
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Unggah Struk</h1>
        <p className="text-sm text-muted-foreground">
          Foto struk dibaca otomatis menjadi draf biaya proyek. Hasil bacanya usulan,
          bukan fakta — periksa dulu sebelum disimpan.
        </p>
      </div>
      <ExpenseCapture data={data} />
    </div>
  );
}
