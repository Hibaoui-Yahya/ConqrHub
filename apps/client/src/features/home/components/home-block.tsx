import { ReactNode } from "react";
import { Anchor, Badge, Button, Card, Group, Skeleton, Stack, Text } from "@mantine/core";
import type { TablerIcon } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import classes from "./home-block.module.css";

/**
 * The one building block of the Homes: an icon, a title, an optional count,
 * a "see all" link, then at most five rows with one action each. An empty
 * block folds into one line. The same file is copied verbatim into
 * ConqrMeet (src/components/home-block.tsx) — change both together.
 */
export function HomeBlock({
  icon: Icon,
  title,
  count,
  seeAll,
  loading,
  emptyText,
  children,
  isEmpty,
  tone = "default",
  aside,
}: {
  icon: TablerIcon;
  title: string;
  count?: number;
  seeAll?: { label: string; to?: string; href?: string; onClick?: () => void };
  loading?: boolean;
  emptyText: string;
  isEmpty: boolean;
  children?: ReactNode;
  /** "quiet" = tinted (managers-only block), "accent" = brand call to action. */
  tone?: "default" | "quiet" | "accent";
  aside?: ReactNode;
}) {
  return (
    <Card withBorder padding={0} radius="md" className={tone === "default" ? undefined : classes[tone]}>
      <Group gap="xs" px="md" py="sm" wrap="nowrap" className={classes.header}>
        <Icon size={18} color="var(--brand-default)" stroke={1.8} />
        <Text fw={600} size="sm">
          {title}
        </Text>
        {!!count && (
          <Badge size="sm" variant="light" color="yellow" radius="xl">
            {count}
          </Badge>
        )}
        {aside}
        <div style={{ flex: 1 }} />
        {seeAll &&
          (seeAll.to ? (
            <Anchor component={Link} to={seeAll.to} size="xs">
              {seeAll.label}
            </Anchor>
          ) : seeAll.href ? (
            <Anchor href={seeAll.href} target="_blank" rel="noreferrer" size="xs">
              {seeAll.label}
            </Anchor>
          ) : (
            <Anchor component="button" type="button" size="xs" onClick={seeAll.onClick}>
              {seeAll.label}
            </Anchor>
          ))}
      </Group>
      {loading ? (
        <Stack gap={8} p="md" className={classes.body}>
          <Skeleton height={14} />
          <Skeleton height={14} width="70%" />
        </Stack>
      ) : isEmpty ? (
        <Text size="sm" c="dimmed" px="md" py="sm" className={classes.body}>
          {emptyText}
        </Text>
      ) : (
        <div className={classes.body}>{children}</div>
      )}
    </Card>
  );
}

/** One row of a HomeBlock: icon, title, one detail line, one action. */
export function HomeRow({
  icon: Icon,
  title,
  detail,
  to,
  href,
  onOpen,
  action,
  primary,
  badge,
}: {
  icon: TablerIcon;
  title: string;
  detail?: string;
  to?: string;
  href?: string;
  onOpen?: () => void;
  action?: string;
  /** The block's most important action is filled, the others outlined. */
  primary?: boolean;
  /** A status shown before the action (e.g. a meeting status). */
  badge?: { label: string; color: string };
}) {
  const linkProps = to
    ? { component: Link, to }
    : href
      ? { component: "a" as const, href, target: "_blank", rel: "noreferrer" }
      : { component: "button" as const, type: "button" as const };
  return (
    <Group gap="sm" px="md" py={10} wrap="nowrap" className={classes.row}>
      <Icon size={16} stroke={1.7} className={classes.rowIcon} />
      <Anchor {...(linkProps as any)} onClick={onOpen} underline="never" c="inherit" className={classes.rowMain}>
        <Text size="sm" fw={500} truncate>
          {title}
        </Text>
        {detail && (
          <Text size="xs" c="dimmed" truncate>
            {detail}
          </Text>
        )}
      </Anchor>
      {badge && (
        <Badge size="sm" variant="light" color={badge.color}>
          {badge.label}
        </Badge>
      )}
      {action && (
        <Button
          size="compact-sm"
          variant={primary ? "filled" : "default"}
          {...(linkProps as any)}
          onClick={onOpen}
        >
          {action}
        </Button>
      )}
    </Group>
  );
}
