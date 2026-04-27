import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { content, paragraph } from '../css/styles';
import { EmailButton, MailBody } from '../partials/partials';

interface Props {
  scopeLabel: string;
  score: number;
  threshold: number;
  dashboardUrl: string;
}

export const DocHealthDroppedEmail = ({
  scopeLabel,
  score,
  threshold,
  dashboardUrl,
}: Props) => {
  return (
    <MailBody>
      <Section style={content}>
        <Text style={paragraph}>Hi there,</Text>
        <Text style={paragraph}>
          The documentation health score for <strong>{scopeLabel}</strong> has
          dropped to <strong>{score}</strong>, below your alert threshold of{' '}
          <strong>{threshold}</strong>.
        </Text>
        <Text style={paragraph}>
          Open the Documentation Health page to see which pages are pulling the
          score down — outdated content, missing owners, expired verifications,
          and stub pages are surfaced with one-click actions.
        </Text>
      </Section>
      <EmailButton href={dashboardUrl}>Review documentation health</EmailButton>
    </MailBody>
  );
};

export default DocHealthDroppedEmail;
