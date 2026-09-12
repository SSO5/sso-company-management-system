"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { UserRole } from "@prisma/client";

/**
 * Rute "layar kerja": papan dan tabel yang menghabiskan lebar, dan yang
 * orangnya sudah tahu mau ke mana. Di sini panel kiri menciut jadi ikon
 * supaya area kerja dapat tambahan ~164px — di papan tugas empat kolom,
 * itu selisih antara judul kartu terpotong dan terbaca utuh.
 *
 * Beranda dan Laporan sengaja TIDAK masuk daftar: di sana orang menjelajah,
 * bukan mengerjakan, dan nama menu justru membantu.
 */
const WORK_ROUTES = [
  "/tasks",
  "/sales/opportunities",
  "/projects",
  "/documents",
  "/finance/invoices",
  "/finance/receivables",
  "/finance/payments",
  "/activity-log",
];

const RAIL_PREF_KEY = "sso.sidebarCompact";

function isWorkRoute(pathname: string): boolean {
  return WORK_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Holds the mobile drawer open/close state that Sidebar and Topbar's
 * hamburger button both need to share — AppLayout itself is a Server
 * Component (it awaits requireUser()), so this client boundary is what lets
 * a menu tap in Topbar actually open Sidebar.
 */
export function AppShell({
  role, userName, unreadCount, avatarUrl, uiMood, children,
}: { role: UserRole; userName: string; unreadCount: number; avatarUrl: string | null; uiMood: string; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // null = ikut aturan rute. true/false = orangnya sudah memutuskan sendiri,
  // dan keputusan itu menang sampai dia mengubahnya lagi. Otomatis itu
  // tebakan sistem; orang harus bisa membantahnya.
  const [railOverride, setRailOverride] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RAIL_PREF_KEY);
      if (saved === "true" || saved === "false") setRailOverride(saved === "true");
    } catch {
      // localStorage bisa dilarang (mode privat, cookie diblokir). Diamkan —
      // aplikasi tetap jalan dengan aturan rute saja.
    }
  }, []);

  function toggleRail() {
    const next = !compact;
    setRailOverride(next);
    try {
      window.localStorage.setItem(RAIL_PREF_KEY, String(next));
    } catch {
      // sama seperti di atas: preferensi hilang saat reload, bukan masalah fatal.
    }
  }

  // Suasana non-default tetap memaksa rail seperti sebelumnya — itu bagian
  // dari tampilannya, bukan keputusan navigasi.
  const moodForcesRail = uiMood !== "default";
  const compact = moodForcesRail || (railOverride ?? isWorkRoute(pathname));

  // Di halaman launcher, grid ikon ITU navigasinya — sidebar di sebelahnya
  // hanya mengulang hal yang sama dengan bentuk lebih kecil, dan memakan
  // lebar yang justru dibutuhkan grid. Ia disembunyikan di situ saja, bukan
  // dihapus: begitu masuk ke sebuah modul, berpindah ke modul lain harus
  // tetap satu klik, bukan pulang dulu ke launcher.
  const hideSidebar = pathname === "/apps";

  return (
    // Cangkang berwarna merek. Sidebar memakai bg-primary yang sama, jadi
    // keduanya menyatu jadi satu bidang — yang terlihat "mengambang" di
    // atasnya hanyalah panel konten di sebelah kanan.
    <div className="mood-shell flex h-screen bg-primary" data-mood={uiMood}>
      {!hideSidebar && (
      <Sidebar
        role={role}
        userName={userName}
        avatarUrl={avatarUrl}
        uiMood={uiMood}
        compact={compact}
        onToggleCompact={moodForcesRail ? undefined : toggleRail}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      )}
      {/* PANEL KONTEN. Di layar lebar ia menjauh dari tepi dan bersudut 28px
          sehingga terbaca sebagai lembar terpisah di atas cangkang biru; di
          layar sempit margin dan sudutnya dilepas, karena memakan ruang yang
          memang tidak ada. Latarnya bg-background (putih tulang), BUKAN putih
          murni — kartu di dalam halaman berwarna putih, dan kalau panelnya
          ikut putih kartu-kartu itu lenyap tak berbatas. */}
      <div className="flex flex-1 flex-col overflow-hidden bg-background md:my-3 md:mr-3 md:rounded-[28px]">
        <Topbar
          userName={userName}
          role={role}
          avatarUrl={avatarUrl}
          unreadCount={unreadCount}
          uiMood={uiMood}
          // Tanpa sidebar, tombol hamburger tidak punya yang dibuka.
          onMenuClick={hideSidebar ? undefined : () => setSidebarOpen(true)}
        />
        {/* key={pathname} membuat React memasang ulang pembungkusnya tiap ganti
            rute, sehingga animasi "masuk ruangan" di globals.css berjalan
            lagi. Sidebar ada di luar elemen ini dan sengaja tidak ikut
            bergerak — itu yang bikin terasa berpindah ruangan, bukan
            berkedip. */}
        <main key={pathname} className="room-enter mood-main flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
