import { createTheme, type Theme } from "@mui/material/styles";

const fontFamily = '"Segoe UI", "Helvetica Neue", "Roboto", sans-serif';

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: '[data-theme="%s"]',
  },
  colorSchemes: {
    light: {
      palette: {
        mode: "light",
        primary: {
          main: "#0f766e",
          dark: "#115e59",
          contrastText: "#fffaf2",
        },
        success: {
          main: "#166534",
          contrastText: "#fffaf2",
        },
        warning: {
          main: "#b45309",
          contrastText: "#fffaf2",
        },
        error: {
          main: "#b91c1c",
          contrastText: "#fffaf2",
        },
        background: {
          default: "#f4efe7",
          paper: "#fffaf2",
        },
        text: {
          primary: "#1f2933",
          secondary: "#5f6c7b",
        },
        divider: "#d7c8b3",
      },
    },
    dark: {
      palette: {
        mode: "dark",
        primary: {
          main: "#55b4a6",
          dark: "#7ad1c2",
          contrastText: "#1f2529",
        },
        success: {
          main: "#7ad1c2",
          contrastText: "#1f2529",
        },
        warning: {
          main: "#f4ba56",
          contrastText: "#1f2529",
        },
        error: {
          main: "#f87171",
          contrastText: "#1f2529",
        },
        background: {
          default: "#1f2529",
          paper: "#2a3339",
        },
        text: {
          primary: "#e8ece6",
          secondary: "#b8c1bb",
        },
        divider: "#435159",
      },
    },
  },
  shape: {
    borderRadius: 10,
  },
  spacing: 8,
  typography: {
    fontFamily,
    h1: {
      fontWeight: 700,
    },
    h2: {
      fontWeight: 700,
    },
    h3: {
      fontWeight: 700,
    },
    button: {
      fontWeight: 600,
      textTransform: "none",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: ({ theme }: { theme: Theme }) => ({
          color: theme.palette.text.primary,
          backgroundColor: theme.palette.background.default,
        }),
        "#root": {
          minHeight: "100vh",
        },
      },
    },
    MuiButtonBase: {
      defaultProps: {
        disableRipple: false,
      },
    },
  },
});
