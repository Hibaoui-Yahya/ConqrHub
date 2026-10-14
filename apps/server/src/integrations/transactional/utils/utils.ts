/** French label of a workspace role, for e-mails. */
export function roleLabelFr(role?: string | null): string {
  switch (role) {
    case 'owner':
      return 'Propriétaire';
    case 'admin':
      return 'Administrateur';
    case 'member':
      return 'Membre';
    default:
      return role ?? '';
  }
}

/** French label of a page access level ("edit" → "Peut modifier"). */
export function accessLabelFr(label?: string | null): string {
  const l = (label ?? '').toLowerCase();
  if (l.includes('edit') || l.includes('write') || l === 'writer')
    return 'Peut modifier';
  if (l.includes('view') || l.includes('read') || l === 'reader')
    return 'Peut consulter';
  if (l.includes('comment')) return 'Peut commenter';
  if (l.includes('full') || l.includes('admin') || l.includes('manage'))
    return 'Accès complet';
  return label ?? '';
}

/**
 * Plain text of a ProseMirror document (comment bodies), with mentions kept
 * as "@Name", cut to `max` characters on a word boundary.
 */
export function proseMirrorExcerpt(doc: unknown, max = 280): string {
  const parts: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && typeof node.text === 'string')
      parts.push(node.text);
    else if (node.type === 'mention') parts.push(`@${node.attrs?.label ?? ''}`);
    else if (node.type === 'hardBreak') parts.push(' ');
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
      if (node.type === 'paragraph' || node.type === 'heading') parts.push(' ');
    }
  };
  let parsed = doc;
  if (typeof doc === 'string') {
    try {
      parsed = JSON.parse(doc);
    } catch {
      parsed = { type: 'text', text: doc };
    }
  }
  walk(parsed);
  const text = parts.join('').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trim()}…`;
}
