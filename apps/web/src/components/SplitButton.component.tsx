import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';

export interface SplitButtonAction {
	label: string;
	secondaryLabel?: string;
	onClick: () => void;
	icon?: AppIconName;
}

interface SplitButtonProps {
	// Main button — the quick/default action.
	primary: SplitButtonAction;
	// Dropdown menu entries opened from the arrow toggle.
	options: SplitButtonAction[];
	// MUI button variant + color. Default is the DS neutral/secondary look ('outlined' + 'inherit');
	// pass color='primary' to render the accent-outlined/contained look (matches a plain <Button>).
	variant?: 'outlined' | 'contained';
	color?: 'primary' | 'inherit';
	size?: 'small' | 'medium' | 'large';
	disabled?: boolean;
	fullWidth?: boolean;
	ariaLabel?: string;
	sx?: SxProps<Theme>;
	// Fires whenever the dropdown menu opens/closes. Lets a parent (e.g. one wrapping this in a
	// Tooltip) force the tooltip shut when the menu opens — the Menu backdrop otherwise swallows the
	// anchor's mouseleave, leaving a hover tooltip stuck open behind the menu.
	onMenuOpenChange?: (open: boolean) => void;
}

/**
 * Reusable split button — the MUI `ButtonGroup` split-button pattern
 * (https://mui.com/material-ui/react-button-group/#split-button) wrapped once, styled with the
 * design-system neutral/secondary look. A primary action on the left + an arrow toggle that opens
 * the alternative actions. The dropdown is a MUI `Menu` (not a bare `Popper`) so it shares the same
 * dimmed backdrop + scroll lock as Select / AssigneePicker. Menu items fire immediately on click.
 */
export function SplitButton({
	primary,
	options,
	variant = 'outlined',
	color = 'inherit',
	size = 'medium',
	disabled = false,
	fullWidth = true,
	ariaLabel = 'Meer opties',
	sx,
	onMenuOpenChange
}: SplitButtonProps) {
	const { tokens } = useTheme();
	const c = tokens.color;
	// Anchor the menu to the whole button group; tracked in state (callback ref) so it can be read
	// during render without tripping the React Compiler's "no ref access in render" rule.
	const [groupEl, setGroupEl] = useState<HTMLDivElement | null>(null);
	const [open, setOpen] = useState(false);

	const changeMenu = (next: boolean) => {
		setOpen(next);
		onMenuOpenChange?.(next);
	};

	const select = (action: SplitButtonAction) => {
		changeMenu(false);
		action.onClick();
	};

	// The DS neutral/secondary look — only when color='inherit'. With color='primary' we defer to
	// MUI's themed outlined/contained styling so the group matches a plain accent <Button>.
	const isNeutral = color === 'inherit';
	const groupedSx = {
		textTransform: 'none',
		fontWeight: 'medium',
		...(isNeutral
			? {
					fontSize: 13,
					minHeight: 34,
					backgroundColor: c.surface,
					borderColor: c.lineStrong,
					color: c.ink2,
					'&:hover': { backgroundColor: c.paper2, borderColor: c.lineStrong }
				}
			: {})
	} as const;

	return (
		<>
			<ButtonGroup
				ref={setGroupEl}
				variant={variant}
				color={color}
				size={size}
				disabled={disabled}
				fullWidth={fullWidth}
				sx={{ '& .MuiButtonGroup-grouped': groupedSx, ...sx }}
			>
				<Button
					onClick={primary.onClick}
					startIcon={primary.icon ? <AppIcon name={primary.icon} size='small' /> : undefined}
				>
					{primary.label}
				</Button>
				<Button
					aria-label={ariaLabel}
					aria-haspopup='menu'
					aria-expanded={open ? 'true' : undefined}
					onClick={() => changeMenu(!open)}
					sx={{ flex: '0 0 auto', px: 0, minWidth: 36, maxWidth: 36 }}
				>
					<AppIcon name='chevron-down' size='small' />
				</Button>
			</ButtonGroup>
			<Menu
				anchorEl={groupEl}
				open={open}
				onClose={() => changeMenu(false)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				slotProps={{ paper: { sx: { minWidth: groupEl?.offsetWidth ?? 180, maxWidth: 300 } } }}
			>
				{options.map(option => (
					<MenuItem key={option.label} onClick={() => select(option)} sx={{ gap: 1, alignItems: 'center' }}>
						{option.icon && (
							<Box component='span' sx={{ display: 'inline-flex', color: c.ink3 }}>
								<AppIcon name={option.icon} />
							</Box>
						)}
						<Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
							<Box component='span'>{option.label}</Box>
							{option.secondaryLabel && (
								<Box
									component='span'
									sx={{ mt: 0.25, color: c.ink3, fontSize: 12, whiteSpace: 'normal' }}
								>
									{option.secondaryLabel}
								</Box>
							)}
						</Box>
					</MenuItem>
				))}
			</Menu>
		</>
	);
}
