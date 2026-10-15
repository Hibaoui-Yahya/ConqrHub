import { useState } from "react";
import { z } from "zod/v4";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import useAuth from "@/features/auth/hooks/use-auth";
import { Button, Text, TextInput } from "@mantine/core";
import { IconMail, IconMailCheck } from "@tabler/icons-react";
import { useRedirectIfAuthenticated } from "@/features/auth/hooks/use-redirect-if-authenticated.ts";
import { useTranslation } from "react-i18next";
import {
  AuthHeading,
  AuthLayout,
  BackToLogin,
  authClasses as classes,
} from "./auth-layout.tsx";

const formSchema = z.object({
  email: z.email({ message: "Enter a valid email address" }),
});
type FormValues = z.infer<typeof formSchema>;

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const { forgotPassword, isLoading } = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  useRedirectIfAuthenticated();

  const form = useForm<FormValues>({
    validate: zod4Resolver(formSchema),
    initialValues: {
      email: "",
    },
  });

  async function onSubmit(data: FormValues) {
    if (await forgotPassword(data)) {
      setSentTo(data.email);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout>
        <AuthHeading
          icon={<IconMailCheck size={24} />}
          title={t("Check your inbox")}
          subtitle={t(
            "If an account exists for {{email}}, a reset link is on its way. It is valid for 30 minutes.",
            { email: sentTo },
          )}
        />
        <Text className={classes.notice}>
          {t(
            "Nothing after a few minutes? Check your spam folder, or make sure you used the address your invitation was sent to.",
          )}
        </Text>
        <BackToLogin />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthHeading
        title={t("Forgot your password?")}
        subtitle={t(
          "Enter your email address. We will send you a link to choose a new password.",
        )}
      />

      <form onSubmit={form.onSubmit(onSubmit)} noValidate>
        <TextInput
          id="email"
          type="email"
          autoComplete="username"
          label={t("Email address")}
          placeholder={t("Your work email address")}
          size="md"
          leftSection={<IconMail size={16} />}
          {...form.getInputProps("email")}
          error={form.errors.email ? t(String(form.errors.email)) : undefined}
        />

        <Button
          type="submit"
          fullWidth
          size="md"
          mt={24}
          loading={isLoading}
          className={classes.primary}
        >
          {t("Send reset link")}
        </Button>
      </form>

      <BackToLogin />
    </AuthLayout>
  );
}
