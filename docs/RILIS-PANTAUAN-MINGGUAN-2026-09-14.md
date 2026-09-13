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
- Pemeriksaan langsung Vercel dan browser produksi: belum selesai saat catatan ini dibuat.

## Migrasi dan rollback

`prisma/deploy/20260914-weekly.sql` hanya menambah kolom dan tabel. `scripts/apply-weekly-schema.mjs` menjalankan satu transaksi dengan kunci deployment dan checksum riwayat. Kegagalan migrasi menghentikan deployment. Skrip tidak mengubah baris transaksi bisnis atau mengirim notifikasi.

Jika halaman proyek/dashboard gagal, kembalikan alias produksi ke deployment terakhir yang berfungsi. Kolom/tabel tambahan kompatibel dengan kode sebelumnya; jangan menghapus tabel review/dispatch karena dapat berisi bukti baru. Jangan menjalankan reset atau db push dengan accept-data-loss.

## Yang belum boleh diklaim

Persetujuan manusia asli, penerimaan pesan di ponsel direktur, serta pengiriman/pembacaan customer belum dibuktikan oleh pengujian kode. Tidak ada persetujuan atas nama direktur atau kiriman customer yang dibuat untuk demonstrasi. Seluruh data nominal Finance masih perlu audit terpisah sebelum disebut laba aktual perusahaan.
