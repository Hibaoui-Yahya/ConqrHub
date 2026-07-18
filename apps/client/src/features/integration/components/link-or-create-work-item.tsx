import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Modal,
  Stack,
  Tabs,
  TextInput,
  Textarea,
  Select,
  Text,
  ScrollArea,
  UnstyledButton,
  Badge,
  Alert,
} from "@mantine/core";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  useCreateRelationshipMutation,
  useCreateWorkItemFromHubMutation,
  useSearchWorkItems,
} from "@/features/integration/queries/integration-query";

/**
 * Link an existing Plane work item to the current Hub object, or create a new
 * one from it (blueprint §5.1A/C). Opened from the Knowledge panel.
 */
export function LinkOrCreateWorkItem({
  sourceUrn,
  planeProjectId,
  opened,
  onClose,
  initialTitle,
}: {
  sourceUrn: string;
  planeProjectId?: string;
  opened: boolean;
  onClose: () => void;
  /** When set (e.g. from an editor selection), prefill + default to "create". */
  initialTitle?: string;
}) {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const { data: searchData, isFetching } = useSearchWorkItems(
    planeProjectId,
    debounced,
  );
  const linkMutation = useCreateRelationshipMutation();
  const createMutation = useCreateWorkItemFromHubMutation([sourceUrn]);

  const [title, setTitle] = useState(initialTitle ?? "");
  const [priority, setPriority] = useState<string | null>(null);

  useEffect(() => {
    if (opened && initialTitle) setTitle(initialTitle);
  }, [opened, initialTitle]);

  const noProject = !planeProjectId;

  const linkExisting = (targetUrn: string) => {
    linkMutation.mutate(
      { sourceUrn, targetUrn, relationType: "specified_by" },
      {
        onSuccess: () => {
          notifications.show({ message: "Linked work item" });
          onClose();
        },
        onError: () =>
          notifications.show({ color: "red", message: "Failed to link" }),
      },
    );
  };

  const createNew = () => {
    if (!planeProjectId || !title.trim()) return;
    createMutation.mutate(
      { sourceUrn, planeProjectId, title, priority: priority ?? undefined },
      {
        onSuccess: (res) => {
          notifications.show({
            color: res.status === "created" ? "green" : "yellow",
            message:
              res.status === "created"
                ? "Work item created and linked"
                : res.warning ?? "Created; link failed",
          });
          setTitle("");
          onClose();
        },
        onError: () =>
          notifications.show({ color: "red", message: "Failed to create" }),
      },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Link or create work item" centered>
      {noProject && (
        <Alert color="yellow" variant="light" mb="sm" radius="sm">
          This space isn't mapped to a Plane project yet, so work items can't be
          resolved. Ask an admin to set a project mapping.
        </Alert>
      )}
      <Tabs defaultValue={initialTitle ? "create" : "link"}>
        <Tabs.List>
          <Tabs.Tab value="link" leftSection={<IconSearch size={14} />}>
            Link existing
          </Tabs.Tab>
          <Tabs.Tab value="create" leftSection={<IconPlus size={14} />}>
            Create new
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="link" pt="sm">
          <TextInput
            placeholder="Search work items…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            disabled={noProject}
          />
          <ScrollArea.Autosize mah={280} mt="xs">
            <Stack gap={4}>
              {isFetching && (
                <Text size="sm" c="var(--txt-tertiary)" p="xs">
                  Searching…
                </Text>
              )}
              {searchData?.items.map((wi) => (
                <UnstyledButton
                  key={wi.urn}
                  onClick={() => linkExisting(wi.urn)}
                  p="xs"
                  style={{
                    borderRadius: 6,
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <Group gap={8} wrap="nowrap">
                    {wi.key != null && (
                      <Badge size="sm" color="gray" variant="light">
                        #{wi.key}
                      </Badge>
                    )}
                    <Text size="sm" c="var(--txt-primary)" lineClamp={1}>
                      {wi.name}
                    </Text>
                  </Group>
                </UnstyledButton>
              ))}
              {!isFetching &&
                searchData &&
                searchData.items.length === 0 &&
                !noProject && (
                  <Text size="sm" c="var(--txt-tertiary)" p="xs">
                    No matching work items.
                  </Text>
                )}
            </Stack>
          </ScrollArea.Autosize>
        </Tabs.Panel>

        <Tabs.Panel value="create" pt="sm">
          <Stack gap="sm">
            <TextInput
              label="Title"
              placeholder="Work item title"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              required
            />
            <Select
              label="Priority"
              placeholder="None"
              data={["urgent", "high", "medium", "low", "none"]}
              value={priority}
              onChange={setPriority}
              clearable
            />
            <Group justify="flex-end">
              <Button
                onClick={createNew}
                loading={createMutation.isPending}
                disabled={noProject || !title.trim()}
              >
                Create &amp; link
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
