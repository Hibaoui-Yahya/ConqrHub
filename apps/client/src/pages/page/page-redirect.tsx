import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePageQuery } from "@/features/page/queries/page-query";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { extractPageSlugId } from "@/lib";
import { Error404 } from "@/components/ui/error-404.tsx";

export default function PageRedirect() {
  const { pageSlug } = useParams();
  const {
    data: page,
    isLoading: pageIsLoading,
    isError,
  } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (page) {
      const pageUrl = buildPageUrl(page.space.slug, page.slugId, page.title);
      navigate(pageUrl);
    }
  }, [page]);

  if (isError) {
    // This route is what cross-product deep links land on (an Ask HR citation
    // in the ConqrService launcher, a suite notification). The common failure
    // is not a bad link but a private space the viewer isn't a member of, and
    // the API answers 404 for both so page ids stay unprobeable. Say both.
    return (
      <Error404
        description={t(
          "This page doesn't exist, or it lives in a space you don't have access to. Ask a space member to share it with you.",
        )}
      />
    );
  }

  if (pageIsLoading) {
    return <></>;
  }

  return null;
}
