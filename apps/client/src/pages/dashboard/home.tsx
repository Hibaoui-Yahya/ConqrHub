import { Container } from "@mantine/core";
import HomeWorkspace from "@/features/home/components/home-workspace";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

/**
 * Home: search first, then what waits for me, where I was, what changed in
 * my spaces (and, for space managers, the state of their knowledge).
 */
export default function Home() {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>
          {t("Home")} - {getAppName()}
        </title>
      </Helmet>
      <Container size={1100} pt="xl" pb="xl">
        <HomeWorkspace />
      </Container>
    </>
  );
}
