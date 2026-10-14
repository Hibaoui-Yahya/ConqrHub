import { Badge } from "@mantine/core";
import {
  IconBuilding,
  IconDeviceDesktop,
  IconUserCircle,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export type SettingsScopeKind = "account" | "company" | "device";

const SCOPES: Record<
  SettingsScopeKind,
  { icon: typeof IconUserCircle; label: string }
> = {
  account: {
    icon: IconUserCircle,
    label: "Your account · everywhere you sign in",
  },
  company: { icon: IconBuilding, label: "Company · applies to every member" },
  device: { icon: IconDeviceDesktop, label: "This device only" },
};

/**
 * Tells the reader where a setting applies. Every settings page shows one
 * under its title; a device-only block repeats it inline.
 */
export function SettingsScope({ scope }: { scope: SettingsScopeKind }) {
  const { t } = useTranslation();
  const { icon: Icon, label } = SCOPES[scope];
  return (
    <Badge
      variant="light"
      color="gray"
      radius="sm"
      size="md"
      tt="none"
      fw={500}
      leftSection={<Icon size={13} stroke={2} />}
      style={{ textTransform: "none" }}
    >
      {t(label)}
    </Badge>
  );
}
