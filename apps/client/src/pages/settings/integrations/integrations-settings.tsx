import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  Group,
  Select,
  TextInput,
  Button,
  Table,
  Badge,
  Text,
  ActionIcon,
  Stack,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import {
  getAllMappings,
  setMapping,
  removeMapping,
} from "@/features/integration/services/integration-service.ts";

/**
 * Admin config for the Conqr ↔ Plane integration (blueprint §8.3): map Plane
 * projects to ConqrHub spaces (one primary + optional secondary). Styled with
 * SettingsTitle + Table like every other settings page so paramètres stay
 * consistent across the app.
 */
export default function IntegrationsSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();

  const { data: spacesPage } = useGetSpacesQuery({ limit: 100 } as any);
  const { data: mappings } = useQuery({
    queryKey: ["integration-mappings-all"],
    queryFn: getAllMappings,
  });

  const spaces = spacesPage?.items ?? [];
  const spaceName = useMemo(() => {
    const m = new Map<string, string>();
    spaces.forEach((s: any) => m.set(s.id, s.name));
    return m;
  }, [spaces]);

  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [kind, setKind] = useState<string | null>("primary");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["integration-mappings-all"] });

  const createMutation = useMutation({
    mutationFn: setMapping,
    onSuccess: () => {
      notifications.show({ message: t("Mapping saved") });
      setProjectId("");
      invalidate();
    },
    onError: () =>
      notifications.show({ color: "red", message: t("Failed to save mapping") }),
  });

  const removeMutation = useMutation({
    mutationFn: removeMapping,
    onSuccess: invalidate,
  });

  const canAdd = isAdmin && spaceId && projectId.trim();

  return (
    <>
      <Helmet>
        <title>
          {t("Integrations")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Integrations")} />

      <Text size="sm" c="var(--txt-tertiary)" mb="md">
        {t(
          "Map Plane projects to ConqrHub spaces so work and documentation link across the suite.",
        )}
      </Text>

      {isAdmin && (
        <Group align="flex-end" mb="lg" gap="sm" wrap="wrap">
          <Select
            label={t("ConqrHub space")}
            placeholder={t("Select space")}
            data={spaces.map((s: any) => ({ value: s.id, label: s.name }))}
            value={spaceId}
            onChange={setSpaceId}
            searchable
            w={220}
          />
          <TextInput
            label={t("Plane project ID")}
            placeholder="project_…"
            value={projectId}
            onChange={(e) => setProjectId(e.currentTarget.value)}
            w={220}
          />
          <Select
            label={t("Type")}
            data={["primary", "secondary"]}
            value={kind}
            onChange={setKind}
            w={140}
          />
          <Button
            disabled={!canAdd}
            loading={createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                spaceId: spaceId as string,
                planeProjectId: projectId.trim(),
                mappingKind: (kind as "primary" | "secondary") ?? "primary",
              })
            }
          >
            {t("Add mapping")}
          </Button>
        </Group>
      )}

      {mappings && mappings.length > 0 ? (
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Space")}</Table.Th>
              <Table.Th>{t("Plane project")}</Table.Th>
              <Table.Th>{t("Type")}</Table.Th>
              {isAdmin && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {mappings.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>{spaceName.get(m.spaceId) ?? m.spaceId}</Table.Td>
                <Table.Td>
                  <Text ff="monospace" size="sm">
                    {m.planeProjectId}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={m.mappingKind === "primary" ? "brand" : "gray"}
                  >
                    {m.mappingKind}
                  </Badge>
                </Table.Td>
                {isAdmin && (
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={t("Remove")}
                      onClick={() => removeMutation.mutate(m.id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Stack align="center" py="lg">
          <Text size="sm" c="var(--txt-tertiary)">
            {t("No project mappings yet.")}
          </Text>
        </Stack>
      )}
    </>
  );
}
