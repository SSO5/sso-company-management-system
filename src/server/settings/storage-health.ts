"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { getStorageDriver } from "@/lib/storage";
import { runAction, type ActionResult } from "@/lib/action-helpers";

/**
 * Answers one question that cannot be answered from the Vercel dashboard:
 * "will an uploaded file still be there tomorrow?"
 *
 * STORAGE_DRIVER is often marked Sensitive in Vercel, which hides its value
 * for good — you cannot read it back to check. And the failure mode it guards
 * against is silent: with the local driver on a serverless host, an upload
 * appears to succeed, the Document row is created, and the bytes are gone by
 * the next request. Nobody notices until someone tries to open a file weeks
 * later.
 *
 * So instead of reporting configuration, this performs a real round trip
 * against the live driver: write a small object, read it back, compare, then
 * delete. That is the only check that actually proves storage works, because
 * it exercises the same code path uploads use.
 *
 * ADMIN or IT only, and it deliberately reports whether each S3_* variable is
 * SET — never its value. Confirming a secret exists is useful; echoing it
 * back into a browser is not.
 */

export interface StorageHealth {
  driver: string;
  driverIsPersistent: boolean;
  roundTripOk: boolean;
  error: string | null;
  envPresent: Record<string, boolean>;
  documentCount: number;
  verdict: "ok" | "will_lose_files" | "misconfigured";
  advice: string;
}

export async function checkStorageHealth(): Promise<ActionResult<StorageHealth>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    if (actor.role !== "ADMIN" && actor.role !== "IT") throw new Error("Only an ADMIN or IT may run the storage check.");

    const driver = process.env.STORAGE_DRIVER || "local";
    const envPresent = {
      STORAGE_DRIVER: Boolean(process.env.STORAGE_DRIVER),
      S3_BUCKET: Boolean(process.env.S3_BUCKET),
      S3_REGION: Boolean(process.env.S3_REGION),
      S3_ENDPOINT: Boolean(process.env.S3_ENDPOINT),
      S3_ACCESS_KEY_ID: Boolean(process.env.S3_ACCESS_KEY_ID),
      S3_SECRET_ACCESS_KEY: Boolean(process.env.S3_SECRET_ACCESS_KEY),
    };

    // Vercel sets this on every deployment; it is the reliable signal that we
    // are on an ephemeral filesystem rather than a normal server.
    const onServerless = Boolean(process.env.VERCEL);
    const driverIsPersistent = driver === "s3" || !onServerless;

    let roundTripOk = false;
    let error: string | null = null;
    try {
      const key = `healthcheck/${Date.now()}.txt`;
      const payload = Buffer.from(`sso-connect storage check ${new Date().toISOString()}`);
      const store = getStorageDriver();
      await store.saveAt(key, payload);
      const readBack = await store.read(key);
      roundTripOk = readBack.equals(payload);
      await store.delete(key).catch(() => {}); // tidy up; failure here is not a health signal
    } catch (e) {
      error = (e as Error).message;
    }

    const documentCount = await prisma.document.count({ where: { deletedAt: null } });

    let verdict: StorageHealth["verdict"];
    let advice: string;
    if (!roundTripOk) {
      verdict = "misconfigured";
      advice =
        driver === "s3"
          ? "Driver S3 aktif tetapi tulis/baca gagal. Periksa kredensial R2 dan nama bucket — detail error ada di bawah."
          : "Penyimpanan tidak dapat ditulis sama sekali. Jangan unggah apa pun sampai ini beres.";
    } else if (!driverIsPersistent) {
      verdict = "will_lose_files";
      advice =
        `Driver "${driver}" berjalan di Vercel. File berhasil ditulis sekarang, tetapi akan hilang ` +
        `saat container di-restart, sementara datanya tetap tercatat di database. ` +
        `Setel STORAGE_DRIVER=s3 beserta variabel S3_* sebelum mengunggah apa pun.` +
        (documentCount > 0 ? ` Saat ini sudah ada ${documentCount} dokumen tercatat — sebagian mungkin sudah tidak bisa dibuka.` : "");
    } else {
      verdict = "ok";
      advice =
        driver === "s3"
          ? "Penyimpanan S3/R2 aktif dan lolos uji tulis-baca. Aman untuk impor massal."
          : "Driver lokal pada server dengan disk permanen — aman, selama aplikasi tidak dipindah ke hosting serverless.";
    }

    return { driver, driverIsPersistent, roundTripOk, error, envPresent, documentCount, verdict, advice };
  });
}
