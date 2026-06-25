import type { CSSObject, Shadows } from '@mui/material/styles';
import { createTheme, type PaletteColorOptions } from '@mui/material/styles';
// Pull in the MUI X date-picker component keys (MuiPickerDay, MuiDigitalClock, …) so the
// `components` overrides below typecheck.
import type {} from '@mui/x-date-pickers/themeAugmentation';

/**
 * Design tokens — faithful port of the Claude Design project
 * (`design-system/colors_and_type.css`, "Investment Indigo" default palette).
 * "Boring but smart": warm-neutral surfaces + a single restrained indigo accent.
 *
 * Exposed on the theme as `theme.tokens` (see the module augmentation below) so
 * component code can read raw values the MUI palette doesn't model — status 50/500/700
 * background/foreground pairs, the neutral ramp, layout metrics, focus ring, motion.
 */
export const tokens = {
	color: {
		// Cool neutral ramp — "pristine document", faint indigo cast.
		paper: '#FBFBFD', // page background
		paper2: '#F5F6F9', // sunken / striped row
		paper3: '#ECEDF2', // hover surface
		line: '#E1E3EB', // hairlines, dividers
		lineStrong: '#CACEDB', // input borders
		ink4: '#8E93A6', // placeholder, disabled
		ink3: '#555A70', // tertiary text
		ink2: '#262A40', // secondary text, labels
		ink1: '#0B0E22', // primary text
		surface: '#FFFFFF', // card / sheet
		surfaceSunk: '#F7F8FB', // sunken / nested card
		overlay: 'rgba(11, 14, 34, 0.46)',
		// Accent — Investment Indigo. Primary action only.
		accent: {
			50: '#E8EAF6',
			100: '#C5CAE9',
			200: '#9FA8DA',
			300: '#5C6BC0',
			500: '#3949AB', // primary
			600: '#283593', // hover
			700: '#1A237E', // pressed
			fg: '#FFFFFF'
		},
		// Status — desaturated, never alarming. (50 = tint bg, 500 = solid, 700 = text-on-tint)
		won: { 50: '#E8EFE6', 500: '#4F7A4A', 700: '#355231' },
		pending: { 50: '#F6ECD5', 500: '#B58620', 700: '#7E5B11' },
		lost: { 50: '#F2DFD9', 500: '#B0432F', 700: '#7C2C1E' },
		cold: { 50: '#E4E6EA', 500: '#6B7686', 700: '#475160' },
		info: { 50: '#E2E8EC', 500: '#3F5A6C', 700: '#2C4150' }
	},
	font: {
		sans: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
		display: '"Playfair Display", "Iowan Old Style", "Apple Garamond", Baskerville, "Times New Roman", serif',
		mono: 'ui-monospace, "SF Mono", "JetBrains Mono", "Roboto Mono", Consolas, "Liberation Mono", monospace'
	},
	radius: { xs: 2, sm: 4, md: 6, lg: 10, xl: 16, full: 9999 },
	shadow: {
		1: '0 1px 0 rgba(11, 14, 34, 0.03), 0 1px 2px rgba(11, 14, 34, 0.04)',
		2: '0 1px 0 rgba(11, 14, 34, 0.03), 0 8px 24px -6px rgba(11, 14, 34, 0.10)',
		3: '0 24px 48px -12px rgba(11, 14, 34, 0.18), 0 8px 16px -6px rgba(11, 14, 34, 0.06)',
		inset: 'inset 0 0 0 1px rgba(11, 14, 34, 0.05)'
	},
	focusRing: '0 0 0 3px rgba(57, 73, 171, 0.26)',
	motion: {
		easeOut: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
		easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
		durFast: 120,
		durBase: 180,
		durSlow: 260
	},
	layout: {
		containerNarrow: 640,
		container: 1040,
		containerWide: 1280,
		sidebarWidth: 248,
		topbarHeight: 56
	}
} as const;

/**
 * Dark-mode token overrides — a faithful port of the design's `[data-theme="dark"]` surface
 * scale (`screenshots/dark.png`). Only the values that differ from `tokens` are listed and
 * spread over the light tokens in `darkTokens`. The neutral ramp inverts (deep indigo-black
 * surfaces, light ink), the accent lifts a step so it stays legible on dark, and shadows/
 * focus ring deepen. Everything else (font, radius, motion, layout, status hues) is shared.
 */
const darkTokenOverrides = {
	color: {
		// Exact values from the design's `[data-theme="dark"]` (styles.css) — "Investment Indigo,
		// after dark". The -50/-700 pairs invert lightness so tint-bg/ink-on-tint contrast holds.
		paper: '#0E1018', // page background
		paper2: '#151823', // sunken / sidebar
		paper3: '#1E2230', // hover surface
		line: '#272C3B', // hairlines, dividers
		lineStrong: '#3A4154', // input borders
		ink4: '#6E7488', // placeholder, disabled
		ink3: '#9AA0B5', // tertiary text
		ink2: '#C9CDDC', // secondary text, labels
		ink1: '#F3F4F9', // primary text
		surface: '#171B26', // card / sheet
		surfaceSunk: '#11141D', // sunken / nested card
		overlay: 'rgba(3, 4, 9, 0.62)',
		accent: {
			50: '#20264A', // accent tint bg (dark)
			100: '#2A3157',
			200: '#3C4778',
			300: '#515D9C', // tint borders
			500: '#6675CC', // primary
			600: '#7886D6', // hover (lighter on dark)
			700: '#AEB7E8', // ink on tint
			fg: '#0E1018'
		},
		// Status — keep desaturated character, lift mids, invert -50/-700 pairs.
		won: { 50: '#15281B', 500: '#6FA567', 700: '#A9D2A0' },
		pending: { 50: '#2C2410', 500: '#D2A53C', 700: '#E8C77E' },
		lost: { 50: '#2C1611', 500: '#D26A52', 700: '#E8A593' },
		cold: { 50: '#1A1F26', 500: '#8A95A6', 700: '#B9C1CF' },
		info: { 50: '#172026', 500: '#6E8A9C', 700: '#A9C0CE' }
	},
	shadow: {
		// Cast in true black, deeper, so cards separate from the field.
		1: '0 1px 2px rgba(0, 0, 0, 0.40)',
		2: '0 8px 24px -6px rgba(0, 0, 0, 0.55)',
		3: '0 24px 48px -12px rgba(0, 0, 0, 0.66), 0 8px 16px -6px rgba(0, 0, 0, 0.40)',
		inset: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)'
	},
	focusRing: '0 0 0 3px rgba(102, 117, 204, 0.40)'
} as const;

export const darkTokens = {
	...tokens,
	color: { ...tokens.color, ...darkTokenOverrides.color, accent: darkTokenOverrides.color.accent },
	shadow: darkTokenOverrides.shadow,
	focusRing: darkTokenOverrides.focusRing
} as const;

export type ThemeMode = 'light' | 'dark';

/**
 * Cookie that persists the chosen theme. Unlike localStorage it's readable at SSR, so the server
 * renders the correct mode on the first paint — that's what kills the light→dark flash on refresh.
 */
export const THEME_COOKIE = 'offertum-theme';

/** Extract the persisted mode from a Cookie header (SSR) or `document.cookie` (client). Defaults to light. */
export function readThemeModeFromCookie(cookieHeader: string | null | undefined): ThemeMode {
	const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=(light|dark)\\b`));
	return match?.[1] === 'dark' ? 'dark' : 'light';
}

/**
 * The token shape consumed across the app via `theme.tokens`. Both the light (`tokens`) and
 * dark (`darkTokens`) sets satisfy it. Defined as the light tokens' type so callers keep full
 * literal autocomplete; the dark set is structurally identical (same keys, string values).
 */
export type AppTokens = typeof tokens;

/**
 * Semantic typography slots — the type scale from the design system
 * (`design-system/colors_and_type.css`). The `Text.component.tsx` components
 * (`Display`/`H1`/…/`Mono`) render MUI `Typography` with these styles. Defined here, in the
 * design-system source, so type styles live next to the tokens they're built from.
 */
export type TypographySlot = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodySm' | 'label' | 'overline' | 'mono';

export const typographySlots: Record<TypographySlot, CSSObject> = {
	display: {
		fontFamily: tokens.font.display,
		fontWeight: 500,
		fontSize: '3rem',
		lineHeight: '3.25rem',
		letterSpacing: '-0.02em',
		margin: 0
	},
	h1: {
		fontFamily: tokens.font.display,
		fontWeight: 500,
		fontSize: '2.25rem',
		lineHeight: '2.5rem',
		letterSpacing: '-0.018em',
		margin: 0
	},
	h2: {
		fontFamily: tokens.font.display,
		fontWeight: 500,
		fontSize: '1.5rem',
		lineHeight: '2rem',
		letterSpacing: '-0.012em',
		margin: 0
	},
	h3: {
		fontFamily: tokens.font.display,
		fontWeight: 500,
		fontSize: '1.125rem',
		lineHeight: '1.625rem',
		letterSpacing: '-0.006em',
		margin: 0
	},
	body: {
		fontFamily: tokens.font.sans,
		fontWeight: 400,
		fontSize: '0.9375rem',
		lineHeight: '1.375rem',
		margin: 0
	},
	bodySm: {
		fontFamily: tokens.font.sans,
		fontWeight: 400,
		fontSize: '0.8125rem',
		lineHeight: '1.125rem',
		margin: 0
	},
	label: {
		fontFamily: tokens.font.sans,
		fontWeight: 500,
		fontSize: '0.8125rem',
		lineHeight: '1.125rem',
		margin: 0
	},
	overline: {
		fontFamily: tokens.font.sans,
		fontWeight: 600,
		fontSize: '0.75rem',
		lineHeight: '1rem',
		letterSpacing: '0.08em',
		textTransform: 'uppercase',
		margin: 0
	},
	mono: {
		fontFamily: tokens.font.mono,
		fontWeight: 400,
		fontSize: '0.8125rem',
		lineHeight: '1.125rem',
		margin: 0
	}
};

/**
 * Default text color per slot, applied as the `Text.component` `color` prop default so a
 * caller's own `color` (or `sx`) still overrides it. Color is kept out of `typographySlots`
 * (which is merged into `sx`, the highest-precedence layer) precisely so the standard MUI
 * `color` prop stays meaningful — e.g. `<BodySmall color="error.main">`.
 */
export const typographySlotColors: Record<TypographySlot, string> = {
	display: tokens.color.ink1,
	h1: tokens.color.ink1,
	h2: tokens.color.ink1,
	h3: tokens.color.ink1,
	body: tokens.color.ink2,
	bodySm: tokens.color.ink3,
	label: tokens.color.ink2,
	overline: tokens.color.ink3,
	mono: tokens.color.ink2
};

// MUI uses 25 elevation slots; map them onto the three design shadows (0 = none).
const buildShadows = (sh: AppTokens['shadow']): Shadows =>
	[
		'none',
		sh[1],
		sh[1],
		sh[1],
		sh[1],
		sh[2],
		sh[2],
		sh[2],
		sh[2],
		sh[2],
		sh[2],
		sh[2],
		sh[2],
		sh[2],
		sh[2],
		sh[2],
		sh[3],
		sh[3],
		sh[3],
		sh[3],
		sh[3],
		sh[3],
		sh[3],
		sh[3],
		sh[3]
	] as unknown as Shadows;

const statusColor = (c: { 50: string; 500: string; 700: string }): PaletteColorOptions => ({
	light: c[50],
	main: c[500],
	dark: c[700],
	contrastText: '#FFFFFF'
});

/**
 * Outlined-button style for a color ramp — border + text in the 500, tinted 50 hover/active with a
 * darker border. The `outlined` slot override forces a neutral lineStrong border on every outlined
 * button, so each palette color needs this to restore its own border (see the MuiButton variants).
 */
const outlinedRampStyle = (r: { 50: string; 500: string; 700: string }, hoverBorder: string): CSSObject => ({
	borderColor: r[500],
	color: r[500],
	'&:hover': { borderColor: hoverBorder, backgroundColor: r[50] },
	'&:active': { borderColor: r[700], backgroundColor: r[50] }
});

/**
 * Build the MUI theme from a token set + palette mode. The light theme uses `tokens`; the
 * dark theme uses `darkTokens` (same shape, inverted surfaces). Component code never reads the
 * mode directly — it reads `theme.tokens`, which carries the correct (light or dark) values.
 */
const buildTheme = (t: AppTokens, mode: ThemeMode) =>
	createTheme({
		shape: { borderRadius: t.radius.md },
		shadows: buildShadows(t.shadow),
		palette: {
			mode,
			primary: {
				light: t.color.accent[300],
				main: t.color.accent[500],
				dark: t.color.accent[700],
				contrastText: t.color.accent.fg
			},
			secondary: {
				light: t.color.ink3,
				main: t.color.ink2,
				dark: t.color.ink1,
				contrastText: '#FFFFFF'
			},
			error: statusColor(t.color.lost),
			warning: statusColor(t.color.pending),
			success: statusColor(t.color.won),
			info: statusColor(t.color.info),
			// Domain status colors (W4–W13 funnel) — addressable as `color="won|pending|cold"`.
			won: statusColor(t.color.won),
			pending: statusColor(t.color.pending),
			cold: statusColor(t.color.cold),
			background: { default: t.color.paper, paper: t.color.surface },
			text: {
				primary: t.color.ink1,
				secondary: t.color.ink4,
				disabled: t.color.ink4
			},
			divider: t.color.line,
			grey: {
				50: t.color.paper,
				100: t.color.paper2,
				200: t.color.paper3,
				300: t.color.line,
				400: t.color.lineStrong,
				500: t.color.ink4,
				600: t.color.ink3,
				700: t.color.ink2,
				800: t.color.ink1,
				900: t.color.ink1
			},
			action: {
				hover: t.color.paper3,
				selected: t.color.accent[50],
				disabledOpacity: 0.45,
				focus: t.color.accent[50]
			}
		},
		typography: {
			fontFamily: t.font.sans,
			// Page / section headings — Playfair Display, tight tracking.
			h1: {
				fontFamily: t.font.display,
				fontWeight: 500,
				fontSize: '2.25rem',
				lineHeight: '2.5rem',
				letterSpacing: '-0.018em'
			},
			h2: {
				fontFamily: t.font.display,
				fontWeight: 500,
				fontSize: '1.5rem',
				lineHeight: '2rem',
				letterSpacing: '-0.012em'
			},
			h3: {
				fontFamily: t.font.display,
				fontWeight: 500,
				fontSize: '1.125rem',
				lineHeight: '1.625rem',
				letterSpacing: '-0.006em'
			},
			h4: {
				fontFamily: t.font.display,
				fontWeight: 600,
				fontSize: '1rem',
				lineHeight: '1.5rem'
			},
			h5: { fontWeight: 600, fontSize: '0.9375rem', lineHeight: '1.375rem' },
			h6: { fontWeight: 600, fontSize: '0.8125rem', lineHeight: '1.125rem' },
			subtitle1: { fontWeight: 500, fontSize: '0.8125rem', lineHeight: '1.125rem' },
			subtitle2: { fontWeight: 600, fontSize: '0.75rem', lineHeight: '1rem' },
			body1: { fontWeight: 400, fontSize: '0.9375rem', lineHeight: '1.375rem' },
			body2: { fontWeight: 400, fontSize: '0.8125rem', lineHeight: '1.125rem' },
			button: { textTransform: 'none', fontWeight: 500, fontSize: '0.8125rem', lineHeight: '1.125rem' },
			caption: { fontWeight: 400, fontSize: '0.75rem', lineHeight: '1rem' },
			overline: {
				fontWeight: 600,
				fontSize: '0.75rem',
				lineHeight: '1rem',
				letterSpacing: '0.08em',
				textTransform: 'uppercase'
			}
		},
		tokens: t,
		components: {
			MuiCssBaseline: {
				styleOverrides: {
					html: {
						scrollBehavior: 'smooth',
						WebkitFontSmoothing: 'antialiased',
						MozOsxFontSmoothing: 'grayscale',
						overscrollBehavior: 'none',
						margin: 0,
						padding: 0,
						minHeight: '100%'
					},
					body: {
						backgroundColor: t.color.paper,
						color: t.color.ink1,
						// cv11/ss01/ss03 = Inter's single-storey a + stylistic sets used in the design.
						fontFeatureSettings: '"cv11", "ss01", "ss03"'
					}
				}
			},
			MuiButton: {
				defaultProps: { disableElevation: true },
				styleOverrides: {
					root: ({ theme }) => ({ borderRadius: t.radius.md, paddingInline: theme.spacing(1.75) }),
					outlined: { borderColor: t.color.lineStrong },
					sizeSmall: ({ theme }) => ({ paddingInline: theme.spacing(1.25), minHeight: 30 })
				},
				// `containedPrimary` is no longer a styleOverrides key in this MUI version — use the
				// `variants` API to give the primary action its accent hover/active colors.
				variants: [
					{
						props: { variant: 'contained', color: 'primary' },
						style: {
							backgroundColor: t.color.accent[500],
							'&:hover': { backgroundColor: t.color.accent[600] },
							'&:active': { backgroundColor: t.color.accent[700] }
						}
					},
					// Outlined buttons match their border + text to the color (the `outlined` slot override
					// forces a neutral lineStrong border, which these restore). `color="inherit"` stays neutral.
					{
						props: { variant: 'outlined', color: 'primary' },
						style: outlinedRampStyle(t.color.accent, t.color.accent[600])
					},
					{
						props: { variant: 'outlined', color: 'secondary' },
						style: outlinedRampStyle(
							{ 50: t.color.paper3, 500: t.color.ink2, 700: t.color.ink1 },
							t.color.ink1
						)
					},
					{
						props: { variant: 'outlined', color: 'error' },
						style: outlinedRampStyle(t.color.lost, t.color.lost[700])
					},
					{
						props: { variant: 'outlined', color: 'warning' },
						style: outlinedRampStyle(t.color.pending, t.color.pending[700])
					},
					{
						props: { variant: 'outlined', color: 'success' },
						style: outlinedRampStyle(t.color.won, t.color.won[700])
					},
					{
						props: { variant: 'outlined', color: 'info' },
						style: outlinedRampStyle(t.color.info, t.color.info[700])
					},
					{
						props: { variant: 'outlined', color: 'won' },
						style: outlinedRampStyle(t.color.won, t.color.won[700])
					},
					{
						props: { variant: 'outlined', color: 'pending' },
						style: outlinedRampStyle(t.color.pending, t.color.pending[700])
					},
					{
						props: { variant: 'outlined', color: 'cold' },
						style: outlinedRampStyle(t.color.cold, t.color.cold[700])
					}
				]
			},
			MuiIconButton: {
				styleOverrides: { root: { borderRadius: t.radius.sm } }
			},
			MuiPaper: {
				styleOverrides: {
					root: { backgroundImage: 'none' },
					outlined: { borderColor: t.color.line }
				}
			},
			MuiPopover: {
				styleOverrides: {
					paper: {
						marginTop: 8
					}
				}
			},
			MuiCard: {
				defaultProps: { elevation: 0, variant: 'outlined' },
				styleOverrides: {
					root: {
						borderRadius: t.radius.lg,
						border: `1px solid ${t.color.line}`,
						backgroundColor: t.color.surface,
						boxShadow: t.shadow[1]
					}
				}
			},
			MuiOutlinedInput: {
				styleOverrides: {
					root: ({ theme }) => ({
						borderRadius: t.radius.md,
						backgroundColor: t.color.surface,
						// Label lives ABOVE the field, so drop MUI's -5px notch offset: the border box
						// now aligns to the input box, which centres the text and aligns the focus ring.
						'& .MuiOutlinedInput-notchedOutline': { top: 0, borderColor: t.color.lineStrong },
						'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.color.ink4 },
						'&.Mui-focused': { boxShadow: t.focusRing },
						'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
							borderColor: t.color.accent[500],
							borderWidth: 1
						},
						// DS error state — red border + soft red ring (kept while focused too).
						'&.Mui-error': { boxShadow: '0 0 0 3px rgba(220, 45, 29, 0.18)' },
						'&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: '#DC2D1D' },
						'&.Mui-error.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#DC2D1D' },
						// DS disabled state — sunken paper fill.
						'&.Mui-disabled': { backgroundColor: t.color.paper2 },
						// DS single-line input is 36px tall (8px vertical padding + 13.5px text).
						'& .MuiOutlinedInput-input': { padding: theme.spacing(1, 1.5) },
						// Multiline (textarea): padding belongs on the root; the textarea itself gets none,
						// otherwise the two stack and leave a large empty gap above the text.
						'&.MuiInputBase-multiline': { padding: theme.spacing(1, 1.5) },
						'&.MuiInputBase-multiline .MuiOutlinedInput-input': { padding: 0 },
						// Label sits above the field (DS), so the notch gap is removed for a solid top border.
						'& .MuiOutlinedInput-notchedOutline legend': { display: 'none' }
					})
				}
			},
			MuiSwitch: {
				styleOverrides: {
					// DS switch — 30×18 track, 14px knob, accent-500 when on.
					root: ({ theme }) => ({
						width: 30,
						height: 18,
						padding: 0,
						display: 'flex',
						marginRight: theme.spacing(1)
					}),
					switchBase: ({ theme }) => ({
						padding: theme.spacing(0.25),
						color: '#fff',
						'&.Mui-checked': {
							transform: 'translateX(12px)',
							color: '#fff',
							'& + .MuiSwitch-track': { backgroundColor: t.color.accent[500], opacity: 1 }
						},
						'&.Mui-disabled + .MuiSwitch-track': { opacity: 0.45 }
					}),
					thumb: { width: 14, height: 14, boxShadow: 'none' },
					track: { borderRadius: 9, backgroundColor: t.color.lineStrong, opacity: 1 }
				}
			},
			MuiInputLabel: {
				// Label is always rendered on top, so keep it "shrunk" — this also lets the input
				// placeholder show at rest (MUI hides the placeholder under a resting label).
				defaultProps: { shrink: true },
				styleOverrides: {
					// DS renders the field label ABOVE the control (static, 12px/500/ink-2) rather than
					// as MUI's floating notched label. Done in the theme so every Field/Select inherits it.
					root: ({ theme }) => ({
						position: 'relative',
						transform: 'none',
						fontSize: '0.75rem',
						fontWeight: 500,
						lineHeight: 1.4,
						color: t.color.ink2,
						marginBottom: theme.spacing(0.625),
						maxWidth: '100%',
						'&.Mui-focused, &.Mui-error, &.Mui-disabled': { color: t.color.ink2 },
						'& .MuiFormLabel-asterisk': { color: '#DC2D1D' }
					}),
					outlined: {
						transform: 'none',
						'&.MuiInputLabel-sizeSmall': { transform: 'none' },
						'&.MuiInputLabel-shrink': { transform: 'none' }
					}
				}
			},
			MuiFormHelperText: {
				styleOverrides: {
					// DS helper text — 11.5px ink-3, aligned to the field's left edge; error red.
					root: ({ theme }) => ({
						fontSize: '0.71875rem',
						color: t.color.ink3,
						marginLeft: 0,
						marginTop: theme.spacing(0.625),
						'&.Mui-error': { color: '#B71C1C' }
					})
				}
			},
			MuiChip: {
				styleOverrides: {
					root: {
						borderRadius: t.radius.sm,
						fontWeight: 500,
						fontSize: '0.75rem',
						'& .MuiChip-deleteIcon': {
							fontSize: 16
						}
					}
				}
			},
			// ── Date / date-time picker popover (MUI X) — "Calendar popover (NL, Monday-first)" ──
			// Playfair month label, uppercase weekday headers, indigo rounded-square selection, an
			// outlined "today", strikethrough disabled days, and an indigo time-slot column.
			MuiPickersCalendarHeader: {
				styleOverrides: {
					label: {
						fontFamily: t.font.display,
						fontSize: '1.25rem',
						fontWeight: 500,
						letterSpacing: '-0.012em',
						color: t.color.ink1
					},
					// The design shows just "Maand Jaar" with no year-view caret.
					switchViewButton: { display: 'none' }
				}
			},
			MuiDayCalendar: {
				styleOverrides: {
					weekDayLabel: {
						textTransform: 'uppercase',
						fontWeight: 600,
						fontSize: '0.75rem',
						letterSpacing: '0.04em',
						color: t.color.ink3
					}
				}
			},
			MuiPickerDay: {
				styleOverrides: {
					root: {
						borderRadius: t.radius.md,
						fontSize: '0.875rem',
						color: t.color.ink1,
						'&.Mui-selected': {
							backgroundColor: t.color.accent[500],
							color: t.color.accent.fg,
							fontWeight: 700,
							'&:hover, &:focus': { backgroundColor: t.color.accent[600] }
						},
						'&.Mui-disabled:not(.Mui-selected)': {
							color: t.color.ink4,
							textDecoration: 'line-through'
						}
					},
					// Outlined indigo ring for today (unless it's also the selected day).
					today: {
						'&:not(.Mui-selected)': {
							border: `1px solid ${t.color.accent[300]}`,
							fontWeight: 700
						}
					},
					dayOutsideMonth: { color: t.color.ink4 }
				}
			},
			MuiPickersArrowSwitcher: {
				styleOverrides: { button: { color: t.color.ink2 } }
			},
			MuiDigitalClock: {
				styleOverrides: {
					root: { borderLeft: `1px solid ${t.color.line}` },
					item: {
						borderRadius: t.radius.sm,
						fontSize: '0.875rem',
						'&.Mui-selected': {
							backgroundColor: t.color.accent[500],
							color: t.color.accent.fg,
							fontWeight: 700,
							'&:hover, &:focus': { backgroundColor: t.color.accent[600] }
						}
					}
				}
			},
			MuiAccordion: {
				// DS accordion — flat, hairline-bordered card with a hover-tinted summary band and a
				// divider above the details. Shared by every accordion so they all read the same.
				// Spacing uses the theme's 8px scale (theme.spacing) rather than hardcoded px.
				defaultProps: { disableGutters: true, elevation: 0, square: false },
				styleOverrides: {
					root: ({ theme }) => ({
						border: `1px solid ${t.color.line}`,
						borderRadius: t.radius.md,
						backgroundColor: t.color.surface,
						boxShadow: t.shadow[1],
						overflow: 'hidden',
						// Remove MUI's default top divider pseudo-element.
						'&::before': { display: 'none' },
						'& .MuiAccordionSummary-root': {
							padding: theme.spacing(0, 2),
							minHeight: 0,
							backgroundColor: t.color.paper2,
							'&:hover': { backgroundColor: t.color.paper3 },
							'& .MuiAccordionSummary-content': {
								margin: theme.spacing(1.5, 0),
								display: 'flex',
								alignItems: 'center',
								gap: theme.spacing(1),
								flexWrap: 'wrap',
								rowGap: theme.spacing(0.5),
								minWidth: 0
							},
							'& .MuiAccordionSummary-expandIconWrapper': { color: t.color.ink4 }
						},
						'& .MuiAccordionDetails-root': { padding: 0, borderTop: `1px solid ${t.color.line}` },
						// Conversation-thread bubble (Werkruimte): stretches to fill its row; the `--out`
						// modifier (our own reply) swaps the neutral chrome for the accent tint.
						'&.OppThreadBubble': { flex: 1, minWidth: 0 },
						'&.OppThreadBubble--out': {
							backgroundColor: t.color.accent[50],
							borderColor: t.color.accent[300],
							'& .MuiAccordionSummary-root': {
								backgroundColor: 'transparent',
								'&:hover': { backgroundColor: t.color.accent[100] }
							},
							'& .MuiAccordionDetails-root': { borderTopColor: t.color.accent[300] }
						}
					})
				}
			},
			MuiAppBar: {
				defaultProps: { elevation: 0, color: 'default' },
				styleOverrides: {
					root: {
						backgroundColor: t.color.surface,
						color: t.color.ink1,
						borderBottom: `1px solid ${t.color.line}`
					}
				}
			},
			MuiDrawer: {
				styleOverrides: {
					paper: { backgroundColor: t.color.surface, borderColor: t.color.line }
				}
			},
			MuiDivider: {
				styleOverrides: { root: { borderColor: t.color.line } }
			},
			MuiTooltip: {
				styleOverrides: {
					tooltip: ({ theme }) => ({
						backgroundColor: t.color.ink1,
						// ink1 is near-white in dark mode, so the default white text vanishes.
						// `paper` is the inverse of ink1 in both modes → always reads cleanly.
						color: t.color.paper,
						fontSize: '0.75rem',
						borderRadius: t.radius.sm,
						padding: theme.spacing(0.75, 1)
					}),
					arrow: { color: t.color.ink1 }
				},
				defaultProps: { arrow: true }
			},
			MuiLink: {
				defaultProps: { underline: 'hover' },
				styleOverrides: { root: { color: t.color.accent[600], fontWeight: 500 } }
			},
			MuiTab: {
				styleOverrides: {
					root: { textTransform: 'none', fontWeight: 500, minHeight: 44, fontSize: '0.875rem' }
				}
			},
			// ── DS "Data table" (design system → components-table) ──────────────────────────
			// One recipe so every MUI <Table> reads the same: paper-2 uppercase header band, hairline
			// row borders, 13px ink-2 cells, hover-tinted body rows, accent-50 selected row with a
			// left accent bar, and a borderless last row (the frame's bottom edge does the job).
			MuiTable: {
				styleOverrides: { root: { borderCollapse: 'collapse' } }
			},
			MuiTableContainer: {
				// Clip the header band + row borders to the frame's rounded corners.
				styleOverrides: { root: { overflow: 'hidden' } }
			},
			MuiTableCell: {
				styleOverrides: {
					root: ({ theme }) => ({
						borderColor: t.color.line,
						color: t.color.ink2,
						fontSize: '0.8125rem',
						padding: theme.spacing(1.5, 1.75)
					}),
					head: ({ theme }) => ({
						backgroundColor: t.color.paper2,
						color: t.color.ink3,
						fontWeight: 600,
						fontSize: '0.6875rem',
						letterSpacing: '0.06em',
						textTransform: 'uppercase',
						whiteSpace: 'nowrap',
						borderBottom: `1px solid ${t.color.line}`,
						padding: theme.spacing(1.25, 1.75)
					})
				}
			},
			MuiTableBody: {
				styleOverrides: {
					root: {
						'& .MuiTableRow-root:hover': { backgroundColor: t.color.paper2 },
						'& .MuiTableRow-root:last-of-type .MuiTableCell-root': { borderBottom: 0 },
						'& .MuiTableRow-root.Mui-selected': { backgroundColor: t.color.accent[50] },
						'& .MuiTableRow-root.Mui-selected:hover': { backgroundColor: t.color.accent[100] },
						'& .MuiTableRow-root.Mui-selected .MuiTableCell-root': { color: t.color.ink1 },
						// Indigo left bar on the selected row's first cell (design's `td.lead`).
						'& .MuiTableRow-root.Mui-selected .MuiTableCell-root:first-of-type': {
							boxShadow: `inset 2px 0 0 ${t.color.accent[500]}`
						}
					}
				}
			},
			MuiMenu: {
				styleOverrides: {
					// DS dropdown panel — radius-md, hairline border, soft shadow, 4px list padding.
					paper: { borderRadius: t.radius.md, border: `1px solid ${t.color.line}`, boxShadow: t.shadow[2] },
					list: ({ theme }) => ({ padding: theme.spacing(0.5) })
				}
			},
			MuiMenuItem: {
				styleOverrides: {
					// DS panel-item — 7/8 padding, radius-sm, hover paper-2, selected accent-50/700.
					root: ({ theme }) => ({
						borderRadius: t.radius.sm,
						padding: theme.spacing(0.875, 1),
						fontSize: '0.8125rem',
						gap: theme.spacing(1.25),
						'&:hover': { backgroundColor: t.color.paper2 },
						'&.Mui-selected': { backgroundColor: t.color.accent[50], color: t.color.accent[700] },
						'&.Mui-selected:hover': { backgroundColor: t.color.accent[100] },
						// DS panel-item with a secondary line + leading icon (Select options / menus):
						// primary 13px, secondary 11.5px ink-3, lead icon ink-3 — accent when selected.
						'& .MuiListItemText-root': { margin: 0 },
						'& .MuiListItemText-primary': { fontSize: '0.8125rem', lineHeight: 1.3 },
						'& .MuiListItemText-secondary': {
							fontSize: '0.71875rem',
							lineHeight: 1.3,
							color: t.color.ink3
						},
						'& .MuiListItemIcon-root': {
							minWidth: 0,
							marginRight: theme.spacing(1.25),
							color: t.color.ink3
						},
						'&.Mui-selected .MuiListItemText-secondary': { color: t.color.accent[600] },
						'&.Mui-selected .MuiListItemIcon-root': { color: t.color.accent[500] }
					})
				}
			},
			MuiDialog: {
				styleOverrides: {
					// DS modal shell: radius-lg, hairline border, elevation-3, dimmed indigo scrim.
					paper: { borderRadius: t.radius.lg, border: `1px solid ${t.color.line}`, boxShadow: t.shadow[3] }
				}
			},
			MuiBackdrop: {
				styleOverrides: { root: { backgroundColor: t.color.overlay } }
			},
			MuiDialogTitle: {
				styleOverrides: {
					// DS modal header: 18px/bold ink-1 title row with a bottom hairline; the DRY
					// Dialog drops a close button in here, so it's a space-between flex row.
					root: ({ theme }) => ({
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: theme.spacing(2),
						padding: theme.spacing(2.5, 3),
						borderBottom: `1px solid ${t.color.line}`,
						fontFamily: t.font.sans,
						fontSize: '1.125rem',
						fontWeight: 700,
						lineHeight: 1.3,
						color: t.color.ink1
					})
				}
			},
			MuiDialogContent: {
				styleOverrides: {
					// MUI zeroes top padding when content follows a title; restore the DS 20px.
					root: ({ theme }) => ({
						padding: theme.spacing(2.5, 3),
						'.MuiDialogTitle-root + &': { paddingTop: theme.spacing(2.5) }
					})
				}
			},
			MuiDialogActions: {
				styleOverrides: {
					// DS modal footer: top hairline, right-aligned buttons.
					root: ({ theme }) => ({
						padding: theme.spacing(2, 3),
						borderTop: `1px solid ${t.color.line}`,
						gap: theme.spacing(1)
					})
				}
			},
			MuiAlert: {
				defaultProps: { variant: 'standard' },
				styleOverrides: {
					// DS inline-banner shell (used via the Banner component). Tone colors per severity below.
					root: ({ theme }) => ({
						borderRadius: t.radius.md,
						border: '1px solid',
						padding: theme.spacing(1.375, 1.75),
						alignItems: 'center',
						// marginTop nudges the icon to optically centre on the first text line (the glyph
						// sits ~2px below its line-box top); flex-start keeps it by the title on multi-line.
						'& .MuiAlert-icon': {
							padding: 0,
							marginRight: theme.spacing(1.25),
							marginTop: theme.spacing(0.25),
							opacity: 1,
							color: 'inherit'
						},
						'& .MuiAlert-message': { padding: 0, fontSize: 13, lineHeight: 1.5, minWidth: 0 },
						// marginLeft:auto keeps the action (close/CTA) pinned to the right edge regardless
						// of message length; paddingLeft gives it breathing room from the text.
						'& .MuiAlert-action': {
							padding: 0,
							marginRight: 0,
							marginLeft: 'auto',
							paddingLeft: theme.spacing(1.5),
							alignItems: 'flex-start'
						},
						// Tone colors (this MUI version splits variant + color classes). info = Investment-Indigo
						// accent; success/warning/error = the DS's vibrant banner hues.
						'&.MuiAlert-colorInfo': {
							backgroundColor: t.color.accent[50],
							borderColor: t.color.accent[300],
							color: t.color.accent[700]
						},
						'&.MuiAlert-colorSuccess': {
							backgroundColor: '#DCFCE7',
							borderColor: '#16A34A',
							color: '#14532D'
						},
						'&.MuiAlert-colorWarning': {
							backgroundColor: '#FEF3C7',
							borderColor: '#F59E0B',
							color: '#7C2D12'
						},
						'&.MuiAlert-colorError': {
							backgroundColor: '#FEE2E0',
							borderColor: '#DC2D1D',
							color: '#7F1810'
						}
					})
				}
			},
			MuiAlertTitle: {
				styleOverrides: {
					root: ({ theme }) => ({
						fontWeight: 700,
						color: 'inherit',
						marginTop: 0,
						marginBottom: theme.spacing(0.125),
						fontSize: '0.9375rem'
					})
				}
			}
		}
	});

/** The default light theme. */
export const theme = buildTheme(tokens, 'light');

/**
 * The dark theme — same component recipe, inverted surface tokens. `darkTokens` is structurally
 * identical to `tokens` (same keys, different hex literals), so the cast just widens the literal
 * types to satisfy the builder's `AppTokens` parameter.
 */
export const darkTheme = buildTheme(darkTokens as unknown as AppTokens, 'dark');

/** Pick the active theme for a mode. Used by the root `ThemeModeProvider`. */
export function themeForMode(mode: ThemeMode) {
	return mode === 'dark' ? darkTheme : theme;
}

// ── Theme type augmentation ──────────────────────────────────────────────────────────
declare module '@mui/material/styles' {
	interface Theme {
		tokens: typeof tokens;
	}
	interface ThemeOptions {
		tokens?: typeof tokens;
	}
	// Domain status colors, usable as `<Chip color="won" />` etc.
	interface Palette {
		won: Palette['primary'];
		pending: Palette['primary'];
		cold: Palette['primary'];
	}
	interface PaletteOptions {
		won?: PaletteOptions['primary'];
		pending?: PaletteOptions['primary'];
		cold?: PaletteOptions['primary'];
	}
}

// Let the `color` prop on common components accept the domain status colors.
declare module '@mui/material/Chip' {
	interface ChipPropsColorOverrides {
		won: true;
		pending: true;
		cold: true;
	}
}
declare module '@mui/material/Button' {
	interface ButtonPropsColorOverrides {
		won: true;
		pending: true;
		cold: true;
	}
}
