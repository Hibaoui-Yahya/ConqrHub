import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import {
  actionColor,
  brandRow,
  button as buttonStyle,
  card,
  container,
  dangerColor,
  divider,
  fontFamily,
  footer,
  footerLegal,
  footerText,
  heading as headingStyle,
  inkColor,
  lineColor,
  main,
  markColor,
  monoFontFamily,
  mutedColor,
  note as noteStyle,
  panel,
  paragraph,
  smallText,
  strong,
  surfaceColor,
  textColor,
} from '../css/styles';

export type MailProduct = 'ai' | 'hub' | 'meet';

const PRODUCT_NAME: Record<MailProduct, string> = {
  ai: 'ConqrAI',
  hub: 'ConqrHub',
  meet: 'ConqrMeet',
};

const DEFAULT_REASON: Record<MailProduct, string> = {
  ai: 'Cet e-mail de service concerne votre compte ConqrAI. Il ne peut pas être désactivé.',
  hub: 'Vous recevez cet e-mail selon vos préférences de notification ConqrHub.',
  meet: 'Vous recevez cet e-mail selon vos préférences de notification ConqrMeet.',
};

/** Public origin of Hub, which serves the e-mail images from /email/. */
export function appOrigin(): string {
  try {
    return process.env.APP_URL ? new URL(process.env.APP_URL).origin : '';
  } catch {
    return '';
  }
}

function asset(path: string): string {
  const origin = appOrigin();
  return origin ? `${origin}/email/${path}` : '';
}

interface MailBodyProps {
  /** Which mark heads the e-mail: account e-mails are sent as ConqrAI. */
  product?: MailProduct;
  /** Inbox preview line. */
  preview?: string;
  /** File name in /email/icons without extension, e.g. "key-round-brand". */
  icon?: string;
  heading?: React.ReactNode;
  /** Why this e-mail was sent; defaults to the product's line. */
  reason?: string;
  recipient?: string;
  children: React.ReactNode;
}

export function MailBody({
  product = 'hub',
  preview,
  icon,
  heading,
  reason,
  recipient,
  children,
}: MailBodyProps) {
  const lockup = asset(`lockup-conqr${product}.png`);
  const iconSrc = icon ? asset(`icons/${icon}.png`) : '';
  const origin = appOrigin();
  return (
    <Html lang="fr">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@700&display=swap"
          rel="stylesheet"
        />
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Body style={main}>
        <Container style={container}>
          <Section style={brandRow}>
            {lockup ? (
              <Img
                src={lockup}
                alt={PRODUCT_NAME[product]}
                height="28"
                style={{ height: '28px', width: 'auto', display: 'block' }}
              />
            ) : (
              <Wordmark product={product} />
            )}
          </Section>
          <Section style={card}>
            {iconSrc && (
              <Img
                src={iconSrc}
                alt=""
                width="44"
                height="44"
                style={{ display: 'block', borderRadius: '12px' }}
              />
            )}
            {heading && (
              <Text
                style={{
                  ...headingStyle,
                  marginTop: iconSrc ? '18px' : '0',
                }}
              >
                {heading}
              </Text>
            )}
            {children}
          </Section>
          <Section style={footer}>
            <Text style={footerText}>{reason ?? DEFAULT_REASON[product]}</Text>
            {origin && (
              <Text style={footerText}>
                {product !== 'ai' && (
                  <>
                    <Link
                      href={`${origin}/settings/account/notifications`}
                      style={{ color: actionColor, textDecoration: 'none' }}
                    >
                      Gérer mes notifications
                    </Link>
                    {'  ·  '}
                  </>
                )}
                <Link
                  href={productUrl(product)}
                  style={{ color: actionColor, textDecoration: 'none' }}
                >
                  Ouvrir {PRODUCT_NAME[product]}
                </Link>
              </Text>
            )}
            <Text style={footerLegal}>
              © {new Date().getFullYear()} ConqrAI
              {recipient ? `  ·  Envoyé à ${recipient}` : ''}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** Where the footer link of each product leads. */
export function productUrl(product: MailProduct): string {
  const meet = (process.env.MEET_APP_URL ?? '').replace(/\/+$/, '');
  return product === 'meet' && meet ? meet : appOrigin();
}

function Wordmark({ product }: { product: MailProduct }) {
  const suffix = product === 'ai' ? 'AI' : product === 'hub' ? 'Hub' : 'Meet';
  const base = {
    fontFamily: "Montserrat, 'Arial Black', Arial, sans-serif",
    fontSize: '20px',
    fontWeight: '900',
  };
  return (
    <Text style={{ margin: '0' }}>
      <span style={{ ...base, color: inkColor }}>Conqr</span>
      <span style={{ ...base, color: markColor }}>{suffix}</span>
    </Text>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <Text style={paragraph}>{children}</Text>;
}

export function B({ children }: { children: React.ReactNode }) {
  return <strong style={strong}>{children}</strong>;
}

/** Key/value panel ("Page", "Espace", "Date"…). Empty values are skipped. */
export function Details({
  rows,
}: {
  rows: Array<[string, React.ReactNode | null | undefined]>;
}) {
  const shown = rows.filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  if (!shown.length) return null;
  return (
    <Section style={{ ...panel, padding: '4px 16px' }}>
      <table
        role="presentation"
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{ borderCollapse: 'collapse' }}
      >
        <tbody>
          {shown.map(([k, v], i) => (
            <tr key={k}>
              <td
                width="150"
                style={{
                  ...smallText,
                  color: mutedColor,
                  padding: '11px 12px 11px 0',
                  verticalAlign: 'top',
                  borderTop: i ? `1px solid ${lineColor}` : 'none',
                }}
              >
                {k}
              </td>
              <td
                style={{
                  ...smallText,
                  color: inkColor,
                  fontWeight: '500',
                  padding: '11px 0',
                  verticalAlign: 'top',
                  borderTop: i ? `1px solid ${lineColor}` : 'none',
                }}
              >
                {v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** Excerpt of a comment or page, with the cyan rule of the design. */
export function Quote({
  author,
  children,
  resolved,
}: {
  author?: React.ReactNode;
  children: React.ReactNode;
  resolved?: boolean;
}) {
  return (
    <Section
      style={{
        backgroundColor: surfaceColor,
        borderLeft: `3px solid ${markColor}`,
        borderRadius: '3px 10px 10px 3px',
        padding: '14px 16px 14px 18px',
        margin: '0 0 18px 0',
      }}
    >
      {author && (
        <Text
          style={{
            ...smallText,
            color: inkColor,
            fontWeight: '600',
            margin: '0 0 6px 0',
          }}
        >
          {author}
        </Text>
      )}
      <Text
        style={{
          ...smallText,
          fontSize: '14px',
          lineHeight: '1.55',
          color: resolved ? mutedColor : textColor,
          textDecoration: resolved ? 'line-through' : 'none',
        }}
      >
        {children}
      </Text>
    </Section>
  );
}

/** One-time code, large and spaced. */
export function CodeBox({
  code,
  validity,
}: {
  code: string;
  validity: string;
}) {
  return (
    <Section
      style={{
        backgroundColor: '#f1f3f4',
        borderRadius: '10px',
        padding: '22px 16px',
        margin: '0 0 18px 0',
        textAlign: 'center' as const,
      }}
    >
      <Text
        style={{
          fontFamily: monoFontFamily,
          fontSize: '34px',
          fontWeight: '700',
          letterSpacing: '6px',
          color: inkColor,
          margin: '0 0 8px 0',
        }}
      >
        {code}
      </Text>
      <Text style={{ ...smallText, fontSize: '12px', color: mutedColor }}>
        {validity}
      </Text>
    </Section>
  );
}

export interface ListItem {
  title: React.ReactNode;
  meta?: React.ReactNode;
  href?: string;
}

/** Bordered list; numbered for steps and action proposals. */
export function ItemList({
  items,
  numbered,
}: {
  items: ListItem[];
  numbered?: boolean;
}) {
  if (!items.length) return null;
  return (
    <Section
      style={{
        border: `1px solid ${lineColor}`,
        borderRadius: '10px',
        margin: '0 0 18px 0',
      }}
    >
      <table
        role="presentation"
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{ borderCollapse: 'collapse' }}
      >
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              {numbered && (
                <td
                  width="42"
                  style={{
                    padding: '12px 0 12px 16px',
                    verticalAlign: 'top',
                    borderTop: i ? `1px solid ${lineColor}` : 'none',
                  }}
                >
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      lineHeight: '26px',
                      borderRadius: '13px',
                      backgroundColor: '#e6f4fb',
                      color: actionColor,
                      fontFamily,
                      fontSize: '12px',
                      fontWeight: '700',
                      textAlign: 'center' as const,
                    }}
                  >
                    {i + 1}
                  </div>
                </td>
              )}
              <td
                style={{
                  padding: numbered ? '12px 16px 12px 0' : '12px 16px',
                  verticalAlign: 'top',
                  borderTop: i ? `1px solid ${lineColor}` : 'none',
                }}
              >
                <Text
                  style={{
                    ...smallText,
                    fontSize: '14px',
                    fontWeight: '600',
                    color: inkColor,
                    lineHeight: '1.4',
                  }}
                >
                  {it.href ? (
                    <Link
                      href={it.href}
                      style={{ color: inkColor, textDecoration: 'none' }}
                    >
                      {it.title}
                    </Link>
                  ) : (
                    it.title
                  )}
                </Text>
                {it.meta && (
                  <Text
                    style={{
                      ...smallText,
                      fontSize: '12px',
                      color: mutedColor,
                      marginTop: '2px',
                    }}
                  >
                    {it.meta}
                  </Text>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** Score bar with its alert threshold (documentation health). */
export function Meter({
  label,
  value,
  threshold,
  legend,
}: {
  label: string;
  value: number;
  threshold: number;
  legend?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <Section style={{ ...panel, padding: '16px' }}>
      <table role="presentation" width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ ...smallText, color: mutedColor }}>{label}</td>
            <td
              align="right"
              style={{
                fontFamily,
                fontSize: '22px',
                fontWeight: '700',
                color: '#9a5b00',
              }}
            >
              {v} / 100
            </td>
          </tr>
        </tbody>
      </table>
      <table
        role="presentation"
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{ margin: '10px 0', borderCollapse: 'collapse' }}
      >
        <tbody>
          <tr>
            {v > 0 && (
              <td
                width={`${v}%`}
                style={{
                  height: '8px',
                  backgroundColor: '#e39a2d',
                  borderRadius: '4px 0 0 4px',
                  fontSize: '0',
                  lineHeight: '0',
                }}
              >
                &nbsp;
              </td>
            )}
            {v < 100 && (
              <td
                style={{
                  height: '8px',
                  backgroundColor: lineColor,
                  borderRadius: '0 4px 4px 0',
                  fontSize: '0',
                  lineHeight: '0',
                }}
              >
                &nbsp;
              </td>
            )}
          </tr>
        </tbody>
      </table>
      <Text style={{ ...smallText, fontSize: '12px', color: mutedColor }}>
        Seuil d'alerte : {threshold}
        {legend ? ` · ${legend}` : ''}
      </Text>
    </Section>
  );
}

/** The single primary action, with an optional secondary text link. */
export function Actions({
  href,
  label,
  danger,
  secondary,
}: {
  href: string;
  label: string;
  danger?: boolean;
  secondary?: { href: string; label: string };
}) {
  return (
    <table
      role="presentation"
      cellPadding="0"
      cellSpacing="0"
      style={{ margin: '6px 0 18px 0' }}
    >
      <tbody>
        <tr>
          <td
            style={{
              backgroundColor: danger
                ? dangerColor
                : buttonStyle.backgroundColor,
              borderRadius: buttonStyle.borderRadius,
            }}
          >
            <a
              href={href}
              target="_blank"
              style={{
                color: buttonStyle.color,
                fontFamily: buttonStyle.fontFamily,
                fontSize: buttonStyle.fontSize,
                fontWeight: buttonStyle.fontWeight,
                textDecoration: 'none',
                display: 'inline-block',
                padding: '13px 22px',
              }}
            >
              {label}
            </a>
          </td>
          {secondary && (
            <td style={{ paddingLeft: '18px' }}>
              <a
                href={secondary.href}
                target="_blank"
                style={{
                  color: actionColor,
                  fontFamily,
                  fontSize: '14px',
                  fontWeight: '600',
                  textDecoration: 'none',
                }}
              >
                {secondary.label}
              </a>
            </td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

/** Copyable link under buttons that carry a token. */
export function FallbackLink({ href }: { href: string }) {
  return (
    <Section style={{ margin: '0 0 18px 0' }}>
      <Text
        style={{
          ...smallText,
          fontSize: '12px',
          color: mutedColor,
          lineHeight: '1.5',
        }}
      >
        Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :
      </Text>
      <Text
        style={{
          ...smallText,
          fontSize: '12px',
          lineHeight: '1.5',
          wordBreak: 'break-all' as const,
        }}
      >
        <Link
          href={href}
          style={{ color: actionColor, textDecoration: 'underline' }}
        >
          {href}
        </Link>
      </Text>
    </Section>
  );
}

/** Divider followed by the muted security or context note. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Hr style={divider} />
      <Text style={noteStyle}>{children}</Text>
    </>
  );
}

export function getGreetingName(name?: string): string {
  return name?.trim().split(' ')[0] || '';
}

/** "Bonjour Sarah," or "Bonjour," when the name is unknown. */
export function greeting(name?: string): string {
  const first = getGreetingName(name);
  return first ? `Bonjour ${first},` : 'Bonjour,';
}

/** French date and time in Paris time, e.g. "14 octobre 2026 à 10:42". */
export function formatDateFr(date: Date | string | number): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const day = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(d);
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(d);
  return `${day} à ${time}`;
}
