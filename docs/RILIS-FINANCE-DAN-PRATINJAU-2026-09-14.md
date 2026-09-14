# Rilis Finance dan pratinjau dokumen — 14 September 2026

## Rilis aktif

- Domain: https://sso-company-management-system.vercel.app/
- Deployment final: https://sso-company-management-system-5sw46szsc-sso-5.vercel.app
- Vercel ID: `dpl_Cy9BzJK1tTAsXwJFEn6UPawZoJws`, status READY dan promote berhasil.
- Akun deployment perusahaan memakai konfigurasi lokal `.vercel-sso-auth` (jangan unggah folder ini).
- Paket tidak menyertakan arsip WhatsApp, kredensial, dokumen privat lokal, atau prototipe.

## Perubahan yang sudah berjalan

1. Panel kanan untuk PDF, gambar, pratinjau isi XLSX/CSV/TSV, DOCX/PPTX, teks dan media umum. Transisi masuk/keluar, Escape, pengembalian fokus, serta reduced-motion tersedia. Link file dalam aplikasi dicegat agar halaman kerja tetap terbuka. Unduh file asli tetap tersedia.
2. PDF memakai tampilan asli browser. Word/PowerPoint hanya pratinjau teks; XLSX menampilkan nilai tersimpan, tidak menghitung ulang rumus. Maksimal 8 lembar, 100 baris, 30 kolom. Format lama DOC/XLS/PPT, arsip, atau dokumen terlalu besar tetap perlu diunduh. Tidak menggunakan viewer publik untuk mengirim dokumen privat.
3. Pusat Finance mempunyai Perlu tindakan, Keuangan proyek, Vendor, Perusahaan, dan Cek data. Submenu lama yang berulang dipangkas; alur invoice, penerimaan dan biaya tetap dapat dibuka dari ruang terkait.
4. Urutan rekap mengikuti workbook Dwiki: PO, termin, invoice, penerimaan, potongan dan sisa. Draf tidak dihitung sebagai tagihan terbit. PO vendor ditampilkan bersama biaya terkait agar tidak dijumlah dua kali.
5. Saldo perusahaan dicatat bertanggal dengan dokumen sumber. Saldo antar rekening hanya dijumlah jika tanggalnya sama. Ini belum rekonsiliasi bank atau neraca perusahaan lengkap.
6. Proyeksi proyek memakai penjualan neto, estimasi seluruh biaya, dan dasar perhitungan. Laporan serta jawaban AISSO tidak lagi menyebut selisih tagihan dan biaya sebagai laba aktual. Halaman laporan Finance/profitabilitas lama diarahkan ke ruang Finance yang relevan.
7. Pekerjaan Finance menyimpan PIC, prasyarat per PIC, target, status, hasil dan jejak perubahan. Status siap/selesai ditolak selama ada prasyarat belum selesai; selesai memerlukan catatan hasil.
8. Pembersihan di Data & Dokumen → Tinjau kemiripan membandingkan SHA-256 dalam kelompok folder/nama/ukuran yang sama. Hanya salinan identik tanpa keterkaitan, anotasi, atau status pemrosesan yang dapat dipindahkan ke Sampah. Sumber laporan dan bukti saldo dilindungi. Batas 20 dokumen/60 MB per permintaan; perubahan dokumen saat pemeriksaan membatalkan pembersihan.

## Bukti sumber dan temuan yang harus ditindaklanjuti

- `_chat.txt` arsip SSO Finance Acc Taxx dan workbook `Rekap Penagihan dan Margin - Sarana Sinergi Optima.xlsx` dibaca. Tiga lembar: Rekap Penagihan; ATP ke Subkon (Athena); Margin & Analisa.
- Workbook menyebut kas nol dan beberapa penagihan September. Aplikasi mempunyai tiga catatan penerimaan total Rp88.944.000 ditambah potongan Rp1.632.000. Jangan menimpa transaksi aplikasi dengan nol dari workbook; cocokkan bukti dan waktu pembaruan.
- Dua PO bernilai Rp74.342.250 memakai dokumen bernama 0646, tetapi nomor catatan berbeda: `2026/BPN-1-0646` dan `2026/BPN-J-00645`. Belum diputuskan catatan mana yang benar. Tindak lanjut nyata disimpan di Finance dengan PIC Dwiki F, proyek 004, dan dua prasyarat pemeriksaan. Tidak ada notifikasi WhatsApp/email dikirim.
- Invoice draf `003/INV/FIN/VIII/2026` belum mempunyai kecocokan PO. Ditampilkan sebagai pekerjaan yang harus dilengkapi, bukan piutang.
- Ada beberapa laporan dari file bernama sama tetapi jumlah checklist berbeda. Semua sumber dan versi dipertahankan.
- Pembersihan dua kelompok PO 0450 dan 0505 dijalankan; masing-masing mengembalikan 0 file terhapus. Tidak ada penghapusan permanen atau penggabungan transaksi.
- Dua ZIP tambahan Internal Report Service dan Marketing Coord baru terinventarisasi sebelumnya; rilis ini tidak mengklaim telah mengaudit seluruh isinya.

## Validasi dan batasnya

- 31 pengujian lokal lulus; TypeScript dan build Vercel lulus.
- Migrasi tambahan tiga tabel Finance terverifikasi pada build Vercel, tanpa mengubah nilai transaksi lama. Migrasi lama tetap memakai checksum yang sama.
- Invoice PDF benar-benar terlihat pada screenshot panel kanan dan URL halaman tidak berubah. Pemilihan laporan 020/ENG membuka panel berjudul benar dan iframe PDF.
- Workbook Dwiki diuji langsung: 34×13, 13×12, dan 15×6 sel berhasil dipratinjau. Uji ini menemukan dan memperbaiki kegagalan sel gabungan kosong, dengan pengujian regresi.
- Finance memuat data asli; pekerjaan baru berhasil disimpan dan muncul setelah pembaruan halaman.
- Pada lebar efektif CSS 390 px, panel dan Finance memiliki lebar dokumen 390 px tanpa overflow horizontal. Screenshot ponsel melalui alat browser mengalami timeout; bukan pengujian perangkat fisik. Override viewport telah di-reset.
- Pemeriksaan browser mengalami gangguan DNS sementara lalu pulih. Respons HTTPS login juga diverifikasi 200.
- Peringatan build untuk gambar blob memakai elemen img bersifat non-blocking; tidak memakai pengoptimal gambar jarak jauh untuk file privat.

## Pekerjaan yang belum dapat dinyatakan tuntas

- Kredensial AI produksi sebelumnya gagal 401. Pembuatan draf/analisis otomatis tetap memerlukan pembaruan kredensial yang valid; tidak diperbaiki dengan perubahan tampilan ini.
- Persetujuan WhatsApp dan pengiriman ke customer belum diuji end-to-end memakai pesan sungguhan. Jangan menyatakan notifikasi sudah diterima perangkat.
- Belum ada jurnal berpasangan lengkap, rekonsiliasi bank menyeluruh, atau riwayat cicilan vendor. Karena itu tidak ada klaim laba aktual perusahaan.
- Angka laporan eksternal belum diimpor menjadi transaksi tanpa pencocokan bukti. Saldo rekening dan proyeksi baru tidak diisi dengan angka asumsi.
- Push GitHub tidak dilakukan: auto-review sebelumnya menolak karena tujuan repository belum terverifikasi. Rilis Vercel dilakukan langsung sesuai izin pengguna.

## Pemulihan

Jika alur utama gagal, promote kembali deployment sebelumnya `sso-company-management-system-q4j3b8dqx-sso-5.vercel.app`. Tabel Finance bersifat tambahan; jangan menjatuhkan tabel atau menghapus catatan baru saat rollback. Dokumen yang dipindahkan ke Sampah dapat dipulihkan lewat menu Pengaturan.
