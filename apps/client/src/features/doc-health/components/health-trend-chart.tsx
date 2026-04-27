import { useMemo } from "react";
import {
  Button,
  Center,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconCameraPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useHealthTrendQuery,
  useSnapshotHealthNowMutation,
  useWorkspaceHealthQuery,
} from "@/features/doc-health/queries/doc-health-query";
import { IHealthTrendPoint } from "@/features/doc-health/types/doc-health.types";

const WORKSPACE_SCOPE = "__workspace__";

const RANGES: { value: string; days: number; label: string }[] = [
  { value: "7", days: 7, label: "7d" },
  { value: "30", days: 30, label: "30d" },
  { value: "90", days: 90, label: "90d" },
  { value: "365", days: 365, label: "1y" },
];

interface Props {
  scope: string;
  onScopeChange: (scope: string) => void;
  days: number;
  onDaysChange: (days: number) => void;
}

export default function HealthTrendChart({
  scope,
  onScopeChange,
  days,
  onDaysChange,
}: Props) {
  const { t } = useTranslation();
  const { data: workspaceHealth } = useWorkspaceHealthQuery();
  const spaceId = scope === WORKSPACE_SCOPE ? undefined : scope;
  const { data, isLoading } = useHealthTrendQuery({ spaceId, days });
  const snapshotNow = useSnapshotHealthNowMutation();
  const points = data?.points ?? [];

  const scopeOptions = useMemo(
    () => [
      { value: WORKSPACE_SCOPE, label: t("Workspace") },
      ...(workspaceHealth?.spaces ?? []).map((s) => ({
        value: s.spaceId,
        label: s.spaceName ?? s.spaceSlug,
      })),
    ],
    [workspaceHealth, t],
  );

  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="wrap">
        <Group gap="sm" wrap="nowrap">
          <Text fw={500} size="sm">
            {t("Score over time")}
          </Text>
          <Select
            size="xs"
            value={scope}
            onChange={(v) => v && onScopeChange(v)}
            data={scopeOptions}
            comboboxProps={{ withinPortal: false }}
            w={180}
          />
        </Group>
        <Group gap="xs" wrap="nowrap">
          <SegmentedControl
            size="xs"
            value={String(days)}
            onChange={(v) => onDaysChange(Number(v))}
            data={RANGES.map((r) => ({ value: r.value, label: t(r.label) }))}
          />
          <Button
            size="xs"
            variant="default"
            leftSection={<IconCameraPlus size={14} />}
            loading={snapshotNow.isPending}
            onClick={() => snapshotNow.mutate()}
          >
            {t("Snapshot now")}
          </Button>
        </Group>
      </Group>

      {isLoading ? (
        <Center h={140}>
          <Text c="dimmed" size="sm">
            {t("Loading trend…")}
          </Text>
        </Center>
      ) : points.length === 0 ? (
        <Center h={140}>
          <Text c="dimmed" size="sm">
            {t("No snapshots yet — first one runs at 02:00 UTC.")}
          </Text>
        </Center>
      ) : (
        <TrendSparkline points={points} />
      )}
    </Stack>
  );
}

const CHART_W = 480;
const CHART_H = 140;
const PAD_X = 8;
const PAD_Y = 8;
const PLOT_W = CHART_W - PAD_X * 2;
const PLOT_H = CHART_H - PAD_Y * 2;

function TrendSparkline({ points }: { points: IHealthTrendPoint[] }) {
  const { t } = useTranslation();

  const { path, area, latest, latestX, latestY, gridLines, xLabels } =
    useMemo(() => {
      const xs = points.map((p) => new Date(p.capturedAt).getTime());
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const xRange = maxX - minX || 1;

      const xy = points.map((p, i) => {
        const x =
          PAD_X +
          (xs.length === 1
            ? PLOT_W / 2
            : ((xs[i] - minX) / xRange) * PLOT_W);
        const score = p.score ?? 0;
        const y = PAD_Y + (1 - score / 100) * PLOT_H;
        return { x, y, score: p.score, capturedAt: p.capturedAt };
      });

      const path = xy
        .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
        .join(" ");
      const area =
        xy.length > 1
          ? `${path} L ${xy[xy.length - 1].x.toFixed(1)} ${(PAD_Y + PLOT_H).toFixed(1)} L ${xy[0].x.toFixed(1)} ${(PAD_Y + PLOT_H).toFixed(1)} Z`
          : "";

      const latest = xy[xy.length - 1];
      const gridLines = [0, 25, 50, 75, 100].map((v) => ({
        value: v,
        y: PAD_Y + (1 - v / 100) * PLOT_H,
      }));

      const xLabels =
        xy.length >= 2
          ? [
              { x: xy[0].x, label: formatShortDate(xy[0].capturedAt) },
              {
                x: xy[xy.length - 1].x,
                label: formatShortDate(xy[xy.length - 1].capturedAt),
              },
            ]
          : [];

      return {
        path,
        area,
        latest: latest.score,
        latestX: latest.x,
        latestY: latest.y,
        gridLines,
        xLabels,
      };
    }, [points]);

  const stroke = scoreColor(latest);

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H + 16}`}
      width="100%"
      height={CHART_H + 16}
      role="img"
      aria-label={t("Documentation health score trend")}
    >
      {gridLines.map((g) => (
        <g key={g.value}>
          <line
            x1={PAD_X}
            x2={CHART_W - PAD_X}
            y1={g.y}
            y2={g.y}
            stroke="var(--mantine-color-gray-3)"
            strokeWidth={0.5}
            strokeDasharray="2 3"
          />
        </g>
      ))}
      {area && <path d={area} fill={stroke} fillOpacity={0.08} />}
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} />
      {points.length === 1 && (
        <circle cx={latestX} cy={latestY} r={3} fill={stroke} />
      )}
      <circle cx={latestX} cy={latestY} r={3.5} fill={stroke} />
      {xLabels.map((lab) => (
        <text
          key={lab.x}
          x={lab.x}
          y={CHART_H + 12}
          fontSize={10}
          fill="var(--mantine-color-dimmed)"
          textAnchor="middle"
        >
          {lab.label}
        </text>
      ))}
    </svg>
  );
}

function scoreColor(score: number | null): string {
  if (score === null) return "var(--mantine-color-gray-5)";
  if (score >= 80) return "var(--mantine-color-teal-6)";
  if (score >= 60) return "var(--mantine-color-yellow-6)";
  if (score >= 40) return "var(--mantine-color-orange-6)";
  return "var(--mantine-color-red-6)";
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}
