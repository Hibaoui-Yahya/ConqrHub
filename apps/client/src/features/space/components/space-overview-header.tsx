import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";
import { ISpace } from "@/features/space/types/space.types.ts";
import { useSpaceMembersInfiniteQuery } from "@/features/space/queries/space-query.ts";
import { timeAgo } from "@/lib/time.ts";
import classes from "./space-overview-header.module.css";

const MAX_MEMBER_CHIPS = 12;

/**
 * Plane project-overview identity block for a Hub space: logo tile, name,
 * "slug · created N ago" meta, description (or the italic placeholder Plane
 * shows), and the member chips row.
 */
export default function SpaceOverviewHeader({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const { data: membersData } = useSpaceMembersInfiniteQuery(space.id);

  const members = membersData?.pages.flatMap((p) => p.items) ?? [];
  const totalMembers =
    typeof space.memberCount === "number" ? space.memberCount : members.length;
  const description = space.description?.trim();

  return (
    <div className={classes.root}>
      <div className={classes.identity}>
        <div className={classes.logoTile}>
          <CustomAvatar
            name={space.name}
            avatarUrl={space.logo}
            type={AvatarIconType.SPACE_ICON}
            color="initials"
            variant="filled"
            size="sm"
            radius="sm"
          />
        </div>
        <div className={classes.titleBlock}>
          <h3 className={classes.name}>{space.name}</h3>
          <span className={classes.meta}>
            {space.slug}
            {space.createdAt
              ? ` · ${t("Created")} ${timeAgo(new Date(space.createdAt))}`
              : ""}
          </span>
        </div>
      </div>

      {description ? (
        <p className={classes.description}>{description}</p>
      ) : (
        <p className={classes.placeholder}>
          {t(
            "No description yet. Add one from space settings to tell the team what this space is about.",
          )}
        </p>
      )}

      {members.length > 0 && (
        <div>
          <div className={classes.sectionLabel} style={{ marginBottom: 8 }}>
            {t("Members")} ({totalMembers})
          </div>
          <div className={classes.members}>
            {members.slice(0, MAX_MEMBER_CHIPS).map((member) => (
              <span key={member.id} className={classes.memberChip}>
                <CustomAvatar
                  avatarUrl={
                    member.type === "user" ? member.avatarUrl : undefined
                  }
                  name={member.name}
                  size={18}
                  radius="xl"
                />
                <span className={classes.memberName}>{member.name}</span>
              </span>
            ))}
            {members.length > MAX_MEMBER_CHIPS && (
              <span className={classes.memberChip}>
                +{members.length - MAX_MEMBER_CHIPS}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
