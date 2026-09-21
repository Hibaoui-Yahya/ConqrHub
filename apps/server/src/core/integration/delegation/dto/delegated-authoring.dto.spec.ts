import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CommentCreateDto,
  CommentListDto,
  CommentUpdateDto,
  PageCreateDto,
  PageHistoryDto,
  PageIdDto,
  PageListDto,
  PageRecentDto,
  PageSearchDto,
  PageUpdateDto,
  SpaceCreateDto,
  SpaceListDto,
  SpaceReadDto,
  SpaceUpdateDto,
} from './delegated-authoring.dto';

/**
 * The body contract, exercised through the pipe the application actually
 * installs.
 *
 * Constructing the real `ValidationPipe` with `main.ts`'s own options rather
 * than calling `validate()` directly is the point: `whitelist` and `transform`
 * are what decide whether an unexpected key is dropped or carried into a
 * service, and a spec that validated the class in isolation would pass while
 * the deployed route behaved differently.
 *
 * Two families of refusal are worth pinning separately. A *blank* identifier
 * is not a missing one — `{"page_id": "   "}` is a well-formed string that
 * satisfies `IsString`, and left to reach the service it becomes a lookup for
 * a page whose id is whitespace, which answers "not found" and reads to a
 * model as "that page does not exist". And an update with no field to update
 * is not an error the service can report usefully: it succeeds, touches
 * nothing, and returns a timestamp, so the caller is told a change was made.
 */

const pipe = new ValidationPipe({
  whitelist: true,
  stopAtFirstError: true,
  transform: true,
});

const parse = <T>(metatype: new () => T, value: unknown): Promise<T> =>
  pipe.transform(value, { type: 'body', metatype }) as Promise<T>;

const rejects = (metatype: any, value: unknown) =>
  expect(parse(metatype, value)).rejects.toThrow(BadRequestException);

describe('a blank identifier is refused rather than looked up', () => {
  it.each([
    ['space.read', SpaceReadDto, { space_id: '   ' }],
    ['page.read', PageIdDto, { page_id: '\t' }],
    ['page.list', PageListDto, { space_id: ' ' }],
    ['comment.list', CommentListDto, { page_id: '' }],
    ['comment.update', CommentUpdateDto, { comment_id: ' ', text: 'Revised' }],
    ['page.list child', PageListDto, { space_id: 'space-1', parent_page_id: '  ' }],
  ])('%s', async (_name, metatype, body) => {
    await rejects(metatype, body);
  });

  it('refuses blank free text as well as blank ids', async () => {
    await rejects(PageSearchDto, { query: '   ' });
    await rejects(CommentCreateDto, { page_id: 'page-1', text: '  ' });
    await rejects(CommentUpdateDto, { comment_id: 'comment-1', text: '\n' });
    await rejects(PageCreateDto, { space_id: 'space-1', title: ' ' });
  });
});

describe('an update must actually update something', () => {
  it('refuses a space update that supplies neither name nor description', async () => {
    await rejects(SpaceUpdateDto, { space_id: 'space-1' });
  });

  it('refuses a page update that supplies neither title nor content', async () => {
    await rejects(PageUpdateDto, { page_id: 'page-1' });
  });

  it('accepts either field alone', async () => {
    await expect(
      parse(SpaceUpdateDto, { space_id: 'space-1', name: 'Renamed' }),
    ).resolves.toMatchObject({ name: 'Renamed' });
    await expect(
      parse(SpaceUpdateDto, { space_id: 'space-1', description: 'Why it exists' }),
    ).resolves.toMatchObject({ description: 'Why it exists' });
    await expect(
      parse(PageUpdateDto, { page_id: 'page-1', title: 'Renamed' }),
    ).resolves.toMatchObject({ title: 'Renamed' });
    await expect(
      parse(PageUpdateDto, { page_id: 'page-1', content: '# Body' }),
    ).resolves.toMatchObject({ content: '# Body' });
  });

  it('still validates both fields when both are supplied', async () => {
    // The "at least one" rule is expressed with `ValidateIf`, which is easy to
    // write in a way that stops checking a field once its sibling is present —
    // and a blank title that reached the service would rename a page to
    // nothing.
    await rejects(PageUpdateDto, {
      page_id: 'page-1',
      title: '   ',
      content: '# Body',
    });
    await rejects(SpaceUpdateDto, {
      space_id: 'space-1',
      name: ' ',
      description: 'Why it exists',
    });
  });
});

describe('bounds and enums are the adapter contract, in both repositories', () => {
  it.each([
    [SpaceListDto, 50],
    [PageListDto, 50],
    [CommentListDto, 50],
    [PageSearchDto, 20],
    [PageRecentDto, 20],
    [PageHistoryDto, 20],
  ])('caps limit at its documented maximum', async (metatype: any, max) => {
    const required = {
      space_id: 'space-1',
      page_id: 'page-1',
      query: 'machine rates',
    };
    await expect(
      parse(metatype, { ...required, limit: max }),
    ).resolves.toMatchObject({ limit: max });
    await rejects(metatype, { ...required, limit: max + 1 });
    await rejects(metatype, { ...required, limit: 0 });
  });

  it('accepts only the three content operations the page service implements', async () => {
    for (const content_operation of ['replace', 'append', 'prepend']) {
      await expect(
        parse(PageUpdateDto, {
          page_id: 'page-1',
          content: '# Body',
          content_operation,
        }),
      ).resolves.toMatchObject({ content_operation });
    }
    await rejects(PageUpdateDto, {
      page_id: 'page-1',
      content: '# Body',
      content_operation: 'overwrite',
    });
  });

  it('omits a limit rather than inventing one when none was sent', async () => {
    // The default belongs to the service, which is the only place that knows
    // what a sensible page size is for that query. A DTO default would make
    // two of them.
    await expect(parse(SpaceListDto, {})).resolves.toEqual({});
  });
});

describe('nothing a caller adds reaches a service', () => {
  it('strips keys the contract does not declare', async () => {
    // `whitelist` is what stops a body carrying `workspace_id`, `user_id` or a
    // scope of its own: the identity is resolved from the assertion, and a
    // field that merely *looked* like it was honoured is worse than one that
    // is refused.
    await expect(
      parse(PageIdDto, {
        page_id: 'page-1',
        workspace_id: 'ws-elsewhere',
        user_id: 'somebody-else',
        scope: ['page:update'],
      }),
    ).resolves.toEqual({ page_id: 'page-1' });
  });

  it('refuses a space whose slug or name is missing entirely', async () => {
    await rejects(SpaceCreateDto, { name: 'Product' });
    await rejects(SpaceCreateDto, { slug: 'product' });
  });
});
