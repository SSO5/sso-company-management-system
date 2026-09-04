import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-secondary px-4 text-center">
      <p className="font-mono text-xs text-muted-foreground">404</p>
      <div>
        <h1 className="text-lg font-semibold">Halaman tidak ditemukan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alamat ini tidak ada atau sudah dipindahkan. Periksa kembali tautannya.
        </p>
      </div>
      <Link href="/dashboard"><Button>Kembali ke Dashboard</Button></Link>
    </div>
  );
}
