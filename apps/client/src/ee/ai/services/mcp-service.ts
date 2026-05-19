import api from "@/lib/api-client.ts";

export interface McpToolMeta {
  name: string;
  description: string;
  category: string;
}

export async function getMcpToolsCatalog(): Promise<McpToolMeta[]> {
  const res = await api.get<{ tools: McpToolMeta[] }>("/ai/mcp/tools");
  return res.data.tools;
}
