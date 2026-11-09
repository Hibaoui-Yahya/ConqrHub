import { useMemo } from "react";
import { Select, Tooltip } from "@mantine/core";
import { IconSpaces, IconWorld } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import classes from "../styles/chat-input.module.css";

/** Sentinel value meaning "the whole workspace" (no space filter). */
export const SCOPE_ALL = "__all__";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Compact chip-like select that restricts Ask AI to a single space.
 * Mounted only by the full-page composer so the spaces query is not fired
 * by the aside panel or the home prompt.
 */
export default function ChatScopeSelect({ value, onChange }: Props) {
  const { t } = useTranslation();
  const { data: spacesData } = useGetSpacesQuery({ limit: 100 });

  const options = useMemo(
    () => [
      { value: SCOPE_ALL, label: t("Whole workspace") },
      ...(spacesData?.items ?? []).map((space) => ({
        value: space.id,
        label: space.name,
      })),
    ],
    [spacesData, t],
  );

  const isAll = !value || value === SCOPE_ALL;

  return (
    <Tooltip label={t("Scope: limit the answer to one space")} openDelay={400}>
      <Select
        aria-label={t("Scope")}
        size="xs"
        radius="xl"
        variant="default"
        data={options}
        value={isAll ? SCOPE_ALL : value}
        onChange={(v) => onChange(v ?? SCOPE_ALL)}
        allowDeselect={false}
        searchable
        nothingFoundMessage={t("No results found...")}
        leftSection={
          isAll ? <IconWorld size={13} /> : <IconSpaces size={13} />
        }
        leftSectionWidth={26}
        comboboxProps={{ withinPortal: true, shadow: "md", width: 240 }}
        classNames={{
          root: classes.scopeRoot,
          input: classes.scopeInput,
          section: classes.scopeSection,
        }}
      />
    </Tooltip>
  );
}
