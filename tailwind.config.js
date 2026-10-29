// Colors resolve to CSS variables (see src/index.css) so `.dark` on <html> swaps the whole palette.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', '"SF Pro Display"', 'Inter', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      colors: {
        page: v('page'), // #ffffff
        side: v('side'), // #f2f2f7
        surface: v('surface'), // #f5f5f7
        'surface-hover': v('surface-hover'),
        card: v('card'), // raised surfaces: menus, pills, dialogs
        'card-hover': v('card-hover'),
        ink: v('ink'), // #1d1d1f
        muted: v('muted'), // #6e6e73
        'muted-side': v('muted-side'), // #636366
        hairline: v('hairline'), // #d2d2d7
        track: v('track'), // #d1d1d6
        accent: {
          DEFAULT: v('accent'), // #0071e3
          hover: v('accent-hover'),
          press: v('accent-press'),
          link: v('accent-link'), // #0066cc, links on grey surfaces
          soft: v('accent-soft'),
        },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft'), fill: v('danger-fill') },
        success: v('success'),
        warn: { DEFAULT: v('warn'), fill: v('warn-fill') },
        // Muted placeholder tones for tiles while photos load.
        tone: {
          sand: v('tone-0'),
          mist: v('tone-1'),
          rose: v('tone-2'),
          sage: v('tone-3'),
          sky: v('tone-4'),
        },
      },
      borderRadius: {
        tile: '16px',
        logo: '16px',
      },
      letterSpacing: {
        display: '-0.03em',
      },
      boxShadow: {
        pill: 'var(--shadow-pill)',
        lift: 'var(--shadow-lift)',
        float: 'var(--shadow-float)',
      },
    },
  },
  plugins: [],
};
