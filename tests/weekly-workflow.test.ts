import test from "node:test";
import assert from "node:assert/strict";
import { compareWeeklyItems, type WeeklyItem } from "../src/lib/weekly-comparison";
import { canDecideWeeklyReport, canDispatchWeeklyReport, isUntouchedTemplateTask } from "../src/lib/weekly-policy";
const item = (id: string, overrides: Partial<WeeklyItem> = {}): WeeklyItem => ({ id, sectionName: "CV 6806", partName: "Timken 655 / 652A", quantity: "2 pc", notes: "Rencana datang 31/8/26 DALAM PROSES", isDone: false, ...overrides });
test("identical promised arrival remains unchanged evidence, not completed or delayed work", () => {
  const [change] = compareWeeklyItems([item("old")], [item("new")]);
  assert.equal(change.kind, "unchanged"); assert.equal(change.after?.isDone, false);
});
test("a component absent from the next report is missing evidence, never completed", () => {
  const [change] = compareWeeklyItems([item("old")], []);
  assert.equal(change.kind, "missing"); assert.equal(change.after, null);
});
test("the same bearing in different units cannot be paired", () => {
  const changes = compareWeeklyItems([item("old")], [item("new", { sectionName: "CV 6804" })]);
  assert.deepEqual(changes.map(c => c.kind).sort(), ["missing", "new"]);
});
test("duplicated bearing rows and unspecified units require clarification", () => {
  const changes = compareWeeklyItems([item("a"), item("b")], [item("c")]);
  assert.ok(changes.every(c => c.kind === "ambiguous"));
  assert.ok(compareWeeklyItems([item("a", { sectionName: null })], [item("b", { sectionName: null })]).every(c => c.kind === "ambiguous"));
});
test("goods arriving is a note change, not installation completion", () => {
  const [change] = compareWeeklyItems([item("a")], [item("b", { notes: "Barang sudah datang DALAM PROSES" })]);
  assert.equal(change.kind, "changed"); assert.equal(change.after?.isDone, false);
});
test("only designated director can decide a pending exact version", () => {
  assert.equal(canDecideWeeklyReport("other-admin", "director", "PENDING", "v1", "v1"), false);
  assert.equal(canDecideWeeklyReport("director", "director", "APPROVED", "v1", "v1"), false);
  assert.equal(canDecideWeeklyReport("director", "director", "PENDING", "v1", "v2"), false);
  assert.equal(canDecideWeeklyReport("director", "director", "PENDING", "v1", "v1"), true);
});
test("rejection, pending review, and changed drafts cannot record dispatch", () => {
  for (const status of ["PENDING", "REJECTED"]) assert.equal(canDispatchWeeklyReport(status, "a", "a"), false);
  assert.equal(canDispatchWeeklyReport("APPROVED", "a", "b"), false);
  assert.equal(canDispatchWeeklyReport("APPROVED", "a", "a"), true);
});
test("real work resembling a template is preserved", () => {
  const base = { title: "Kickoff meeting with customer", status: "TODO" };
  assert.equal(isUntouchedTemplateTask(base), true);
  assert.equal(isUntouchedTemplateTask({ ...base, assignedToId: "someone" }), false);
  assert.equal(isUntouchedTemplateTask({ ...base, notes: "Customer requests Monday" }), false);
  assert.equal(isUntouchedTemplateTask({ ...base, dueDate: new Date() }), false);
});
