import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { content, paragraph } from '../css/styles';
import { MailBody } from '../partials/partials';

interface Props {
  invitedUserName: string;
  invitedUserEmail: string;
}

export const InvitationAcceptedEmail = ({
  invitedUserName,
  invitedUserEmail,
}: Props) => {
  return (
    <MailBody>
      <Section style={content}>
        <Text style={paragraph}>Hi there,</Text>
        <Text style={paragraph}>
          Great news! <strong>{invitedUserName}</strong> ({invitedUserEmail}) has
          accepted your invitation and is now a member of your workspace.
        </Text>
      </Section>
    </MailBody>
  );
};

export default InvitationAcceptedEmail;
