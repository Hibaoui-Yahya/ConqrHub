import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Center, Loader, Stack, Text, Anchor } from "@mantine/core";
import {
  getProjectDocs,
  ProjectDocsResolution,
} from "@/features/integration/services/integration-service";

/**
 * Landing route for Plane's "Docs" nav item (blueprint §5.2A). Plane deep-links
 * here with its project id; ConqrHub resolves the mapped space and redirects to
 * it — deep link, not an iframe (§8.7). Shows an explicit state when the project
 * isn't mapped yet.
 */
export default function PlaneDocsRedirect() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<
    "loading" | "unmapped" | "error" | "choose"
  >("loading");
  const [docs, setDocs] = useState<ProjectDocsResolution | null>(null);

  useEffect(() => {
    let active = true;
    if (!projectId) return;
    getProjectDocs(projectId)
      .then((res) => {
        if (!active) return;
        setDocs(res);
        if (res.primary) {
          navigate(res.primary.url, { replace: true });
        } else if (res.secondary.length === 1) {
          navigate(res.secondary[0].url, { replace: true });
        } else if (res.secondary.length > 1) {
          setState("choose");
        } else {
          setState("unmapped");
        }
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [projectId, navigate]);

  if (state === "loading") {
    return (
      <Center h="60vh">
        <Stack align="center" gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="var(--txt-tertiary)">
            Opening project documentation…
          </Text>
        </Stack>
      </Center>
    );
  }

  if (state === "choose" && docs) {
    return (
      <Center h="60vh">
        <Stack gap="xs">
          <Text fw={600} c="var(--txt-primary)">
            Choose documentation space
          </Text>
          {docs.secondary.map((s) => (
            <Anchor key={s.spaceId} href={s.url}>
              {s.name}
            </Anchor>
          ))}
        </Stack>
      </Center>
    );
  }

  return (
    <Center h="60vh">
      <Text size="sm" c="var(--txt-tertiary)">
        {state === "error"
          ? "Couldn't load project documentation."
          : "This project isn't mapped to a ConqrHub space yet."}
      </Text>
    </Center>
  );
}
