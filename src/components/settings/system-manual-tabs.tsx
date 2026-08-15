"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "bisnis", label: "Alur Bisnis" },
  { value: "approval", label: "Maker-Checker" },
  { value: "milestone", label: "Milestone & Penagihan" },
  { value: "dokumen", label: "Penomoran & Folder" },
  { value: "ai", label: "AI & Otomatisasi" },
  { value: "notifikasi", label: "Notifikasi" },
  { value: "developer", label: "Panduan Developer" },
  { value: "roadmap", label: "Roadmap" },
];

function FlowRow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-medium">{s}</div>
          {i < steps.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: "neutral" | "warn" | "good" | "bad" }) {
  const toneClass = {
    neutral: "bg-muted text-muted-foreground",
    warn: "bg-amber-100 text-amber-800",
    good: "bg-emerald-100 text-emerald-800",
    bad: "bg-red-100 text-red-800",
  }[tone];
  return <span className={cn("rounded px-2 py-1 text-xs font-medium", toneClass)}>{children}</span>;
}

export function SystemManualTabs() {
  const [active, setActive] = useState("bisnis");

  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} active={active} onChange={setActive} />

      {active === "bisnis" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alur Bisnis Utama SSO Connect</CardTitle>
              <CardDescription>Satu data masuk di awal, dipakai ulang di setiap tahap berikutnya — tidak input dua kali.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 overflow-x-auto">
              <FlowRow steps={["Customer", "Opportunity", "Costing Sheet", "Quotation", "WON"]} />
              <div className="flex items-center gap-2 pl-4"><ArrowDown className="h-4 w-4 text-muted-foreground" /></div>
              <FlowRow steps={["Project (auto)", "Milestone & Kurva-S", "Vendor PO", "Invoice", "Payment", "Laporan Management"]} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Penjelasan Tiap Tahap</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="font-medium">Opportunity</span> — dibuat saat ada calon project/customer baru. Otomatis membuat folder dokumen sales (Sales/Opportunity/&lt;nama&gt;) dengan struktur baku (RFQ, Costing, Quotation, PO, Kontrak, dst).</div>
              <div><span className="font-medium">Costing Sheet</span> — hitung harga pokok dan margin per item. Bisa dibuka lagi untuk revisi selama belum jadi Quotation final (dan otomatis terbuka lagi kalau Quotation-nya direvisi).</div>
              <div><span className="font-medium">Quotation</span> — penawaran resmi ke customer. Melalui approval (lihat tab Maker-Checker) sebelum boleh dikirim. Status: Draft → Submitted → Approved/Rejected → Sent → Won/Lost.</div>
              <div><span className="font-medium">WON</span> — saat Quotation ditandai Won, sistem <span className="font-medium">otomatis</span> membuat Project baru, folder dokumen project, numbering job, dan tugas default — tanpa input ulang data. Sistem <span className="font-medium">tidak lagi</span> membuat milestone generik/placeholder — milestone diisi manual berdasarkan PO customer yang sebenarnya (lihat tab &quot;Milestone &amp; Penagihan&quot;).</div>
              <div><span className="font-medium">Project</span> — eksekusi pekerjaan: task, milestone, biaya proyek (expense), dokumen. Terhubung ke PO customer, Vendor PO, dan Invoice lewat <code className="rounded bg-muted px-1">projectId</code> yang sama (bisa dilihat di tab &quot;Documents&quot; pada setiap Project).</div>
              <div><span className="font-medium">Vendor PO</span> — pembelian SSO ke supplier/vendor untuk memenuhi pekerjaan. Melalui approval sebelum dikirim ke vendor.</div>
              <div><span className="font-medium">Invoice</span> — tagihan ke customer. Melalui approval sebelum diterbitkan (Issued). Pembayaran baru bisa dicatat setelah invoice berstatus Issued/Partially Paid/Overdue. Mendukung pencatatan PPh23 yang dipotong customer sebagai kredit pajak.</div>
              <div><span className="font-medium">Laporan Management</span> — Dashboard dan menu Reports membaca langsung dari data di atas secara real-time, tidak ada rekap manual terpisah.</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Prinsip: Project Adalah Titik Pertemuan Semua Modul</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              PO customer, Vendor PO, Invoice, Expense, dan Milestone semuanya menyimpan <code className="rounded bg-muted px-1">projectId</code> yang sama. Karena itu, tab &quot;Documents&quot; pada satu halaman Project bisa menampilkan seluruh riwayat transaksi sebuah pekerjaan tanpa perlu mencari di modul terpisah-pisah — termasuk kartu &quot;Sisa Penagihan&quot; yang dihitung otomatis dari PO dan Invoice project tersebut.
            </CardContent>
          </Card>
        </div>
      )}

      {active === "approval" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alur Maker-Checker</CardTitle>
              <CardDescription>Pembuat dokumen tidak pernah bisa menyetujui dokumennya sendiri — ini ditegakkan di server, bukan cuma disembunyikan di tampilan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <FlowRow steps={["DRAFT (Maker)", "SUBMITTED", "Direktur review"]} />
              <div className="flex flex-wrap gap-4 pl-4">
                <div className="flex items-center gap-2">
                  <ArrowDown className="h-4 w-4 text-muted-foreground" />
                  <StatusPill tone="good">Approve</StatusPill>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Lanjut ke tahap berikutnya (Send / Issue / dst)</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowDown className="h-4 w-4 text-muted-foreground" />
                  <StatusPill tone="bad">Reject</StatusPill>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Kembali ke Maker dengan alasan penolakan, bisa direvisi</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Berlaku di 4 Modul</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr><th className="pb-2 pr-4">Modul</th><th className="pb-2 pr-4">Diajukan oleh</th><th className="pb-2 pr-4">Disetujui oleh</th><th className="pb-2">Efek setelah Approve</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr><td className="py-2 pr-4 font-medium">Quotation</td><td className="py-2 pr-4">Sales</td><td className="py-2 pr-4">Direktur (Admin)</td><td className="py-2">Boleh dikirim ke customer (Mark Sent)</td></tr>
                    <tr><td className="py-2 pr-4 font-medium">Vendor PO</td><td className="py-2 pr-4">Sales / Procurement</td><td className="py-2 pr-4">Direktur (Admin)</td><td className="py-2">Boleh dikirim ke vendor (Mark Sent)</td></tr>
                    <tr><td className="py-2 pr-4 font-medium">Project Expense</td><td className="py-2 pr-4">PM / Finance</td><td className="py-2 pr-4">Direktur (Admin)</td><td className="py-2">Masuk hitungan cost control project</td></tr>
                    <tr><td className="py-2 pr-4 font-medium">Invoice</td><td className="py-2 pr-4">Finance</td><td className="py-2 pr-4">Direktur (Admin)</td><td className="py-2">Boleh diterbitkan ke customer (Mark Issued), baru bisa terima pembayaran</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Catatan: &quot;Direktur&quot; saat ini dipetakan ke role <span className="font-medium">Admin</span> yang sudah ada — belum ada role Direktur terpisah. Kalau ke depan butuh pemisahan (misal Direktur beda akun dari Admin operasional), tinggal ganti pengecekan role di satu tempat (<code className="rounded bg-muted px-1">src/lib/permissions.ts</code>), semua alur approval otomatis ikut.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Role IT — Koreksi Data, Bukan Approval</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Role <span className="font-medium text-foreground">IT</span> bisa mengoreksi data yang salah input atau salah nomor (lewat halaman &quot;Koreksi Dokumen&quot; di menu Pengaturan) untuk memperbaiki kesalahan administratif — tapi role ini <span className="font-medium text-foreground">sengaja tidak diberi izin approve</span> di alur maker-checker manapun. Perannya administratif-teknis, bukan otoritas bisnis.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {active === "milestone" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Milestone Manual, Dampak Otomatis</CardTitle>
              <CardDescription>Setiap milestone diisi/diedit manual oleh pengguna — tapi begitu tersimpan, semua yang bergantung padanya (Kurva-S, Sisa Penagihan, notifikasi, action item) menyesuaikan otomatis, tanpa langkah &quot;hitung ulang&quot; terpisah.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Sejak Agustus 2026, sistem <span className="font-medium">tidak lagi</span> membuat 5 milestone generik (&quot;Milestone 1 — Planning&quot; dst.) secara otomatis saat Quotation di-Won — itu terbukti hanya jadi data yang tidak relevan dengan pekerjaan aktual. Setiap milestone sekarang diisi manual di tab &quot;Milestones&quot; pada halaman Project: nama/jenis pekerjaan, tanggal jatuh tempo, dan bobot (%) terhadap total proyek untuk Kurva-S. Semua field ini bisa diedit dan dihapus kapan saja lewat tombol Edit/Hapus di baris milestone.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Kaitan Milestone ke Purchase Order (Opsional)</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Sebuah milestone bisa &quot;dikaitkan&quot; ke satu PO customer tertentu, dengan basis tanggal yang bisa dipilih:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="pb-2 pr-4">Basis Tanggal</th><th className="pb-2">Mengikuti field PO</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    <tr><td className="py-1.5 pr-4">Tanggal PO (DP)</td><td className="py-1.5">poDate — biasanya dasar penagihan termin DP</td></tr>
                    <tr><td className="py-1.5 pr-4">Perkiraan Tanggal Kirim</td><td className="py-1.5">estimatedDeliveryDate — dasar termin pelunasan/Cash Before Delivery</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground">Saat PO yang terkait diedit dan tanggalnya berubah (lewat tombol Edit PO di tab Documents), tanggal milestone yang terkait <span className="font-medium text-foreground">otomatis ikut berubah</span> — bukan dua sumber tanggal yang bisa berbeda. Field tanggal pada milestone yang sudah terkait PO akan terkunci (disabled) di form edit, dengan keterangan agar diubah lewat Edit PO, bukan di sini.</p>
              <p className="text-muted-foreground">Bila satu proyek punya lebih dari satu PO (mis. proyek dengan dua PO terpisah), milestone-nya sengaja dibiarkan <span className="font-medium text-foreground">tidak dikaitkan</span> ke PO manapun — karena satu milestone hanya bisa terhubung ke satu PO, mengaitkannya ke salah satu saja akan membuatnya diam-diam mengabaikan perubahan di PO yang lain. Untuk kasus ini, tanggal milestone tetap diedit manual sepenuhnya.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Efek Berantai: Satu Perubahan, Banyak Tampilan Menyesuaikan</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <FlowRow steps={["Tanggal PO diedit", "Milestone terkait ikut berubah", "Kurva-S", "Sisa Penagihan", "Notifikasi & Action Item"]} />
              <p className="text-muted-foreground pt-2">
                &quot;Sisa Penagihan&quot; (Total Nilai PO dikurangi Total Sudah Ditagih) dihitung ulang otomatis setiap halaman dibuka — bukan angka yang disimpan lalu disinkronkan manual. Kartu ringkasan yang sama tampil di lima tempat: tab Documents Project, Accounts Receivable, Invoice, Payment, dan Dashboard. Bila tanggal penagihan berikutnya jatuh dalam 7 hari ke depan, sistem otomatis membuat notifikasi &quot;Billing Due Soon&quot; ke role Finance dan memunculkan Action Item — tanpa siapa pun harus mengingat untuk mengeceknya.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Kurva-S (S-Curve)</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Dihitung langsung dari data Milestone (rencana/planned, berdasarkan bobot % dan tanggal) dan Invoice (aktual tertagih/billed) — bukan diinput manual terpisah. Milestone dengan bobot 0% (nilai default bila lupa diisi) otomatis diabaikan dari kurva. Bila total bobot seluruh milestone sebuah proyek belum 100%, tab Milestones menampilkan peringatan agar Kurva-S tetap akurat.
            </CardContent>
          </Card>
        </div>
      )}

      {active === "dokumen" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Format Penomoran Dokumen</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">{"{urutan}/{kode}/{bulan romawi}/{tahun}"}</div>
              <p className="text-muted-foreground">Contoh: <span className="font-mono">003/QUO/MKT/VIII/2026</span>. Nomor urut reset tiap tahun, per jenis dokumen, dan tidak pernah dipakai ulang meski dokumennya dihapus (nomor yang sudah terbit dianggap &quot;terbakar&quot;).</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="pb-2 pr-4">Jenis Dokumen</th><th className="pb-2">Kode Prefix</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    <tr><td className="py-1.5 pr-4">Customer</td><td className="py-1.5 font-mono text-xs">CUS/MKT</td></tr>
                    <tr><td className="py-1.5 pr-4">Lead</td><td className="py-1.5 font-mono text-xs">LED/MKT</td></tr>
                    <tr><td className="py-1.5 pr-4">Opportunity</td><td className="py-1.5 font-mono text-xs">OPP/MKT</td></tr>
                    <tr><td className="py-1.5 pr-4">Costing Sheet</td><td className="py-1.5 font-mono text-xs">CST/MKT</td></tr>
                    <tr><td className="py-1.5 pr-4">Quotation</td><td className="py-1.5 font-mono text-xs">QUO/MKT</td></tr>
                    <tr><td className="py-1.5 pr-4">Vendor PO (SSO ke vendor)</td><td className="py-1.5 font-mono text-xs">PO/PRO</td></tr>
                    <tr><td className="py-1.5 pr-4">Kontrak</td><td className="py-1.5 font-mono text-xs">CTR/MKT</td></tr>
                    <tr><td className="py-1.5 pr-4">Project</td><td className="py-1.5 font-mono text-xs">PRJ/OPS</td></tr>
                    <tr><td className="py-1.5 pr-4">Progress Report</td><td className="py-1.5 font-mono text-xs">ENG-REP/OPS</td></tr>
                    <tr><td className="py-1.5 pr-4">Invoice</td><td className="py-1.5 font-mono text-xs">INV/FIN</td></tr>
                    <tr><td className="py-1.5 pr-4">Payment</td><td className="py-1.5 font-mono text-xs">PAY/FIN</td></tr>
                    <tr><td className="py-1.5 pr-4">Expense</td><td className="py-1.5 font-mono text-xs">EXP/FIN</td></tr>
                    <tr><td className="py-1.5 pr-4">Job Order</td><td className="py-1.5 font-mono text-xs">JO/MKT</td></tr>
                    <tr><td className="py-1.5 pr-4">Dokumen umum lainnya</td><td className="py-1.5 font-mono text-xs">SSO-SURAT</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <span className="font-medium">Purchase Order dari customer TIDAK dibuat otomatis.</span> Nomor PO customer diisi manual dengan nomor asli milik customer (unik per customer, bukan nomor global SSO) — karena dokumen ini milik customer, bukan dokumen yang diterbitkan SSO. Sempat terjadi kesalahan di mana PO customer ikut diberi nomor otomatis (&quot;002/PO/MKT/...&quot;), menyebabkan data ganda dan salah hitung total PO — sudah diperbaiki dengan menghapus fungsi auto-generate untuk entitas ini.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Struktur Dokumen &amp; Folder (Direstrukturisasi Agustus 2026)</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">Menu &quot;Dokumen&quot; sebagai grup navigasi terpisah <span className="font-medium text-foreground">sudah dihapus</span>. Folder &quot;Company Documents&quot; tingkat perusahaan (8 folder generik seperti HR, Legal, dsb.) juga <span className="font-medium text-foreground">sudah dihapus permanen</span> — dievaluasi tidak relevan, karena hampir semua dokumen kerja selalu terkait ke sebuah Project atau Opportunity tertentu, bukan &quot;milik perusahaan&quot; secara umum.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="pb-2 pr-4">Sebelumnya</th><th className="pb-2">Sekarang</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    <tr><td className="py-1.5 pr-4">Menu &quot;Dokumen&quot; (grup navigasi sendiri)</td><td className="py-1.5">Dihapus — dipindah jadi item &quot;Dokumen Proyek&quot; di bagian bawah menu &quot;Pekerjaan&quot;</td></tr>
                    <tr><td className="py-1.5 pr-4">8 folder &quot;Company Documents&quot;</td><td className="py-1.5">Dihapus permanen beserta isinya — semua dokumen sekarang tersimpan di folder proyek masing-masing</td></tr>
                    <tr><td className="py-1.5 pr-4">&quot;Sampah&quot; (Trash)</td><td className="py-1.5">Dipindah ke menu &quot;Pengaturan&quot; sebagai &quot;Sampah Dokumen&quot;</td></tr>
                  </tbody>
                </table>
              </div>
              <FlowRow steps={["Opportunity dibuat", "Folder Sales otomatis", "Project WON", "Folder Sales digabung ke Folder Project"]} />
              <p className="text-muted-foreground pt-2">Vendor PO, Invoice, dan PO customer terhubung ke Project yang sama lewat <code className="rounded bg-muted px-1">projectId</code> — semua bisa dilihat sekaligus di tab &quot;Documents&quot; pada halaman detail Project, tanpa perlu mencari manual.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Kalau Nomor Urut Terasa Salah / Bentrok</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Jalankan <code className="rounded bg-muted px-1">npm run db:sync-numbers</code> — script ini menyamakan counter nomor ke data yang benar-benar ada di database (tidak pernah menurunkan angka, aman dijalankan berkali-kali). Biasanya terjadi kalau ada data lama yang di-input manual lewat seed/import tanpa lewat sistem penomoran otomatis. Untuk kesalahan nomor/data pada dokumen yang sudah terlanjur tersimpan, gunakan halaman &quot;Koreksi Dokumen&quot; (role IT/Admin) di menu Pengaturan, bukan mengubah database secara langsung.
            </CardContent>
          </Card>
        </div>
      )}

      {active === "ai" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Prinsip: AI Menyiapkan Draf, Manusia Konfirmasi</CardTitle>
              <CardDescription>AI tidak pernah menulis langsung ke database. Setiap fitur AI berhenti di satu form yang bisa diperiksa dan dikoreksi sebelum disimpan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <FlowRow steps={["Upload file", "AI membaca & mengusulkan data", "Form review (bisa dikoreksi)", "Pengguna simpan"]} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Ekstraksi PO Customer</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Saat mengunggah PDF/foto PO dari customer (tab Documents pada Project, atau saat membuat PO baru), AI membaca isinya dan mengusulkan nomor PO, nilai, tanggal, term of payment, dan perkiraan tanggal kirim. Pengguna memeriksa hasilnya di form sebelum menyimpan — bukan langsung tersimpan otomatis.
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>AI Smart Upload (dari Dashboard)</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Tersedia di Dashboard untuk file APA PUN (tidak harus PO) — pengguna unggah satu file dari mana saja, AI mengklasifikasikan file itu milik proyek yang mana, masuk ke folder mana (dipilih dari 19 folder baku struktur project), dan mengusulkan nama file standar dengan format &quot;TANGGAL - Jenis Dokumen - Deskripsi Singkat&quot;. Ini menghilangkan kebutuhan mencari-cari folder yang benar secara manual, sekaligus menjaga penamaan file tetap konsisten di seluruh sistem.
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Ekstraksi Progress Report</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Foto/dokumen laporan progres lapangan yang diunggah ke tab &quot;Progress Report&quot; pada Project dibaca AI untuk menyusun draf checklist item pekerjaan (nama bagian, status selesai/belum, catatan) — tetap bisa dicentang/diedit manual setelah tersimpan sebagai laporan progres proyek.
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Model AI yang Dipakai</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Model default: <span className="font-mono text-xs">claude-haiku-4-5</span> — dipilih karena cukup akurat untuk ekstraksi data terstruktur dari dokumen, namun jauh lebih cepat dan murah dibanding model yang lebih besar. Penting karena setiap unggahan dokumen memanggil API ini. Bisa diganti lewat environment variable <code className="rounded bg-muted px-1">ANTHROPIC_EXTRACTION_MODEL</code> tanpa mengubah kode.
            </CardContent>
          </Card>
        </div>
      )}

      {active === "notifikasi" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Alur Notifikasi</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <FlowRow steps={["Aksi: Submit / Approve / Reject / Billing Due Soon", "Notifikasi in-app (selalu)", "Email (kalau dikonfigurasi)", "WhatsApp (kalau dikonfigurasi)"]} />
              <p className="text-sm text-muted-foreground pt-2">Notifikasi in-app selalu jalan (tidak butuh setting apa pun) dan muncul lewat ikon lonceng di topbar dengan badge jumlah belum dibaca. Email &amp; WhatsApp baru terkirim setelah tiga variable di bawah ini diisi dan project di-redeploy.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Jenis Notifikasi</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="pb-2 pr-4">Kejadian</th><th className="pb-2">Penerima</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    <tr><td className="py-1.5 pr-4">Quotation / Vendor PO / Expense / Invoice diajukan</td><td className="py-1.5">Admin (approver)</td></tr>
                    <tr><td className="py-1.5 pr-4">Approve / Reject</td><td className="py-1.5">Pengaju (maker)</td></tr>
                    <tr><td className="py-1.5 pr-4">Invoice mendekati/lewat jatuh tempo</td><td className="py-1.5">Role Finance</td></tr>
                    <tr><td className="py-1.5 pr-4">Billing Due Soon — sisa penagihan proyek mendekati tanggal target</td><td className="py-1.5">Role Finance</td></tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cara Mengaktifkan Email &amp; WhatsApp</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Isi 3 variable ini di Vercel → Settings → Environment Variables (Production), lalu redeploy:</p>
              <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs space-y-1">
                <div>SMTP_APP_PASSWORD=&lt;App Password Gmail&gt;</div>
                <div>FONNTE_TOKEN=&lt;token device Fonnte&gt;</div>
                <div>NOTIFICATIONS_OUTBOUND_ENABLED=true</div>
              </div>
              <p className="text-muted-foreground">App Password Gmail: myaccount.google.com/apppasswords (perlu 2-Step Verification aktif dulu). Token Fonnte: daftar di fonnte.com → Connect Device → scan QR dari WhatsApp yang mau dipakai → salin token di menu Device.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Checklist Kalau Notifikasi Tidak Masuk</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>1. Cek user penerima sudah mengisi nomor WhatsApp di Settings → Users → Edit User.</div>
              <div>2. Cek ketiga env variable di atas sudah diisi persis (huruf kecil semua untuk <span className="font-mono">true</span>), dan tercentang untuk <span className="font-medium">Production</span> — bukan cuma Preview.</div>
              <div>3. Sudah redeploy <span className="text-muted-foreground">(env variable baru tidak otomatis kepakai di deployment lama)</span>.</div>
              <div>4. Buka Vercel → Logs, filter kata &quot;notifications&quot; sekitar waktu aksi dilakukan — <span className="font-mono">SKIPPED</span> berarti env belum kebaca, <span className="font-mono">FAILED</span> berarti token/koneksi ke provider bermasalah.</div>
              <div>5. Pastikan yang dibuka adalah domain production utama (<span className="font-mono">*.vercel.app</span> yang statusnya &quot;Production&quot; di Settings → Domains), bukan link preview per-deployment yang berbeda-beda.</div>
            </CardContent>
          </Card>
        </div>
      )}

      {active === "developer" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Tech Stack</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Next.js 14 (App Router) + TypeScript · Prisma ORM + PostgreSQL (Neon) · Cloudflare R2 (file storage) · Vercel (hosting) · @react-pdf/renderer (PDF) · exceljs (Excel) · nodemailer (email) · Fonnte (WhatsApp) · Anthropic Claude API (ekstraksi &amp; klasifikasi dokumen).
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Struktur Kode</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div><code className="rounded bg-muted px-1">prisma/schema.prisma</code> — sumber kebenaran struktur data. Ubah di sini dulu, baru <span className="font-mono">prisma generate</span> + <span className="font-mono">prisma db push</span>.</div>
              <div><code className="rounded bg-muted px-1">src/lib/workflows/*</code> — logika bisnis inti (create/submit/approve/reject tiap modul, termasuk cascade tanggal PO → Milestone). Semua transaksi database dan aturan status hidup di sini, bukan di komponen UI.</div>
              <div><code className="rounded bg-muted px-1">src/lib/permissions.ts</code> — satu-satunya tempat aturan &quot;siapa boleh apa&quot;, termasuk guard anti self-approval.</div>
              <div><code className="rounded bg-muted px-1">src/lib/notifications/*</code> — pengiriman email/WhatsApp yang sesungguhnya (dipanggil setelah transaksi database selesai, tidak pernah di dalamnya).</div>
              <div><code className="rounded bg-muted px-1">src/lib/ai/*</code> — client Anthropic bersama, ekstraksi dokumen (PO, Progress Report), dan klasifikasi dokumen untuk AI Smart Upload.</div>
              <div><code className="rounded bg-muted px-1">src/lib/pdf/*</code> — satu komponen React per jenis dokumen cetak (Quotation, Invoice, Vendor PO, Costing, Progress Report).</div>
              <div><code className="rounded bg-muted px-1">src/server/*</code> — server actions: validasi input, cek permission, panggil workflow, lalu <span className="font-mono">revalidatePath</span>.</div>
              <div><code className="rounded bg-muted px-1">src/components/*</code> — UI. Komponen client (&quot;use client&quot;) untuk yang interaktif, server component untuk halaman.</div>
              <div><code className="rounded bg-muted px-1">prisma/*.ts</code> (di luar schema) — script maintenance satu-kali/berkala: sync nomor, backfill milestone dari PO, bersihkan folder lama, dsb. Semua aman dijalankan berkali-kali (idempotent) kecuali yang minta konfirmasi ketik &quot;DELETE&quot;.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Aturan yang Wajib Dipegang Saat Menambah Fitur Baru</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="font-medium">Jangan panggil API eksternal (email/WA/AI/HTTP lain) di dalam <span className="font-mono">prisma.$transaction()</span>.</span> Kumpulkan dulu apa yang perlu dikirim, kirim setelah transaksi commit. Ini pernah jadi penyebab error &quot;Transaction already closed&quot; di production.</div>
              <div><span className="font-medium">Batasi jumlah query berurutan dalam satu transaksi</span> (idealnya di bawah ~20). Kalau perlu bikin banyak baris sekaligus (misal folder tree), pakai <span className="font-mono">createMany()</span> dengan id yang di-generate di sisi aplikasi (<span className="font-mono">crypto.randomUUID()</span>), bukan loop <span className="font-mono">create()</span> satu-satu.</div>
              <div><span className="font-medium">Alur approval baru harus ikut pola yang sama</span> seperti Quotation/Vendor PO/Expense/Invoice: field <span className="font-mono">submittedAt/By, approvedAt/By, rejectedAt/By, rejectionReason, isLocked</span>, dan guard anti self-approval di <span className="font-mono">permissions.ts</span>.</div>
              <div><span className="font-medium">Nomor dokumen baru selalu lewat <span className="font-mono">generateNumber(tx, entityType)</span></span>, jangan pernah di-hardcode atau di-generate manual — kecuali dokumen tersebut memang milik pihak luar (seperti PO customer), yang nomornya harus diisi apa adanya, bukan dibuatkan sistem.</div>
              <div><span className="font-medium">Angka yang bisa dihitung dari data lain</span> (total, persentase, status turunan) sebaiknya dihitung saat dibaca (lihat pola Kurva-S dan Sisa Penagihan), bukan disimpan sebagai kolom terpisah yang harus disinkronkan manual — mencegah dua tempat menampilkan angka yang berbeda.</div>
              <div><span className="font-medium">Fitur AI baru mengikuti pola &quot;draf lalu konfirmasi&quot;</span> — AI menyiapkan data, manusia memeriksa di form sebelum tersimpan. Jangan biarkan AI menulis langsung ke database.</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Checklist Deploy</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs space-y-1">
                <div>npm install</div>
                <div>npx prisma generate</div>
                <div>npx prisma db push</div>
                <div>npm run typecheck</div>
                <div>git add -A &amp;&amp; git commit -m &quot;...&quot; &amp;&amp; git push</div>
              </div>
              <p className="mt-2 text-muted-foreground">Setelah push, cek di Vercel → Deployments bahwa deployment terbaru statusnya &quot;Ready&quot;, lalu cek Settings → Domains bahwa domain production sudah otomatis mengarah ke deployment tersebut.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {active === "roadmap" && (
        <Card>
          <CardHeader><CardTitle>Status Pengembangan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { label: "Vendor PO, Costing, Quotation — CRUD dasar + PDF", done: true },
              { label: "Dokumen tab di Project (relasi PO customer ↔ Vendor PO)", done: true },
              { label: "Perbaikan transaksi Won agar tidak timeout", done: true },
              { label: "Sinkronisasi nomor dokumen ke data riil", done: true },
              { label: "Revisi Costing tetap bisa dibuka setelah Quotation approved/sent", done: true },
              { label: "PIC Quotation otomatis ikut dari Opportunity", done: true },
              { label: "Branding SSO Connect + PWA (install ke HP)", done: true },
              { label: "Maker-checker: Vendor PO, Project Expense, Invoice", done: true },
              { label: "Notifikasi Email (Gmail) + WhatsApp (Fonnte)", done: true },
              { label: "Field WhatsApp di profil user", done: true },
              { label: "Role IT + alur Koreksi Dokumen/Nomor", done: true },
              { label: "Nomor PO customer memakai nomor asli (bukan auto-generate)", done: true },
              { label: "Kredit pajak PPh23 pada Invoice", done: true },
              { label: "Ekstraksi AI untuk upload PO customer (draf, bukan auto-save)", done: true },
              { label: "AI Smart Upload — klasifikasi file & folder otomatis dari Dashboard", done: true },
              { label: "Ekstraksi AI untuk Progress Report + checklist item", done: true },
              { label: "Kurva-S (S-Curve) dihitung dari Milestone & Invoice", done: true },
              { label: "Milestone manual (edit/hapus) + hapus template placeholder otomatis", done: true },
              { label: "Kaitan Milestone ↔ Purchase Order dengan cascade tanggal otomatis", done: true },
              { label: "Sisa Penagihan (Billing Schedule) di 5 halaman + notifikasi + action item", done: true },
              { label: "Restrukturisasi Dokumen: hapus Company Documents, pindah Dokumen Proyek & Sampah", done: true },
              { label: "Action Items lintas modul (to-do otomatis per role)", done: true },
              { label: "Modul panduan operasional & developer (halaman ini)", done: true },
              { label: "Perbaikan layout tanda tangan/alamat/logo di PDF cetak", done: false },
              { label: "Tanggal retention proyek dengan beberapa PO — masih estimasi placeholder, perlu konfirmasi termin asli", done: false },
              { label: "Role Direktur terpisah dari Admin operasional", done: false },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5">
                <span>{item.label}</span>
                <Badge variant={item.done ? "success" : "secondary"}>{item.done ? "Selesai" : "Belum"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
