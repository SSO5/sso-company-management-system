# Audit ruang proyek dan arah perombakan — 14 September 2026

Status: diagnosis kode dan rancangan awal. Menunggu jawaban wawancara operasional sebelum menetapkan model progres dan membuat prototipe alur final. Belum ada perubahan aplikasi produksi dalam audit ini.

## Kesimpulan

Tab Tugas yang sekarang dapat menyimpan daftar pekerjaan, tetapi belum memadai sebagai alat pemantauan proyek. Aplikasi mengharuskan pengguna menyimpulkan kondisi proyek dari beberapa tempat. Perubahan label sebelumnya belum memperbaiki pemisahan sumber progres dan relevansi pekerjaan yang dibuat otomatis.

## Temuan berdasarkan kode dan gambar pengguna

| Prioritas | Temuan | Dampak operasional | Sumber |
|---|---|---|---|
| Utama | Empat tugas generik otomatis dibuat setiap konversi penawaran, tanpa PIC atau tanggal | Daftar tampil seolah rencana kerja, tetapi belum dapat ditindaklanjuti | src/lib/workflows/project.ts: DEFAULT_TASK_TEMPLATE dan convertQuotationToProject |
| Utama | Sistem membuat folder lalu membuat tugas menyiapkan folder | Pengguna diminta melakukan/menutup pekerjaan administrasi yang sistem sudah kerjakan | src/lib/workflows/project.ts |
| Utama | Task tidak memiliki hubungan ke milestone, unit peralatan, atau item laporan | Update tugas tidak menjelaskan pengaruhnya terhadap progres dan barang yang dikerjakan | prisma/schema.prisma: ProjectTask |
| Utama | Kurva aktual menjumlah bobot milestone yang memiliki completedAt. Script pengisian lama memasukkan bobot termin DP/pengiriman/retensi | Progres komersial berpotensi dibaca sebagai progres fisik. DP 20% bukan bukti 20% pekerjaan selesai | src/lib/workflows/calculations.ts; prisma/backfill-milestones.ts. Script tidak dijalankan pada audit ini; kesimpulan bukan klaim semua baris produksi berasal dari script |
| Utama | Tugas, milestone, dan checklist laporan merupakan sumber terpisah; hubungan persetujuan/update belum terpadu | Pengguna harus memperbarui informasi berulang dan memahami angka yang berbeda | prisma/schema.prisma; src/server/projects/projects.ts |
| Tinggi | Panel hanya menyediakan tambah tugas dan dropdown status; keterangan tidak ditampilkan, tidak ada edit PIC/target pada tugas tersimpan | Tugas default yang belum ditugaskan sulit ditertibkan dari layar ini | src/components/projects/task-panel.tsx |
| Tinggi | Status BLOCKED tidak meminta sebab, pihak yang ditunggu, atau tindak lanjut | Mengetahui tugas tertahan belum membantu menyelesaikannya | src/server/projects/tasks.ts: updateTaskStatus |
| Tinggi | Data diurutkan berdasarkan waktu dibuat, bukan kendala/target; tidak menampilkan kapan terakhir ada pembaruan | Tugas mendesak dan informasi basi tidak langsung terlihat | src/server/projects/projects.ts: tasks.orderBy; task-panel.tsx |
| Tinggi | Semua tugas terbuka ikut menghalangi penutupan proyek | Tugas generik yang tidak relevan dapat menjadi hambatan administratif | src/lib/workflows/project.ts: validateProjectClosing |
| Tinggi | Ringkasan proyek berisi delapan indikator uang, sedangkan pekerjaan ada di tab lain | Halaman awal belum menjawab keadaan pelaksanaan dan keputusan yang diperlukan | src/components/projects/project-detail-tabs.tsx |
| Menengah | Delapan tab setara, judul sangat panjang, status global dominan | Pengguna harus memahami struktur aplikasi sebelum mengetahui kondisi pekerjaannya | Gambar pengguna dan project-detail-tabs.tsx |

## Rancangan awal yang perlu diuji dengan pengguna

Kurangi navigasi utama menjadi empat ruang. Ini usulan, bukan aturan perusahaan yang sudah disepakati:

1. Pantauan: kondisi terbaru, target penyerahan, PIC, pekerjaan tertahan, permintaan keputusan, serta waktu/sumber pembaruan.
2. Pekerjaan: lingkup aktual per unit/barang atau paket pekerjaan, sesuai jawaban wawancara. Setiap baris menjawab sedang apa, siapa, target kapan, kendala apa, dan langkah berikutnya.
3. Dokumen & Riwayat: bukti foto/PDF, laporan kunjungan, revisi dan sumber file. Laporan baru tidak menimpa sejarah.
4. Keuangan: termin, invoice, kas diterima, biaya. Tidak digunakan sebagai pengganti progres fisik.

Tugas menjadi tindak lanjut konkret di bawah pekerjaan terkait. Tahapan menjadi jalur pekerjaan di dalam ruang Pekerjaan. Grafik dapat dibuka sebagai detail setelah dasar hitungnya sah. Penutupan menjadi tindakan dengan ringkasan syarat, bukan tab yang harus terus dipantau.

## Interaksi yang diusulkan

- Tombol utama: Catat perkembangan.
- Pilih pekerjaan/unit -> tulis yang berubah -> tambahkan bukti bila ada -> catat kendala, penanggung jawab tindak lanjut, dan perkiraan berikutnya.
- Pembaruan menyimpan penulis, waktu kejadian, waktu dicatat, dan sumber. Status belum dikonfirmasi harus berbeda dari status disetujui.
- Tugas baru meminta hasil yang diharapkan dan PIC. Jika target belum diketahui, tampilkan belum ditentukan, bukan terlambat atau aman.
- Kemajuan proyek jangan dirata-rata dari jumlah tugas/checklist tanpa dasar. Tahap pekerjaan dan persentase terukur merupakan dua hal berbeda.
- Jika belum ada lingkup/bobot yang disepakati, tampilkan posisi pekerjaan dan cakupan data; jangan menghasilkan angka progres palsu.
- AI dapat mengusulkan ringkasan dari file yang sudah ada dengan tautan sumber. Pengguna memeriksa unit, tanggal, perubahan dan konflik sebelum disimpan. AI tidak otomatis mengesahkan hasil pekerjaan.

## Perlakuan data lama

- Tidak menghapus tugas hanya berdasarkan kecocokan judul template. Periksa histori, pemilik, perubahan, dan relevansi sebelum mengarsipkan dengan alasan.
- Pertahankan milestone komersial dan dokumen aslinya; klasifikasikan ulang setelah hubungan dan fungsi disepakati. Jangan mengganti angka lama diam-diam.
- Laporan hasil impor dan laporan manual memakai jalur pencatatan yang sama dengan asal data yang jelas.
- Jangan menjalankan backfill lama untuk mengisi progres yang kosong.

## Wawancara yang sudah diminta

1. Ceritakan satu proyek dari PO hingga penyerahan: siapa memberi update dan melalui media apa?
2. Tiga informasi apa yang paling diperlukan saat membuka proyek?
3. Ceritakan kejadian terakhir proyek sulit dipantau: informasi hilang, pihak yang harus dihubungi, dan keputusan yang diperlukan?

Jawaban menentukan apakah pusat pantauan perlu per unit, paket pekerjaan, kunjungan lapangan, atau vendor; siapa yang boleh mengesahkan; dan kapan data dianggap perlu pembaruan. Hal tersebut belum boleh dianggap sudah pasti.

## Kriteria uji prototipe

Target uji, bukan klaim hasil: pengguna dapat menemukan pekerjaan tertahan beserta penanggung jawab dalam 15 detik; mencatat satu perkembangan tanpa mengisi ulang data pada tab lain; membuka bukti asal dari ringkasan; membedakan kondisi barang dari pembayaran; dan mengetahui kapan status belum diperbarui. Uji dengan contoh proyek SSO yang sebenarnya, di desktop dan ponsel, sebelum penerapan final.
