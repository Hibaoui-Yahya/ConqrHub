// Tokens of the ConqrAI e-mail design (new_logo.pen, board "E-mails ·
// ConqrHub & ConqrMeet · v1"). Cyan is reserved for the marks; actions are
// blue, and only "this wasn't me" actions are red.
export const fontFamily =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const monoFontFamily =
  "'JetBrains Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export const inkColor = '#0a0a0a';
export const textColor = '#3f4448';
export const mutedColor = '#6b7175';
export const faintColor = '#9aa0a4';
export const actionColor = '#006399';
export const dangerColor = '#b42318';
export const markColor = '#00c2ff';
export const lineColor = '#e4e6e8';
export const surfaceColor = '#f7f8f8';
export const canvasColor = '#f4f5f5';

export const main = {
  backgroundColor: canvasColor,
  fontFamily,
  margin: '0',
  padding: '32px 0',
};

export const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '0 16px',
};

export const brandRow = {
  padding: '0 4px 20px 4px',
};

export const card = {
  backgroundColor: '#ffffff',
  border: `1px solid ${lineColor}`,
  borderRadius: '12px',
  padding: '36px 40px',
};

export const heading = {
  color: inkColor,
  fontFamily,
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: '1.25',
  letterSpacing: '-0.3px',
  margin: '18px 0 18px 0',
};

export const paragraph = {
  fontFamily,
  color: textColor,
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 16px 0',
};

export const strong = {
  color: inkColor,
  fontWeight: '600',
};

export const link = {
  color: actionColor,
  textDecoration: 'underline',
};

export const panel = {
  backgroundColor: surfaceColor,
  borderRadius: '10px',
  margin: '0 0 18px 0',
};

export const smallText = {
  fontFamily,
  fontSize: '13px',
  lineHeight: '1.45',
  margin: '0',
};

export const note = {
  fontFamily,
  color: mutedColor,
  fontSize: '13px',
  lineHeight: '1.55',
  margin: '0',
};

export const divider = {
  borderTop: `1px solid ${lineColor}`,
  borderBottom: 'none',
  margin: '6px 0 18px 0',
};

export const footer = {
  padding: '20px 24px 0 24px',
};

export const footerText = {
  textAlign: 'center' as const,
  color: mutedColor,
  fontSize: '12px',
  fontFamily,
  lineHeight: '1.5',
  margin: '0 0 6px 0',
};

export const footerLegal = {
  ...footerText,
  color: faintColor,
  fontSize: '11px',
};

export const button = {
  backgroundColor: actionColor,
  borderRadius: '8px',
  color: '#ffffff',
  fontFamily,
  fontSize: '15px',
  fontWeight: '600',
};

// Kept for templates written against the previous layout.
export const content = { padding: '0' };
