import { SetMetadata } from '@nestjs/common';
import { AI_FEATURE_KEY, AiFeature } from '../feature.constants';

/**
 * Marks a route or controller as requiring a specific AI surface. Pair with
 * WorkspaceAiToggleGuard in the controller's @UseGuards(...) list.
 */
export const RequireAiFeature = (feature: AiFeature) =>
  SetMetadata(AI_FEATURE_KEY, feature);
