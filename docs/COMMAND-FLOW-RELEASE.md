# SSO Command Flow — 14 September 2026

## Perubahan

- Login dua panel, formulir ponsel ringkas, navigasi berlabel, transisi ruang kerja dengan reduced motion.
- Beranda berisi prioritas, ruang kerja, progres proyek, dan ringkasan penagihan. Profil besar, sapaan maskot, pemilih suasana di header, dan KPI berulang dikeluarkan dari alur utama.
- Tindak Lanjut memiliki filter urgensi. Notifikasi memiliki halaman tersendiri.
- Ruang Proyek memakai kartu, pencarian, dan filter aktif/riwayat. Tautan tab, reload, dan tombol kembali mempertahankan bagian yang dituju.
- Data & Dokumen membedakan file dan catatan transaksi, menampilkan folder/PIC/tanggal, menyediakan pencarian dan pagination. Kemiripan nama+ukuran+folder hanya kandidat, bukan bukti duplikasi.
- Laporan lapangan menampilkan tanggal terbaru; semua riwayat dapat dibuka. Antrean otomatis memakai laporan terbaru per proyek, tidak menjumlahkan semua checkpoint historis.
- Invoice draf/pengajuan tidak dihitung sebagai penagihan di dashboard, jadwal penagihan, kurva, detail proyek, dan timeline. Nilai kontrak minus biaya tercatat diberi label sementara, bukan laba final.
- Membaca dashboard/proyek/jadwal tidak menjalankan pengiriman notifikasi. Cron tetap memeriksa bearer secret pada handler, dan kegagalan job menghasilkan respons gagal agar scheduler mendeteksinya.
- Akun aktif dan peran diperiksa dari database; helper yang menerima actor tidak diekspor sebagai Server Action.
- Batas smart upload 4 MB diperiksa sebelum membaca buffer, nama sumber dicatat, hasil AI tetap ditinjau pengguna. Membuat ulang checklist meminta konfirmasi karena mengganti isinya.
- Next.js dan eslint-config-next diperbarui ke 14.2.35; ditambahkan tes aturan bisnis dan gate build.

## Data perusahaan

Tidak ada migrasi schema, penghapusan data produksi, perubahan angka tersimpan, atau penentuan ulang status transaksi dalam rilis ini. File asli dan laporan historis dipertahankan. Metode asal data lama tidak selalu tersedia; aplikasi menyatakan batas ini dan tidak mengarang asal manual/impor.

### Cara kerja yang dianjurkan

1. Buka prospek/proyek yang benar sebelum membuat transaksi.
2. Unggah file yang dibuat di luar aplikasi melalui Data & Dokumen atau folder ruang terkait; periksa tujuan hasil AI.
3. Transaksi yang dibuat di aplikasi mengikuti alur draf → tinjau → setujui → terbitkan. Keberadaan PDF tidak menggantikan persetujuan.
4. Buka Laporan Lapangan untuk bukti terbaru. Setelah meninjau, perbarui tahapan proyek; checklist dokumen tidak otomatis mengesahkan milestone.
5. Periksa kandidat duplikat sebelum melakukan koreksi. Jangan menghapus hanya karena nama serupa.

## Verifikasi dan rollback

Jalankan `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Smoke test preview: login, dashboard, semua tab proyek, Data & Dokumen, filter, notifikasi, dan tampilan 390px. Jangan membuat transaksi uji dalam database produksi.

Baseline rollback: commit `7c1556accff6d3df750954a877cfa26b2abcb201`. Karena tidak ada migrasi schema, deployment sebelumnya dapat dipulihkan tanpa mengubah data. Lakukan rollback jika login/otorisasi rusak, halaman inti gagal, atau penagihan menyimpang dari aturan invoice yang disetujui. Pemulihan ke baseline juga mengembalikan kekurangan keamanan lamanya; prioritaskan perbaikan maju bila memungkinkan.

Audit ini tidak mensertifikasi semua API atau seluruh data bisnis. Rekonsiliasi isi file, invoice ganda, validitas nilai kontrak, dan pengakuan laba membutuhkan pemeriksaan catatan bisnis oleh pemilik data. Tidak ada pesan WhatsApp/email uji dikirim oleh proses revisi.
