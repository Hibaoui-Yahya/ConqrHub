import { BrokenLinksService } from './broken-links.service';

describe('BrokenLinksService.extractLinks (pure)', () => {
  it('returns an empty list for empty content', () => {
    expect(BrokenLinksService.extractLinks(null)).toEqual([]);
    expect(BrokenLinksService.extractLinks(undefined)).toEqual([]);
    expect(BrokenLinksService.extractLinks({})).toEqual([]);
  });

  it('classifies relative paths as internal', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'see this',
              marks: [
                { type: 'link', attrs: { href: '/s/eng/p/abc1234567' } },
              ],
            },
          ],
        },
      ],
    };
    const links = BrokenLinksService.extractLinks(doc);
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({
      href: '/s/eng/p/abc1234567',
      kind: 'internal',
    });
  });

  it('classifies absolute URLs as external', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'docs',
              marks: [
                { type: 'link', attrs: { href: 'https://example.com/x' } },
              ],
            },
          ],
        },
      ],
    };
    const links = BrokenLinksService.extractLinks(doc);
    expect(links[0]).toEqual({
      href: 'https://example.com/x',
      kind: 'external',
    });
  });

  it('treats protocol-relative URLs as external', () => {
    const doc = mkLink('//cdn.example.com/img.png');
    const links = BrokenLinksService.extractLinks(doc);
    expect(links[0].kind).toBe('external');
  });

  it('deduplicates the same href across multiple text nodes', () => {
    const doc = {
      type: 'doc',
      content: [
        mkLinkNode('/p/abc1234567'),
        mkLinkNode('/p/abc1234567'),
        mkLinkNode('/p/abc1234567'),
      ],
    };
    const links = BrokenLinksService.extractLinks(doc);
    expect(links).toHaveLength(1);
  });

  it('walks nested content (lists, blockquotes)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'a',
                      marks: [
                        {
                          type: 'link',
                          attrs: { href: '/p/aaa1234567' },
                        },
                      ],
                    },
                    {
                      type: 'text',
                      text: 'b',
                      marks: [
                        {
                          type: 'link',
                          attrs: { href: 'https://x.test' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const links = BrokenLinksService.extractLinks(doc);
    expect(links.map((l) => l.href).sort()).toEqual(
      ['/p/aaa1234567', 'https://x.test'].sort(),
    );
  });

  it('ignores marks that are not links', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'bold',
              marks: [{ type: 'bold' }, { type: 'italic' }],
            },
          ],
        },
      ],
    };
    expect(BrokenLinksService.extractLinks(doc)).toEqual([]);
  });

  it('ignores empty hrefs and non-string href attrs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [
                { type: 'link', attrs: { href: '' } },
                { type: 'link', attrs: { href: null } },
                { type: 'link', attrs: {} },
              ],
            },
          ],
        },
      ],
    };
    expect(BrokenLinksService.extractLinks(doc)).toEqual([]);
  });
});

function mkLink(href: string) {
  return {
    type: 'doc',
    content: [mkLinkNode(href)],
  };
}

function mkLinkNode(href: string) {
  return {
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: 'x',
        marks: [{ type: 'link', attrs: { href } }],
      },
    ],
  };
}
