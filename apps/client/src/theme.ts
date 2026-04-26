import {
  createTheme,
  CSSVariablesResolver,
  MantineColorsTuple,
  Tabs,
} from "@mantine/core";

const blue: MantineColorsTuple = [
  "#e6f7fd",
  "#cceffc",
  "#99dff9",
  "#66cff5",
  "#3FC1F2",
  "#33b0e0",
  "#279ccc",
  "#1d85b0",
  "#146e94",
  "#0c5878",
];

const red: MantineColorsTuple = [
  "#ffebeb",
  "#fad7d7",
  "#eeadad",
  "#e3807f",
  "#da5a59",
  "#d54241",
  "#d43535",
  "#bc2727",
  "#a82022",
  "#93151b",
];

export const theme = createTheme({
  colors: {
    blue,
    red,
  },
  components: {
    Tabs: Tabs.extend({
      vars: (theme, props) => ({
        root: {
          ...(props.color === "dark" && {
            "--tabs-color": "var(--mantine-color-dark-default)",
          }),
        },
      }),
    }),
  },
  /***
  components: {
    ActionIcon: ActionIcon.extend({
      vars: (_theme, props) => {
        return {
          root: {
            ...(props.variant === "subtle" &&
              props.color === "dark" && {
                "--ai-color": "var(--mantine-color-default-color)",
                "--ai-hover": "var(--mantine-color-default-hover)",
              }),
          },
        };
      },
    }),
  },
  ***/
});

export const mantineCssResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    "--input-error-size": theme.fontSizes.sm,
  },
  light: {
    "--mantine-color-dimmed": "#6b7280",
    "--mantine-color-dark-light-color": "#4e5359",
    "--mantine-color-dark-light-hover": "var(--mantine-color-gray-light-hover)",
  },
  dark: {
    "--mantine-color-dark-light-color": "var(--mantine-color-gray-4)",
    "--mantine-color-dark-light-hover": "var(--mantine-color-default-hover)",
  },
});
