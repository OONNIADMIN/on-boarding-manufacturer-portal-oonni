import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { BackgroundJobQueue } from "@/lib/background-job-queue";
import { parseSpreadsheetRowsOffThread } from "@/lib/spreadsheet-parse-worker";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  return { promise, resolve };
}

describe("BackgroundJobQueue", () => {
  it("never runs more jobs than the concurrency cap", async () => {
    const queue = new BackgroundJobQueue(2);
    let running = 0;
    let peak = 0;
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const done: string[] = [];

    for (let i = 0; i < 4; i++) {
      queue.enqueue(`job-${i}`, async () => {
        running++;
        peak = Math.max(peak, running);
        await gates[i].promise;
        running--;
        done.push(`job-${i}`);
      });
    }

    expect(queue.activeCount).toBe(2);
    expect(queue.waitingCount).toBe(2);
    expect(queue.has("job-3")).toBe(true);

    for (const gate of gates) gate.resolve();
    await vi.waitFor(() => expect(done).toHaveLength(4));

    expect(peak).toBe(2);
    expect(done).toEqual(["job-0", "job-1", "job-2", "job-3"]);
    expect(queue.has("job-0")).toBe(false);
  });

  it("ignores duplicate ids while a job is waiting or running", async () => {
    const queue = new BackgroundJobQueue(1);
    const gate = deferred();
    let runs = 0;

    queue.enqueue("a", async () => {
      runs++;
      await gate.promise;
    });
    queue.enqueue("a", async () => {
      runs++;
    });
    queue.enqueue("b", async () => {});
    queue.enqueue("b", async () => {});

    gate.resolve();
    await vi.waitFor(() => expect(queue.activeCount).toBe(0));
    expect(runs).toBe(1);
    expect(queue.waitingCount).toBe(0);
  });

  it("keeps draining after a job crashes", async () => {
    const queue = new BackgroundJobQueue(1);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let secondRan = false;

    queue.enqueue("boom", async () => {
      throw new Error("boom");
    });
    queue.enqueue("next", async () => {
      secondRan = true;
    });

    await vi.waitFor(() => expect(secondRan).toBe(true));
    errSpy.mockRestore();
  });
});

describe("parseSpreadsheetRowsOffThread", () => {
  it("parses an xlsx buffer inside the worker (no sync fallback)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sheet = XLSX.utils.aoa_to_sheet([
      ["SKU", "Name"],
      ["A-1", " Anchor "],
      ["B-2", 42],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Data");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const rows = await parseSpreadsheetRowsOffThread(buffer, "catalog.xlsx");

    expect(rows).toEqual([
      ["SKU", "Name"],
      ["A-1", "Anchor"],
      ["B-2", "42"],
    ]);
    const fellBack = warnSpy.mock.calls.some((c) =>
      String(c[0]).includes("falling back to sync parse")
    );
    expect(fellBack).toBe(false);
    warnSpy.mockRestore();
  });
});
