import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { User } from '@docmost/db/types/entity.types';
import { PageService } from '../../page/services/page.service';
import { ProjectSpaceMappingService } from './project-space-mapping.service';
import { RelationshipService } from './relationship.service';
import { buildUrn } from '../domain/urn.util';
import { RelationType } from '../domain/relationship-types';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';

export interface PromotePageInput {
  workspaceId: string;
  user: User;
  planeProjectId: string;
  planePageId: string;
  title: string;
  contentHtml: string;
}

export interface PromotePageResult {
  status: 'promoted' | 'promoted_link_failed';
  pageId: string;
  slugId: string;
  deepLink: string;
  correlationId: string;
  warning?: string;
}

/**
 * Promote a Plane Project Note to a canonical ConqrHub page (blueprint §4):
 * one-way promotion into the project's primary mapped space, with provenance
 * and a typed `derived_from` relationship. Never field-level sync; the Plane
 * side archives the note after a successful promotion.
 */
@Injectable()
export class PagePromotionService {
  private readonly logger = new Logger(PagePromotionService.name);

  constructor(
    private readonly pageService: PageService,
    private readonly mappings: ProjectSpaceMappingService,
    private readonly relationships: RelationshipService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly environment: EnvironmentService,
  ) {}

  async promote(input: PromotePageInput): Promise<PromotePageResult> {
    if (!input.planeProjectId?.trim()) {
      throw new BadRequestException('planeProjectId is required');
    }
    if (!input.planePageId?.trim()) {
      throw new BadRequestException('planePageId is required');
    }
    if (!input.title?.trim()) {
      throw new BadRequestException('title is required');
    }

    // Promotion lands in the project's PRIMARY mapped documentation space.
    const docs = await this.mappings.resolveProjectDocs(
      input.workspaceId,
      input.planeProjectId,
    );
    if (!docs.primary) {
      throw new BadRequestException(
        'No primary documentation space is mapped to this project',
      );
    }

    // The ability factory throws for users with no space membership; both
    // cases mean the same thing here: no create rights in the target space.
    let ability;
    try {
      ability = await this.spaceAbility.createForUser(
        input.user,
        docs.primary.spaceId,
      );
    } catch {
      ability = null;
    }
    if (!ability || ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new BadRequestException(
        'You cannot create pages in the mapped documentation space',
      );
    }

    const correlationId = randomUUID();

    // 1) Create the canonical Hub page (Hub owns documents).
    const page = await this.pageService.create(
      input.user.id,
      input.workspaceId,
      {
        spaceId: docs.primary.spaceId,
        title: input.title,
        content: input.contentHtml,
        format: 'html',
      } as any,
    );

    const appUrl = this.environment.getAppUrl().replace(/\/$/, '');
    const deepLink = `${appUrl}/s/${docs.primary.slug}/p/${page.slugId}`;
    const pageUrn = buildUrn('hub', 'page', page.id);
    const planePageUrn = buildUrn('plane', 'page', input.planePageId);

    // 2) Record provenance: the Hub page is derived from the Plane note.
    try {
      await this.relationships.create({
        workspaceId: input.workspaceId,
        actorId: input.user.id,
        sourceUrn: pageUrn,
        targetUrn: planePageUrn,
        relationType: RelationType.DerivedFrom,
        provenance: 'plane.page.promote',
        metadata: { plane_project_id: input.planeProjectId },
        correlationId,
      });
    } catch (err) {
      // The canonical page exists; be honest that only the link failed.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Page ${page.id} promoted but linking failed: ${message}`,
      );
      return {
        status: 'promoted_link_failed',
        pageId: page.id,
        slugId: page.slugId,
        deepLink,
        correlationId,
        warning:
          'The page was created in ConqrHub but the provenance link failed. Retry the link.',
      };
    }

    return {
      status: 'promoted',
      pageId: page.id,
      slugId: page.slugId,
      deepLink,
      correlationId,
    };
  }
}
