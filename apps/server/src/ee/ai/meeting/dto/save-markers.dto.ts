import { ArrayMaxSize, IsArray } from 'class-validator';
import { MAX_MARKERS } from '../meeting-markers.util';

/** POST /ai/meeting/:id/markers — replaces the meeting's marked moments.
 *  Entries are sanitised by normalizeMarkers(); malformed ones are dropped. */
export class SaveMarkersDto {
  @IsArray()
  @ArrayMaxSize(MAX_MARKERS)
  markers!: unknown[];
}
