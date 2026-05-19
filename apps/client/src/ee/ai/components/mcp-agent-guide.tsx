import {
  Accordion,
  ActionIcon,
  Anchor,
  Box,
  Code,
  Group,
  List,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Trans, useTranslation } from "react-i18next";
import { CopyButton } from "@/components/common/copy-button.tsx";

interface McpAgentGuideProps {
  mcpUrl: string;
}

function CodeBlock({ code }: { code: string }) {
  return (
    <Box style={{ position: "relative" }}>
      <Code block style={{ whiteSpace: "pre", paddingRight: 40, fontSize: 12 }}>
        {code}
      </Code>
      <Box style={{ position: "absolute", top: 6, right: 6 }}>
        <CopyButton value={code} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy"} withArrow position="left">
              <ActionIcon
                size="sm"
                color={copied ? "teal" : "gray"}
                variant="subtle"
                onClick={copy}
                aria-label="Copy"
              >
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Box>
    </Box>
  );
}

export default function McpAgentGuide({ mcpUrl }: McpAgentGuideProps) {
  const { t } = useTranslation();

  const initRequest = `curl -X POST ${mcpUrl} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": { "name": "my-agent", "version": "1.0.0" }
    }
  }'`;

  const initResponse = `{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": { "tools": {} },
    "serverInfo": { "name": "ConqrHub MCP", "version": "0.80.1" }
  }
}`;

  const listRequest = `curl -X POST ${mcpUrl} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'`;

  const callRequest = `curl -X POST ${mcpUrl} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search_pages",
      "arguments": { "query": "incident review", "limit": 5 }
    }
  }'`;

  const callResponse = `{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[ { \\"id\\": \\"019e...\\", \\"title\\": \\"Q1 Incident Review\\", \\"slugId\\": \\"abc123\\", \\"excerpt\\": \\"...\\" } ]"
      }
    ]
  }
}`;

  const errorResponse = `{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      { "type": "text", "text": "Error: You do not have access to this page" }
    ],
    "isError": true
  }
}`;

  const tsClient = `// npm i @modelcontextprotocol/sdk
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("${mcpUrl}"),
  {
    requestInit: {
      headers: { Authorization: \`Bearer \${process.env.CONQRHUB_API_KEY}\` },
    },
  },
);

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const result = await client.callTool({
  name: "search_pages",
  arguments: { query: "onboarding", limit: 5 },
});`;

  const pythonClient = `# pip install mcp
import asyncio, os
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def main():
    headers = {"Authorization": f"Bearer {os.environ['CONQRHUB_API_KEY']}"}
    async with streamablehttp_client("${mcpUrl}", headers=headers) as (r, w, _):
        async with ClientSession(r, w) as session:
            await session.initialize()
            tools = await session.list_tools()
            result = await session.call_tool(
                "search_pages", {"query": "onboarding", "limit": 5}
            )
            print(result)

asyncio.run(main())`;

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t("Agent integration guide")}
      </Text>
      <Text size="xs" c="dimmed">
        <Trans
          i18nKey="Use this if you're building a custom agent against the JSON-RPC endpoint instead of plugging into Claude Desktop, Cursor, or VS Code. The endpoint speaks <code>MCP</code> over HTTP — one POST per request, JSON-RPC 2.0 framing."
          components={{ code: <Code /> }}
        />
      </Text>

      <Accordion variant="separated" multiple>
        <Accordion.Item value="overview">
          <Accordion.Control>{t("1. Endpoint & authentication")}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Text size="sm">{t("Send all requests as POST to:")}</Text>
              <CodeBlock code={mcpUrl} />
              <Text size="sm">
                <Trans
                  i18nKey="Authenticate with an API key as a bearer token. Create one in <anchor>Account Settings → API Keys</anchor>. The key carries the user's identity — every tool call runs with that user's workspace and space permissions, exactly as if they were using the web UI."
                  components={{
                    anchor: <Anchor href="/settings/account/api-keys" size="sm" />,
                  }}
                />
              </Text>
              <CodeBlock code={`Authorization: Bearer YOUR_API_KEY`} />
              <Text size="xs" c="dimmed">
                {t(
                  "Keys expire 30 days after creation by default. If you get HTTP 401 Unauthorized, rotate the key.",
                )}
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="handshake">
          <Accordion.Control>{t("2. Handshake — initialize")}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Text size="sm">
                <Trans
                  i18nKey="Send <code>initialize</code> first. The server negotiates the protocol version: supported versions are <code>2025-06-18</code>, <code>2025-03-26</code>, and <code>2024-11-05</code>. If your client requests one of those it is echoed back, otherwise the latest is returned."
                  components={{ code: <Code /> }}
                />
              </Text>
              <Text size="xs" fw={600} c="dimmed">
                {t("Request")}
              </Text>
              <CodeBlock code={initRequest} />
              <Text size="xs" fw={600} c="dimmed">
                {t("Response")}
              </Text>
              <CodeBlock code={initResponse} />
              <Text size="xs" c="dimmed">
                <Trans
                  i18nKey="Per the MCP spec you should also send a <code>notifications/initialized</code> notification after initialize; this server accepts it but treats it as a no-op."
                  components={{ code: <Code /> }}
                />
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="discover">
          <Accordion.Control>
            {t("3. Discover available tools — tools/list")}
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Text size="sm">
                <Trans
                  i18nKey="Each tool comes back with a JSON Schema (draft 2020-12, <code>io: input</code>) describing its arguments. Use this to constrain what your model is allowed to call."
                  components={{ code: <Code /> }}
                />
              </Text>
              <CodeBlock code={listRequest} />
              <Text size="xs" c="dimmed">
                {t(
                  "The Available tools section below lists every tool with its arguments and an example payload — same data your client will receive from tools/list.",
                )}
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="call">
          <Accordion.Control>{t("4. Call a tool — tools/call")}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Text size="xs" fw={600} c="dimmed">
                {t("Request")}
              </Text>
              <CodeBlock code={callRequest} />
              <Text size="xs" fw={600} c="dimmed">
                {t("Response (success)")}
              </Text>
              <CodeBlock code={callResponse} />
              <Text size="sm">
                <Trans
                  i18nKey="The result is always <code>{ content: [{ type: 'text', text }] }</code>. For non-string tool results the text is JSON-stringified; parse it client-side."
                  components={{ code: <Code /> }}
                />
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="errors">
          <Accordion.Control>{t("5. Errors")}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Text size="sm">
                <Trans
                  i18nKey="Permission or business-logic failures are returned as a result with <code>isError: true</code> — your agent gets the message back so the model can recover. Truly fatal errors (bad JSON, unknown method) come back as a JSON-RPC <code>error</code>."
                  components={{ code: <Code /> }}
                />
              </Text>
              <CodeBlock code={errorResponse} />
              <Text size="xs" fw={600} c="dimmed">
                {t("HTTP-level statuses")}
              </Text>
              <Table withTableBorder verticalSpacing={4} horizontalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("Status")}</Table.Th>
                    <Table.Th>{t("Meaning")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>
                      <Code>200</Code>
                    </Table.Td>
                    <Table.Td>
                      {t(
                        "Success. Inspect the body for result vs error / isError.",
                      )}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>
                      <Code>401</Code>
                    </Table.Td>
                    <Table.Td>
                      {t(
                        "Missing, malformed, or expired API key. Rotate and retry.",
                      )}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>
                      <Code>403</Code>
                    </Table.Td>
                    <Table.Td>
                      {t(
                        "MCP is disabled for this workspace, or the EE MCP feature is not licensed. Ask a workspace admin.",
                      )}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>
                      <Code>404</Code>
                    </Table.Td>
                    <Table.Td>
                      {t(
                        "Wrong URL. The endpoint is /mcp, not /api/mcp or /mcp/stream.",
                      )}
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="sdk">
          <Accordion.Control>{t("6. SDK examples")}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Text size="xs" fw={600} c="dimmed">
                {t("TypeScript / Node — official MCP SDK")}
              </Text>
              <CodeBlock code={tsClient} />
              <Text size="xs" fw={600} c="dimmed">
                {t("Python — official MCP SDK")}
              </Text>
              <CodeBlock code={pythonClient} />
              <Text size="xs" c="dimmed">
                <Trans
                  i18nKey="Both SDKs handle the JSON-RPC framing, the initialize handshake, and reconnects automatically. For a one-shot script you can also POST JSON-RPC requests directly with <code>fetch</code> / <code>requests</code> as in steps 2–4."
                  components={{ code: <Code /> }}
                />
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="guardrails">
          <Accordion.Control>
            {t("7. Guardrails for agent authors")}
          </Accordion.Control>
          <Accordion.Panel>
            <List size="sm" spacing={4}>
              <List.Item>
                <Trans
                  i18nKey="Tools tagged <code>(write)</code> mutate the workspace. Only call them after explicit user confirmation. Bulk operations are the agent's responsibility — there is no transactional rollback."
                  components={{ code: <Code /> }}
                />
              </List.Item>
              <List.Item>
                <Trans
                  i18nKey="<code>delete_page</code> is a soft delete (trash). Pages are recoverable from the UI for 30 days. There is no permanent-delete tool over MCP by design."
                  components={{ code: <Code /> }}
                />
              </List.Item>
              <List.Item>
                {t(
                  "Permissions are enforced server-side per call. Probing access by calling a tool is safe — failures return as isError messages, never as silent partial success.",
                )}
              </List.Item>
              <List.Item>
                <Trans
                  i18nKey="<code>get_page</code> caps content at 8000 characters. For long pages, paginate by following <code>list_child_pages</code> or by reading the page hierarchy."
                  components={{ code: <Code /> }}
                />
              </List.Item>
              <List.Item>
                <Trans
                  i18nKey="<code>list_*</code> tools cap <code>limit</code> at 20 or 50. Loop and re-issue with a different starting point (parent page, space, parent comment) rather than asking for more in one call."
                  components={{ code: <Code /> }}
                />
              </List.Item>
              <List.Item>
                {t(
                  "Treat every tool description as the source of truth. Tools may be added or removed between deploys; rebuild your model's tool list from tools/list at the start of each session rather than hardcoding it.",
                )}
              </List.Item>
            </List>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
