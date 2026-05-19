import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Code,
  Group,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy, IconInfoCircle } from "@tabler/icons-react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CopyButton } from "@/components/common/copy-button.tsx";

interface McpSetupSnippetsProps {
  mcpUrl: string;
}

function buildSnippets(mcpUrl: string) {
  return {
    claudeDesktop: `{
  "mcpServers": {
    "conqrhub": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpUrl}",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}`,
    claudeCodeHttp: `claude mcp add conqrhub --transport http ${mcpUrl} --header "Authorization: Bearer YOUR_API_KEY"`,
    claudeCodeRemote: `claude mcp add conqrhub -- npx -y mcp-remote ${mcpUrl} --header "Authorization: Bearer YOUR_API_KEY"`,
    cursor: `{
  "mcpServers": {
    "conqrhub": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpUrl}",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}`,
    vscodeWorkspace: `{
  "servers": {
    "conqrhub": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`,
    vscodeUser: `{
  "mcp": {
    "servers": {
      "conqrhub": {
        "type": "http",
        "url": "${mcpUrl}",
        "headers": {
          "Authorization": "Bearer YOUR_API_KEY"
        }
      }
    }
  }
}`,
    langgraph: `# pip install langchain-mcp-adapters langgraph langchain-anthropic
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

client = MultiServerMCPClient({
    "conqrhub": {
        "transport": "streamable_http",
        "url": "${mcpUrl}",
        "headers": {"Authorization": "Bearer YOUR_API_KEY"},
    }
})

async def main():
    tools = await client.get_tools()
    agent = create_react_agent("anthropic:claude-opus-4-7", tools)
    result = await agent.ainvoke({
        "messages": [("user", "List the spaces I have access to.")]
    })
    print(result["messages"][-1].content)

if __name__ == "__main__":
    asyncio.run(main())`,
  };
}

function SnippetBlock({ code }: { code: string }) {
  return (
    <div style={{ position: "relative" }}>
      <Code
        block
        style={{
          maxHeight: 360,
          overflow: "auto",
          paddingRight: 44,
          whiteSpace: "pre",
        }}
      >
        {code}
      </Code>
      <div style={{ position: "absolute", top: 6, right: 6 }}>
        <CopyButton value={code} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy"} withArrow position="left">
              <ActionIcon
                color={copied ? "teal" : "gray"}
                variant="subtle"
                onClick={copy}
                aria-label="Copy snippet"
              >
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </div>
    </div>
  );
}

function SnippetCaption() {
  return (
    <Text size="xs" c="dimmed">
      <Trans
        i18nKey="Replace <code>YOUR_API_KEY</code> with a key from <anchor>Account Settings → API Keys</anchor>."
        components={{
          code: <Code />,
          anchor: <Anchor component={Link} to="/settings/account/api-keys" size="xs" />,
        }}
      />
    </Text>
  );
}

export default function McpSetupSnippets({ mcpUrl }: McpSetupSnippetsProps) {
  const { t } = useTranslation();
  const s = buildSnippets(mcpUrl);

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t("Connect a client")}
      </Text>

      <Tabs defaultValue="claude-desktop" color="dark" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="claude-desktop">Claude Desktop</Tabs.Tab>
          <Tabs.Tab value="claude-code">Claude Code</Tabs.Tab>
          <Tabs.Tab value="cursor">Cursor</Tabs.Tab>
          <Tabs.Tab value="vscode">VS Code</Tabs.Tab>
          <Tabs.Tab value="langgraph">LangGraph</Tabs.Tab>
          <Tabs.Tab
            value="conqrknowledge"
            disabled
            rightSection={
              <Badge size="xs" variant="light" color="gray">
                {t("Soon")}
              </Badge>
            }
          >
            ConqrKnowledge
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="claude-desktop" pt="sm">
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              <Trans
                i18nKey="Edit <code>claude_desktop_config.json</code> in your Claude config folder, then restart Claude Desktop."
                components={{ code: <Code /> }}
              />
            </Text>
            <SnippetBlock code={s.claudeDesktop} />
            <SnippetCaption />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="claude-code" pt="sm">
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              {t("Recommended: native HTTP transport (Claude Code 1.0+).")}
            </Text>
            <SnippetBlock code={s.claudeCodeHttp} />
            <Text size="xs" c="dimmed">
              <Trans
                i18nKey="Fallback via <code>mcp-remote</code> if your version does not accept <code>--transport http</code>:"
                components={{ code: <Code /> }}
              />
            </Text>
            <SnippetBlock code={s.claudeCodeRemote} />
            <Text size="xs" c="dimmed">
              <Trans
                i18nKey="Verify with <code>claude mcp list</code>."
                components={{ code: <Code /> }}
              />
            </Text>
            <SnippetCaption />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="cursor" pt="sm">
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              <Trans
                i18nKey="Create <code>.cursor/mcp.json</code> at your project root, then reload Cursor (Settings → Features → MCP)."
                components={{ code: <Code /> }}
              />
            </Text>
            <SnippetBlock code={s.cursor} />
            <SnippetCaption />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="vscode" pt="sm">
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              <Trans
                i18nKey="Workspace config — <code>.vscode/mcp.json</code> (recommended). Requires VS Code 1.99+."
                components={{ code: <Code /> }}
              />
            </Text>
            <SnippetBlock code={s.vscodeWorkspace} />
            <Text size="xs" c="dimmed">
              <Trans
                i18nKey="Or globally in user <code>settings.json</code>:"
                components={{ code: <Code /> }}
              />
            </Text>
            <SnippetBlock code={s.vscodeUser} />
            <Text size="xs" c="dimmed">
              <Trans
                i18nKey="Verify with the command palette: <code>MCP: List Servers</code>."
                components={{ code: <Code /> }}
              />
            </Text>
            <SnippetCaption />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="langgraph" pt="sm">
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              {t("Python 3.10+. Use this snippet in a LangGraph agent app.")}
            </Text>
            <SnippetBlock code={s.langgraph} />
            <Text size="xs" c="dimmed">
              <Trans
                i18nKey={
                  'For production, read the key from an environment variable (<code>os.environ["CONQRHUB_API_KEY"]</code>).'
                }
                components={{ code: <Code /> }}
              />
            </Text>
            <SnippetCaption />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="conqrknowledge" pt="sm">
          <Alert icon={<IconInfoCircle />} title={t("Coming soon")} color="blue">
            {t(
              "ConqrHub will connect to ConqrKnowledge for retrieval-augmented generation (RAG), GraphRAG, and multimodal search. No setup needed today.",
            )}
          </Alert>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
