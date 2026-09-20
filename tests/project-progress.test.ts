import test from "node:test";
import assert from "node:assert/strict";
import {
  computeProjectHealth,
  computeProjectProgress,
  HEALTH_CRITICAL_LAG_POINTS,
  projectStatusLabel,
} from "../src/lib/project-progress";

const hariLalu = (n: number) => new Date(Date.now() - n * 86_400_000);
const hariDepan = (n: number) => new Date(Date.now() + n * 86_400_000);
const now = new Date();

test("progres memakai bobot milestone, bukan sekadar jumlahnya", () => {
  // Proyek dengan tiga milestone tidak berarti tiap milestone bernilai 33%.
  const p = computeProjectProgress({
    milestones: [
      { status: "COMPLETED", dueDate: hariLalu(20), completedAt: hariLalu(19), weightPercent: 70 },
      { status: "PENDING", dueDate: hariDepan(5), completedAt: null, weightPercent: 10 },
      { status: "PENDING", dueDate: hariDepan(10), completedAt: null, weightPercent: 20 },
    ],
    manualPercent: 0,
    now,
  });
  assert.equal(p.percent, 70);
  assert.equal(p.source, "MILESTONE_WEIGHT");
  assert.equal(p.milestonesDone, 1);
  assert.equal(p.milestonesTotal, 3);
});

test("tanpa bobot, progres jatuh ke angka manual dan MENGAKUINYA", () => {
  // Sumbernya ikut dilaporkan supaya tebakan manual tidak menyamar sebagai
  // hasil perhitungan.
  const p = computeProjectProgress({
    milestones: [
      { status: "COMPLETED", dueDate: null, completedAt: hariLalu(1), weightPercent: 0 },
    ],
    manualPercent: 35,
    now,
  });
  assert.equal(p.percent, 35);
  assert.equal(p.source, "MANUAL");
});

test("milestone lewat tanggal dihitung, yang sudah selesai tidak", () => {
  const p = computeProjectProgress({
    milestones: [
      { status: "IN_PROGRESS", dueDate: hariLalu(8), completedAt: null, weightPercent: 50 },
      { status: "COMPLETED", dueDate: hariLalu(20), completedAt: hariLalu(21), weightPercent: 50 },
    ],
    manualPercent: 0,
    now,
  });
  assert.equal(p.overdueCount, 1);
});

test("persen selalu dijaga di rentang 0–100", () => {
  assert.equal(
    computeProjectProgress({ milestones: [], manualPercent: 150, now }).percent,
    100,
  );
  assert.equal(
    computeProjectProgress({ milestones: [], manualPercent: -20, now }).percent,
    0,
  );
});

test("kesehatan membandingkan progres dengan WAKTU, bukan dengan biaya", () => {
  // Proyek yang separuh waktunya terpakai dan separuh pekerjaannya selesai
  // sedang sesuai rencana, berapa pun biayanya.
  const h = computeProjectHealth({
    progressPercent: 50,
    startDate: hariLalu(50),
    endDate: hariDepan(50),
    status: "ACTIVE",
    overdueCount: 0,
    now,
  });
  assert.equal(h.health, "SESUAI_RENCANA");
  assert.equal(h.timeElapsedPercent, 50);
});

test("tertinggal jauh saat progres jauh di belakang waktu terpakai", () => {
  const h = computeProjectHealth({
    progressPercent: 30,
    startDate: hariLalu(80),
    endDate: hariDepan(20),
    status: "ACTIVE",
    overdueCount: 0,
    now,
  });
  assert.equal(h.health, "KRITIS");
  assert.ok(h.lagPoints !== null && h.lagPoints <= -HEALTH_CRITICAL_LAG_POINTS);
});

test("satu milestone lewat tanggal sudah cukup menyebut proyek tertinggal", () => {
  // Walaupun persentasenya masih terlihat wajar.
  const h = computeProjectHealth({
    progressPercent: 50,
    startDate: hariLalu(50),
    endDate: hariDepan(50),
    status: "ACTIVE",
    overdueCount: 1,
    now,
  });
  assert.equal(h.health, "TERTINGGAL");
  assert.match(h.reason, /lewat tanggal/);
});

test("tanpa jadwal, kesehatan tidak ditebak", () => {
  // Proyek tanpa tanggal tidak bisa dinilai terlambat. Berpura-pura bisa
  // hanya membuat orang berhenti mempercayai penandanya.
  for (const [startDate, endDate] of [
    [null, hariDepan(10)],
    [hariLalu(10), null],
    [hariDepan(10), hariLalu(10)],
  ] as [Date | null, Date | null][]) {
    const h = computeProjectHealth({
      progressPercent: 10,
      startDate,
      endDate,
      status: "ACTIVE",
      overdueCount: 0,
      now,
    });
    assert.equal(h.health, "TIDAK_TERUKUR");
    assert.equal(h.lagPoints, null);
  }
});

test("proyek yang sudah ditutup tidak pernah disebut tertinggal", () => {
  for (const status of ["COMPLETED", "CLOSED"]) {
    const h = computeProjectHealth({
      progressPercent: 40,
      startDate: hariLalu(100),
      endDate: hariLalu(10),
      status,
      overdueCount: 3,
      now,
    });
    assert.equal(h.health, "SELESAI");
  }
});

test("label status memakai kamus yang sama dengan seluruh aplikasi", () => {
  assert.equal(projectStatusLabel("ACTIVE"), "Aktif");
  assert.equal(projectStatusLabel("AT_RISK"), "Perlu perhatian");
  // Nilai yang tidak dikenal dikembalikan apa adanya, bukan dikosongkan.
  assert.equal(projectStatusLabel("ENTAH_APA"), "ENTAH_APA");
});
