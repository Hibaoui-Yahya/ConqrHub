import { accessLabelFr, proseMirrorExcerpt, roleLabelFr } from './utils';
import { maskIp } from '../emails/new-sign-in-email';
import { formatDateFr, greeting } from '../partials/partials';

describe('e-mail helpers', () => {
  it('extracts comment text with mentions and paragraph breaks', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { label: 'Sarah Martin' } },
            { type: 'text', text: ' peux-tu relire ?' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Merci' }] },
      ],
    };
    expect(proseMirrorExcerpt(doc)).toBe(
      '@Sarah Martin peux-tu relire ? Merci',
    );
    expect(proseMirrorExcerpt(JSON.stringify(doc))).toBe(
      '@Sarah Martin peux-tu relire ? Merci',
    );
  });

  it('cuts long comments on a word boundary', () => {
    const doc = { type: 'text', text: 'mot '.repeat(200) };
    const out = proseMirrorExcerpt(doc, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith('…')).toBe(true);
  });

  it('translates roles and access levels', () => {
    expect(roleLabelFr('admin')).toBe('Administrateur');
    expect(roleLabelFr('member')).toBe('Membre');
    expect(accessLabelFr('edit')).toBe('Peut modifier');
    expect(accessLabelFr('view')).toBe('Peut consulter');
  });

  it('masks the end of an IP address', () => {
    expect(maskIp('81.250.12.34')).toBe('81.250.xxx.xxx');
    expect(maskIp('::ffff:81.250.12.34')).toBe('81.250.xxx.xxx');
    expect(maskIp(undefined)).toBeUndefined();
  });

  it('formats dates in Paris time, in French', () => {
    expect(formatDateFr('2026-10-14T08:42:00Z')).toBe(
      '14 octobre 2026 à 10:42',
    );
  });

  it('greets by first name, or neutrally', () => {
    expect(greeting('Sarah Martin')).toBe('Bonjour Sarah,');
    expect(greeting('')).toBe('Bonjour,');
  });
});
