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
import { IconPlus, IconSearch, IconSettings } from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import {
  useCreateRelationshipMutation,
  useCreateWorkItemFromHubMutation,
  useSearchWorkItems,
} from "@/features/integration/queries/integration-query";
import useUserRole from "@/hooks/use-user-role";
import { useTranslation } from "react-i18next";

/**
 * Link an existing Plane work item to the current Hub object, or create a new
 * one from it (blueprint §5.1A/C). Opened from the Knowledge panel.
 */
const PRIORITIES = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" },
];

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
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
          notifications.show({ message: t("Linked work item") });
          onClose();
        },
        onError: () =>
          notifications.show({ color: "red", message: t("Failed to link") }),
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
                ? t("Work item created and linked")
                : res.warning ?? t("Created; link failed"),
          });
          setTitle("");
          onClose();
        },
        onError: () =>
          notifications.show({ color: "red", message: t("Failed to create") }),
      },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Link or create work item")} centered>
      {noProject && (
        <Alert color="yellow" variant="light" mb="sm" radius="sm">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              {t("This space isn't mapped to a Plane project yet, so work items can't be resolved.")}
              {!isAdmin && ` ${t("Ask an admin to set a project mapping.")}`}
            </Text>
            {isAdmin && (
              <Button
                size="xs"
                variant="light"
                color="yellow"
                leftSection={<IconSettings size={14} />}
                onClick={() => {
                  onClose();
                  navigate("/settings/integrations");
                }}
              >
                {t("Set up mapping")}
              </Button>
            )}
          </Stack>
        </Alert>
      )}
      <Tabs defaultValue={initialTitle ? "create" : "link"}>
        <Tabs.List>
          <Tabs.Tab value="link" leftSection={<IconSearch size={14} />}>
            {t("Link existing")}
          </Tabs.Tab>
          <Tabs.Tab value="create" leftSection={<IconPlus size={14} />}>
            {t("Create new")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="link" pt="sm">
          <TextInput
            placeholder={t("Search work items…")}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            disabled={noProject}
          />
          <ScrollArea.Autosize mah={280} mt="xs">
            <Stack gap={4}>
              {isFetching && (
                <Text size="sm" c="var(--txt-tertiary)" p="xs">
                  {t("Searching…")}
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
                    {t("No matching work items.")}
                  </Text>
                )}
            </Stack>
          </ScrollArea.Autosize>
        </Tabs.Panel>

        <Tabs.Panel value="create" pt="sm">
          <Stack gap="sm">
            <TextInput
              label={t("Title")}
              placeholder={t("Work item title")}
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              required
            />
            <Select
              label={t("Priority")}
              placeholder={t("None")}
              data={PRIORITIES.map((p) => ({ value: p.value, label: t(p.label) }))}
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
                {t("Create & link")}
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
