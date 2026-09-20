import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Ditampilkan saat notFound() dipanggil dari Smart Expense Capture.
 *
 * Sengaja tidak memakai layar 404 umum: orang sampai di sini lewat tautan
 * proyek, jadi jalan keluarnya adalah daftar proyek, bukan dashboard.
 */
export default function ExpenseCaptureNotFound() {
  return (
    <div className="space-y-4">
      <Link href="/projects" className="inline-block py-2 text-sm text-primary">
        ← Semua proyek
      </Link>
      <EmptyState
        title="Proyek tidak ditemukan"
        description="Proyek ini tidak ada, sudah dihapus, atau alamatnya salah ketik. Periksa kembali dari daftar proyek."
        action={
          <Link href="/projects" className="mt-2 inline-block">
            <Button>Buka daftar proyek</Button>
          </Link>
        }
      />
    </div>
  );
}
