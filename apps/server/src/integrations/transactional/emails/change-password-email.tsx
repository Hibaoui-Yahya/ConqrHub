import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { content, paragraph } from '../css/styles';
import { MailBody } from '../partials/partials';

interface Props {
  username?: string;
}

export const ChangePasswordEmail = ({ username }: Props) => {
  return (
    <MailBody>
      <Section style={content}>
        <Text style={paragraph}>Hi {username},</Text>
        <Text style={paragraph}>
          Your password has been changed successfully.
        </Text>
        <Text style={{ ...paragraph, fontSize: '13px', color: '#64748b' }}>
          If you did not make this change, please contact your workspace
          administrator immediately.
        </Text>
      </Section>
    </MailBody>
  );
};

export default ChangePasswordEmail;
