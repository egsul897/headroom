/**
 * WS-CKF consumer of WS-EHB acquisition handoff.
 *
 * Does not import EHB exclusive modules. Reads the committed/copied handoff
 * JSON and maps into CKF DiscoveredFilingDocument for acquisition.
 */

import { readFileSync, existsSync } from "node:fs";
import type { DiscoveredFilingDocument } from "../types";

export interface EhbHandoffDocument {
  sourceId: string;
  filing: {
    accessionNumber: string;
    formType: string;
    filingDate: string;
    issuer: { cik: string; ticker?: string; name?: string };
  };
  exhibit: {
    filename: string;
    description: string;
    exhibitType: string;
    sourceUrl: string;
  };
  discoverySignals: string[];
  documentClass?: string;
  ehbQueueId?: string;
  ehbPriority?: number;
  ehbDedupeIdentity?: string;
}

export interface EhbHandoffPackage {
  contractVersion: number;
  producer: string;
  consumer: string;
  fetchableCount: number;
  documents: EhbHandoffDocument[];
  storageNote?: string;
}

export function loadEhbHandoffPackage(path: string): EhbHandoffPackage {
  if (!existsSync(path)) {
    throw new Error(`EHB handoff not found at ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as EhbHandoffPackage;
}

export function handoffToDiscovered(doc: EhbHandoffDocument): DiscoveredFilingDocument {
  return {
    sourceId: doc.sourceId.startsWith("ehb:") ? doc.sourceId : `ehb:${doc.sourceId}`,
    filing: {
      accessionNumber: doc.filing.accessionNumber,
      formType: doc.filing.formType,
      filingDate: doc.filing.filingDate,
      issuer: {
        cik: doc.filing.issuer.cik.padStart(10, "0"),
        ticker: doc.filing.issuer.ticker,
        name: doc.filing.issuer.name,
      },
    },
    exhibit: {
      filename: doc.exhibit.filename,
      description: doc.exhibit.description,
      exhibitType: doc.exhibit.exhibitType,
      sourceUrl: doc.exhibit.sourceUrl,
    },
    discoverySignals: [...(doc.discoverySignals ?? []), "ehb-handoff"],
  };
}
