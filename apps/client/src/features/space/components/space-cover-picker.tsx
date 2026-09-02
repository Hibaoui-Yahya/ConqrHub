import { useMemo, useState } from "react";
import { Button, FileButton, Group, Popover, Tabs, Text } from "@mantine/core";
import { IconPhoto, IconTrash, IconUpload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { ISpace } from "@/features/space/types/space.types.ts";
import { useUpdateSpaceMutation } from "@/features/space/queries/space-query.ts";
import {
  uploadSpaceCover,
  removeSpaceCover,
} from "@/features/attachments/services/attachment-service.ts";
import {
  STATIC_COVER_KEYS,
  defaultCoverKey,
  getSpaceCoverUrl,
  isStaticCover,
  staticCoverUrl,
} from "@/features/space/lib/space-cover.ts";
import classes from "./space-cover-picker.module.css";

interface SpaceCoverPickerProps {
  space: ISpace;
  readOnly?: boolean;
  /* called after any change so the caller can refetch / invalidate */
  onChanged: () => Promise<void> | void;
}

/**
 * Plane's ImagePickerPopover (Images | Upload tabs) over a wide cover
 * preview, as used in project settings. Stock covers apply immediately;
 * uploads go through the `space-cover` attachment type.
 */
export default function SpaceCoverPicker({
  space,
  readOnly,
  onChanged,
}: SpaceCoverPickerProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const updateSpaceMutation = useUpdateSpaceMutation();

  const selectedKey = useMemo(() => {
    if (isStaticCover(space.coverImage)) return space.coverImage as string;
    if (!space.coverImage) return defaultCoverKey(space.id);
    return null; // uploaded cover
  }, [space.coverImage, space.id]);

  const filePreview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  const pickStatic = async (key: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateSpaceMutation.mutateAsync({
        spaceId: space.id,
        coverImage: key,
      });
      await onChanged();
      setOpened(false);
    } catch {
      // mutation already toasts
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadSpaceCover(file, space.id);
      await onChanged();
      setFile(null);
      setOpened(false);
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

          <Popover
            opened={opened}
            onChange={setOpened}
            position="top-end"
            width={380}
            shadow="none"
            withinPortal
          >
            <Popover.Target>
              <Button
                size="xs"
                variant="white"
                color="dark"
                leftSection={<IconPhoto size={14} />}
                onClick={() => setOpened((o) => !o)}
              >
                {t("Change cover")}
              </Button>
            </Popover.Target>
            <Popover.Dropdown className={classes.dropdown}>
              <Tabs defaultValue="images">
                <Tabs.List>
                  <Tabs.Tab value="images">{t("Images")}</Tabs.Tab>
                  <Tabs.Tab value="upload">{t("Upload")}</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="images">
                  <div className={classes.grid}>
                    {STATIC_COVER_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        aria-label={key}
                        aria-pressed={selectedKey === key}
                        className={
                          selectedKey === key
                            ? `${classes.tile} ${classes.tileSelected}`
                            : classes.tile
                        }
                        onClick={() => pickStatic(key)}
                        disabled={busy}
                      >
                        <img src={staticCoverUrl(key)} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </Tabs.Panel>

                <Tabs.Panel value="upload">
                  <FileButton
                    onChange={setFile}
                    accept="image/png,image/jpeg"
                    disabled={busy}
                  >
                    {(props) => (
                      <button
                        type="button"
                        className={classes.dropzone}
                        {...props}
                      >
                        {filePreview ? (
                          <img src={filePreview} alt="" />
                        ) : (
                          <>
                            <IconUpload size={18} />
                            <Text size="sm">
                              {t("Click to upload an image")}
                            </Text>
                            <span className={classes.hint}>
                              {t("JPG or PNG, up to 10 MB")}
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </FileButton>
                  <Group justify="flex-end" mt="sm" gap="xs">
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => setFile(null)}
                      disabled={!file || busy}
                    >
                      {t("Clear")}
                    </Button>
                    <Button
                      size="xs"
                      onClick={upload}
                      disabled={!file}
                      loading={busy}
                    >
                      {t("Upload and save")}
                    </Button>
                  </Group>
                </Tabs.Panel>
              </Tabs>
            </Popover.Dropdown>
          </Popover>
        </div>
      )}
    </div>
  );
}
