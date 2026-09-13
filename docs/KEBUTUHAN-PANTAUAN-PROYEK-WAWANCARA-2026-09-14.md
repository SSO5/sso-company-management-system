# Hasil wawancara alur pemantauan proyek SSO

Dikonfirmasi pengguna melalui percakapan suara, 14 September 2026. Dokumen kebutuhan, belum implementasi atau perubahan izin produksi.

## Kebutuhan utama

Pengguna ingin membandingkan laporan minggu sebelumnya dengan laporan paling baru: perubahan pekerjaan, kemajuan, hal yang tertahan, dan tindak lanjut. Pusat pantauan harus bertumpu pada laporan aktual vendor, bukan tugas administrasi generik atau persentase termin pembayaran.

## Alur nyata

1. SSO menerima PO customer dan mengirim konfirmasi PO.
2. SSO menyiapkan PO kepada vendor.
3. Finance mengelola invoice ke customer dan pembayaran ke vendor; kedua sisi harus memiliki status terpisah.
4. Setelah pembayaran ke vendor, vendor mulai bekerja menurut penjelasan pengguna. Jangan mengubah semua kontrak menjadi aturan pembayaran tunggal tanpa membaca term masing-masing.
5. Vendor mengirim laporan progres mingguan dalam format mereka.
6. Tim membaca sepintas lalu memakai aplikasi/AI untuk merapikan laporan menjadi format resmi SSO, dengan logo, nomor laporan, tanggal, dan isi serta bukti yang setia kepada sumber.
7. Laporan SSO harus mendapat persetujuan Bapak F Yudianto sebelum dikirim ke customer.
8. Pengiriman saat ini dilakukan melalui email atau WhatsApp, dan hanya diketahui pengirim. Ini akar kebingungan tim yang perlu diatasi dengan riwayat bersama.

## Identitas dan kewenangan

- Pemberi persetujuan: **F Yudianto**, akun aktif dengan jabatan **President Director** dan peran ADMIN. Nama dan jabatan telah dicocokkan dengan halaman Users dan dikonfirmasi pengguna.
- Sebutan Valdi pada transkrip sebelumnya dikoreksi; jangan membuat akun atau memilih akun berdasarkan transkrip itu.
- Ada akun lain dengan ejaan F Yudiyanto yang tidak aktif; jangan tertukar. Jangan mengaktifkan akun tersebut atau mengubah izin global.
- Penunjukan PIC dilakukan manager. Persetujuan yang dimaksud pengguna berlaku untuk laporan sebelum dikirim, bukan penunjukan PIC.
- Saat ini pengelola laporan biasanya disebut Joanna oleh pengguna; daftar akun memuat Yohana C S Munthe, tetapi pemetaan kedua sebutan belum dikonfirmasi. Jangan menetapkan pemilik otomatis berdasarkan kemiripan nama.
- Ke depan PIC laporan dapat bergantian antaranggota tim.

## Jadwal dan notifikasi

- Umumnya Senin untuk penerimaan laporan vendor dan pengiriman laporan SSO ke customer.
- Dapat bergeser ke Selasa atau hari lain. Perlu target per siklus yang bisa diubah dengan riwayat.
- Anggota jarang membuka aplikasi. Penugasan kepada seseorang perlu notifikasi WhatsApp yang mengarah ke pekerjaan terkait.
- Kode createTask saat pemeriksaan belum memicu outbound WhatsApp. Ketersediaan nomor akun dan konfigurasi Cloud API tidak membuktikan kepemilikan nomor, persetujuan penerima, atau keberhasilan pengiriman.
- Belum ada izin spesifik pada wawancara ini untuk mengirim pesan uji ke anggota atau customer. Jangan melakukan pengiriman tersebut sebagai bagian dari demonstrasi.

## Implikasi rancangan

- Halaman utama Progres Mingguan: laporan sebelumnya vs terbaru, perubahan per unit/pekerjaan, sumber bukti, kendala, tindak lanjut, PIC dan target.
- Siklus laporan: menunggu vendor -> draf SSO -> menunggu persetujuan -> disetujui/siap dikirim -> pengiriman tercatat. Pengembalian untuk revisi harus terlihat.
- Pisahkan penerimaan laporan, pengerjaan fisik, persetujuan dan pengiriman. Dokumen dibuat/diunduh bukan bukti terkirim. Pengiriman dicatat manual harus diberi sumber pencatatan manual; tidak disebut delivered oleh penyedia.
- Persetujuan terikat revisi/versi. Perubahan isi setelah persetujuan perlu pemeriksaan ulang. Ini usulan kontrol implementasi untuk memenuhi aturan persetujuan pengguna.
- Perbandingan hanya untuk unit/lingkup yang cocok. Item hilang dari laporan baru bukan otomatis selesai; laporan kosong bukan progres nol; tidak ada perubahan teks belum tentu pekerjaan macet. Tampilkan perlu klarifikasi jika bukti tidak cukup.
- Tindak lanjut berasal dari temuan nyata, ditetapkan manager, bukan dibuat otomatis sebagai pekerjaan sah oleh AI.
- Pertahankan foto, file vendor, laporan SSO, dan riwayat revisi; jangan menimpa bukti lama saat membuat ulang laporan.

## Tahap selanjutnya

Buat prototipe reviewable berdasarkan data contoh yang jelas labelnya. Gunakan struktur ini untuk menguji apakah pengguna dapat melihat perbedaan mingguan dan tindak lanjut tanpa berpindah tab berkali-kali. Implementasi perlu pemetaan sumber laporan, revisi/persetujuan, catatan kirim, PIC siklus, serta notifikasi yang dapat ditelusuri; jangan memakai status atau catatan bebas sebagai pengganti kontrol persetujuan server.

## Koreksi batas ruang kerja dari pengguna

Finance tetap ruang kerja terpisah untuk invoice, penagihan, dan pembayaran customer/vendor. Transaksi terhubung dengan proyek yang sama, tetapi tidak menjadi tab Keuangan di ruang pemantauan proyek. Prototipe ruang proyek hanya memuat Progres Mingguan, Tindak Lanjut, serta Dokumen & Riwayat.

## Otomatisasi setelah unggah yang dikonfirmasi pengguna

- PIC cukup mengunggah laporan vendor pada proyek terkait. Aplikasi mencatat waktu penerimaan dan akun pengunggah dari server; akun pengunggah tidak otomatis menggantikan PIC yang telah ditetapkan manager.
- Tanggal laporan/periode diekstrak dari isi dokumen, terpisah dari waktu unggah. Jika tidak terbaca atau bertentangan, minta koreksi hanya untuk bagian tersebut, bukan mengganti diam-diam dengan tanggal unggah.
- Unggahan vendor memulai pembuatan draf SSO dan analisis perubahan terhadap laporan sebelumnya yang cocok proyek, unit, dan periodenya. Jika pembanding ambigu, minta pilihan; jika belum ada, gunakan laporan pertama sebagai titik awal dan jangan mengarang perubahan.
- Dokumen yang sudah berformat SSO tetap diberi label SSO dan tidak diperlakukan sebagai dokumen vendor. File asli dipertahankan. Pekerjaan otomatis perlu status memproses, selesai, atau gagal yang bisa dicoba ulang tanpa menggandakan laporan.
- Logo, nomor laporan, tanggal, tata letak, serta ringkasan perubahan disiapkan otomatis. Fakta, foto, dan status pekerjaan mengikuti sumber; ketidakpastian ditandai. Hasil tetap draf sampai disetujui.
- Riwayat mencatat sejak penerimaan, pembuatan draf, revisi, permintaan persetujuan, keputusan direktur, hingga pengiriman. Persetujuan hanya berlaku pada versi tetap yang diperiksa.
- Pengguna meminta persetujuan direktur melalui WhatsApp. Rancangan awal: notifikasi WhatsApp membawa tautan langsung ke versi laporan; keputusan Setujui/Minta revisi dilakukan setelah identitas F Yudianto diverifikasi di aplikasi. Jangan menganggap balasan bebas atau pemilik tautan sebagai persetujuan sah. Persetujuan langsung dengan tombol di dalam WhatsApp memerlukan integrasi dan verifikasi identitas tersendiri; belum diimplementasikan atau diuji.
- Minimalkan pengisian pengiriman: akun pencatat dan waktu pencatatan otomatis, penerima/kanal dari pengaturan proyek jika tersedia. Pengiriman di luar aplikasi tidak bisa dideteksi otomatis; tombol Tandai terkirim merupakan konfirmasi manual, dengan opsi koreksi waktu kirim sebenarnya. Membuka WhatsApp atau mengunduh PDF bukan bukti pengiriman.
- Pengiriman melalui integrasi aplikasi harus memisahkan antre, diterima penyedia, terkirim, dan gagal berdasarkan bukti penyedia. Persetujuan laporan tidak dengan sendirinya mengirim pesan ke customer; aksi pengiriman dan penerimanya tetap jelas.

Catatan ini memperbarui kebutuhan implementasi; tidak menyatakan otomatisasi, persetujuan WhatsApp, atau pengiriman sudah berjalan di produksi.

## Beranda perusahaan dan kondisi keuangan

Pengguna meminta beranda menjawab progres pekerjaan tiap PO/kontrak sekaligus kondisi keuangan SSO secara keseluruhan. Detail transaksi tetap di Finance; ringkasan proyek cukup memberi jalan menuju rincian bila diperlukan.

- Ringkasan operasional: posisi pekerjaan terakhir dengan tanggal dan sumber, perubahan dari laporan sebelumnya, hambatan terkonfirmasi, tindak lanjut, dan laporan menunggu persetujuan/pengiriman.
- Ringkasan keuangan bagi pengguna berwenang: saldo kas/bank yang telah dicocokkan dengan rekening, penerimaan/pengeluaran periode terpilih, piutang customer, kewajiban vendor dan biaya perusahaan, serta pembayaran jatuh tempo terdekat.
- Pisahkan margin rencana dari costing, perkiraan hasil akhir proyek yang memperhitungkan sisa biaya, dan hasil aktual yang sudah diverifikasi Finance. Data biaya belum lengkap harus terlihat sebagai belum dapat dipastikan, bukan otomatis profit.
- Tampilan perusahaan harus mencakup biaya di luar proyek. Selisih nilai kontrak dan biaya tercatat bukan laba bersih perusahaan, dan selisih penerimaan/pengeluaran bukan saldo rekening tanpa saldo awal dan pencocokan transaksi.
- Pemeriksaan kode src/server/reports/reports.ts menemukan getProfitabilityReport memakai biaya costing jika tersedia dan biaya proyek tercatat sebagai cadangan; hasilnya belum konsisten sebagai ukuran laba aktual. getFinanceReport menghitung grossProfit dari total tagihan dikurangi ProjectExpense, sehingga belum cukup untuk menyatakan kondisi keuangan aktual menyeluruh.
- Riwayat progres dapat dibagikan kepada anggota yang memiliki akses proyek; akses ringkasan nominal keuangan tetap mengikuti kewenangan, tidak otomatis dibuka untuk semua akun.
- Hal yang perlu dipastikan dari Finance: sumber saldo dan transaksi yang dijadikan acuan saat ini (rekening bank, Excel, aplikasi akuntansi, atau pencatatan di SSO Connect), cakupan biaya umum, dan batas waktu pembaruan terakhir.
