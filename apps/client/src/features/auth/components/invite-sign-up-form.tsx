import * as React from "react";
import { z } from "zod/v4";

import { useForm } from "@mantine/form";
import { TextInput, Button, PasswordInput, Text } from "@mantine/core";
import { IconArrowRight, IconLinkOff, IconLock } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useParams, useSearchParams } from "react-router-dom";
import useAuth from "@/features/auth/hooks/use-auth";
import { useGetInvitationQuery } from "@/features/workspace/queries/workspace-query.ts";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { useRedirectIfAuthenticated } from "@/features/auth/hooks/use-redirect-if-authenticated.ts";
import { useTranslation } from "react-i18next";
import SsoLogin from "@/ee/components/sso-login.tsx";
import {
  AuthApps,
  AuthHeading,
  AuthLayout,
  BackToLogin,
  PasswordStrength,
  authClasses as classes,
} from "./auth-layout.tsx";

const formSchema = z.object({
  name: z.string().trim().min(1, { message: "Enter your name" }),
  password: z
    .string()
    .min(8, { message: "Password must contain at least 8 characters" }),
});

type FormValues = z.infer<typeof formSchema>;

export function InviteSignUpForm() {
  const { t } = useTranslation();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const { data: invitation, isError } = useGetInvitationQuery(
    params?.invitationId,
  );
  const { data: workspace } = useWorkspacePublicDataQuery();
  const { invitationSignup, isLoading } = useAuth();
  useRedirectIfAuthenticated();

  const form = useForm<FormValues>({
    validate: zod4Resolver(formSchema),
    initialValues: {
      name: "",
      password: "",
    },
  });

  async function onSubmit(data: FormValues) {
    const invitationToken = searchParams.get("token");

    await invitationSignup({
      invitationId: invitation.id,
      name: data.name,
      password: data.password,
      token: invitationToken,
    });
  }

  if (isError) {
    return (
      <AuthLayout>
        <AuthHeading
          icon={<IconLinkOff size={22} />}
          title={t("This invitation is no longer valid")}
          subtitle={t(
            "It may have been used already or withdrawn. If you already have an account, sign in. Otherwise, ask an administrator to invite you again.",
          )}
        />
        <BackToLogin />
      </AuthLayout>
    );
  }

  if (!invitation) {
    return <div></div>;
  }

  return (
    <AuthLayout>
      <AuthHeading
        title={t("Welcome")}
        subtitle={
          workspace?.name
            ? t(
                "Your invitation to the {{name}} workspace is confirmed. Choose your password to activate your account.",
                { name: workspace.name },
              )
            : t(
                "Your invitation is confirmed. Choose your password to activate your account.",
              )
        }
      />

      <SsoLogin />

      {!invitation.enforceSso && (
        <form onSubmit={form.onSubmit(onSubmit)} noValidate>
          <TextInput
            id="name"
            type="text"
            autoComplete="name"
            label={t("Full name")}
            placeholder={t("enter your full name")}
            size="md"
            {...form.getInputProps("name")}
            error={form.errors.name ? t(String(form.errors.name)) : undefined}
          />

          <TextInput
            id="email"
            type="email"
            label={t("Email address")}
            description={t("The address your invitation was sent to")}
            value={invitation.email}
            readOnly
            size="md"
            mt={16}
            leftSection={<IconLock size={16} />}
          />

          <PasswordInput
            id="password"
            autoComplete="new-password"
            label={t("Password")}
            placeholder={t("Your password")}
            size="md"
            mt={16}
            {...form.getInputProps("password")}
            error={
              form.errors.password ? t(String(form.errors.password)) : undefined
            }
          />
          <PasswordStrength value={form.values.password} />
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
            rightSection={<IconArrowRight size={16} />}
          >
            {t("Activate my account")}
          </Button>
        </form>
      )}

      <AuthApps />
    </AuthLayout>
  );
}
