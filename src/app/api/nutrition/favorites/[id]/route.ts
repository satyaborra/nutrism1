/**
 * DELETE /api/nutrition/favorites/[id] — unpin a favorite.
 * Ownership-checked. Id is extracted from the URL path (withApi pattern).
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

function extractId(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 1];
  if (!id || id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new AppError("VALIDATION_FAILED", "Invalid favorite id.");
  }
  return id;
}

export const DELETE = withApi("favorites_delete", async ({ req }: { req: NextRequest }): Promise<NextResponse> => {
  const user = await requireUser();
  const id = extractId(req.url);

  const favorite = await db.favorite.findUnique({ where: { id } });
  if (!favorite) throw new AppError("NOT_FOUND", "That favorite no longer exists.");
  if (favorite.userId !== user.id) throw new AppError("FORBIDDEN", "You can only remove your own favorites.");

  await db.favorite.delete({ where: { id } });
  return NextResponse.json({ ok: true, id });
});
