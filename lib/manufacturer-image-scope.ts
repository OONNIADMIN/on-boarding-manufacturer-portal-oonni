import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId } from "@/lib/auth";
import { manufacturerImageKitImagesFolder } from "@/lib/manufacturer-media-path";

type ScopeUser = {
  id: number;
  manufacturer_id: number | null;
  manufacturer?: { id: number } | null;
};

/** Resolve manufacturer id for image list when profile FK is missing (infer from past uploads). */
export async function resolveImageListManufacturerScope(
  user: ScopeUser,
  isAdmin: boolean
): Promise<number | null> {
  if (isAdmin) return null;
  let mfrScope = effectiveManufacturerId(user);
  if (mfrScope != null) return mfrScope;
  const inferred = await prisma.image.findFirst({
    where: { user_id: user.id, deleted_at: null },
    select: { manufacturer_id: true },
    orderBy: { created_at: "desc" },
  });
  return inferred?.manufacturer_id ?? null;
}

function imageKitFolderKeyPrefixes(folder: string): string[] {
  const trimmed = folder.trim();
  if (!trimmed) return [];
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const noLeading = withSlash.replace(/^\/+/, "");
  const out = new Set<string>();
  out.add(`${withSlash}/`);
  out.add(`${noLeading}/`);
  return [...out];
}

/**
 * Full visibility filter for non-admin image listing.
 * Includes ImageKit path prefix so rows that landed under the manufacturer folder still match
 * if manufacturer_id on the row is wrong or legacy.
 */
export async function buildNonAdminImagesWhere(
  user: ScopeUser
): Promise<Prisma.ImageWhereInput> {
  const mfrScope = await resolveImageListManufacturerScope(user, false);
  if (mfrScope == null) {
    return { user_id: user.id };
  }

  const mfr = await prisma.manufacturer.findUnique({ where: { id: mfrScope } });
  const prefixes =
    mfr && !mfr.deleted_at ? imageKitFolderKeyPrefixes(manufacturerImageKitImagesFolder(mfr)) : [];

  const or: Prisma.ImageWhereInput[] = [
    { manufacturer_id: mfrScope },
    { user_id: user.id },
    {
      product: {
        is: {
          deleted_at: null,
          OR: [
            { manufacturer_id: mfrScope },
            {
              catalog: {
                is: { manufacturer_id: mfrScope, deleted_at: null },
              },
            },
          ],
        },
      },
    },
  ];
  for (const p of prefixes) {
    or.push({ s3_key: { startsWith: p } });
  }

  return { OR: or };
}

/** @deprecated Prefer buildNonAdminImagesWhere — kept for tests or callers that need sync-only OR. */
export function nonAdminImagesVisibilityWhere(
  mfrScope: number | null,
  userId: number
): Prisma.ImageWhereInput {
  if (mfrScope != null) {
    return {
      OR: [
        { manufacturer_id: mfrScope },
        { user_id: userId },
        { product: { is: { manufacturer_id: mfrScope, deleted_at: null } } },
      ],
    };
  }
  return { user_id: userId };
}
