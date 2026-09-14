import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { nativePreview, readOfficePreview } from "../src/lib/document-preview";
test("active content never opens as native preview", () => {
  assert.equal(nativePreview("text/html"), null);
  assert.equal(nativePreview("image/svg+xml"), null);
  assert.equal(nativePreview("application/pdf"), "pdf");
});
test("Word text remains literal text for escaped React rendering", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    "<w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p>",
  );
  const result = await readOfficePreview(
    await zip.generateAsync({ type: "nodebuffer" }),
    "report.docx",
  );
  assert.equal(result.kind, "text");
  assert.equal(result.text, "<script>alert(1)</script>");
});
test("CSV preview bounds rows and columns", async () => {
  const csv = Array.from({ length: 150 }, () =>
    Array.from({ length: 40 }, (_, i) => String(i)).join(","),
  ).join("\n");
  const result = await readOfficePreview(Buffer.from(csv), "report.csv");
  assert.equal(result.sheets?.[0].rows.length, 100);
  assert.equal(result.sheets?.[0].rows[0].length, 30);
});
test("Excel merged empty cells do not break the actual workbook preview", async () => {
  const book=new ExcelJS.Workbook(); const sheet=book.addWorksheet("Rekap");
  sheet.mergeCells("A1:C1"); sheet.getCell("A2").value="Invoice";
  sheet.getCell("B2").value={formula:"1+1",result:2};
  const result=await readOfficePreview(Buffer.from(await book.xlsx.writeBuffer()),"rekap.xlsx");
  assert.deepEqual(result.sheets?.[0].rows[0],["","",""]);
  assert.equal(result.sheets?.[0].rows[1][1],"2");
});
test("ZIP opens in the same preview surface as a safe file list", async () => {
  const zip = new JSZip();
  zip.file("Laporan Vendor/Progress 020.pdf", Buffer.from("test"));
  const result = await readOfficePreview(
    await zip.generateAsync({ type: "nodebuffer" }),
    "laporan.zip",
  );
  assert.equal(result.kind, "text");
  assert.match(result.text ?? "", /Progress 020\.pdf/);
});
test("legacy Office formats stay in the drawer with a safe file fallback", async () => {
  const result = await readOfficePreview(Buffer.from("legacy"), "laporan.xls");
  assert.equal(result.kind, "file");
});
