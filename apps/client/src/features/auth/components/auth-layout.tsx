import React, { useEffect, useMemo, useState } from "react";
import {
  Anchor,
  Box,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import classes from "./auth.module.css";
import { getClientBrand } from "@/lib/client-brand.ts";
import { getSuiteAppUrls } from "@/lib/config.ts";
import APP_ROUTE from "@/lib/app-route.ts";

const LOCALE_KEY = "conqr.authLocale";
const LOCALES = [
  { label: "FR", value: "fr-FR" },
  { label: "EN", value: "en-US" },
];

function readStoredLocale(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}

type AuthLayoutProps = {
  children: React.ReactNode;
};

/**
 * Shell of every sign-in page (login, forgot and reset password, invitation,
 * MFA, setup): the client identity on the left, the form on the right. On
 * small screens the identity collapses into a header above the form.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  const { t, i18n } = useTranslation();
  const brand = useMemo(() => getClientBrand(), []);

  // Before sign-in the user's own language is unknown: use the visitor's
  // last choice, then the client's language.
  useEffect(() => {
    const target = readStoredLocale() || brand.defaultLocale;
    if (target && i18n.language !== target) i18n.changeLanguage(target);
  }, [brand.defaultLocale, i18n]);

  const year = new Date().getFullYear();

  return (
    <div className={classes.shell}>
      <aside className={classes.brand} aria-label={brand.name}>
        <BrandIdentity />
        <div className={classes.message}>
          <h1 className={classes.slogan}>{t(brand.slogan)}</h1>
          <p className={classes.pitch}>{t(brand.pitch)}</p>
          {brand.team.length > 0 && (
            <div className={classes.mosaic}>
              {brand.team.map((m) => (
                <img
                  key={m.photo}
                  src={m.photo}
                  alt={m.name}
                  title={m.name}
                  loading="lazy"
                />
              ))}
            </div>
          )}
        </div>
        {brand.facts.length > 0 ? (
          <div className={classes.facts}>
            {brand.facts.map((f) => (
              <div key={f.label}>
                <div className={classes.factValue}>{f.value}</div>
                <div className={classes.factLabel}>{t(f.label)}</div>
              </div>
            ))}
          </div>
        ) : (
          <span />
        )}
      </aside>

      <header className={classes.mobileHeader}>
        <BrandIdentity compact />
        <div className={classes.mobileSlogan}>{t(brand.slogan)}</div>
        {brand.team.length > 0 && (
          <Group gap={10} wrap="nowrap">
            <div className={classes.avatars}>
              {brand.team.slice(0, 6).map((m) => (
                <img key={m.photo} src={m.photo} alt="" />
              ))}
            </div>
            <Text size="xs" c="#C9CDD0">
              {t("{{count}} people, one workspace", {
                count: brand.teamSize ?? brand.team.length,
              })}
            </Text>
          </Group>
        )}
      </header>

      <main className={classes.panel}>
        <div className={classes.top}>
          <Group gap={8} wrap="nowrap">
            <Text size="xs" c="dimmed">
              {t("Workspace powered by")}
            </Text>
            <img
              className={`${classes.poweredBy} ${classes.onLight}`}
              src="/branding/conqrai-logo-on-light.png"
              alt="ConqrAI"
            />
            <img
              className={`${classes.poweredBy} ${classes.onDark}`}
              src="/branding/conqrai-logo-on-dark.png"
              alt=""
              aria-hidden="true"
            />
          </Group>
          <LanguageSwitch />
        </div>
        <div className={classes.content}>
          <div className={classes.inner}>{children}</div>
        </div>
        <div className={classes.footer}>
          <span>
            © {year}{" "}
            {brand.key === "conqrai" ? "ConqrAI" : `${brand.name} · ConqrAI`}
          </span>
        </div>
      </main>
    </div>
  );
}

function BrandIdentity({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const brand = getClientBrand();
  if (!brand.markSrc) {
    return (
      <img
        className={compact ? classes.neutralLogoCompact : classes.neutralLogo}
        src="/branding/conqrai-logo-on-dark.png"
        alt="ConqrAI"
      />
    );
  }
  return (
    <Group gap={compact ? 10 : 14} wrap="nowrap">
      <img
        className={compact ? classes.markCompact : classes.mark}
        src={brand.markSrc}
        alt=""
      />
      <div>
        <div className={compact ? classes.nameCompact : classes.name}>
          {brand.name}
        </div>
        {!compact && brand.tagline && (
          <div className={classes.tagline}>{t(brand.tagline)}</div>
        )}
      </div>
    </Group>
  );
}

function LanguageSwitch() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith("en") ? "en-US" : "fr-FR";
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  return (
    <SegmentedControl
      size="xs"
      radius="md"
      data={LOCALES}
      value={value}
      aria-label="Langue / Language"
      onChange={(v) => {
        setValue(v);
        try {
          window.localStorage.setItem(LOCALE_KEY, v);
        } catch {
          // private mode: the choice lasts for this page only
        }
        i18n.changeLanguage(v);
      }}
    />
  );
}

/** Title and one-line explanation at the top of each form. */
export function AuthHeading({
  title,
  subtitle,
  icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Stack gap={8} mb={26}>
      {icon && <div className={classes.headingIcon}>{icon}</div>}
      <Title order={1} className={classes.title}>
        {title}
      </Title>
      {subtitle && (
        <Text c="dimmed" size="md" lh={1.55}>
          {subtitle}
        </Text>
      )}
    </Stack>
  );
}

/** "Back to sign in" link under the secondary forms. */
export function BackToLogin() {
  const { t } = useTranslation();
  return (
    <Anchor
      component={Link}
      to={APP_ROUTE.AUTH.LOGIN}
      size="sm"
      fw={600}
      underline="never"
      className={classes.back}
    >
      <IconArrowLeft size={16} stroke={2} />
      {t("Back to sign in")}
    </Anchor>
  );
}

/** "One account for" ConqrHub and, when deployed, ConqrMeet. */
export function AuthApps() {
  const { t } = useTranslation();
  const meet = Boolean(getSuiteAppUrls().meet);
  const apps = [
    {
      name: "ConqrHub",
      desc: t("Knowledge and reports"),
      mark: "/branding/conqrhub-mark.svg",
    },
    ...(meet
      ? [
          {
            name: "ConqrMeet",
            desc: t("Interviews and meetings"),
            mark: "/branding/conqrmeet-mark.svg",
          },
        ]
      : []),
  ];
  return (
    <Box className={classes.apps}>
      <Text className={classes.appsCaption}>{t("One account for")}</Text>
      <div className={classes.appsRow}>
        {apps.map((a) => (
          <div key={a.name} className={classes.app}>
            <img src={a.mark} alt="" />
            <div>
              <div className={classes.appName}>{a.name}</div>
              <div className={classes.appDesc}>{a.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </Box>
  );
}

/** Four bars that fill as the password gets stronger. */
export function PasswordStrength({ value }: { value: string }) {
  const { t } = useTranslation();
  if (!value) return null;
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  if (value.length < 8) score = Math.min(score, 1);
  const labels = [
    t("Too short"),
    t("Weak"),
    t("Fair"),
    t("Strong"),
    t("Very strong"),
  ];
  const tone = score >= 3 ? "strong" : score === 2 ? "fair" : "weak";
  return (
    <Group gap={10} mt={8} wrap="nowrap" aria-live="polite">
      <div className={classes.strength} data-tone={tone}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} data-on={i < Math.max(score, 1) ? "1" : "0"} />
        ))}
      </div>
      <Text
        size="xs"
        fw={600}
        className={classes.strengthLabel}
        data-tone={tone}
      >
        {labels[score]}
      </Text>
    </Group>
  );
}

export { classes as authClasses };
