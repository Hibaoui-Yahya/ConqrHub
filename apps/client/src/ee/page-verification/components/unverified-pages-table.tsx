import {
  Anchor,
  Badge,
  Checkbox,
  Group,
  Skeleton,
  Table,
  Text,
} from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  IUnverifiedPageItem,
  VerificationStatus,
} from "@/ee/page-verification/types/page-verification.types";
import { buildPageUrl } from "@/features/page/page.utils";
import NoTableResults from "@/components/common/no-table-results";

type Props = {
  items?: IUnverifiedPageItem[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onToggle: (pageId: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  emptyText?: string;
};

function statusBadge(
  status: VerificationStatus | null | undefined,
  t: (s: string) => string,
) {
  switch (status) {
    case "expiring":
      return (
        <Badge color="orange" variant="light" size="sm">
          {t("Expiring")}
        </Badge>
      );
    case "expired":
      return (
        <Badge color="red" variant="light" size="sm">
          {t("Expired")}
        </Badge>
      );
    case "draft":
      return (
        <Badge color="gray" variant="light" size="sm">
          {t("Draft")}
        </Badge>
      );
    case "in_approval":
      return (
        <Badge color="blue" variant="light" size="sm">
          {t("In approval")}
        </Badge>
      );
    case "approved":
      return (
        <Badge color="green" variant="light" size="sm">
          {t("Approved")}
        </Badge>
      );
    case "obsolete":
      return (
        <Badge color="red" variant="light" size="sm">
          {t("Obsolete")}
        </Badge>
      );
    case "none":
    default:
      return (
        <Badge color="gray" variant="outline" size="sm">
          {t("Never verified")}
        </Badge>
      );
  }
}

function fmtDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <Table.Tr key={i}>
          <Table.Td>
            <Skeleton height={16} width={16} />
          </Table.Td>
          <Table.Td>
            <Skeleton height={14} width={180} mb={4} />
            <Skeleton height={10} width={100} />
          </Table.Td>
          <Table.Td>
            <Skeleton height={20} width={70} />
          </Table.Td>
          <Table.Td>
            <Skeleton height={14} width={110} />
          </Table.Td>
          <Table.Td>
            <Skeleton height={14} width={90} />
          </Table.Td>
        </Table.Tr>
      ))}
    </>
  );
}

export default function UnverifiedPagesTable({
  items,
  isLoading,
  selectedIds,
  onToggle,
  onToggleAll,
  emptyText,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || undefined;

  const all = items ?? [];
  const selectedCount = all.filter((p) => selectedIds.has(p.id)).length;
  const allChecked = all.length > 0 && selectedCount === all.length;
  const indeterminate = selectedCount > 0 && !allChecked;

  return (
    <Table.ScrollContainer minWidth={700}>
      <Table highlightOnHover verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={36}>
              <Checkbox
                size="xs"
                aria-label={t("Select all")}
                checked={allChecked}
                indeterminate={indeterminate}
                disabled={all.length === 0}
                onChange={(e) => onToggleAll(e.currentTarget.checked)}
              />
            </Table.Th>
            <Table.Th>{t("Page")}</Table.Th>
            <Table.Th>{t("Status")}</Table.Th>
            <Table.Th>{t("Last modified")}</Table.Th>
            <Table.Th>{t("Last verified")}</Table.Th>
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          {isLoading ? (
            <TableSkeleton />
          ) : all.length > 0 ? (
            all.map((item) => {
              const pageUrl = buildPageUrl(
                item.spaceSlug,
                item.slugId,
                item.title ?? undefined,
              );
              const checked = selectedIds.has(item.id);
              return (
                <Table.Tr
                  key={item.id}
                  bg={checked ? "var(--mantine-primary-color-light)" : undefined}
                >
                  <Table.Td>
                    <Checkbox
                      size="xs"
                      aria-label={t("Select page")}
                      checked={checked}
                      onChange={(e) => onToggle(item.id, e.currentTarget.checked)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Anchor
                      size="sm"
                      underline="never"
                      style={{ color: "var(--mantine-color-text)" }}
                      component={Link}
                      to={pageUrl}
                    >
                      <Text fz="sm" fw={500} lineClamp={1}>
                        {item.icon ? `${item.icon} ` : ""}
                        {item.title || t("Untitled")}
                      </Text>
                    </Anchor>
                    <Text fz="xs" c="dimmed" lineClamp={1}>
                      {item.spaceName}
                    </Text>
                  </Table.Td>
                  <Table.Td>{statusBadge(item.status, t)}</Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Text fz="sm" style={{ whiteSpace: "nowrap" }}>
                        {fmtDate(item.updatedAt, locale) || "—"}
                      </Text>
                      {item.updatedByName && (
                        <Text fz="xs" c="dimmed" lineClamp={1}>
                          · {item.updatedByName}
                        </Text>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm" c={item.lastVerifiedAt ? undefined : "dimmed"}>
                      {fmtDate(item.lastVerifiedAt, locale) || t("Never")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              );
            })
          ) : (
            <NoTableResults colSpan={5} text={emptyText} />
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
