import {
  button as buttonStyle,
  container,
  divider,
  footer,
  footerText,
  header,
  headerBrandAccent,
  headerBrandRegular,
  main,
} from '../css/styles';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Row,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface MailBodyProps {
  children: React.ReactNode;
}

export function MailBody({ children }: MailBodyProps) {
  return (
    <Html>
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;1,500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Body style={main}>
        <Container style={container}>
          <MailHeader />
          {children}
          <Hr style={divider} />
          <MailFooter />
        </Container>
      </Body>
    </Html>
  );
}

export function MailHeader() {
  return (
    <Section style={header}>
      <Text style={{ margin: '0', textAlign: 'center' as const }}>
        <span style={headerBrandRegular}>Conqr</span>
        <span style={headerBrandAccent}>AI</span>
        <span style={{ ...headerBrandRegular, fontSize: '16px', fontWeight: '400', marginLeft: '6px' }}>
          {' '}Wiki
        </span>
      </Text>
    </Section>
  );
}

interface EmailButtonProps {
  href: string;
  children: React.ReactNode;
}

export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <table
      role="presentation"
      cellPadding="0"
      cellSpacing="0"
      style={{ margin: '8px 0 24px 32px' }}
    >
      <tr>
        <td
          style={{
            backgroundColor: buttonStyle.backgroundColor,
            borderRadius: buttonStyle.borderRadius,
            textAlign: 'center' as const,
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
              padding: '12px 24px',
            }}
          >
            {children}
          </a>
        </td>
      </tr>
    </table>
  );
}

export function MailFooter() {
  return (
    <Section style={footer}>
      <Row>
        <Text style={footerText}>
          © {new Date().getFullYear()} ConqrAI Wiki — All Rights Reserved
        </Text>
      </Row>
    </Section>
  );
}

export function getGreetingName(name?: string): string {
  return name?.split(' ')[0] || 'there';
}
