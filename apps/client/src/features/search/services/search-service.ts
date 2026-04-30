import api from "@/lib/api-client";
import {
  IAttachmentSearch,
  IPageSearch,
  IPageSearchParams,
  ISuggestionResult,
  SearchSuggestionParams,
} from '@/features/search/types/search.types';

export async function searchPage(
  params: IPageSearchParams,
): Promise<IPageSearch[]> {
  const req = await api.post<{ items: IPageSearch[] }>("/search", params);
  return req.data.items;
}

export async function searchSuggestions(
  params: SearchSuggestionParams,
): Promise<ISuggestionResult> {
  const req = await api.post<ISuggestionResult>("/search/suggest", params);
  return req.data;
}

export async function searchShare(
  params: IPageSearchParams,
): Promise<IPageSearch[]> {
  const req = await api.post<{ items: IPageSearch[] }>("/search/share-search", params);
  return req.data.items;
}

export async function searchAttachments(
  params: IPageSearchParams,
): Promise<IAttachmentSearch[]> {
  const req = await api.post<{ items: IAttachmentSearch[] }>("/search-attachments", params);
  return req.data.items;
}

export async function trackSearchClick(params: {
  query: string;
  pageId: string;
}): Promise<void> {
  // Fire-and-forget: doc-health uses these to compute the search-success
  // signal, but a failure here must never block navigation.
  try {
    await api.post("/search/click", params);
  } catch {
    // ignore
  }
}
