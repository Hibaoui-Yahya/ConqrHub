import { AiAction } from './dto/ai-generate.dto';

const BASE_SYSTEM = [
  'You are an expert writing assistant integrated into a wiki editor.',
  'You receive a piece of text the user has selected and you transform it.',
  'Reply with ONLY the rewritten text — no preamble, no explanation, no quotes around the answer.',
  'Preserve the original markdown formatting unless the action explicitly changes it.',
].join(' ');

export type PromptInputs = {
  content: string;
  prompt?: string;
};

export type PromptResult = {
  system: string;
  prompt: string;
};

/**
 * Build the (system, prompt) pair for a given action. The single source of
 * truth for the 10 actions exposed by the bubble menu — keep this in sync
 * with apps/client/src/ee/ai/components/editor/ai-menu/command-items.ts.
 */
export function buildPrompt(action: AiAction, input: PromptInputs): PromptResult {
  switch (action) {
    case AiAction.IMPROVE_WRITING:
      return {
        system: BASE_SYSTEM,
        prompt: `Improve the writing of the following text. Make it clearer, more concise, and better-flowing. Do not add new information or change the meaning.\n\n---\n${input.content}\n---`,
      };
    case AiAction.FIX_SPELLING_GRAMMAR:
      return {
        system: BASE_SYSTEM,
        prompt: `Correct any spelling and grammar mistakes in the following text. Do not change the meaning, tone, or style. If the text is already correct, return it unchanged.\n\n---\n${input.content}\n---`,
      };
    case AiAction.MAKE_SHORTER:
      return {
        system: BASE_SYSTEM,
        prompt: `Rewrite the following text to be shorter while keeping the key information and meaning intact.\n\n---\n${input.content}\n---`,
      };
    case AiAction.MAKE_LONGER:
      return {
        system: BASE_SYSTEM,
        prompt: `Expand the following text with more detail, examples, or explanation while staying on topic. Do not invent facts.\n\n---\n${input.content}\n---`,
      };
    case AiAction.SIMPLIFY:
      return {
        system: BASE_SYSTEM,
        prompt: `Rewrite the following text using simpler words and shorter sentences. Aim for a general audience.\n\n---\n${input.content}\n---`,
      };
    case AiAction.CHANGE_TONE: {
      const tone = sanitiseTone(input.prompt) || 'professional';
      return {
        system: BASE_SYSTEM,
        prompt: `Rewrite the following text in a ${tone} tone. Keep the meaning and the markdown formatting.\n\n---\n${input.content}\n---`,
      };
    }
    case AiAction.SUMMARIZE:
      return {
        system: BASE_SYSTEM,
        prompt: `Summarise the following text. Use a short paragraph or a bulleted list, whichever is clearer.\n\n---\n${input.content}\n---`,
      };
    case AiAction.EXPLAIN:
      return {
        system: BASE_SYSTEM,
        prompt: `Explain the following text in plain English so a non-expert can understand it. Cover the main idea and any jargon.\n\n---\n${input.content}\n---`,
      };
    case AiAction.CONTINUE_WRITING:
      return {
        system: BASE_SYSTEM,
        prompt: `Continue writing from where the following text leaves off. Match the style, tone, and topic. Reply with only the continuation — do NOT repeat the input.\n\n---\n${input.content}\n---`,
      };
    case AiAction.TRANSLATE: {
      const target = sanitiseLanguage(input.prompt) || 'English';
      return {
        system: BASE_SYSTEM,
        prompt: `Translate the following text into ${target}. Preserve the markdown formatting.\n\n---\n${input.content}\n---`,
      };
    }
    case AiAction.CUSTOM: {
      const instruction =
        (input.prompt ?? '').trim() || 'Rewrite the following text.';
      return {
        system: BASE_SYSTEM,
        prompt: `${instruction}\n\n---\n${input.content}\n---`,
      };
    }
  }
}

function sanitiseTone(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase().replace(/[^a-z\s-]/g, '');
  return t.length > 0 && t.length <= 40 ? t : null;
}

function sanitiseLanguage(raw: string | undefined): string | null {
  if (!raw) return null;
  // Keep letters, spaces, hyphens — language names ("Brazilian Portuguese")
  // and BCP-47-ish tags ("pt-BR") both pass.
  const t = raw.trim().replace(/[^A-Za-z\s-]/g, '');
  return t.length > 0 && t.length <= 40 ? t : null;
}
