import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MeetingIntelligenceRepo } from '@docmost/db/repos/meeting/meeting-intelligence.repo';
import {
  Meeting,
  MeetingDocument,
  User,
} from '@docmost/db/types/entity.types';
import { PageService } from '../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
import { getMeetingType } from './meeting-types/meeting-type.registry';
import { RenderContext } from './meeting-types/meeting-type.types';
import { SpeakerMap } from '../transcription/transcript.types';

/**
 * Document generation (template render -> meeting_documents) and
 * publication (-> ConqrHub page via PageService, real result recorded).
 */
@Injectable()
export class MeetingDocumentsService {
  constructor(
    private readonly repo: MeetingIntelligenceRepo,
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  async generate(params: {
    meeting: Meeting;
    transcriptVersion: number;
    structured: Record<string, unknown>;
    speakers: SpeakerMap;
  }): Promise<MeetingDocument> {
    const definition = getMeetingType(params.meeting.meetingType);
    const ctx: RenderContext = {
      meetingTitle: params.meeting.title,
      meetingDate: new Date(
        params.meeting.startedAt as unknown as string,
      ).toISOString().slice(0, 10),
      meetingType: definition.name,
      speakers: Object.values(params.speakers).map((s) => s.displayName),
    };
    const rendered = definition.renderDocument(params.structured as never, ctx);

    // Regeneration supersedes prior unpublished documents for this meeting.
    await this.repo.supersedeDocuments(params.meeting.id, []);

    return this.repo.insertDocument({
      meetingId: params.meeting.id,
      transcriptVersion: params.transcriptVersion,
      templateId: definition.id,
      templateVersion: definition.version,
      title: rendered.title.slice(0, 300),
      contentMarkdown: rendered.markdown,
      structured: params.structured as never,
    });
  }

  async publish(params: {
    meeting: Meeting;
    documentId: string;
    workspaceId: string;
    user: User;
    spaceId: string;
    parentPageId?: string | null;
  }): Promise<{ pageId: string; document: MeetingDocument }> {
    const document = await this.repo.findDocument(
      params.documentId,
      params.meeting.id,
    );
    if (!document) throw new NotFoundException('Document not found');

    const ability = await this.spaceAbility.createForUser(
      params.user,
      params.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        'You do not have permission to create pages in the target space',
      );
    }

    const page = (await this.pageService.create(
      params.user.id,
      params.workspaceId,
      {
        spaceId: params.spaceId,
        parentPageId: params.parentPageId ?? undefined,
        title: document.title,
        content: document.contentMarkdown,
        format: 'markdown',
      } as never,
    )) as { id: string };

    const updated = await this.repo.updateDocument(document.id, {
      status: 'published',
      pageId: page.id,
    });

    return { pageId: page.id, document: updated ?? document };
  }
}
