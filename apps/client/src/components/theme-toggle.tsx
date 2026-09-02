import { ActionIcon, Tooltip, useComputedColorScheme } from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { useConqrTheme } from "@/features/user/theme/use-conqr-theme.ts";
import classes from "./theme-toggle.module.css";

export function ThemeToggle() {
  const [, setPref] = useConqrTheme();
  const computedColorScheme = useComputedColorScheme();

  return (
    <Tooltip label="Toggle Color Scheme">
      <ActionIcon
        variant="default"
        onClick={() => {
          // Flipping the quick toggle picks the plain Light/Dark theme, like
          // Plane's power-K theme switch; contrast/custom are chosen in
          // Preferences.
          setPref((p) => ({
            ...p,
            theme: computedColorScheme === "light" ? "dark" : "light",
          }));
        }}
        aria-label="Toggle color scheme"
      >
        <IconSun className={classes.light} size={18} stroke={1.5} />
        <IconMoon className={classes.dark} size={18} stroke={1.5} />
      </ActionIcon>
    </Tooltip>
  );
}
