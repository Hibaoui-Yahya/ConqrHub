import { useMemo, useState } from "react";
import { Button } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { ISpace } from "@/features/space/types/space.types.ts";
import { useUpdateSpaceMutation } from "@/features/space/queries/space-query.ts";
import {
  uploadSpaceCover,
  removeSpaceCover,
} from "@/features/attachments/services/attachment-service.ts";
import {
  defaultCoverKey,
  getSpaceCoverUrl,
  isStaticCover,
} from "@/features/space/lib/space-cover.ts";
import CoverPickerPopover from "./cover-picker-popover.tsx";
import classes from "./space-cover-picker.module.css";

interface SpaceCoverPickerProps {
  space: ISpace;
  readOnly?: boolean;
  /* called after any change so the caller can refetch / invalidate */
  onChanged: () => Promise<void> | void;
}

/**
 * Space-settings cover row: wide preview with Plane's picker popover over
 * its corner. Stock covers apply immediately; uploads go through the
 * `space-cover` attachment type; Remove falls back to the default cover.
 */
export default function SpaceCoverPicker({
  space,
  readOnly,
  onChanged,
}: SpaceCoverPickerProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const updateSpaceMutation = useUpdateSpaceMutation();

  const selectedKey = useMemo(() => {
    if (isStaticCover(space.coverImage)) return space.coverImage as string;
    if (!space.coverImage) return defaultCoverKey(space.id);
    return null; // uploaded cover
  }, [space.coverImage, space.id]);

  const pickStatic = async (key: string) => {
    setBusy(true);
    try {
      await updateSpaceMutation.mutateAsync({
        spaceId: space.id,
        coverImage: key,
      });
      await onChanged();
    } catch {
      // mutation already toasts
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await uploadSpaceCover(file, space.id);
      await onChanged();
      notifications.show({ message: t("Cover updated") });
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || t("Failed to upload cover"),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeSpaceCover(space.id);
      await onChanged();
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || t("Failed to remove cover"),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={classes.preview}>
      <img
        className={classes.previewImg}
        src={getSpaceCoverUrl(space)}
        alt=""
      />
      <div className={classes.previewScrim} />

      {!readOnly && (
        <div className={classes.previewActions}>
          {space.coverImage && (
            <Button
              size="xs"
              variant="white"
              color="dark"
              leftSection={<IconTrash size={14} />}
              onClick={remove}
              loading={busy}
            >
              {t("Remove")}
            </Button>
          )}
          <CoverPickerPopover
            selectedKey={selectedKey}
            onPickStatic={pickStatic}
            onUpload={upload}
            busy={busy}
          />
        </div>
      )}
    </div>
  );
}
