import { atom } from "jotai";

/**
 * Drives the "Create work item from selection" flow (blueprint §5.1A). The
 * editor bubble menu sets the selected text as the draft title and opens the
 * modal; a page-scoped wrapper supplies the source page URN and mapped project.
 */
export interface CreateWorkItemDraft {
  open: boolean;
  title: string;
}

export const createWorkItemDraftAtom = atom<CreateWorkItemDraft>({
  open: false,
  title: "",
});
