import { useMemo, useState } from "react";
import { Button, FileButton, Group, Popover, Tabs, Text } from "@mantine/core";
import { IconPhoto, IconUpload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  STATIC_COVER_KEYS,
  staticCoverUrl,
} from "@/features/space/lib/space-cover.ts";
import classes from "./space-cover-picker.module.css";

interface CoverPickerPopoverProps {
  /* highlighted stock cover key (null = an uploaded cover is active) */
  selectedKey: string | null;
  onPickStatic: (key: string) => void | Promise<void>;
  /* omit to hide the Upload tab (e.g. before the space exists) */
  onUpload?: (file: File) => void | Promise<void>;
  busy?: boolean;
  disabled?: boolean;
}

/**
 * Plane's ImagePickerPopover: "Change cover" trigger opening Images | Upload
 * tabs. Shared by space settings (SpaceCoverPicker) and the create-space
 * modal header.
 */
export default function CoverPickerPopover({
  selectedKey,
  onPickStatic,
  onUpload,
  busy = false,
  disabled = false,
}: CoverPickerPopoverProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const filePreview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  const pick = async (key: string) => {
    if (busy) return;
    await onPickStatic(key);
    setOpened(false);
  };

  const upload = async () => {
    if (!file || !onUpload) return;
    await onUpload(file);
    setFile(null);
    setOpened(false);
  };

  return (
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
          disabled={disabled}
        >
          {t("Change cover")}
        </Button>
      </Popover.Target>
      <Popover.Dropdown className={classes.dropdown}>
        <Tabs defaultValue="images">
          <Tabs.List>
            <Tabs.Tab value="images">{t("Images")}</Tabs.Tab>
            {onUpload && <Tabs.Tab value="upload">{t("Upload")}</Tabs.Tab>}
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
                  onClick={() => pick(key)}
                  disabled={busy}
                >
                  <img src={staticCoverUrl(key)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </Tabs.Panel>

          {onUpload && (
            <Tabs.Panel value="upload">
              <FileButton
                onChange={setFile}
                accept="image/png,image/jpeg"
                disabled={busy}
              >
                {(props) => (
                  <button type="button" className={classes.dropzone} {...props}>
                    {filePreview ? (
                      <img src={filePreview} alt="" />
                    ) : (
                      <>
                        <IconUpload size={18} />
                        <Text size="sm">{t("Click to upload an image")}</Text>
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
          )}
        </Tabs>
      </Popover.Dropdown>
    </Popover>
  );
}
