import { z } from "zod/v4";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import useAuth from "@/features/auth/hooks/use-auth";
import { Button, PasswordInput, Text } from "@mantine/core";
import { IconKey } from "@tabler/icons-react";
import { useRedirectIfAuthenticated } from "@/features/auth/hooks/use-redirect-if-authenticated.ts";
import { useTranslation } from "react-i18next";
import {
  AuthHeading,
  AuthLayout,
  BackToLogin,
  PasswordStrength,
  authClasses as classes,
} from "./auth-layout.tsx";

const formSchema = z.object({
  newPassword: z
    .string()
    .min(8, { message: "Password must contain at least 8 characters" }),
});
type FormValues = z.infer<typeof formSchema>;

interface PasswordResetFormProps {
  resetToken?: string;
}

export function PasswordResetForm({ resetToken }: PasswordResetFormProps) {
  const { t } = useTranslation();
  const { passwordReset, isLoading } = useAuth();
  useRedirectIfAuthenticated();

  const form = useForm<FormValues>({
    validate: zod4Resolver(formSchema),
    initialValues: {
      newPassword: "",
    },
  });

  async function onSubmit(data: FormValues) {
    await passwordReset({
      token: resetToken,
      newPassword: data.newPassword,
    });
  }

  return (
    <AuthLayout>
      <AuthHeading
        icon={<IconKey size={22} />}
        title={t("Choose a new password")}
        subtitle={t(
          "Your other sessions will be signed out. You will stay signed in here.",
        )}
      />

      <form onSubmit={form.onSubmit(onSubmit)} noValidate>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          label={t("New password")}
          placeholder={t("Your new password")}
          size="md"
          {...form.getInputProps("newPassword")}
          error={
            form.errors.newPassword
              ? t(String(form.errors.newPassword))
              : undefined
          }
        />
        <PasswordStrength value={form.values.newPassword} />
        <Text size="xs" c="dimmed" mt={8}>
          {t("At least 8 characters. Avoid reusing a password.")}
        </Text>

        <Button
          type="submit"
          fullWidth
          size="md"
          mt={24}
          loading={isLoading}
          className={classes.primary}
        >
          {t("Set password")}
        </Button>
      </form>

      <BackToLogin />
    </AuthLayout>
  );
}
