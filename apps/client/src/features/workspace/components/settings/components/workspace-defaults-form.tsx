import { useState } from "react";
import { useAtom } from "jotai";
import { useForm } from "@mantine/form";
import { Button, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import useUserRole from "@/hooks/use-user-role.tsx";

const LOCALE_OPTIONS = [
  { value: "fr-FR", label: "Français" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
  { value: "de-DE", label: "Deutsch" },
  { value: "nl-NL", label: "Nederlands" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "it-IT", label: "Italiano" },
];

const TIMEZONE_OPTIONS = [
  "America/Toronto",
  "America/Montreal",
  "America/Vancouver",
  "America/Halifax",
  "America/New_York",
  "Europe/Paris",
  "Europe/London",
  "Africa/Casablanca",
  "Asia/Dubai",
  "UTC",
];

interface FormValues {
  defaultLocale: string;
  defaultTimezone: string;
  mailFromName: string;
}

/**
 * Paramètres › Entreprise › Général: defaults for new members and the
 * sender name of suite e-mails. Until now these only existed as deployment
 * variables (DEFAULT_USER_LOCALE, MAIL_FROM_NAME) that owners could not see.
 */
export default function WorkspaceDefaultsForm() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { isAdmin } = useUserRole();
  const [isLoading, setIsLoading] = useState(false);
  const general = workspace?.settings?.general ?? {};

  const form = useForm<FormValues>({
    initialValues: {
      defaultLocale: general.defaultLocale ?? "",
      defaultTimezone: general.defaultTimezone ?? "",
      mailFromName: general.mailFromName ?? "",
    },
  });

  const timezones = Array.from(
    new Set([
      ...TIMEZONE_OPTIONS,
      ...(general.defaultTimezone ? [general.defaultTimezone] : []),
    ]),
  );

  async function handleSubmit(values: FormValues) {
    setIsLoading(true);
    try {
      const updated = await updateWorkspace({
        defaultLocale: values.defaultLocale || undefined,
        defaultTimezone: values.defaultTimezone || undefined,
        mailFromName: values.mailFromName,
      });
      setWorkspace(updated);
      form.resetDirty(values);
      notifications.show({ message: t("Updated successfully") });
    } catch (err) {
      console.error(err);
      notifications.show({
        message: t("Failed to update data"),
        color: "red",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="lg">
        <div>
          <Text fw={600}>{t("Defaults for new members")}</Text>
          <Text size="sm" c="dimmed" mb="sm">
            {t("Each member can then change them in My account › Preferences.")}
          </Text>
          <Group grow align="flex-start">
            <Select
              label={t("Interface language")}
              description={t("Given to accounts created from now on.")}
              placeholder={t("Deployment default")}
              data={LOCALE_OPTIONS}
              readOnly={!isAdmin}
              clearable
              {...form.getInputProps("defaultLocale")}
            />
            <Select
              label={t("Time zone")}
              description={t("Dates of meetings and reports.")}
              placeholder={t("Deployment default")}
              data={timezones.map((tz) => ({ value: tz, label: tz }))}
              searchable
              readOnly={!isAdmin}
              clearable
              {...form.getInputProps("defaultTimezone")}
            />
          </Group>
        </div>

        <div>
          <Text fw={600}>{t("E-mails sent by the suite")}</Text>
          <Text size="sm" c="dimmed" mb="sm">
            {t("Invitations, notifications and shared reports.")}
          </Text>
          <TextInput
            label={t("Sender name")}
            description={t(
              "Shown as the sender of every e-mail. The sending address is managed by ConqrAI.",
            )}
            placeholder={t("Deployment default")}
            maxLength={80}
            readOnly={!isAdmin}
            {...form.getInputProps("mailFromName")}
          />
        </div>

        {isAdmin && (
          <div>
            <Button
              type="submit"
              disabled={isLoading || !form.isDirty()}
              loading={isLoading}
            >
              {t("Save")}
            </Button>
          </div>
        )}
      </Stack>
    </form>
  );
}
