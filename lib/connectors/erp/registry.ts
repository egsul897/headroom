/**
 * ERP provider-adapter registry (ERP-3 scaffold).
 *
 * The ONE place that branches on ErpProviderKind to construct a concrete
 * adapter - the same "one factory, branch on kind once" discipline as
 * lib/connectors/registry.ts's getConnectorForConnection and the
 * inference registry. Callers (ERP-1 sync orchestration, the connect
 * flow, webhook intake) program against ErpProviderAdapter only.
 *
 * Only NETSUITE is registered today (the ERP-3 recommendation; see the
 * design report). Asking for any other kind throws
 * UnsupportedErpProviderError naming what IS registered - fail closed,
 * never a silent undefined adapter.
 */

import { createNetSuiteAdapter, NETSUITE_DESCRIPTOR } from "./providers/netsuite";
import {
  UnsupportedErpProviderError,
  type ErpAdapterDeps,
  type ErpProviderAdapter,
  type ErpProviderDescriptor,
  type ErpProviderKind,
} from "./types";

type ErpAdapterFactory = (deps: ErpAdapterDeps) => ErpProviderAdapter;

const ADAPTER_FACTORIES: ReadonlyMap<ErpProviderKind, ErpAdapterFactory> = new Map<ErpProviderKind, ErpAdapterFactory>([
  ["NETSUITE", (deps) => createNetSuiteAdapter(deps)],
]);

const DESCRIPTORS: readonly ErpProviderDescriptor[] = [NETSUITE_DESCRIPTOR];

export function listRegisteredErpProviders(): readonly ErpProviderKind[] {
  return [...ADAPTER_FACTORIES.keys()];
}

export function listErpProviderDescriptors(): readonly ErpProviderDescriptor[] {
  return DESCRIPTORS;
}

export function getErpProviderAdapter(kind: ErpProviderKind, deps: ErpAdapterDeps = {}): ErpProviderAdapter {
  const factory = ADAPTER_FACTORIES.get(kind);
  if (!factory) {
    throw new UnsupportedErpProviderError(kind, listRegisteredErpProviders());
  }
  return factory(deps);
}
