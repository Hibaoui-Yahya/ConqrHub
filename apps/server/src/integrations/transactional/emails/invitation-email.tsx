import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { content, paragraph } from '../css/styles';
import { EmailButton, MailBody } from '../partials/partials';

interface Props {
  inviteLink: string;
}

export const InvitationEmail = ({ inviteLink }: Props) => {
  return (
    <MailBody>
      <Section style={content}>
        <Text style={paragraph}>Hi there,</Text>
        <Text style={paragraph}>
          You have been invited to join <strong>ConqrAI Wiki</strong>, your
          team's collaborative knowledge base.
        </Text>
        <Text style={paragraph}>
          Click the button below to accept this invitation and set up your
          account.
        </Text>
      </Section>
      <EmailButton href={inviteLink}>Accept Invitation</EmailButton>
      <Section style={content}>
        <Text style={{ ...paragraph, fontSize: '13px', color: '#64748b' }}>
          If you weren't expecting this invitation, you can safely ignore this
          email.
        </Text>
      </Section>
    </MailBody>
  );
};

export default InvitationEmail;
