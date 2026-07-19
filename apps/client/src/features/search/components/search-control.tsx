import { IconSearch } from "@tabler/icons-react";
import cx from "clsx";
import {
  ActionIcon,
  BoxProps,
  ElementProps,
  Group,
  rem,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import classes from "./search-control.module.css";
import React from "react";
import { useTranslation } from "react-i18next";

interface SearchControlProps extends BoxProps, ElementProps<"button"> {}

export function SearchControl({ className, ...others }: SearchControlProps) {
  const { t } = useTranslation();

  return (
    <UnstyledButton {...others} className={cx(classes.root, className)}>
      <Group gap={8} wrap="nowrap" h="100%" style={{ width: "100%" }}>
        <IconSearch style={{ width: rem(14), height: rem(14), flexShrink: 0 }} stroke={1.5} />
        <Text className={classes.label} truncate>
          {t("Search commands...")}
        </Text>
        <Text className={classes.shortcut}>Ctrl + K</Text>
      </Group>
    </UnstyledButton>
  );
}

interface SearchMobileControlProps {
  onSearch: () => void;
}

export function SearchMobileControl({ onSearch }: SearchMobileControlProps) {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("Search")} withArrow>
      <ActionIcon
        variant="subtle"
        color="dark"
        onClick={onSearch}
        size="sm"
      >
        <IconSearch size={20} stroke={2} />
      </ActionIcon>
    </Tooltip>
  );
}
