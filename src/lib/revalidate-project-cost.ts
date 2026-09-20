import { revalidatePath } from "next/cache";

/**
 * Membuang cache setiap halaman yang menampilkan angka biaya sebuah proyek.
 *
 * Empat halaman membaca sumber yang sama dengan pertanyaan berbeda: detail
 * proyek, Command Center, papan biaya, dan daftar biaya finance. Kalau hanya
 * sebagian yang disegarkan, dua halaman akan menampilkan angka berbeda untuk
 * proyek yang sama — dan orang akan percaya yang mana pun yang dibukanya
 * lebih dulu.
 *
 * Dipanggil dari SETIAP tempat yang mengubah biaya: mencatat, mengajukan,
 * menyetujui, menolak, membayar, dan mengirim PO vendor. Menolak biaya juga
 * termasuk — penolakan mengurangi angka yang tadinya menunggu, dan itu
 * perubahan yang harus terlihat.
 *
 * Berkas ini sengaja BUKAN "use server": ia dipanggil dari lapisan server
 * mana pun, dan berkas "use server" hanya boleh mengekspor fungsi async.
 */
export function revalidateProjectCost(projectId: string): void {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/command`);
  revalidatePath(`/projects/${projectId}/cost-board`);
  revalidatePath("/finance/expenses");
}
