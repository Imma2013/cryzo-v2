export type AppView = "chat" | "autonomous" | "apps" | "billing" | "analytics";

export type ToolkitConnection = {
  slug: string;
  name: string;
  logo?: string;
  isConnected: boolean;
  connectedAccountId?: string;
};

export type ConnectionsResponse = {
  toolkits?: ToolkitConnection[];
};
