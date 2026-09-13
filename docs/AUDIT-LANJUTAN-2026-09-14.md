# Audit lanjutan SSO Connect — 14 September 2026

Ruang lingkup: koreksi lanjutan setelah rilis 962baa9. Pemeriksaan kode, aturan hitung, API dokumen, notifikasi, dan halaman kerja. Ini bukan sertifikasi seluruh aplikasi atau pengesahan data keuangan perusahaan.

## Temuan dan koreksi

| Area | Akar masalah | Koreksi | Batas verifikasi |
|---|---|---|---|
| API file/PDF/Excel | Sesi JWT valid dipakai tanpa membaca kembali status akun | Semua endpoint privat terkait memakai akun aktif dan peran terbaru dari database | Tidak menonaktifkan akun produksi untuk pengujian |
| Foto laporan | Endpoint membaca storage key tanpa membuktikan foto terkait laporan aktif | Key harus tercatat sebagai foto sebelum/sesudah pada laporan yang belum dihapus | Hak lihat lintas proyek mengikuti model akses aplikasi saat ini |
| File inline | MIME dari upload dapat membuat format aktif dibuka dalam origin aplikasi | Hanya PDF dan format gambar pasif tertentu dibuka inline; format lain sebagai attachment; nosniff | Tidak mengubah file tersimpan |
| Tugas/tahapan | Parameter proyek terpisah tidak ikut memfilter baris yang diubah | Update/delete memakai pasangan ID catatan dan ID proyek; enum status divalidasi | Tidak menjalankan perubahan status bisnis saat smoke test |
| Bukti bayar biaya | Proyek upload mengikuti input terpisah dari biaya | Cocokkan biaya dengan proyek sebelum upload; simpan relatedEntityId bukti | Tidak membuat pembayaran uji |
| Cloud API | HTTP sukses disebut pesan terkirim; JSON tanpa ID pesan dapat dianggap sukses | Wajib respons berisi ID pesan; UI menyebut diterima penyedia, belum konfirmasi ponsel | Belum ada pencatatan delivered/read webhook |
| Routing WhatsApp | Konfigurasi Cloud setengah terisi dapat jatuh ke gateway lain | Cloud yang mulai dikonfigurasi tidak diam-diam beralih ke Fonnte | Fonnte tetap ada untuk instalasi lama tanpa konfigurasi Cloud |
| Kegagalan kanal | Email berhasil dapat menutupi WA gagal; pesan error menyebut Fonnte meski provider Cloud | Ringkasan per kanal dan pemberitahuan kegagalan parsial dengan penyedia yang benar | Deduplikasi pemberitahuan berbasis waktu 6 jam, bukan antrean pengiriman transaksional |
| SMTP | secure=true dipakai pada semua port | Port 465 TLS langsung; port lain mewajibkan STARTTLS; batas waktu koneksi ditambahkan | Kredensial produksi belum diuji |
| Konten notifikasi | Isi bisnis dimasukkan langsung ke HTML email; tautan dapat cacat | Escape teks, batasi link HTTPS satu origin, batasi waktu HTTP, kurangi data penerima pada log | Tidak mengirim email/WA nyata dalam pengujian |
| Piutang | Penjumlahan total memungkinkan kelebihan bayar satu invoice mengurangi piutang invoice lain | Hitung sisa per invoice, batas bawah nol, lalu jumlahkan; invoice draf dikecualikan | Tidak mengubah nominal transaksi sumber |
| Penutupan | Label semua invoice/pembayaran ditinjau tidak sesuai pemeriksaan minimal satu invoice dan 50% pembayaran | Label menyatakan aturan aktual; hanya invoice terbit dihitung; keterangan bahwa ini bukan persetujuan/pelunasan kontrak | Ambang lama 50% dipertahankan, perlu keputusan bisnis untuk kebijakan final |
| Kurva progres | Selisih poin diberi simbol persen; penagihan di bawah realisasi otomatis disebut aman | Gunakan poin persentase; perbandingan netral, rencana kosong diberi keterangan | Tidak mengubah bobot atau status milestone |
| Data mirip | Tanda kemiripan belum menyediakan jalan membandingkan isi dan kaitan | Halaman Tinjau Kemiripan, file asli dan checklist terkait, pengunggah/versi/ID; pembacaan dibatasi per halaman | Nama persis+ukuran+folder bukan hash isi; tidak ada merge/delete otomatis |
| Bahasa | Label tugas, biaya, dokumen, dan penutupan bercampur | Label utama ruang proyek berbahasa Indonesia, nilai enum tersimpan tetap sama | Sebagian istilah/formulir lama di modul lain masih memerlukan penyeragaman |

## Halaman yang ditambahkan

- `/data/review`: kelompok kemiripan, maksimal 10 kelompok per halaman dan 20 file tiap kelompok, tautan file asli serta checklist.
- `/settings/integrations`: khusus ADMIN/IT, memeriksa kelengkapan konfigurasi tanpa menampilkan rahasia atau mengirim pesan. Riwayat kegagalan dibatasi pada notifikasi milik akun yang masuk.

## Verifikasi

- 16 tes lulus, mencakup konfigurasi parsial Cloud, STARTTLS/TLS, link satu origin, escape HTML, kegagalan parsial per kanal, respons penyedia, dan sisa piutang per invoice.
- Seluruh HTTP penyedia pada tes dimock. Tidak ada pesan nyata.
- Pemeriksaan TypeScript dan lint lulus pada koreksi yang diperiksa. Build/deployment final dan hasil browser dicatat pada DEPLOYMENT-STATUS-2026-09-14.md.
- Tidak ada migrasi schema, penghapusan dokumen, penulisan nominal/status transaksi produksi, atau perubahan kredensial/izin akun.

## Keputusan bisnis yang belum boleh ditebak

1. Penutupan proyek: apakah harus invoice terbit menutup seluruh kontrak, seluruh kewajiban vendor selesai, dan piutang lunas; siapa yang boleh memberikan pengecualian? Aturan lama 50% bukan pengganti persetujuan tersebut.
2. Dokumen mirip: versi mana yang sah harus ditentukan dari isi/bukti dan PIC; jumlah checklist yang berbeda tidak otomatis berarti salah satu file boleh dibuang.
3. Hak akses: aplikasi masih memakai hak lihat per modul, bukan pembatasan setiap proyek hanya untuk PIC. Perubahan ini memerlukan matriks hak akses perusahaan.
4. Integrasi: perlu memastikan pilihan penyedia WhatsApp, token/template valid, dan izin penerima. Respons provider belum membuktikan delivered/read.
5. Keandalan notifikasi jangka panjang: antrean/outbox, idempotency, status webhook tervalidasi, dan retensi log masih perlu dirancang sebelum menjanjikan pengiriman pasti.

## Referensi teknis

- Nodemailer SMTP: https://nodemailer.com/smtp — port 465/587, secure, requireTLS, timeout.
- Dokumentasi Meta di Postman: https://www.postman.com/meta/whatsapp-business-platform/request/vm6dfdv/status-message-delivered-business-delivered-from-user — konfirmasi delivered datang sebagai status webhook.

Baseline pemulihan sebelum koreksi lanjutan: 962baa9d2a38d40a666a422ec5de855d90ae986b. Tidak ada perubahan schema; pemulihan deployment tidak memerlukan pemulihan database.
