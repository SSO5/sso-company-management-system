import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { AppLauncher } from "@/components/layout/app-launcher";

export const metadata: Metadata = { title: "Semua Modul" };

function greeting(hour: number): string {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

export default async function AppsPage() {
  const actor = await requireUser();

  // Dua hitungan ini sengaja ditulis langsung, bukan lewat getDashboardData():
  // yang itu menghitung belasan agregat untuk kartu KPI, dan halaman ini cuma
  // butuh dua angka. Keduanya dijaga izin — Sales tidak boleh melihat jumlah
  // invoice terlambat hanya karena angkanya kecil.
  const [awaitingApproval, overdueInvoices] = await Promise.all([
    can(actor.role, "sales", "view")
      ? prisma.quotation.count({
          where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
        })
      : Promise.resolve(0),
    can(actor.role, "finance", "view")
      ? prisma.invoice.count({ where: { status: "OVERDUE" } })
      : Promise.resolve(0),
  ]);

  // Lencana HANYA untuk yang butuh tindakan. Menempelkan angka pada setiap
  // ikon ("142 pelanggan") melatih orang mengabaikan semua lencana, termasuk
  // yang benar-benar penting.
  const counts = {
    "/sales/quotations": { value: awaitingApproval, tone: "attention" as const },
    "/finance/receivables": { value: overdueInvoices, tone: "urgent" as const },
  };

  // Jam server. Untuk sapaan, meleset satu zona waktu tidak berakibat apa-apa;
  // menambah komponen klien hanya demi ini tidak sepadan.
  const firstName = actor.name.split(" ")[0];

  return (
    <div className="space-y-7">
      <header>
        <h1 className="mood-heading text-2xl font-semibold tracking-tight">
          {greeting(new Date().getHours())}, {firstName}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Ikon tersusun mengikuti urutan pekerjaan: penawaran dulu, baru proyek, lalu penagihan.
        </p>
      </header>

      <AppLauncher role={actor.role} counts={counts} />
    </div>
  );
}
