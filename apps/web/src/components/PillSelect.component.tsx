import { AppIcon } from '@/components/AppIcon.component';
import { Pill, pillTonePalette, type PillTone } from '@/components/Pill.component';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import { useState, type ReactNode } from 'react';

/**
 * A design-system Status pill that doubles as a select: the trigger is a `Pill` (soft tint +
 * leading dot + caret); clicking it opens a menu of the given options, each shown with its own
 * leading dot. DRY replacement for the `naked` Select-styled-as-a-pill status pickers.
 *
 * Generic over the option id `T`. The current value must be present in `options` (it renders
 * the trigger). Styling lives in the theme (Pill tokens + `MuiMenu`/`MuiMenuItem` overrides).
 */
export interface PillSelectOption<T extends string> {
	id: T;
	label: ReactNode;
	tone: PillTone;
}

interface PillSelectProps<T extends string> {
	value: T;
	options: PillSelectOption<T>[];
	onChange: (id: T) => void;
	disabled?: boolean;
	ariaLabel?: string;
}

export function PillSelect<T extends string>({
	value,
	options,
	onChange,
	disabled = false,
	ariaLabel
}: PillSelectProps<T>) {
	const { tokens } = useTheme();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const palette = pillTonePalette(tokens);
	const current = options.find(option => option.id === value) ?? options[0];

	if (!current) {
		return null;
	}

	return (
		<>
			<ButtonBase
				aria-label={ariaLabel}
				aria-haspopup='listbox'
				disabled={disabled}
				onClick={event => setAnchor(event.currentTarget)}
				sx={{
					border: 0,
					background: 'transparent',
					padding: 0,
					cursor: disabled ? 'not-allowed' : 'pointer',
					opacity: disabled ? 0.55 : 1
				}}
			>
				<Pill tone={current.tone} dot sx={{ pr: 0.75 }}>
					{current.label}
					<AppIcon name='chevron-down' size='small' />
				</Pill>
			</ButtonBase>
			<Menu
				anchorEl={anchor}
				open={Boolean(anchor)}
				onClose={() => setAnchor(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				transformOrigin={{ vertical: 'top', horizontal: 'left' }}
			>
				{options.map(option => (
					<MenuItem
						key={option.id}
						selected={option.id === value}
						onClick={() => {
							onChange(option.id);
							setAnchor(null);
						}}
					>
						<Box
							component='span'
							sx={{
								width: 6,
								height: 6,
								borderRadius: '50%',
								backgroundColor: palette[option.tone].dot,
								mr: 1,
								flexShrink: 0
							}}
						/>
						{option.label}
					</MenuItem>
				))}
			</Menu>
		</>
	);
}
