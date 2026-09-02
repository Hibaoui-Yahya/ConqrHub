import { useMemo, useState } from "react";
import {
  Button,
  ColorInput,
  Group,
  SegmentedControl,
  Select,
  SelectProps,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import {
  CONQR_THEME_OPTIONS,
  ConqrCustomTheme,
  ConqrThemeKey,
  ConqrThemeOption,
  DEFAULT_CUSTOM_THEME,
} from "@/features/user/theme/conqr-theme.ts";
import { useConqrTheme } from "@/features/user/theme/use-conqr-theme.ts";
import { validateHexColor } from "@/lib/theme";
import classes from "./theme-swatch.module.css";

export default function AccountTheme() {
  const { t } = useTranslation();
  const [pref, setPref] = useConqrTheme();

  return (
    <>
      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Text size="md">{t("Theme")}</Text>
          <Text size="sm" c="dimmed">
            {t("Choose your preferred color scheme.")}
          </Text>
        </div>

        <ThemeSwitch
          value={pref.theme}
          onChange={(theme) =>
            setPref((p) => ({
              theme,
              custom:
                theme === "custom"
                  ? (p.custom ?? DEFAULT_CUSTOM_THEME)
                  : p.custom,
            }))
          }
        />
      </Group>

      {pref.theme === "custom" && (
        <CustomThemeSelector
          value={pref.custom ?? DEFAULT_CUSTOM_THEME}
          onApply={(custom) => setPref({ theme: "custom", custom })}
        />
      )}
    </>
  );
}

/* Plane's rotated two-half swatch (theme-switch.tsx). */
function ThemeSwatch({ icon }: { icon: ConqrThemeOption["icon"] }) {
  return (
    <span
      className={classes.swatch}
      style={
        {
          "--swatch-border": icon.border,
          "--swatch-c1": icon.color1,
          "--swatch-c2": icon.color2,
        } as React.CSSProperties
      }
    >
      <span className={classes.half1} />
      <span className={classes.half2} />
    </span>
  );
}

function ThemeSwitch({
  value,
  onChange,
}: {
  value: ConqrThemeKey;
  onChange: (theme: ConqrThemeKey) => void;
}) {
  const { t } = useTranslation();
  const byValue = useMemo(
    () =>
      Object.fromEntries(
        CONQR_THEME_OPTIONS.map((o) => [o.value, o]),
      ) as Record<ConqrThemeKey, ConqrThemeOption>,
    [],
  );
  const current = byValue[value];

  const renderOption: SelectProps["renderOption"] = ({ option }) => {
    const opt = byValue[option.value as ConqrThemeKey];
    return (
      <span className={classes.option}>
        <ThemeSwatch icon={opt.icon} />
        {t(opt.label)}
      </span>
    );
  };

  return (
    <Select
      label={t("Select theme")}
      data={CONQR_THEME_OPTIONS.map((o) => ({
        value: o.value,
        label: t(o.label),
      }))}
      value={value}
      onChange={(v) => v && onChange(v as ConqrThemeKey)}
      allowDeselect={false}
      checkIconPosition="right"
      leftSection={current ? <ThemeSwatch icon={current.icon} /> : null}
      renderOption={renderOption}
      comboboxProps={{ position: "bottom-end", width: 240 }}
      w={240}
    />
  );
}

/* Plane's CustomThemeSelector: palette mode, primary + background, Set theme. */
function CustomThemeSelector({
  value,
  onApply,
}: {
  value: ConqrCustomTheme;
  onApply: (custom: ConqrCustomTheme) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ConqrCustomTheme>(value);

  const valid =
    validateHexColor(draft.primary) && validateHexColor(draft.background);

  const apply = () => {
    if (!valid) {
      notifications.show({
        message: t("Enter valid hex colors, e.g. #3f76ff"),
        color: "red",
      });
      return;
    }
    onApply(draft);
    notifications.show({ message: t("Theme updated") });
  };

  return (
    <div className={classes.customCard}>
      <Stack gap="sm">
        <div>
          <div className={classes.customTitle}>{t("Customize your theme")}</div>
          <div className={classes.customHint}>
            {t(
              "Pick a primary and a background color. The full neutral and accent palettes are generated from them, exactly like ConqrPlan.",
            )}
          </div>
        </div>

        <SegmentedControl
          size="xs"
          w={220}
          value={draft.darkPalette ? "dark" : "light"}
          onChange={(v) => setDraft({ ...draft, darkPalette: v === "dark" })}
          data={[
            { value: "light", label: t("Light palette") },
            { value: "dark", label: t("Dark palette") },
          ]}
        />

        <Group grow align="flex-start">
          <ColorInput
            label={t("Primary color")}
            format="hex"
            value={draft.primary}
            onChange={(primary) => setDraft({ ...draft, primary })}
            swatches={[
              "#3f76ff",
              "#7c3aed",
              "#059669",
              "#ea580c",
              "#dc2626",
              "#0f766e",
            ]}
          />
          <ColorInput
            label={t("Background color")}
            format="hex"
            value={draft.background}
            onChange={(background) => setDraft({ ...draft, background })}
            swatches={[
              "#ffffff",
              "#f5f5f4",
              "#1a1a1a",
              "#0f172a",
              "#111827",
              "#18181b",
            ]}
          />
        </Group>

        <div className={classes.previewRow}>
          <span
            className={classes.previewChip}
            style={{
              background: "var(--bg-accent-primary)",
              color: "var(--txt-on-color)",
            }}
          >
            {t("Accent")}
          </span>
          <span
            className={classes.previewChip}
            style={{
              background: "var(--bg-surface-1)",
              color: "var(--txt-primary)",
            }}
          >
            {t("Surface")}
          </span>
          <span
            className={classes.previewChip}
            style={{
              background: "var(--bg-layer-2)",
              color: "var(--txt-secondary)",
            }}
          >
            {t("Layer")}
          </span>
        </div>

        <Group justify="flex-end">
          <Button size="xs" onClick={apply} disabled={!valid}>
            {t("Set theme")}
          </Button>
        </Group>
      </Stack>
    </div>
  );
}
