/**
 * GET /api/coach/context
 * Returns the verified CoachContext (sanitized) for the authenticated user.
 * The UI uses this to render the "Here's your nutrition day so far" panel
 * without regenerating it per render — backend caching + invalidation apply.
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { getCoachContext } from "@/lib/coach/context-builder";

export const GET = withApi("coach_context", async () => {
  const user = await requireUser();
  const { context } = await getCoachContext(user.id);
  return NextResponse.json({ context });
});
