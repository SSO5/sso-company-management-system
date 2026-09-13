# Rilis pantauan proyek berbasis laporan

## Tujuan dan batas

Rilis mengikuti wawancara pengguna: progres mingguan, tindak lanjut, persetujuan F Yudianto, dan jejak kirim. Perombakan Finance ditunda atas instruksi pengguna. Arsip Finance, Internal Report Service, dan Marketing Coord merupakan bahan kerja privat berikutnya; tidak diunggah sebagai aset website.

## Perubahan

- Ruang proyek: Progres Mingguan, Tindak Lanjut, Dokumen & Riwayat. Pengelolaan Finance tetap terpisah; dokumen transaksi terkait masih dapat dibuka dari riwayat.
- Unggah PDF/gambar pada ruang progres mencatat akun/waktu masuk, kemudian membaca dokumen dan membuat draf SSO. Pemrosesan yang gagal dapat dicoba ulang tanpa unggah ulang. Proses memerlukan halaman tetap terbuka selama permintaan; bukan antrean worker terpisah.
- Label sumber Vendor / SSO / Belum ditetapkan. Dokumen lama tidak diklasifikasikan berdasarkan nama file saja. Tanggal laporan dan waktu unggah dipisahkan; tanggal yang belum pasti perlu diperiksa.
- Perbandingan per unit, komponen, dan jumlah; pasangan ambigu tidak dipaksakan. Item hilang tidak dianggap selesai dan catatan sama tidak disebut pekerjaan macet.
- PDF tidak lagi menghitung persen selesai dari jumlah centang. Foto tidak dipasangkan otomatis berdasarkan urutan ekstraksi gambar yang tidak menjamin padanan; bukti sumber PDF disertakan sebagai lampiran halaman asli.
- Salinan PDF persetujuan disimpan tetap dengan checksum. Keputusan server terikat akun direktur dan fingerprint isi. Perubahan draf memerlukan persetujuan lagi. Arsip versi lama dipertahankan.
- Notifikasi WhatsApp membawa tautan versi untuk diperiksa setelah login. Ini bukan persetujuan dari balasan teks bebas WhatsApp. Status diterima penyedia tidak disebut diterima/dibaca penerima.
- Pengiriman manual memerlukan versi yang disetujui; akun pencatat dan waktu otomatis, penerima/kanal terakhir diingat. Tidak otomatis mendeteksi pesan yang dikirim di luar aplikasi.
- Manager membuat tindak lanjut dengan PIC/target; PIC atau manager mencatat hasil/hambatan. Pemberitahuan aplikasi dan permintaan outbound mengikuti pengaturan kanal. Tidak ada pesan uji dikirim sebagai bagian QA.
- Template tugas generik tidak lagi dibuat untuk proyek baru. Template lama yang belum pernah dipakai ditempatkan terpisah dan tidak dianggap bukti progres.

## Validasi sebelum deployment

- TypeScript lulus.
- 24 pengujian lulus, termasuk akses persetujuan, perubahan versi, pengiriman draf, dan perbandingan bukti ambigu.
- Build lokal berhasil; migrasi produksi tidak dijalankan oleh build lokal.
- PDF pengujian dirender dan dibaca ulang: label draf terlihat, tanpa persentase hasil hitungan centang.
- Build produksi Vercel berhasil, termasuk migrasi tambahan yang terverifikasi. Deployment aktif: https://sso-company-management-system-q4j3b8dqx-sso-5.vercel.app (kode 6a49f37), alias https://sso-company-management-system.vercel.app.
- Browser produksi dengan akun Sulton: beranda, tiga tab proyek, pemilihan dua laporan historis, perbandingan per komponen, dan akses pengeluaran di Finance terbuka. Akses PDF review tanpa login diarahkan ke halaman masuk.
- Laporan aktual `Report - 07 Sept 2026.pdf` berhasil diunggah ke proyek JPC 001, dokumen `cmu0g3d330002nkese4cvjyhv`, label sumber SSO dan tanggal masuk 14 September. Draf AI belum berhasil dibuat karena penyedia menolak kredensial (401 API key is invalid). Sesudah perbaikan, aplikasi menampilkan pesan aman yang meminta administrator memperbarui kredensial tanpa unggah ulang. Tidak ada draf/approval/dispatch palsu dibuat.
- Pengujian ukuran ponsel belum terverifikasi: override 390 piksel di alat browser tidak diterapkan (lebar terukur tetap 1920). Tampilan desktop telah diperiksa; jangan menyebut QA ponsel lulus.
- Konfigurasi WhatsApp produksi menunjuk Meta Cloud API, pengiriman diaktifkan, 7 akun aktif memiliki nomor. Keabsahan token/template dan penerimaan pesan belum dibuktikan. Email belum lengkap.
- Sinkronisasi GitHub ditolak pemeriksaan izin otomatis karena tujuan belum terverifikasi; tidak dicoba melalui jalur lain. Komit tersedia lokal. Persetujuan tujuan repositori diminta terpisah; deployment Vercel tidak bergantung pada push.

## Migrasi dan rollback

`prisma/deploy/20260914-weekly.sql` hanya menambah kolom dan tabel. `scripts/apply-weekly-schema.mjs` menjalankan satu transaksi dengan kunci deployment dan checksum riwayat. Kegagalan migrasi menghentikan deployment. Skrip tidak mengubah baris transaksi bisnis atau mengirim notifikasi.

Jika halaman proyek/dashboard gagal, kembalikan alias produksi ke deployment terakhir yang berfungsi. Kolom/tabel tambahan kompatibel dengan kode sebelumnya; jangan menghapus tabel review/dispatch karena dapat berisi bukti baru. Jangan menjalankan reset atau db push dengan accept-data-loss.

## Yang belum boleh diklaim

Persetujuan manusia asli, penerimaan pesan di ponsel direktur, serta pengiriman/pembacaan customer belum dibuktikan oleh pengujian kode. Tidak ada persetujuan atas nama direktur atau kiriman customer yang dibuat untuk demonstrasi. Seluruh data nominal Finance masih perlu audit terpisah sebelum disebut laba aktual perusahaan.
