import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { serverMessageCatalog, translateServerMessage } from './server-messages';
import {
  LocalizedExceptionFilter,
  LocalizedMessagesInterceptor,
  requestLanguage,
  translateMessageFields,
} from './localized-messages';
import {
  MEETING_PUBLISH_SUSPENDED_MESSAGE,
  MEETING_READ_ONLY_MESSAGE,
  TEMPLATE_DEFAULT_ADMIN_MESSAGE,
  TEMPLATE_READ_ONLY_MESSAGE,
} from '../../ee/ai/meeting/meeting-access.util';
import { MEETING_PAGE_RETAINED_MESSAGE } from '../../core/page/services/meeting-derived-pages';
import { INVITATION_EXPIRED_MESSAGE } from '../../core/workspace/invitation-expiry';
import {
  failureReasonFor,
  PipelineTimeoutError,
  STALE_FAILURE_MESSAGE,
} from '../../ee/ai/meeting/meeting-processing.util';
import { normalizeInsight } from '../../ee/ai/meeting/meeting-insights.util';

describe('translateServerMessage', () => {
  it('knows every shared French constant', () => {
    for (const fr of [
      MEETING_READ_ONLY_MESSAGE,
      MEETING_PUBLISH_SUSPENDED_MESSAGE,
      TEMPLATE_DEFAULT_ADMIN_MESSAGE,
      TEMPLATE_READ_ONLY_MESSAGE,
      MEETING_PAGE_RETAINED_MESSAGE,
      INVITATION_EXPIRED_MESSAGE,
      STALE_FAILURE_MESSAGE,
    ]) {
      expect([fr, translateServerMessage(fr, 'en')]).not.toEqual([fr, fr]);
    }
    expect(translateServerMessage(MEETING_READ_ONLY_MESSAGE, 'en')).toBe(
      'Read only: only the person who created this meeting can change it.',
    );
  });

  it('leaves French readers, English and unknown texts untouched', () => {
    expect(translateServerMessage(MEETING_READ_ONLY_MESSAGE, 'fr')).toBe(
      MEETING_READ_ONLY_MESSAGE,
    );
    expect(translateServerMessage('Meeting not found', 'en')).toBe(
      'Meeting not found',
    );
    expect(translateServerMessage('Un texte inconnu.', 'en')).toBe(
      'Un texte inconnu.',
    );
  });

  it('carries the variable parts over', () => {
    expect(
      translateServerMessage(
        'Le morceau 3 (mic) est déjà enregistré avec un autre contenu. Reprenez la numérotation à partir de la capture enregistrée.',
        'en',
      ),
    ).toBe(
      'Chunk 3 (mic) is already stored with different content. Resume the numbering from the stored capture.',
    );
    expect(
      translateServerMessage(
        'La durée maximale d’un enregistrement (4 h) est atteinte : arrêtez l’enregistrement pour lancer le traitement.',
        'en',
      ),
    ).toBe(
      'The maximum length of a recording (4 h) has been reached: stop the recording to start processing.',
    );
  });

  it('translates the stored failure reasons, cause included', () => {
    expect(
      translateServerMessage(failureReasonFor(new Error('ECONNRESET'), true), 'en'),
    ).toBe(
      'Processing failed after several attempts. The audio is kept: restart the processing. Detail: ECONNRESET',
    );
    expect(translateServerMessage(failureReasonFor(new Error('x'), false), 'en')).toBe(
      'Processing failed. Detail: x',
    );
    expect(
      translateServerMessage(failureReasonFor(new PipelineTimeoutError(), true), 'en'),
    ).toBe(
      'Processing was interrupted (service restart or time limit exceeded). The audio is kept: restart the processing. Detail: Processing exceeded the maximum time allowed.',
    );
  });

  it('translates the insight validation errors', () => {
    const empty = normalizeInsight({ kind: 'qa', content: '  ' });
    expect(empty.ok).toBe(false);
    const error = (empty as { error: string }).error;
    expect(translateServerMessage(error, 'en')).not.toBe(error);
  });

  it('gives every catalogue entry an English text with the same placeholders', () => {
    for (const { fr, en } of serverMessageCatalog()) {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect([fr, names(en)]).toEqual([fr, names(fr)]);
      expect(en).not.toMatch(/[àâçéèêëîïôûùüœ«»]/);
    }
  });
});

function httpHost(request: any) {
  const reply = { status: undefined as number | undefined, body: undefined as any };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    getArgByIndex: (i: number) => (i === 0 ? request : {}),
  } as unknown as ArgumentsHost;
  const filter = new LocalizedExceptionFilter({
    reply: (_res: any, body: any, status: number) => {
      reply.status = status;
      reply.body = body;
    },
    isHeadersSent: () => false,
    end: () => undefined,
  } as any);
  return { host, reply, filter };
}

describe('LocalizedExceptionFilter', () => {
  const english = { user: { user: { locale: 'en-US' } }, headers: {} };
  const french = { user: { user: { locale: 'fr-FR' } }, headers: {} };

  it('gives a French account the French refusal, unchanged', () => {
    const { host, reply, filter } = httpHost(french);
    filter.catch(new ForbiddenException(MEETING_READ_ONLY_MESSAGE), host);
    expect(reply.status).toBe(403);
    expect(reply.body).toEqual({
      statusCode: 403,
      message: MEETING_READ_ONLY_MESSAGE,
      error: 'Forbidden',
    });
  });

  it('gives an English account the English refusal, same status and shape', () => {
    const { host, reply, filter } = httpHost(english);
    filter.catch(new ForbiddenException(MEETING_PUBLISH_SUSPENDED_MESSAGE), host);
    expect(reply.status).toBe(403);
    expect(reply.body).toEqual({
      statusCode: 403,
      message:
        'Publishing to ConqrHub is suspended while private meeting sharing is being set up.',
      error: 'Forbidden',
    });
  });

  it('keeps the code and the other fields of an object refusal', () => {
    const { host, reply, filter } = httpHost(english);
    filter.catch(
      new ConflictException({
        statusCode: 409,
        code: 'meeting_archived',
        message:
          'Cette réunion est archivée : désarchivez-la avant de la traiter ou de la publier.',
      }),
      host,
    );
    expect(reply.status).toBe(409);
    expect(reply.body).toEqual({
      statusCode: 409,
      code: 'meeting_archived',
      message:
        'This meeting is archived: unarchive it before processing or publishing it.',
    });
  });

  it('leaves English refusals alone', () => {
    const { host, reply, filter } = httpHost(english);
    filter.catch(new BadRequestException('Invalid audio source or timing'), host);
    expect(reply.body.message).toBe('Invalid audio source or timing');
  });

  it('before sign-in, follows the browser language', () => {
    const fr = httpHost({ headers: { 'accept-language': 'fr-CA,fr;q=0.9' } });
    fr.filter.catch(new BadRequestException(INVITATION_EXPIRED_MESSAGE), fr.host);
    expect(fr.reply.body.message).toBe(INVITATION_EXPIRED_MESSAGE);
    const en = httpHost({ headers: { 'accept-language': 'en-GB,en;q=0.9' } });
    en.filter.catch(new BadRequestException(INVITATION_EXPIRED_MESSAGE), en.host);
    expect(en.reply.body.message).toBe(
      'This invitation has expired. Ask an administrator to send it again.',
    );
  });

  it('a plain HttpException with a string body', () => {
    const { host, reply, filter } = httpHost(english);
    filter.catch(new HttpException('Élément introuvable.', 404), host);
    expect(reply.status).toBe(404);
    expect(reply.body).toEqual({ statusCode: 404, message: 'Item not found.' });
  });
});

describe('requestLanguage', () => {
  const previous = process.env.DEFAULT_USER_LOCALE;
  afterEach(() => {
    if (previous === undefined) delete process.env.DEFAULT_USER_LOCALE;
    else process.env.DEFAULT_USER_LOCALE = previous;
  });

  it('account locale first, then the browser, then DEFAULT_USER_LOCALE', () => {
    expect(
      requestLanguage({
        user: { user: { locale: 'fr-FR' } },
        headers: { 'accept-language': 'en-US' },
      }),
    ).toBe('fr');
    expect(requestLanguage({ headers: { 'accept-language': 'en-US' } })).toBe('en');
    process.env.DEFAULT_USER_LOCALE = 'fr-FR';
    expect(requestLanguage({ headers: {} })).toBe('fr');
    delete process.env.DEFAULT_USER_LOCALE;
    expect(requestLanguage({ headers: {} })).toBe('en');
  });
});

describe('LocalizedMessagesInterceptor', () => {
  const run = (request: any, data: unknown) =>
    lastValueFrom(
      new LocalizedMessagesInterceptor().intercept(
        {
          getType: () => 'http',
          switchToHttp: () => ({ getRequest: () => request }),
        } as any,
        { handle: () => of(data) },
      ),
    );

  const meeting = {
    id: 'm1',
    title: 'Point hebdo',
    failureReason: STALE_FAILURE_MESSAGE,
    documents: [
      {
        id: 'd1',
        publishBlocker:
          'Ce document n’a pas pu être généré. Relancez l’analyse avant de le publier.',
      },
    ],
  };

  it('translates failure and status sentences for an English account', async () => {
    const out: any = await run({ user: { user: { locale: 'en-US' } } }, meeting);
    expect(out.failureReason).toBe(
      'Processing was interrupted (service restart or time limit exceeded). The audio is kept: restart the processing.',
    );
    expect(out.documents[0].publishBlocker).toBe(
      'This document could not be generated. Restart the analysis before publishing it.',
    );
    expect(out.title).toBe('Point hebdo');
    // the original object is not mutated
    expect(meeting.failureReason).toBe(STALE_FAILURE_MESSAGE);
  });

  it('returns the very same data to a French account', async () => {
    const out = await run({ user: { user: { locale: 'fr-CA' } } }, meeting);
    expect(out).toBe(meeting);
  });

  it('never walks buffers or touches fields that are not messages', () => {
    const buffer = Buffer.from('x');
    expect(translateMessageFields(buffer, 'en')).toBe(buffer);
    const data = { text: MEETING_READ_ONLY_MESSAGE };
    expect(translateMessageFields(data, 'en')).toBe(data);
  });
});
