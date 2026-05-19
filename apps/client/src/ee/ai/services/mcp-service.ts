import api from "@/lib/api-client.ts";

export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  anyOf?: JsonSchemaProperty[];
  // arbitrary extra fields (additionalProperties, items, etc.)
  [key: string]: unknown;
}

export interface JsonInputSchema {
  type?: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface McpToolMeta {
  name: string;
  description: string;
  category: string;
  inputSchema: JsonInputSchema;
}

export async function getMcpToolsCatalog(): Promise<McpToolMeta[]> {
  const res = await api.get<{ tools: McpToolMeta[] }>("/ai/mcp/tools");
  return res.data.tools;
}
