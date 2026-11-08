import { connection } from "next/server";

/**
 * Set SKIP_BUILD_PRERENDER=1 when the database isn't reachable from the build
 * machine. Pages are then rendered on the first request instead of at build
 * time (no ISR caching), so the build never touches the database.
 */
export async function renderAtRequestIfConfigured(): Promise<void> {
  if (process.env.SKIP_BUILD_PRERENDER === "1") await connection();
}
