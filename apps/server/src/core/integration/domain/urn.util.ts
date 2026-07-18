/**
 * Canonical Conqr resource URNs (blueprint §8.2).
 *
 * Relationships reference objects by stable URN, not URL, so a title/URL change
 * never changes identity. Shape:
 *
 *   conqr://<product>/<type>/<id>[#block=<blockId>]
 *
 * Examples:
 *   conqr://hub/page/page_123
 *   conqr://hub/page/page_123#block=req_45
 *   conqr://plane/work-item/wi_789
 *   conqr://plane/project/project_abc
 */

export type ConqrProduct = 'hub' | 'plane' | 'core';

export interface ParsedUrn {
  product: ConqrProduct;
  type: string;
  id: string;
  /** Optional block anchor within the object (e.g. a requirement block). */
  block?: string;
  /** The normalized URN string this was parsed from. */
  urn: string;
}

const URN_SCHEME = 'conqr://';
const PRODUCTS: ReadonlySet<string> = new Set(['hub', 'plane', 'core']);

// product/type/id — id may contain word chars, dashes, dots. Optional #block=...
const URN_RE =
  /^conqr:\/\/(hub|plane|core)\/([a-z0-9-]+)\/([A-Za-z0-9._-]+)(?:#block=([A-Za-z0-9._-]+))?$/;

export function buildUrn(
  product: ConqrProduct,
  type: string,
  id: string,
  block?: string,
): string {
  if (!PRODUCTS.has(product)) {
    throw new Error(`Invalid URN product: ${product}`);
  }
  const normalizedType = String(type).trim().toLowerCase();
  const normalizedId = String(id).trim();
  if (!normalizedType || !normalizedId) {
    throw new Error('URN type and id are required');
  }
  const base = `${URN_SCHEME}${product}/${normalizedType}/${normalizedId}`;
  return block ? `${base}#block=${String(block).trim()}` : base;
}

export function parseUrn(urn: string): ParsedUrn {
  if (typeof urn !== 'string') {
    throw new Error('URN must be a string');
  }
  const match = URN_RE.exec(urn.trim());
  if (!match) {
    throw new Error(`Malformed Conqr URN: ${urn}`);
  }
  const [, product, type, id, block] = match;
  return {
    product: product as ConqrProduct,
    type,
    id,
    block: block || undefined,
    urn: block
      ? `${URN_SCHEME}${product}/${type}/${id}#block=${block}`
      : `${URN_SCHEME}${product}/${type}/${id}`,
  };
}

export function isValidUrn(urn: string): boolean {
  try {
    parseUrn(urn);
    return true;
  } catch {
    return false;
  }
}

/** URN identifying an object WITHOUT its block anchor (for resolving the parent). */
export function urnWithoutBlock(urn: string): string {
  const parsed = parseUrn(urn);
  return buildUrn(parsed.product, parsed.type, parsed.id);
}

export function isPlaneUrn(urn: string): boolean {
  return isValidUrn(urn) && parseUrn(urn).product === 'plane';
}

export function isHubUrn(urn: string): boolean {
  return isValidUrn(urn) && parseUrn(urn).product === 'hub';
}
