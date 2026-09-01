import { Table, Text } from "@mantine/core";
import React from "react";
import { useTranslation } from "react-i18next";

interface NoTableResultsProps {
  colSpan: number;
  text?: string;
}
export default function NoTableResults({ colSpan, text }: NoTableResultsProps) {
  const { t } = useTranslation();
  return (
    <Table.Tr>
      <Table.Td colSpan={colSpan}>
        <Text fw={500} fz={13} c="var(--txt-tertiary)" ta="center" py="lg">
          {text || t("No results found...")}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}
