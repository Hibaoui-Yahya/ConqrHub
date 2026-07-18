import React from "react";
import { Group, Text } from "@mantine/core";
import classes from "./auth.module.css";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      <Group justify="center" gap={8} className={classes.logo}>
        <Text
          size="32px"
          fw={700}
          style={{
            userSelect: "none",
            letterSpacing: "-0.02em",
          }}
        >
          Conqr
          <span style={{ color: "var(--brand-default)" }}>
            Hub
          </span>
        </Text>
      </Group>
      {children}
    </>
  );
}
