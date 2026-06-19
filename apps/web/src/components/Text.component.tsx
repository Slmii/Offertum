import { typographySlotColors, typographySlots, type TypographySlot } from '@/lib/utils/theme.utils';
import Typography, { type TypographyProps } from '@mui/material/Typography';
import type { ElementType } from 'react';

/**
 * Named font weights (MUI resolves these against `theme.typography.fontWeight*`). Passed as
 * the `fontWeight` PROP — `<BodySmall fontWeight="bold">` — so weight is expressed
 * consistently as a named token at call sites, never as a raw number or via `sx`.
 */
export type FontWeight = 'light' | 'regular' | 'normal' | 'medium' | 'bold';

type TextProps = TypographyProps & { fontWeight?: FontWeight };

/**
 * Design-system typography components — the semantic type slots from
 * `design-system/colors_and_type.css` (Display / H1–H3 / Body / BodySmall / Label /
 * Overline / Mono). Use these instead of MUI `<Typography variant="…">` so every text
 * style is defined once, from the tokens (the slot styles live in `theme.utils.ts`).
 *
 * Props are MUI `TypographyProps` plus a named `fontWeight` (the one addition — MUI's
 * Typography has no fontWeight prop). Each renders `Typography` with `variant="inherit"`
 * (no built-in variant styles), the slot's type + optional weight via `sx`, and the slot's
 * default text `color` (overridable by a caller `color`/`sx`).
 */
function makeText(slot: TypographySlot, defaultComponent: ElementType, displayName: string) {
	function Text({ component, color, sx, fontWeight, ...rest }: TextProps) {
		return (
			<Typography
				variant='inherit'
				component={component ?? defaultComponent}
				color={color ?? typographySlotColors[slot]}
				sx={[typographySlots[slot], fontWeight ? { fontWeight } : false, ...(Array.isArray(sx) ? sx : [sx])]}
				{...rest}
			/>
		);
	}
	Text.displayName = displayName;
	return Text;
}

export const Display = makeText('display', 'h1', 'Display');
export const H1 = makeText('h1', 'h1', 'H1');
export const H2 = makeText('h2', 'h2', 'H2');
export const H3 = makeText('h3', 'h3', 'H3');
export const Body = makeText('body', 'p', 'Body');
export const BodySmall = makeText('bodySm', 'p', 'BodySmall');
export const Label = makeText('label', 'span', 'Label');
export const Overline = makeText('overline', 'span', 'Overline');
export const Mono = makeText('mono', 'span', 'Mono');
