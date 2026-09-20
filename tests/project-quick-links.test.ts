import test from "node:test";
import assert from "node:assert/strict";
import { buildQuickLinks, type QuickLinkCounts } from "../src/lib/project-quick-links";

const kosong = (): QuickLinkCounts => ({
  costing: 0,
  quotation: 0,
  vendorPo: 0,
  vendorPoPending: 0,
  expense: 0,
  expensePending: 0,
  invoice: 0,
  invoiceOutstanding: 0,
  document: 0,
});

const link = (counts: QuickLinkCounts, label: string) =>
  buildQuickLinks("clx8n2k4p0001qw3f7yz9abcd", counts).find((l) => l.label === label)!;

test("setiap tautan menuju modul yang sudah ada, bukan layar baru", () => {
  // Papan biaya satu-satunya halaman baru, dan itu memang bagian fitur ini.
  const links = buildQuickLinks("clx8n2k4p0001qw3f7yz9abcd", kosong());
  const modulLama = links.filter((l) => !l.href.includes("/cost-board"));
  assert.ok(modulLama.length >= 6);
  for (const l of modulLama) {
    assert.ok(
      /^\/(sales|procurement|finance|projects)\//.test(l.href),
      `tautan tak dikenal: ${l.href}`,
    );
  }
});

test("petunjuk hanya muncul saat ada yang perlu ditindak", () => {
  // Tautan yang selalu berlabel akan berhenti dibaca.
  const c = kosong();
  c.vendorPo = 4;
  c.expense = 23;
  c.invoice = 3;
  c.document = 41;
  c.costing = 2;
  c.quotation = 1;
  assert.equal(link(c, "PO vendor").hint, undefined);
  assert.equal(link(c, "Biaya proyek").hint, undefined);
  assert.equal(link(c, "Invoice").hint, undefined);
  assert.equal(link(c, "Dokumen").hint, undefined);
});

test("petunjuk menyebut angkanya, bukan sekadar bilang ada", () => {
  const c = kosong();
  c.expense = 23;
  c.expensePending = 5;
  c.vendorPo = 4;
  c.vendorPoPending = 1;
  c.invoice = 3;
  c.invoiceOutstanding = 2;
  assert.equal(link(c, "Biaya proyek").hint, "5 menunggu persetujuan");
  assert.equal(link(c, "PO vendor").hint, "1 belum dikirim");
  assert.equal(link(c, "Invoice").hint, "2 belum lunas");
});

test("modul yang masih kosong mengatakannya, bukan menampilkan nol tanpa keterangan", () => {
  const c = kosong();
  assert.equal(link(c, "Costing").hint, "belum ada");
  assert.equal(link(c, "Penawaran").hint, "belum ada");
  assert.equal(link(c, "Dokumen").hint, "kosong");
});

test("tautan proyek selalu membawa id proyeknya", () => {
  const links = buildQuickLinks("clx8n2k4p0001qw3f7yz9abcd", kosong());
  for (const l of links) {
    if (l.href.includes("project") || l.href.includes("/projects/")) {
      assert.ok(
        l.href.includes("clx8n2k4p0001qw3f7yz9abcd"),
        `tautan kehilangan id proyek: ${l.href}`,
      );
    }
  }
});
