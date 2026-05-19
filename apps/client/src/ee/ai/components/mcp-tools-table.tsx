import {
  Accordion,
  ActionIcon,
  Badge,
  Box,
  Code,
  Collapse,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconCheck,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getMcpToolsCatalog,
  JsonInputSchema,
  JsonSchemaProperty,
  McpToolMeta,
} from "@/ee/ai/services/mcp-service.ts";
import { CopyButton } from "@/components/common/copy-button.tsx";

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

function renderType(prop: JsonSchemaProperty): string {
  if (prop.enum) {
    return prop.enum.map((v) => JSON.stringify(v)).join(" | ");
  }
  if (prop.anyOf?.length) {
    return prop.anyOf.map((p) => renderType(p)).join(" | ");
  }
  const t = prop.type;
  if (Array.isArray(t)) return t.join(" | ");
  return t ?? "any";
}

function constraintNotes(prop: JsonSchemaProperty): string[] {
  const notes: string[] = [];
  if (prop.minimum !== undefined || prop.maximum !== undefined) {
    const min = prop.minimum ?? "−∞";
    const max = prop.maximum ?? "∞";
    notes.push(`range ${min}..${max}`);
  }
  if (prop.minLength !== undefined || prop.maxLength !== undefined) {
    notes.push(`length ${prop.minLength ?? 0}..${prop.maxLength ?? "∞"}`);
  }
  if (prop.format) notes.push(`format ${prop.format}`);
  if (prop.default !== undefined)
    notes.push(`default ${JSON.stringify(prop.default)}`);
  return notes;
}

function exampleArguments(schema: JsonInputSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  for (const [name, prop] of Object.entries(props)) {
    if (!required.has(name) && prop.default === undefined) continue;
    if (prop.default !== undefined) {
      out[name] = prop.default;
      continue;
    }
    out[name] = exampleForType(prop);
  }
  return out;
}

function exampleForType(prop: JsonSchemaProperty): unknown {
  if (prop.enum?.length) return prop.enum[0];
  const t = Array.isArray(prop.type) ? prop.type[0] : prop.type;
  switch (t) {
    case "string":
      if (prop.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      return "...";
    case "integer":
    case "number":
      return prop.minimum ?? 1;
    case "boolean":
      return false;
    default:
      return null;
  }
}

function ToolDetails({ tool }: { tool: McpToolMeta }) {
  const { t } = useTranslation();
  const schema = tool.inputSchema ?? {};
  const props = (schema.properties ?? {}) as Record<string, JsonSchemaProperty>;
  const required = new Set(schema.required ?? []);
  const propNames = Object.keys(props);

  const exampleBody = JSON.stringify(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: tool.name,
        arguments: exampleArguments(schema),
      },
    },
    null,
    2,
  );

  return (
    <Stack gap="sm" pl="md" py="xs">
      <Text size="sm">{tool.description}</Text>

      <div>
        <Text size="xs" fw={600} c="dimmed" mb={4}>
          {t("Arguments")}
        </Text>
        {propNames.length === 0 ? (
          <Text size="xs" c="dimmed" fs="italic">
            {t("This tool takes no arguments.")}
          </Text>
        ) : (
          <Table
            striped
            withTableBorder
            verticalSpacing={4}
            horizontalSpacing="sm"
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: "22%" }}>{t("Name")}</Table.Th>
                <Table.Th style={{ width: "20%" }}>{t("Type")}</Table.Th>
                <Table.Th style={{ width: "12%" }}>{t("Required")}</Table.Th>
                <Table.Th>{t("Description")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {propNames.map((name) => {
                const prop = props[name];
                const notes = constraintNotes(prop);
                return (
                  <Table.Tr key={name}>
                    <Table.Td>
                      <Code>{name}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Code>{renderType(prop)}</Code>
                    </Table.Td>
                    <Table.Td>
                      {required.has(name) ? (
                        <Badge size="xs" color="red" variant="light">
                          {t("required")}
                        </Badge>
                      ) : (
                        <Badge size="xs" color="gray" variant="light">
                          {t("optional")}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        {prop.description && (
                          <Text size="xs">{prop.description}</Text>
                        )}
                        {notes.length > 0 && (
                          <Text size="xs" c="dimmed">
                            {notes.join(" · ")}
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </div>

      <div>
        <Group justify="space-between" align="center" mb={4}>
          <Text size="xs" fw={600} c="dimmed">
            {t("Example tools/call payload")}
          </Text>
          <CopyButton value={exampleBody} timeout={1500}>
            {({ copied, copy }) => (
              <Tooltip
                label={copied ? t("Copied") : t("Copy")}
                withArrow
                position="left"
              >
                <ActionIcon
                  size="sm"
                  color={copied ? "teal" : "gray"}
                  variant="subtle"
                  onClick={copy}
                  aria-label="Copy example"
                >
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
        <Code block style={{ whiteSpace: "pre", fontSize: 12 }}>
          {exampleBody}
        </Code>
      </div>
    </Stack>
  );
}

function ToolRow({ tool }: { tool: McpToolMeta }) {
  const [open, setOpen] = useState(false);
  const props = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  const propCount = Object.keys(props).length;
  const requiredCount = Array.from(required).filter((r) => props[r]).length;

  return (
    <Box
      style={{
        borderBottom: "1px solid var(--mantine-color-gray-3)",
      }}
    >
      <Group
        gap="xs"
        wrap="nowrap"
        py="xs"
        px="sm"
        style={{ cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <ActionIcon size="sm" variant="subtle" aria-label="toggle">
          {open ? (
            <IconChevronDown size={14} />
          ) : (
            <IconChevronRight size={14} />
          )}
        </ActionIcon>
        <Code style={{ flexShrink: 0 }}>{tool.name}</Code>
        <Text size="sm" lineClamp={1} style={{ flex: 1 }}>
          {tool.description}
        </Text>
        <Badge size="xs" variant="light" color="gray">
          {propCount === 0
            ? "no args"
            : requiredCount === 0
              ? `${propCount} opt`
              : `${requiredCount}/${propCount} req`}
        </Badge>
      </Group>
      <Collapse in={open}>
        <ToolDetails tool={tool} />
      </Collapse>
    </Box>
  );
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
    return [...present].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (
        (ia === -1 ? CATEGORY_ORDER.length : ia) -
        (ib === -1 ? CATEGORY_ORDER.length : ib)
      );
    });
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

  return (
    <Stack gap="xs">
      <Group gap="xs" align="baseline">
        <Text size="sm" fw={500}>
          {t("Available tools")}
        </Text>
        <Badge size="sm" variant="light" color="gray">
          {data.length}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed">
        {t(
          "Tools exposed to MCP clients via this server. Click a tool to see its arguments and an example payload. Authorization is enforced per-call using the API key user's workspace and space permissions.",
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
              <Accordion.Panel p={0}>
                {items.map((tool) => (
                  <ToolRow key={tool.name} tool={tool} />
                ))}
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </Stack>
  );
}
