import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { content, paragraph } from '../css/styles';
import { EmailButton, MailBody } from '../partials/partials';

interface Props {
  username: string;
  resetLink: string;
}

export const ForgotPasswordEmail = ({ username, resetLink }: Props) => {
  return (
    <MailBody>
      <Section style={content}>
        <Text style={paragraph}>Hi {username},</Text>
        <Text style={paragraph}>
          We received a request to reset your password. Click the button below to
          choose a new one.
        </Text>
      </Section>
      <EmailButton href={resetLink}>Reset Password</EmailButton>
      <Section style={content}>
        <Text style={{ ...paragraph, fontSize: '13px', color: '#64748b' }}>
          This link expires in 30 minutes. If you did not request a password
          reset, please ignore this email — your account is safe.
        </Text>
      </Section>
    </MailBody>
  );
};

export default ForgotPasswordEmail;
