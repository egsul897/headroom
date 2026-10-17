/**
 * ERP provider registry - the one factory that branches on provider
 * kind. NetSuite (the ERP-3 first provider) resolves; every other
 * surveyed kind fails closed with UnsupportedErpProviderError naming
 * what IS registered - never a silent undefined adapter.
 */
import { describe, expect, it } from "vitest";
import { getErpProviderAdapter, listErpProviderDescriptors, listRegisteredErpProviders } from "../../lib/connectors/erp/registry";
import { UnsupportedErpProviderError } from "../../lib/connectors/erp/types";

describe("getErpProviderAdapter", () => {
  it("resolves the NetSuite adapter", () => {
    const adapter = getErpProviderAdapter("NETSUITE");
    expect(adapter.descriptor.kind).toBe("NETSUITE");
    expect(adapter.descriptor.displayName).toBe("NetSuite");
  });

  it("fails closed for surveyed-but-unimplemented providers", () => {
    for (const kind of ["QUICKBOOKS_ONLINE", "SAP_S4HANA", "ORACLE_ERP_CLOUD", "DYNAMICS_365_FINANCE", "DYNAMICS_365_BUSINESS_CENTRAL"] as const) {
      expect(() => getErpProviderAdapter(kind)).toThrow(UnsupportedErpProviderError);
      expect(() => getErpProviderAdapter(kind)).toThrow(/NETSUITE/);
    }
  });

  it("lists exactly the registered providers and their descriptors", () => {
    expect(listRegisteredErpProviders()).toEqual(["NETSUITE"]);
    expect(listErpProviderDescriptors().map((d) => d.kind)).toEqual(["NETSUITE"]);
  });
});
