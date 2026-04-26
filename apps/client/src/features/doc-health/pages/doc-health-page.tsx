import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, Stack, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title";
import { getAppName } from "@/lib/config";
import useUserRole from "@/hooks/use-user-role";
import HealthAlertCard from "@/features/doc-health/components/health-alert-card";
import HealthScoreCard from "@/features/doc-health/components/health-score-card";
import HealthTrendChart from "@/features/doc-health/components/health-trend-chart";
import SpaceScoresTable from "@/features/doc-health/components/space-scores-table";
import IssueList from "@/features/doc-health/components/issue-list";
import { useWorkspaceHealthQuery } from "@/features/doc-health/queries/doc-health-query";
import { HealthIssueCategory } from "@/features/doc-health/types/doc-health.types";

export default function DocHealthPage() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { data, isLoading } = useWorkspaceHealthQuery();

  const [category, setCategory] =
    useState<HealthIssueCategory>("outdated");
  const [page, setPage] = useState(1);
  const [trendDays, setTrendDays] = useState(30);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>
          {t("Documentation health")} - {getAppName()}
        </title>
      </Helmet>

      <SettingsTitle title={t("Documentation health")} />

      <Stack gap="lg">
        <HealthScoreCard
          data={data}
          isLoading={isLoading}
          title={t("Workspace score")}
          subtitle={
            data
              ? t("{{count}} pages scored across {{spaces}} spaces", {
                  count: data.scoredPageCount,
                  spaces: data.spaces.length,
                })
              : undefined
          }
        />

        <Card withBorder padding="lg" radius="md">
          <HealthTrendChart days={trendDays} onDaysChange={setTrendDays} />
        </Card>

        <HealthAlertCard />

        <Stack gap="xs">
          <Title order={4}>{t("Spaces")}</Title>
          {data && <SpaceScoresTable spaces={data.spaces} />}
        </Stack>

        <Stack gap="xs">
          <Title order={4}>{t("Issues to fix")}</Title>
          <IssueList
            category={category}
            onCategoryChange={setCategory}
            page={page}
            onPageChange={setPage}
          />
        </Stack>
      </Stack>
    </>
  );
}
