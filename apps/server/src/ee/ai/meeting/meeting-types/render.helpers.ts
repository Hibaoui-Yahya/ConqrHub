import {
  ActionItem,
  BaseExtraction,
  Decision,
  Evidence,
  ProposalSeed,
  RenderContext,
} from './meeting-type.types';

export function mdSection(title: string, body: string): string {
  return body.trim().length > 0 ? `## ${title}\n\n${body.trim()}\n` : '';
}

export function mdList(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

export function evidenceNote(evidence: Evidence[]): string {
  const first = evidence[0];
  return first ? ` _(evidence: "${truncate(first.quote, 120)}")_` : '';
}

export function renderDecisions(decisions: Decision[]): string {
  return decisions
    .map(
      (d) =>
        `- **[${d.kind}]** ${d.title}${d.detail ? ` — ${d.detail}` : ''}${evidenceNote(d.evidence)}`,
    )
    .join('\n');
}

export function renderActionItems(items: ActionItem[]): string {
  return items
    .map((a) => {
      const owner = a.owner ? ` (owner: ${a.owner})` : ' (unassigned)';
      const due = a.dueDate ? `, due ${a.dueDate}` : '';
      return `- [ ] **${a.title}**${owner}${due} — ${a.commitment}${evidenceNote(a.evidence)}`;
    })
    .join('\n');
}

export function renderBaseSections(
  s: BaseExtraction,
  ctx: RenderContext,
): string {
  return [
    `# ${ctx.meetingTitle}\n`,
    `> ${ctx.meetingType} · ${ctx.meetingDate} · Participants: ${
      s.participants.length > 0 ? s.participants.join(', ') : ctx.speakers.join(', ') || '—'
    }\n`,
    mdSection('Summary', s.summary),
    mdSection('Topics', mdList(s.topics)),
    mdSection('Key points', mdList(s.keyPoints)),
    mdSection('Decisions', renderDecisions(s.decisions)),
    mdSection('Action items', renderActionItems(s.actionItems)),
    mdSection(
      'Open questions',
      mdList(
        s.openQuestions.map(
          (q) => `${q.question}${q.raisedBy ? ` _(raised by ${q.raisedBy})_` : ''}`,
        ),
      ),
    ),
    mdSection(
      'Risks',
      mdList(s.risks.map((r) => `**${r.severity}** — ${r.title}${r.detail ? `: ${r.detail}` : ''}`)),
    ),
    mdSection('Follow-ups', mdList(s.followUps)),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Work-item proposals from action items — shared by most meeting types. */
export function workItemProposalsFromActions(
  actionItems: ActionItem[],
): ProposalSeed[] {
  return actionItems.map((a) => ({
    kind: 'create_work_item',
    targetApp: 'conqrplane' as const,
    title: a.title,
    payload: {
      name: a.title,
      description: a.description,
      priority: a.priority,
      ownerHint: a.owner,
      dueDate: a.dueDate,
    },
    reason:
      a.commitment === 'explicit'
        ? 'Explicit commitment made in the meeting'
        : 'Action item identified in the meeting',
    evidence: a.evidence,
    confidence: a.confidence,
    commitment: a.commitment,
    // Assigning work to others is a risky action (D10); unassigned/self
    // task creation is normal.
    riskLevel: a.owner ? ('risky' as const) : ('normal' as const),
  }));
}

export function decisionRecordProposals(
  decisions: Decision[],
): ProposalSeed[] {
  return decisions
    .filter((d) => d.kind === 'final' || d.kind === 'provisional')
    .map((d) => ({
      kind: 'create_decision_record',
      targetApp: 'conqrhub' as const,
      title: `Decision: ${d.title}`,
      payload: { title: d.title, detail: d.detail, decisionKind: d.kind },
      reason: 'Decision captured in the meeting',
      evidence: d.evidence,
      confidence: d.confidence,
      commitment: d.kind === 'final' ? ('explicit' as const) : ('suggested' as const),
      riskLevel: 'normal' as const,
    }));
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
