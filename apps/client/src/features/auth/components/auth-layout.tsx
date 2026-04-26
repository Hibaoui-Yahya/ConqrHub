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
          fw={500}
          style={{
            userSelect: "none",
            fontFamily: "'Playfair Display', 'Newsreader', serif",
          }}
        >
          Conqr
          <span style={{ color: "#3FC1F2", fontStyle: "italic" }}>AI</span>
          <span style={{ fontSize: "20px", fontWeight: 400, marginLeft: "4px" }}>
            {" "}Wiki
          </span>
        </Text>
      </Group>
      {children}
    </>
  );
}
