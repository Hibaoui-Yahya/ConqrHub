import {
  Accordion,
  Badge,
  Code,
  Group,
  Loader,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  getMcpToolsCatalog,
  McpToolMeta,
} from "@/ee/ai/services/mcp-service.ts";

const CATEGORY_ORDER: string[] = [
  "Search & RAG",
  "Pages (read)",
  "Pages (write)",
  "Spaces (read)",
  "Spaces (write)",
  "Comments (read)",
  "Comments (write)",
  "Attachments",
  "Users",
];

function categoryColor(category: string): string {
  if (category.startsWith("Search")) return "violet";
  if (category.endsWith("(write)")) return "orange";
  if (category.startsWith("Pages")) return "blue";
  if (category.startsWith("Spaces")) return "teal";
  if (category.startsWith("Comments")) return "grape";
  if (category === "Attachments") return "yellow";
  if (category === "Users") return "gray";
  return "gray";
}

function groupTools(tools: McpToolMeta[]): Record<string, McpToolMeta[]> {
  const groups: Record<string, McpToolMeta[]> = {};
  for (const t of tools) {
    (groups[t.category] ??= []).push(t);
  }
  for (const cat of Object.keys(groups)) {
    groups[cat].sort((a, b) => a.name.localeCompare(b.name));
  }
  return groups;
}

export default function McpToolsTable() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["mcp-tools-catalog"],
    queryFn: getMcpToolsCatalog,
    staleTime: 5 * 60 * 1000,
  });

  const grouped = useMemo(() => (data ? groupTools(data) : {}), [data]);
  const orderedCategories = useMemo(() => {
    const present = Object.keys(grouped);
    const ranked = [...present].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (
        (ia === -1 ? CATEGORY_ORDER.length : ia) -
        (ib === -1 ? CATEGORY_ORDER.length : ib)
      );
    });
    return ranked;
  }, [grouped]);

  if (isLoading) {
    return (
      <Group gap="xs" py="sm">
        <Loader size="xs" />
        <Text size="sm" c="dimmed">
          {t("Loading available tools…")}
        </Text>
      </Group>
    );
  }

  if (isError || !data) {
    return (
      <Group gap="xs" py="sm" c="red">
        <IconAlertCircle size={16} />
        <Text size="sm">{t("Could not load the MCP tools catalog.")}</Text>
      </Group>
    );
  }

  const total = data.length;

  return (
    <Stack gap="xs">
      <Group gap="xs" align="baseline">
        <Text size="sm" fw={500}>
          {t("Available tools")}
        </Text>
        <Badge size="sm" variant="light" color="gray">
          {total}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed">
        {t(
          "Tools exposed to MCP clients via this server. Authorization is enforced per-call using the API key's user permissions.",
        )}
      </Text>

      <Accordion
        multiple
        variant="separated"
        defaultValue={orderedCategories.slice(0, 2)}
      >
        {orderedCategories.map((category) => {
          const items = grouped[category];
          return (
            <Accordion.Item key={category} value={category}>
              <Accordion.Control>
                <Group gap="xs" wrap="nowrap">
                  <Badge
                    size="sm"
                    variant="light"
                    color={categoryColor(category)}
                  >
                    {category}
                  </Badge>
                  <Text size="sm" c="dimmed">
                    {items.length}{" "}
                    {items.length === 1 ? t("tool") : t("tools")}
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Table
                  striped
                  highlightOnHover
                  withTableBorder={false}
                  verticalSpacing="xs"
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: "28%" }}>{t("Tool")}</Table.Th>
                      <Table.Th>{t("Description")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.map((tool) => (
                      <Table.Tr key={tool.name}>
                        <Table.Td style={{ verticalAlign: "top" }}>
                          <Code>{tool.name}</Code>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{tool.description}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </Stack>
  );
}
