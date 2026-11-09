import { z } from "zod/v4";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import useAuth from "@/features/auth/hooks/use-auth";
import { TextInput, Button, PasswordInput, Anchor, Text } from "@mantine/core";
import { IconArrowRight, IconMail } from "@tabler/icons-react";
import { useRedirectIfAuthenticated } from "@/features/auth/hooks/use-redirect-if-authenticated.ts";
import { Link } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";
import { useTranslation } from "react-i18next";
import SsoLogin from "@/ee/components/sso-login.tsx";
import { ConqrSsoButton } from "@/features/auth/components/conqr-sso-button.tsx";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { Error404 } from "@/components/ui/error-404.tsx";
import React from "react";
import {
  AuthApps,
  AuthHeading,
  AuthLayout,
  authClasses as classes,
} from "./auth-layout.tsx";

const formSchema = z.object({
  email: z.email({ message: "Enter a valid email address" }),
  password: z.string().min(1, { message: "Enter your password" }),
});
type FormValues = z.infer<typeof formSchema>;

export function LoginForm() {
  const { t } = useTranslation();
  const { signIn, isLoading } = useAuth();
  useRedirectIfAuthenticated();
  const {
    data,
    isLoading: isDataLoading,
    isError,
    error,
  } = useWorkspacePublicDataQuery();

  const form = useForm<FormValues>({
    validate: zod4Resolver(formSchema),
    initialValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: FormValues) {
    await signIn(data);
  }

  if (isDataLoading) {
    return null;
  }

  if (isError && error?.["response"]?.status === 404) {
    return <Error404 />;
  }

  return (
    <AuthLayout>
      <AuthHeading
        title={t("Welcome back")}
        subtitle={
          data?.name
            ? t("Sign in to the {{name}} workspace.", { name: data.name })
            : t("Sign in to your workspace.")
        }
      />

      <ConqrSsoButton />
      <SsoLogin />

      {!data?.enforceSso && (
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

          <div className={classes.labelRow} style={{ marginTop: 16 }}>
            <label htmlFor="password" className={classes.label}>
              {t("Password")}
            </label>
            <Anchor
              to={APP_ROUTE.AUTH.FORGOT_PASSWORD}
              component={Link}
              underline="never"
              size="sm"
              fw={600}
            >
              {t("Forgot your password?")}
            </Anchor>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-label={t("Password")}
            placeholder={t("Your password")}
            size="md"
            {...form.getInputProps("password")}
            error={
              form.errors.password ? t(String(form.errors.password)) : undefined
            }
          />

          <Button
            type="submit"
            fullWidth
            size="md"
            mt={24}
            loading={isLoading}
            className={classes.primary}
            rightSection={<IconArrowRight size={16} />}
          >
            {t("Sign In")}
          </Button>
        </form>
      )}

      <AuthApps />

      <Text className={classes.help}>
        {t(
          "No account yet? Use the invitation link you received by email. Trouble signing in? Contact an administrator of your workspace.",
        )}
      </Text>
    </AuthLayout>
  );
}
