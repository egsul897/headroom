/**
 * Feeds page loaders.
 *
 * Review queue: getFeedQueueItems is the authoritative read. A thrown read
 * stays UNKNOWN. Zero PENDING after a successful read is VERIFIED_EMPTY.
 *
 * Connected sources: a registry count is not a probe. Zero rows is
 * VERIFIED_EMPTY. One or more rows stay UNKNOWN. This module does not
 * import a connector and does not call a remote probe, discover, or fetch.
 *
 * IMPLEMENTED ≠ CERTIFIED.
 */

import { getFeedQueueItems } from "@/lib/coherent";
import {
  connectedSourcesStateFromRegistry,
  connectedSourcesStateFromSuccessfulRead,
  reviewQueueStateFromQuery,
  reviewQueueStateFromSuccessfulRead,
  type ConnectedSourcesLoadState,
  type ReviewQueueLoadState,
} from "@/lib/feeds/load-state";
import { prisma } from "@/lib/prisma";

export async function loadFeedsReviewQueue(companyId: string): Promise<ReviewQueueLoadState> {
  try {
    const items = await getFeedQueueItems(companyId);
    return reviewQueueStateFromSuccessfulRead(items);
  } catch {
    return reviewQueueStateFromQuery({ queried: true, outcome: "failed" });
  }
}

export async function loadFeedsConnectedSources(companyId: string): Promise<ConnectedSourcesLoadState> {
  try {
    const recordCount = await prisma.companySourceConnection.count({ where: { companyId } });
    return connectedSourcesStateFromSuccessfulRead(recordCount);
  } catch {
    return connectedSourcesStateFromRegistry({ queried: true, outcome: "failed" });
  }
}
