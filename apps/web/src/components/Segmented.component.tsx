import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { useTheme } from '@mui/material/styles';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// `useLayoutEffect` measures the active tab to position the indicator; fall back to `useEffect` on
// the server so SSR doesn't warn (the indicator simply settles on first client paint).
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface SegmentedOption<T extends string> {
	id: T;
	label: ReactNode;
}

/**
 * Reusable segmented (pill) control with a single active background that animates its position +
 * width to the selected option. Tabs are transparent; the shared indicator slides between them.
 */
export function Segmented<T extends string>({
	value,
	options,
	onChange,
	ariaLabel
}: {
	value: T;
	options: SegmentedOption<T>[];
	onChange: (value: T) => void;
	ariaLabel?: string;
}) {
	const { tokens } = useTheme();
	const containerRef = useRef<HTMLDivElement>(null);
	const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

	useIsomorphicLayoutEffect(() => {
		const container = containerRef.current;
		const active = container?.querySelector<HTMLElement>(`[data-segmented-id="${value}"]`);
		if (active) {
			setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
		}
	}, [value, options]);

	return (
		<Box
			ref={containerRef}
			role='tablist'
			aria-label={ariaLabel}
			sx={{
				position: 'relative',
				display: 'inline-flex',
				p: 0.25,
				backgroundColor: tokens.color.paper2,
				border: `1px solid ${tokens.color.line}`,
				borderRadius: `${tokens.radius.md}px`
			}}
		>
			{indicator && (
				<Box
					aria-hidden
					sx={{
						position: 'absolute',
						top: 2,
						bottom: 2,
						left: indicator.left,
						width: indicator.width,
						backgroundColor: tokens.color.surface,
						border: `1px solid ${tokens.color.line}`,
						borderRadius: `${tokens.radius.sm}px`,
						transition: 'left 200ms ease, width 200ms ease',
						zIndex: 0
					}}
				/>
			)}
			{options.map(option => {
				const active = option.id === value;
				return (
					<ButtonBase
						key={option.id}
						data-segmented-id={option.id}
						role='tab'
						aria-selected={active}
						onClick={() => onChange(option.id)}
						sx={{
							position: 'relative',
							zIndex: 1,
							height: 30,
							px: 1.75,
							borderRadius: `${tokens.radius.sm}px`,
							fontFamily: tokens.font.sans,
							fontSize: 13,
							fontWeight: active ? 'bold' : 'medium',
							color: active ? tokens.color.ink1 : tokens.color.ink3,
							transition: 'color 200ms ease'
						}}
					>
						{option.label}
					</ButtonBase>
				);
			})}
		</Box>
	);
}
