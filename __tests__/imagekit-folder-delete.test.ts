import { describe, expect, it, vi } from "vitest";
import { purgeImageKitFolder, type ImageKitFolderIo } from "@/lib/imagekit";

const tree: Record<string, { fileIds: string[]; folders: string[] }> = {
  "/Acme": {
    fileIds: [],
    folders: ["/Acme/images", "/Acme/catalogs", "/Other"],
  },
  "/Acme/images": {
    fileIds: ["img-1", "img-2"],
    folders: ["/Acme/images/spring"],
  },
  "/Acme/images/spring": {
    fileIds: ["img-3"],
    folders: [],
  },
  "/Acme/catalogs": {
    fileIds: ["sheet-1"],
    folders: [],
  },
};

function ioFrom(calls: string[], overrides?: Partial<ImageKitFolderIo>): ImageKitFolderIo {
  return {
    listChildren: vi.fn(async (folder: string) => {
      calls.push(`list:${folder}`);
      return tree[folder] ?? { fileIds: [], folders: [] };
    }),
    deleteFileIds: vi.fn(async (fileIds: string[]) => {
      calls.push(`files:${fileIds.join(",")}`);
    }),
    deleteFolder: vi.fn(async (folder: string) => {
      calls.push(`folder:${folder}`);
    }),
    ...overrides,
  };
}

describe("purgeImageKitFolder", () => {
  it("deletes nested files before deleting folders from the inside out", async () => {
    const calls: string[] = [];
    await purgeImageKitFolder("/Acme", {
      extraFileIds: ["legacy-file"],
      io: ioFrom(calls),
    });

    expect(calls.filter((call) => call.startsWith("folder:"))).toEqual([
      "folder:/Acme/images/spring",
      "folder:/Acme/images",
      "folder:/Acme/catalogs",
      "folder:/Acme",
    ]);
    expect(calls.some((call) => call.startsWith("list:/Other"))).toBe(false);
    const filesCall = calls.find((call) => call.startsWith("files:"));
    expect(filesCall).toContain("img-1");
    expect(filesCall).toContain("img-3");
    expect(filesCall).toContain("sheet-1");
    expect(filesCall).toContain("legacy-file");
    expect(calls.findIndex((call) => call.startsWith("files:"))).toBeLessThan(
      calls.findIndex((call) => call.startsWith("folder:"))
    );
  });

  it("clears files found on a retry when the folder is not empty yet", async () => {
    const calls: string[] = [];
    const base = ioFrom(calls);
    let attempts = 0;
    const io: ImageKitFolderIo = {
      ...base,
      listChildren: vi.fn(async (folder: string) => {
        if (folder === "/Acme" && attempts > 0) return { fileIds: ["late-file"], folders: [] };
        return tree[folder] ?? { fileIds: [], folders: [] };
      }),
      deleteFolder: vi.fn(async (folder: string) => {
        calls.push(`folder:${folder}`);
        if (folder === "/Acme" && attempts === 0) {
          attempts += 1;
          throw new Error("folder is not empty");
        }
      }),
    };

    await purgeImageKitFolder("/Acme", { io });

    expect(calls.filter((call) => call === "folder:/Acme")).toHaveLength(2);
    expect(io.deleteFileIds).toHaveBeenCalledWith(["late-file"]);
  });

  it("refuses to purge the media library root", async () => {
    const deleteFolder = vi.fn();
    await expect(
      purgeImageKitFolder("/", {
        io: {
          listChildren: async () => ({ fileIds: [], folders: [] }),
          deleteFileIds: async () => undefined,
          deleteFolder,
        },
      })
    ).rejects.toThrow(/unsafe/i);
    expect(deleteFolder).not.toHaveBeenCalled();
  });
});
