import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
      extend: {
          colors: {
              "on-tertiary-fixed": "#281900",
              "surface-container-low": "#f2f4f2",
              "tertiary-container": "#926500",
              "surface-container-lowest": "#ffffff",
              "surface-container-high": "#e6e9e7",
              "on-tertiary-fixed-variant": "#604100",
              "inverse-on-surface": "#eff1ef",
              "on-error-container": "#93000a",
              "secondary": "#5f5e5e",
              "on-tertiary-container": "#ffefda",
              "primary-fixed-dim": "#88d982",
              "on-background": "#191c1b",
              "on-tertiary": "#ffffff",
              "inverse-surface": "#2e3130",
              "on-primary": "#ffffff",
              "surface-variant": "#e1e3e1",
              "secondary-fixed-dim": "#c8c6c5",
              "on-primary-fixed": "#002204",
              "error-container": "#ffdad6",
              "on-error": "#ffffff",
              "primary-container": "#2e7d32",
              "on-secondary": "#ffffff",
              "background": "#f8faf8",
              "on-secondary-container": "#636262",
              "surface-tint": "#1b6d24",
              "on-secondary-fixed": "#1b1c1c",
              "on-surface-variant": "#40493d",
              "tertiary-fixed-dim": "#ffba38",
              "surface-bright": "#f8faf8",
              "tertiary-fixed": "#ffdeac",
              "surface": "#f8faf8",
              "tertiary": "#734e00",
              "error": "#ba1a1a",
              "on-surface": "#191c1b",
              "on-secondary-fixed-variant": "#474746",
              "secondary-fixed": "#e5e2e1",
              "surface-container-highest": "#e1e3e1",
              "surface-container": "#eceeec",
              "inverse-primary": "#88d982",
              "primary": "#0d631b",
              "outline-variant": "#bfcaba",
              "surface-dim": "#d8dad9",
              "primary-fixed": "#a3f69c",
              "on-primary-fixed-variant": "#005312",
              "outline": "#707a6c",
              "secondary-container": "#e2dfde",
              "on-primary-container": "#cbffc2"
          },
          borderRadius: {
              "DEFAULT": "0.25rem",
              "lg": "0.5rem",
              "xl": "0.75rem",
              "full": "9999px"
          },
          spacing: {
              "container-padding": "16px",
              "card-gap": "16px",
              "unit": "4px",
              "touch-target-min": "48px",
              "stack-gap": "12px"
          },
          fontFamily: {
              "headline-md": ["Hanken Grotesk"],
              "label-numeric": ["JetBrains Mono"],
              "display-currency": ["Hanken Grotesk"],
              "headline-lg": ["Hanken Grotesk"],
              "label-sm": ["Hanken Grotesk"],
              "body-md": ["Hanken Grotesk"],
              "body-lg": ["Hanken Grotesk"]
          },
          fontSize: {
              "headline-md": ["20px", { "lineHeight": "28px", "fontWeight": "600" }],
              "label-numeric": ["14px", { "lineHeight": "20px", "fontWeight": "500" }],
              "display-currency": ["32px", { "lineHeight": "40px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
              "headline-lg": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
              "label-sm": ["12px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "500" }],
              "body-md": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
              "body-lg": ["18px", { "lineHeight": "26px", "fontWeight": "400" }]
          }
      }
  },
  plugins: [
    forms,
    containerQueries,
  ],
}
