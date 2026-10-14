import { Json, Timestamp, Generated } from '@docmost/db/types/db';

// Legacy placeholder — not yet in use.
export interface PageEmbeddings {
  id: Generated<string>;
  pageId: string;
  spaceId: string;
  modelName: string;
  modelDimensions: number;
  workspaceId: string;
  attachmentId: string;
  embedding: number[];
  chunkIndex: Generated<number>;
  chunkStart: Generated<number>;
  chunkLength: Generated<number>;
  metadata: Generated<Json>;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  deletedAt: Timestamp | null;
}

export type AiSourceKind =
  | 'page'
  | 'expert_insight'
  | 'external_document'
  | 'plane_work_item';

export interface AiEmbeddings {
  id: Generated<string>;
  workspaceId: string;
  spaceId: string;
  sourceKind: AiSourceKind;
  sourceId: string;
  chunkIndex: number;
  chunkText: string;
  /** pgvector stores this as a string; reads return string, writes accept string. */
  embedding: string;
  model: string;
  dim: number;
  contentHash: string;
  metadata: Json | null;
  /**
   * Generated tsvector over f_unaccent(chunk_text) with the 'simple' config
   * (migration 20261013T120000-ai-embeddings-lexical). Never written by the
   * application; read only through EmbeddingRepository.lexicalSearch.
   */
  tsv: Generated<string>;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
}
