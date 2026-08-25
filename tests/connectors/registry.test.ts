/**
 * Source-connection registry: connectSource validates+resolves per connector
 * type, is idempotent per (companyId, connectorType), and
 * getConnectorForConnection is the one factory branching on ConnectorType.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { connectSource, getConnectorForConnection, listCompanySourceConnections, UnsupportedConnectorConfigError } from "../../lib/connectors/registry";
import { EdgarConnector } from "../../lib/connectors/edgar-connector";
import { CsvFinancialConnector } from "../../lib/connectors/csv-financial-connector";

const COMPANY_ID = "fixture-registry-co";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("connectSource + getConnectorForConnection", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Registry Co (synthetic, test-only)" } });
  });

  afterAll(async () => {
    await teardown();
  });

  it("EDGAR requires config.ticker and fails closed without one", async () => {
    await expect(connectSource({ companyId: COMPANY_ID, connectorType: "EDGAR", config: {} })).rejects.toBeInstanceOf(UnsupportedConnectorConfigError);
  });

  it("EDGAR fails closed on an unresolvable ticker, storing NOTHING (never a half-connected row with a guessed CIK)", async () => {
    await expect(connectSource({ companyId: COMPANY_ID, connectorType: "EDGAR", config: { ticker: "ZZZZZZ-not-real" } })).rejects.toThrow(/was not found/);
    const connections = await listCompanySourceConnections(COMPANY_ID);
    expect(connections.find((c) => c.connectorType === "EDGAR")).toBeUndefined();
  }, 30000);

  it("EDGAR connects for real, resolving+storing the CIK via a real SEC.gov call", async () => {
    const connection = await connectSource({ companyId: COMPANY_ID, connectorType: "EDGAR", config: { ticker: "F" } });
    expect(connection.connectorType).toBe("EDGAR");
    expect(connection.status).toBe("CONNECTED");
    expect(connection.capabilities).toContain("DOCUMENTS");
    const config = connection.config as { cik: string; ticker: string; title: string };
    expect(config.cik).toBe("0000037996");
    expect(config.title.toUpperCase()).toContain("FORD");
    // No credential of any kind was ever stored - EDGAR needs none.
    expect(connection.credentialRef).toBeNull();
  }, 30000);

  it("connectSource is idempotent per (companyId, connectorType) - reconnecting updates the SAME row, never a second one", async () => {
    const first = await connectSource({ companyId: COMPANY_ID, connectorType: "CSV_FINANCIAL" });
    const second = await connectSource({ companyId: COMPANY_ID, connectorType: "CSV_FINANCIAL" });
    expect(first.id).toBe(second.id);
    const connections = await listCompanySourceConnections(COMPANY_ID);
    expect(connections.filter((c) => c.connectorType === "CSV_FINANCIAL")).toHaveLength(1);
  });

  it("getConnectorForConnection returns a real EdgarConnector for an EDGAR connection", async () => {
    const connection = await prisma.companySourceConnection.findFirstOrThrow({ where: { companyId: COMPANY_ID, connectorType: "EDGAR" } });
    const connector = getConnectorForConnection(connection);
    expect(connector).toBeInstanceOf(EdgarConnector);
  });

  it("getConnectorForConnection returns a real CsvFinancialConnector for a CSV_FINANCIAL connection", async () => {
    const connection = await prisma.companySourceConnection.findFirstOrThrow({ where: { companyId: COMPANY_ID, connectorType: "CSV_FINANCIAL" } });
    const connector = getConnectorForConnection(connection);
    expect(connector).toBeInstanceOf(CsvFinancialConnector);
  });

  it("getConnectorForConnection throws a clear error for an EDGAR connection with no resolved cik in config (fail closed, never a guessed CIK)", () => {
    const brokenConnection = { id: "broken", companyId: COMPANY_ID, connectorType: "EDGAR" as const, config: {} } as never;
    expect(() => getConnectorForConnection(brokenConnection)).toThrow(UnsupportedConnectorConfigError);
  });
});
