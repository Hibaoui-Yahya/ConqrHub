import { ReactNode } from "react";
import { Button } from "@mantine/core";
import { Link, useNavigate } from "react-router-dom";
import { IconFileDescription } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import classes from "./page-list.module.css";

export interface PageListItem {
  id: string;
  to: string;
  icon?: ReactNode;
  title: string;
  spaceName?: string;
  spaceTo?: string;
  date: string;
}

interface PageListProps {
  items: PageListItem[];
  hasNextPage?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

/**
 * Plane-style dense page list: 44px hover rows with a truncated title and a
 * right-aligned metadata strip (space pill + timestamp) in Plane's 20px
 * hairline-pill geometry. Shared by the recent/favorites/created-by-me lists.
 */
export default function PageList({
  items,
  hasNextPage,
  isLoadingMore,
  onLoadMore,
}: PageListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div>
      <ul className={classes.list}>
        {items.map((item) => (
          <li key={item.id}>
            <Link to={item.to} className={classes.row}>
              <span className={classes.icon}>
                {item.icon || <IconFileDescription size={16} />}
              </span>
              <span className={classes.title}>
                {item.title || t("Untitled")}
              </span>
              <span className={classes.meta}>
                {item.spaceName && (
                  /* span, not <a>: the row itself is a Link and nested
                     anchors are invalid HTML */
                  <span
                    className={classes.pill}
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      if (!item.spaceTo) return;
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(item.spaceTo);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && item.spaceTo) {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(item.spaceTo);
                      }
                    }}
                  >
                    {item.spaceName}
                  </span>
                )}
                <span className={classes.date}>{item.date}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <Button
          variant="subtle"
          fullWidth
          mt="sm"
          mb="xl"
          onClick={onLoadMore}
          loading={isLoadingMore}
        >
          {t("Load more")}
        </Button>
      )}
    </div>
  );
}
