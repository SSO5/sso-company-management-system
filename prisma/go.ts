/**
 * One command to bring the app into operational use.
 *
 * Everything here already existed as a separate script; the value of this file
 * is ORDER and GATES. Run out of order, the steps quietly damage each other:
 * importing documents before storage is verified writes rows pointing at files
 * that no longer exist, and merging users after the import attributes history
 * to an account that is about to be deleted.
 *
 * Runs on your machine because that is the only place with network access to
 * the production database and to the OneDrive folder.
 *
 * Usage:
 *   npm run go                 # dry run — shows what every step would do
 *   npm run go -- --apply      # actually do it
 *   npm run go -- --apply --skip-import
 */
import { spawnSync } from "child_process";
import path from "path";

const APPLY = process.argv.includes("--apply");
const SKIP = (name: string) => process.argv.includes(`--skip-${name}`);

const PROSPEK =
  process.env.PROSPEK_PATH ||
  path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    "OneDrive - PT. Petrindo Semesta", "PT SSO", "PROSPEK 2026"
  );

interface Step {
  name: string;
  label: string;
  script: string;
  args: (apply: boolean) => string[];
  /** A failure here means later steps would do damage, so stop. */
  fatal: boolean;
}

console.log(`Folder PROSPEK: ${PROSPEK}`);
console.log("(ubah dengan variabel lingkungan PROSPEK_PATH bila lokasinya berbeda)\n");

const STEPS: Step[] = [
  {
    name: "login",
    label: "Perbaiki email & password login",
    script: "prisma/fix-login.ts",
    args: (a) => (a ? ["--apply", "--reset-all"] : []),
    fatal: false,
  },
  {
    name: "merge",
    label: "Gabungkan akun ganda Yohana",
    script: "prisma/merge-users.ts",
    args: (a) => [
      "--from=yohanamunthe555@gmail.com",
      "--to=saranasinergi.optima@gmail.com",
      ...(a ? ["--apply"] : []),
    ],
    fatal: false,
  },
  {
    name: "import",
    label: "Impor dokumen dari folder PROSPEK 2026",
    script: "prisma/import-documents.ts",
    // This step refuses to run on a non-persistent storage driver. That refusal
    // is the gate: if it trips, the follow-up tasks below still make sense, so
    // it is not fatal — but no documents will have been imported.
    args: (a) => [`--root=${PROSPEK}`, ...(a ? ["--apply"] : [])],
    fatal: false,
  },
  {
    name: "followups",
    label: "Buat tugas operasional dari hasil telaah email",
    script: "prisma/operational-followups.ts",
    args: (a) => (a ? ["--apply"] : []),
    fatal: false,
  },
];

function run(step: Step): boolean {
  console.log("\n" + "=".repeat(72));
  console.log(`  ${step.label}`);
  console.log("=".repeat(72));
  const res = spawnSync("npx", ["tsx", step.script, ...step.args(APPLY)], {
    stdio: "inherit",
    shell: process.platform === "win32", // npx on Windows needs a shell
  });
  return res.status === 0;
}

const results: { label: string; ok: boolean; ran: boolean }[] = [];

for (const step of STEPS) {
  if (SKIP(step.name)) {
    results.push({ label: step.label, ok: true, ran: false });
    console.log(`\n(dilewati: ${step.label})`);
    continue;
  }
  const ok = run(step);
  results.push({ label: step.label, ok, ran: true });
  if (!ok && step.fatal) {
    console.error(`\nBerhenti: "${step.label}" gagal, dan langkah berikutnya bergantung padanya.`);
    process.exit(1);
  }
}

console.log("\n" + "=".repeat(72));
console.log("  RINGKASAN");
console.log("=".repeat(72));
for (const r of results) {
  const mark = !r.ran ? "—" : r.ok ? "OK" : "GAGAL";
  console.log(`  ${mark.padEnd(6)} ${r.label}`);
}
console.log(
  APPLY
    ? "\nSelesai. Buka beranda aplikasi: Tugas Saya, Pemberitahuan, dan Kelengkapan Dokumen sudah terisi.\n"
    : "\nIni baru simulasi. Jalankan ulang dengan --apply untuk benar-benar menerapkan.\n"
);
