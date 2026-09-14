"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { X, Download, FileText, Loader2 } from "lucide-react";
import "./document-preview.css";

type Preview = { url: string; title: string };
type Content =
  | { kind: "pdf"; url: string }
  | { kind: "image"; url: string }
  | { kind: "audio"; url: string }
  | { kind: "video"; url: string }
  | { kind: "text"; text: string; note?: string }
  | { kind: "file"; note: string }
  | {
      kind: "sheets";
      sheets: { name: string; rows: string[][] }[];
      note?: string;
    };
const Context = createContext<(value: Preview) => void>(() => {});
export const useDocumentPreview = () => useContext(Context);
const fileRoute =
  /^\/api\/(?:files\/[^/]+|(?:progress-reports|report-reviews|invoices|quotations|costing|procurement\/vendor-po)\/[^/]+\/(?:pdf|excel))$/;

export function DocumentPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Preview | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const [sheet, setSheet] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  function open(value: Preview) {
    const url = new URL(value.url, location.origin);
    if (url.origin !== location.origin || !fileRoute.test(url.pathname)) return;
    if (!selected) opener.current = document.activeElement as HTMLElement;
    clearTimeout(timer.current);
    setClosing(false);
    setSelected({ ...value, url: url.pathname + url.search });
  }
  function close() {
    setClosing(true);
    timer.current = setTimeout(() => {
      dialog.current?.close();
      setSelected(null);
      setClosing(false);
      opener.current?.focus();
    }, 180);
  }
  useEffect(() => {
    function intercept(event: MouseEvent) {
      if (
        event.button ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        anchor.dataset.preview === "off"
      )
        return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || !fileRoute.test(url.pathname))
        return;
      event.preventDefault();
      event.stopPropagation();
      open({
        url: anchor.href,
        title:
          anchor.dataset.documentTitle ||
          anchor.textContent?.trim() ||
          "Dokumen",
      });
    }
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  });
  useEffect(() => {
    if (!selected) return;
    dialog.current?.showModal();
    setContent(null);
    setError("");
    setSheet(0);
    const controller = new AbortController();
    let objectUrl: string | undefined;
    (async () => {
      const url = new URL(selected.url, location.origin);
      url.searchParams.set("view", "1");
      const isFile = /^\/api\/files\/[^/]+$/.test(url.pathname);
      const response = await fetch(
        isFile ? `${url.pathname}/preview` : url.href,
        { signal: controller.signal, cache: "no-store" },
      );
      if (!response.ok || response.redirected)
        throw new Error(
          "Dokumen belum dapat dibuka. Periksa akses Anda atau unduh file asli.",
        );
      if (isFile) {
        const data = await response.json();
        if (["text", "sheets", "file"].includes(data.kind)) {
          setContent(data);
          return;
        }
        const bytes = await fetch(url.href, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!bytes.ok || bytes.redirected)
          throw new Error("File belum dapat dimuat.");
        objectUrl = URL.createObjectURL(await bytes.blob());
        if (!controller.signal.aborted)
          setContent({ kind: data.kind, url: objectUrl } as Content);
      } else {
        if (!response.headers.get("content-type")?.includes("application/pdf"))
          throw new Error("Format ini tersedia melalui unduhan file asli.");
        objectUrl = URL.createObjectURL(await response.blob());
        if (!controller.signal.aborted)
          setContent({ kind: "pdf", url: objectUrl });
      }
    })().catch((e) => {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Pratinjau belum tersedia.");
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const download = selected?.url
    .replace(/([?&])view=1(&|$)/, "$1")
    .replace(/[?&]$/, "");
  return (
    <Context.Provider value={open}>
      {children}
      <dialog
        ref={dialog}
        className={`document-drawer ${closing ? "is-closing" : ""}`}
        aria-labelledby="document-drawer-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <section className="flex h-full min-h-0 flex-col bg-card">
          <header className="flex shrink-0 items-start gap-3 border-b p-4">
            <FileText className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Pratinjau dokumen</p>
              <h2
                id="document-drawer-title"
                className="break-words font-semibold"
              >
                {selected?.title}
              </h2>
            </div>
            <a
              href={download}
              download
              data-preview="off"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Unduh</span>
            </a>
            <button
              autoFocus
              aria-label="Tutup pratinjau"
              onClick={close}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          {error ? (
            <div role="alert" className="m-5 rounded-xl border bg-muted/30 p-5">
              <p className="font-medium">Pratinjau belum tersedia</p>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <p className="mt-2 text-sm">
                File asli tetap dapat diunduh dari tombol di atas.
              </p>
            </div>
          ) : !content ? (
            <div
              role="status"
              className="grid flex-1 place-content-center gap-3 text-center text-sm"
            >
              <Loader2 className="mx-auto h-6 w-6 animate-spin" />
              Memuat dokumen…
            </div>
          ) : content.kind === "pdf" ? (
            <iframe
              key={content.url}
              src={content.url}
              title={selected?.title}
              className="min-h-0 w-full flex-1 border-0"
            />
          ) : content.kind === "image" ? (
            <div className="flex-1 overflow-auto bg-muted/40 p-4">
              <img
                src={content.url}
                alt={selected?.title}
                className="mx-auto h-auto max-w-full rounded-lg"
              />
            </div>
          ) : content.kind === "video" ? (
            <video
              controls
              src={content.url}
              className="min-h-0 w-full flex-1 bg-black"
            />
          ) : content.kind === "audio" ? (
            <audio controls src={content.url} className="m-6 max-w-full" />
          ) : content.kind === "file" ? (
            <div className="grid flex-1 place-content-center p-6 text-center">
              <FileText className="mx-auto h-12 w-12 text-primary/70" />
              <h3 className="mt-4 font-semibold">File tersedia di ruang ini</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {content.note}
              </p>
              <a
                href={download}
                download
                data-preview="off"
                className="mx-auto mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm text-primary-foreground"
              >
                <Download className="h-4 w-4" /> Buka file asli
              </a>
            </div>
          ) : content.kind === "text" ? (
            <div className="flex-1 overflow-auto p-5">
              <p className="mb-4 text-xs text-muted-foreground">
                {content.note}
              </p>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                {content.text}
              </pre>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div
                className="flex shrink-0 gap-2 overflow-x-auto border-b p-3"
                role="tablist"
                aria-label="Lembar kerja"
              >
                {content.sheets.map((s, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={sheet === i}
                    onClick={() => setSheet(i)}
                    className={`min-h-11 shrink-0 rounded-lg border px-3 text-sm ${sheet === i ? "bg-primary text-primary-foreground" : ""}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <p className="p-3 text-xs text-muted-foreground">
                {content.note}
              </p>
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {content.sheets[sheet]?.rows.map((row, i) => (
                      <tr key={i}>
                        <th className="sticky left-0 border bg-muted p-2">
                          {i + 1}
                        </th>
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className="min-w-28 max-w-80 whitespace-pre-wrap break-words border p-2 align-top"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </dialog>
    </Context.Provider>
  );
}
