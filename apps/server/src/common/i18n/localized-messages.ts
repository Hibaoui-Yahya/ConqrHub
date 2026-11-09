import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { resolveUiLanguage, UiLanguage, uiLanguageOf } from './ui-language';
import { translateServerMessage } from './server-messages';

/**
 * Language of the person behind a request: their account locale; before
 * sign-in, the browser's first language (Accept-Language); else the
 * deployment's DEFAULT_USER_LOCALE; else English.
 */
export function requestLanguage(request: any): UiLanguage {
  const own = uiLanguageOf(request?.user?.user?.locale);
  if (own) return own;
  const header = request?.headers?.['accept-language'];
  const first =
    typeof header === 'string'
      ? header.split(',')[0]?.split(';')[0]?.trim()
      : undefined;
  return resolveUiLanguage(first);
}

/** Response fields that carry a sentence for a person. */
const MESSAGE_KEYS = new Set([
  'message',
  'failureReason',
  'publishBlocker',
  'reason',
  'error',
]);

const MAX_DEPTH = 8;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Copy of `value` with the known French messages of MESSAGE_KEYS fields in
 * `lang`. Unchanged branches keep their reference; nothing is mutated.
 * Only plain objects and arrays are walked (never buffers or streams).
 */
export function translateMessageFields<T>(value: T, lang: UiLanguage, depth = 0): T {
  if (lang === 'fr' || depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = translateMessageFields(item, lang, depth + 1);
      if (next !== item) changed = true;
      return next;
    });
    return (changed ? out : value) as T;
  }
  if (!isPlainObject(value)) return value;
  let out: Record<string, unknown> | null = null;
  for (const [key, item] of Object.entries(value)) {
    let next: unknown = item;
    if (typeof item === 'string') {
      if (MESSAGE_KEYS.has(key)) next = translateServerMessage(item, lang);
    } else if (Array.isArray(item) && key === 'message') {
      // class-validator style: a list of messages
      next = item.map((m) =>
        typeof m === 'string' ? translateServerMessage(m, lang) : m,
      );
      if ((next as unknown[]).every((m, i) => m === item[i])) next = item;
    } else if (item && typeof item === 'object') {
      next = translateMessageFields(item, lang, depth + 1);
    }
    if (next !== item) {
      out ??= { ...value };
      out[key] = next;
    }
  }
  return (out ?? value) as T;
}

/**
 * Refusals written in French (see server-messages.ts) reach a person in
 * their own language: French accounts get the original text, everyone else
 * the English one. A filter, not an interceptor, so refusals thrown by
 * guards (MeetingAccessGuard) are covered too. Status codes, `code` fields
 * and every other part of the body are left as they are.
 */
@Catch(HttpException)
export class LocalizedExceptionFilter extends BaseExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    if (host.getType() !== 'http') return super.catch(exception, host);
    let translated: HttpException = exception;
    try {
      const lang = requestLanguage(host.switchToHttp().getRequest());
      if (lang !== 'fr') {
        const body = exception.getResponse();
        const next =
          typeof body === 'string'
            ? translateServerMessage(body, lang)
            : translateMessageFields(body, lang);
        if (next !== body) {
          translated = new HttpException(next, exception.getStatus(), {
            cause: exception,
          });
        }
      }
    } catch {
      // Translation is best effort: the original refusal still goes out.
    }
    return super.catch(translated, host);
  }
}

/**
 * Same translation for the status and failure sentences that successful
 * responses carry (stored failure reasons, processing status, publish
 * blockers). Applied to the meeting endpoints.
 */
@Injectable()
export class LocalizedMessagesInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const lang = requestLanguage(context.switchToHttp().getRequest());
    if (lang === 'fr') return next.handle();
    return next.handle().pipe(map((data) => translateMessageFields(data, lang)));
  }
}
