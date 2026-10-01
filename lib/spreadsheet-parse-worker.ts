import { Worker } from "node:worker_threads";
import { parseSpreadsheetRows } from "@/lib/catalog-spreadsheet-parse";

/**
 * Parse a catalog spreadsheet WITHOUT blocking the main thread.
 *
 * `XLSX.read` / `sheet_to_json` are synchronous; on a large Excel file they
 * block Node's single event loop for many seconds, freezing every request
 * (logins, job polling, other users' uploads). Background jobs call this
 * wrapper instead: Excel files are parsed inside a short-lived worker thread,
 * so the portal stays responsive.
 *
 * The worker script is passed as an eval string (not a file) so it survives
 * both bundlers in play (webpack in `next build`, vite in vitest) without
 * special worker-chunk configuration. It resolves `xlsx` from process.cwd(),
 * which holds node_modules in dev, tests, and the Docker runtime alike.
 *
 * CSV files and any worker failure fall back to the existing synchronous
 * parser, so behavior can only degrade to what production does today.
 */

const WORKER_TIMEOUT_MS = 5 * 60 * 1000;

// Mirrors parseSpreadsheetRows for xlsx/xls: dense read, first sheet,
// header:1 rows, every cell normalized to a trimmed string.
const XLSX_WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const { createRequire } = require("node:module");
try {
  const requireFromCwd = createRequire(process.cwd() + "/");
  const XLSX = requireFromCwd("xlsx");
  const buffer = Buffer.from(workerData.bytes);
  const workbook = XLSX.read(buffer, { type: "buffer", dense: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) : [];
  const rows = raw.map((row) => (row || []).map((cell) => (cell == null ? "" : String(cell).trim())));
  parentPort.postMessage({ ok: true, rows });
} catch (e) {
  parentPort.postMessage({ ok: false, error: e && e.message ? e.message : String(e) });
}
`;

function isExcelFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

function parseExcelRowsInWorker(buffer: Buffer): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(XLSX_WORKER_SOURCE, {
      eval: true,
      workerData: { bytes: buffer },
    });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
      void worker.terminate();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("Spreadsheet parse timed out"))),
      WORKER_TIMEOUT_MS
    );
    worker.once("message", (msg: { ok: boolean; rows?: string[][]; error?: string }) => {
      finish(() =>
        msg.ok && msg.rows
          ? resolve(msg.rows)
          : reject(new Error(msg.error || "Spreadsheet parse failed"))
      );
    });
    worker.once("error", (e) => finish(() => reject(e)));
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        finish(() => reject(new Error(`Spreadsheet parse worker exited with code ${code}`)));
      }
    });
  });
}

/** Async drop-in for `parseSpreadsheetRows` in background jobs. */
export async function parseSpreadsheetRowsOffThread(
  buffer: Buffer,
  fileName: string
): Promise<string[][]> {
  if (isExcelFile(fileName)) {
    try {
      return await parseExcelRowsInWorker(buffer);
    } catch (e) {
      console.warn("Spreadsheet worker parse failed; falling back to sync parse:", e);
    }
  }
  return parseSpreadsheetRows(buffer, fileName);
}
