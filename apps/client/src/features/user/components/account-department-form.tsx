import { useAtom } from "jotai";
import { useState } from "react";
import { Button, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateUser } from "@/features/user/services/user-service.ts";

/** Department shown next to the person's name on the expert insights they write. */
export default function AccountDepartmentForm() {
  const { t } = useTranslation();
  const [user, setUser] = useAtom(userAtom);
  const [value, setValue] = useState(user?.department ?? "");
  const [saving, setSaving] = useState(false);
  const unchanged = value.trim() === (user?.department ?? "");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateUser({ department: value.trim() || null });
      setUser(updated);
      notifications.show({ message: t("Updated successfully") });
    } catch {
      notifications.show({ message: t("Failed to update data"), color: "red" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save}>
      <TextInput
        label={t("Department")}
        description={t("Shown with the expert insights you write.")}
        placeholder={t("e.g. Human resources")}
        variant="filled"
        maxLength={120}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
      />
      <Button type="submit" mt="sm" loading={saving} disabled={unchanged}>
        {t("Save")}
      </Button>
    </form>
  );
}
