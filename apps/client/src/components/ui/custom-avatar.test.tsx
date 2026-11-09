import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { CustomAvatar } from "./custom-avatar";
import { avatarThumbnailSize } from "./avatar-thumbnail-size";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";

/** LTC-06: menus and member lists download a small thumbnail, never the
 *  multi-megabyte original photo. */
describe("avatar thumbnails", () => {
  it("picks the server thumbnail edge for the displayed size on 2x screens", () => {
    expect(avatarThumbnailSize("xs")).toBe(64);
    expect(avatarThumbnailSize("sm")).toBe(64);
    expect(avatarThumbnailSize(undefined)).toBe(128); // Mantine md = 38 px
    expect(avatarThumbnailSize("lg")).toBe(128);
    expect(avatarThumbnailSize("xl")).toBe(256);
    expect(avatarThumbnailSize(24)).toBe(64);
    expect(avatarThumbnailSize(120)).toBe(256);
  });

  it("asks for a thumbnail of uploaded photos only", () => {
    const srcOf = (props: Parameters<typeof CustomAvatar>[0]) =>
      render(
        <MantineProvider>
          <CustomAvatar {...props} />
        </MantineProvider>,
      )
        .container.querySelector("img")
        ?.getAttribute("src");
    expect(
      srcOf({ name: "Marie", avatarUrl: "0f0e8a1c-3c1f-4c55-a1f2-1c2d3e4f5a6b.jpg", size: "sm" }),
    ).toMatch(/\/attachments\/img\/avatar\/0f0e8a1c-3c1f-4c55-a1f2-1c2d3e4f5a6b\.jpg\?size=64$/);
    expect(srcOf({ name: "Paul", avatarUrl: "https://images.example/p.png" })).toBe(
      "https://images.example/p.png",
    );
    expect(
      srcOf({ name: "Espace", avatarUrl: "icon.png", type: AvatarIconType.SPACE_ICON }),
    ).not.toContain("?size=");
  });
});
