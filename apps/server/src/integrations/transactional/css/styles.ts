export const fontFamily =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif";

export const brandFontFamily =
  "'Playfair Display', 'Newsreader', 'Georgia', serif";

export const brandColor = '#3FC1F2';
export const inkColor = '#0a0a0a';
export const creamColor = '#faf9f6';

export const main = {
  backgroundColor: '#f4f6f9',
  fontFamily,
  padding: '20px 0',
};

export const container = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
  overflow: 'hidden' as const,
};

export const header = {
  backgroundColor: inkColor,
  padding: '24px 32px',
  textAlign: 'center' as const,
};

export const headerBrandRegular = {
  color: creamColor,
  fontFamily: brandFontFamily,
  fontSize: '26px',
  fontWeight: '500',
  fontStyle: 'normal' as const,
  margin: '0',
  display: 'inline' as const,
  letterSpacing: '0.3px',
};

export const headerBrandAccent = {
  color: brandColor,
  fontFamily: brandFontFamily,
  fontSize: '26px',
  fontWeight: '500',
  fontStyle: 'italic' as const,
  margin: '0',
  display: 'inline' as const,
  letterSpacing: '0.3px',
};

export const content = {
  padding: '32px 32px 16px 32px',
};

export const paragraph = {
  fontFamily,
  color: '#334155',
  lineHeight: '1.6',
  fontSize: '15px',
  margin: '0 0 16px 0',
};

export const h1 = {
  color: inkColor,
  fontFamily,
  fontSize: '24px',
  fontWeight: 'bold' as const,
  padding: '0',
  margin: '0 0 8px 0',
};

export const logo = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 4,
};

export const link = {
  color: brandColor,
  textDecoration: 'underline',
};

export const footer = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '16px 32px',
};

export const footerText = {
  textAlign: 'center' as const,
  color: '#94a3b8',
  fontSize: '12px',
  fontFamily,
  lineHeight: '1.5',
  margin: '0',
};

export const divider = {
  borderTop: '1px solid #e2e8f0',
  margin: '8px 32px',
};

export const button = {
  backgroundColor: brandColor,
  borderRadius: '6px',
  color: '#ffffff',
  fontFamily,
  fontSize: '15px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};
