import React from "react";
import { Avatar } from "@mantine/core";
import { getAvatarUrl } from "@/lib/config.ts";
import { avatarThumbnailSize } from "./avatar-thumbnail-size";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";

interface CustomAvatarProps {
  avatarUrl?: string;
  name: string;
  color?: string;
  size?: string | number;
  radius?: string | number;
  variant?: string;
  style?: any;
  component?: any;
  type?: AvatarIconType;
  mt?: string | number;
}

export const CustomAvatar = React.forwardRef<
  HTMLInputElement,
  CustomAvatarProps
>(({ avatarUrl, name, type, ...props }: CustomAvatarProps, ref) => {
  const link = getAvatarUrl(avatarUrl, type);
  // Uploaded user photos come back as small cached thumbnails (LTC-06);
  // external URLs and other image kinds are left as they are.
  const avatarLink =
    link &&
    (type ?? AvatarIconType.AVATAR) === AvatarIconType.AVATAR &&
    !avatarUrl?.startsWith("http")
      ? `${link}?size=${avatarThumbnailSize(props.size)}`
      : link;

  return (
    <Avatar
      ref={ref}
      src={avatarLink}
      name={name}
      alt={name}
      color="initials"
      {...props}
    />
  );
});
