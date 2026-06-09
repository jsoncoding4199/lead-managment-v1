import { cache } from "react";
import { prisma } from "./prisma";

/**
 * Reads the singleton AppSettings row, creating it on first access with the
 * default maxPickup of 2. Cached per-request via React's cache() so multiple
 * server components on a page share one DB hit.
 */
export const getAppSettings = cache(async () => {
  return prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, maxPickup: 2 },
  });
});
