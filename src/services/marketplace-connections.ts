import type { MarketplaceConnection, MarketplaceSource } from "@/types/marketplace";
import { marketplaceConnectionsFixture } from "@/mock/marketplace-connections";

let connections: MarketplaceConnection[] = [...marketplaceConnectionsFixture];

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getMarketplaceConnections(): Promise<MarketplaceConnection[]> {
  await wait();
  return connections;
}

export async function connectMarketplace(source: MarketplaceSource, accountUrl: string): Promise<MarketplaceConnection> {
  await wait(700);
  connections = connections.map((c) =>
    c.source === source ? { ...c, connected: true, accountUrl, connectedAt: new Date().toISOString() } : c
  );
  return connections.find((c) => c.source === source)!;
}

export async function disconnectMarketplace(source: MarketplaceSource): Promise<MarketplaceConnection> {
  await wait();
  connections = connections.map((c) =>
    c.source === source ? { ...c, connected: false, accountUrl: null, connectedAt: null } : c
  );
  return connections.find((c) => c.source === source)!;
}
