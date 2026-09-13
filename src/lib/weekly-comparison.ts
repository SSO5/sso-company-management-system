export interface WeeklyItem {
  id: string;
  sectionName: string | null;
  partName: string;
  quantity: string | null;
  notes: string | null;
  isDone: boolean;
}
export type ChangeKind =
  | "changed"
  | "unchanged"
  | "new"
  | "missing"
  | "ambiguous";
export interface WeeklyChange {
  key: string;
  kind: ChangeKind;
  before: WeeklyItem | null;
  after: WeeklyItem | null;
}
const normalize = (value: string | null) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
// Conservative matching: quantity is evidence too. Duplicated keys or an absent
// unit are not safe to match automatically across reports.
export function compareWeeklyItems(
  before: WeeklyItem[],
  after: WeeklyItem[],
): WeeklyChange[] {
  const key = (i: WeeklyItem) =>
    [
      normalize(i.sectionName),
      normalize(i.partName),
      normalize(i.quantity),
    ].join("|");
  const group = (items: WeeklyItem[]) => {
    const map = new Map<string, WeeklyItem[]>();
    for (const i of items) map.set(key(i), [...(map.get(key(i)) ?? []), i]);
    return map;
  };
  const a = group(before),
    b = group(after);
  return [...new Set([...a.keys(), ...b.keys()])].flatMap(
    (k): WeeklyChange[] => {
      const old = a.get(k) ?? [],
        next = b.get(k) ?? [];
      if (
        old.length > 1 ||
        next.length > 1 ||
        !(old[0] ?? next[0]).sectionName?.trim()
      ) {
        return [
          ...old.map((i) => ({
            key: `${k}:old:${i.id}`,
            kind: "ambiguous" as const,
            before: i,
            after: null,
          })),
          ...next.map((i) => ({
            key: `${k}:new:${i.id}`,
            kind: "ambiguous" as const,
            before: null,
            after: i,
          })),
        ];
      }
      const previous = old[0] ?? null,
        current = next[0] ?? null;
      const kind: ChangeKind = !previous
        ? "new"
        : !current
          ? "missing"
          : normalize(previous.notes) !== normalize(current.notes) ||
              previous.isDone !== current.isDone
            ? "changed"
            : "unchanged";
      return [{ key: k, kind, before: previous, after: current }];
    },
  );
}
export const CHANGE_LABELS: Record<ChangeKind, string> = {
  changed: "Ada perubahan",
  unchanged: "Keterangan sama",
  new: "Baru tercantum",
  missing: "Tidak tercantum lagi",
  ambiguous: "Perlu cocokkan unit/item",
};
