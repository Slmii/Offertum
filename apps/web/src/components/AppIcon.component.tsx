import {
	IconActivity,
	IconAlarm,
	IconAlarmFilled,
	IconAlertCircle,
	IconAlertCircleFilled,
	IconAlertTriangle,
	IconAlertTriangleFilled,
	IconArrowLeft,
	IconArrowRight,
	IconArrowsSort,
	IconArrowUpRight,
	IconBell,
	IconBellFilled,
	IconCalendar,
	IconCalendarFilled,
	IconCheck,
	IconChevronDown,
	IconChevronLeft,
	IconChevronRight,
	IconChevronUp,
	IconCircleCheck,
	IconCircleCheckFilled,
	IconClock,
	IconClockFilled,
	IconCode,
	IconCopy,
	IconCopyFilled,
	IconCornerUpLeft,
	IconCreditCard,
	IconCreditCardFilled,
	IconDeviceMobile,
	IconDeviceMobileFilled,
	IconDotsVertical,
	IconDownload,
	IconExternalLink,
	IconExternalLinkFilled,
	IconFilePlus,
	IconFileText,
	IconFileTextFilled,
	IconFileX,
	IconFlask2,
	IconFlask2Filled,
	IconInbox,
	IconInfoCircle,
	IconInfoCircleFilled,
	IconLayoutDashboard,
	IconLayoutDashboardFilled,
	IconLink,
	IconLinkFilled,
	IconLock,
	IconLockFilled,
	IconLogout,
	IconMail,
	IconMapPin,
	IconMapPinFilled,
	IconMailFilled,
	IconMessageCircle,
	IconMessageCircleFilled,
	IconMoon,
	IconMoonFilled,
	IconPackage,
	IconPaperclip,
	IconPencil,
	IconPhone,
	IconPhoneFilled,
	IconPlug,
	IconPlus,
	IconPuzzle,
	IconPuzzleFilled,
	IconRefresh,
	IconSearch,
	IconSearchOff,
	IconSelector,
	IconSend,
	IconSendFilled,
	IconSettings,
	IconSettingsFilled,
	IconShieldCheck,
	IconShieldCheckFilled,
	IconSnowflake,
	IconSparkles,
	IconSparklesFilled,
	IconSun,
	IconSunFilled,
	IconSunrise,
	IconSunriseFilled,
	IconTarget,
	IconTrendingUp,
	IconTrophy,
	IconTrophyFilled,
	IconUnlink,
	IconUser,
	IconUserCheck,
	IconUserPlus,
	IconUserX,
	IconUserFilled,
	IconUsers,
	IconX
} from '@tabler/icons-react';
import type { CSSProperties } from 'react';

/**
 * Central icon registry for the app shell + chrome, backed by `@tabler/icons-react`.
 *
 * Project convention: every icon pairs an **outline** and a **filled** variant and renders
 * with `color="currentColor"` (so it inherits the surrounding text color). The filled
 * variant is used for the active/selected state. Tabler does not ship a filled variant for
 * every glyph (inbox, package, users, activity, target, selector, logout, chevrons) — for
 * those the outline doubles as the filled slot so active states still render. Pairing them
 * here keeps the convention in one place rather than re-deciding per call site.
 */
export type AppIconName =
	| 'dashboard'
	| 'inbox'
	| 'calendar'
	| 'package'
	| 'settings'
	| 'users'
	| 'credit-card'
	| 'activity'
	| 'target'
	| 'chevron-left'
	| 'chevron-right'
	| 'chevron-down'
	| 'chevrons-up-down'
	| 'arrows-sort'
	| 'lock'
	| 'log-out'
	| 'check'
	| 'plus'
	| 'user'
	| 'user-check'
	| 'user-plus'
	| 'user-x'
	| 'pen-line'
	| 'phone'
	| 'chevron-up'
	| 'dots-vertical'
	| 'external-link'
	| 'link'
	| 'refresh'
	| 'info'
	| 'plug'
	| 'unlink'
	| 'puzzle'
	| 'circle-check'
	| 'clock'
	| 'alert-circle'
	| 'alert-triangle'
	| 'arrow-up-right'
	| 'arrow-right'
	| 'arrow-left'
	| 'send'
	| 'trophy'
	| 'paperclip'
	| 'map-pin'
	| 'corner-up-left'
	| 'file-text'
	| 'file-plus'
	| 'file-x'
	| 'message'
	| 'code'
	| 'flask'
	| 'search'
	| 'search-off'
	| 'snowflake'
	| 'bell'
	| 'mail'
	| 'device-mobile'
	| 'copy'
	| 'download'
	| 'sunrise'
	| 'alarm-clock'
	| 'trending-up'
	| 'sparkles'
	| 'shield-check'
	| 'sun'
	| 'moon'
	| 'x';

type TablerGlyph = typeof IconInbox;

interface IconPair {
	outline: TablerGlyph;
	filled: TablerGlyph;
}

const ICONS: Record<AppIconName, IconPair> = {
	dashboard: { outline: IconLayoutDashboard, filled: IconLayoutDashboardFilled },
	inbox: { outline: IconInbox, filled: IconInbox },
	calendar: { outline: IconCalendar, filled: IconCalendarFilled },
	package: { outline: IconPackage, filled: IconPackage },
	settings: { outline: IconSettings, filled: IconSettingsFilled },
	users: { outline: IconUsers, filled: IconUsers },
	'credit-card': { outline: IconCreditCard, filled: IconCreditCardFilled },
	activity: { outline: IconActivity, filled: IconActivity },
	target: { outline: IconTarget, filled: IconTarget },
	'chevron-left': { outline: IconChevronLeft, filled: IconChevronLeft },
	'chevron-right': { outline: IconChevronRight, filled: IconChevronRight },
	'chevron-down': { outline: IconChevronDown, filled: IconChevronDown },
	'arrows-sort': { outline: IconArrowsSort, filled: IconArrowsSort },
	'chevrons-up-down': { outline: IconSelector, filled: IconSelector },
	lock: { outline: IconLock, filled: IconLockFilled },
	'log-out': { outline: IconLogout, filled: IconLogout },
	check: { outline: IconCheck, filled: IconCheck },
	plus: { outline: IconPlus, filled: IconPlus },
	user: { outline: IconUser, filled: IconUserFilled },
	// Tabler ships no filled user-check / user-plus / user-x — outline doubles as the filled slot.
	'user-check': { outline: IconUserCheck, filled: IconUserCheck },
	'user-plus': { outline: IconUserPlus, filled: IconUserPlus },
	'user-x': { outline: IconUserX, filled: IconUserX },
	'pen-line': { outline: IconPencil, filled: IconPencil },
	phone: { outline: IconPhone, filled: IconPhoneFilled },
	'chevron-up': { outline: IconChevronUp, filled: IconChevronUp },
	'dots-vertical': { outline: IconDotsVertical, filled: IconDotsVertical },
	'external-link': { outline: IconExternalLink, filled: IconExternalLinkFilled },
	link: { outline: IconLink, filled: IconLinkFilled },
	refresh: { outline: IconRefresh, filled: IconRefresh },
	info: { outline: IconInfoCircle, filled: IconInfoCircleFilled },
	plug: { outline: IconPlug, filled: IconPlug },
	unlink: { outline: IconUnlink, filled: IconUnlink },
	puzzle: { outline: IconPuzzle, filled: IconPuzzleFilled },
	'circle-check': { outline: IconCircleCheck, filled: IconCircleCheckFilled },
	clock: { outline: IconClock, filled: IconClockFilled },
	'alert-circle': { outline: IconAlertCircle, filled: IconAlertCircleFilled },
	'alert-triangle': { outline: IconAlertTriangle, filled: IconAlertTriangleFilled },
	// Tabler ships no filled arrow-up-right — outline doubles as the filled slot.
	'arrow-up-right': { outline: IconArrowUpRight, filled: IconArrowUpRight },
	// Tabler ships no filled arrow-right — outline doubles as the filled slot.
	'arrow-right': { outline: IconArrowRight, filled: IconArrowRight },
	// Tabler ships no filled arrow-left — outline doubles as the filled slot.
	'arrow-left': { outline: IconArrowLeft, filled: IconArrowLeft },
	send: { outline: IconSend, filled: IconSendFilled },
	trophy: { outline: IconTrophy, filled: IconTrophyFilled },
	// Tabler ships no filled paperclip — outline doubles as the filled slot.
	paperclip: { outline: IconPaperclip, filled: IconPaperclip },
	'map-pin': { outline: IconMapPin, filled: IconMapPinFilled },
	// Tabler ships no filled corner-up-left — outline doubles as the filled slot.
	'corner-up-left': { outline: IconCornerUpLeft, filled: IconCornerUpLeft },
	'file-text': { outline: IconFileText, filled: IconFileTextFilled },
	// Tabler ships no filled file-plus / file-x — outline doubles as the filled slot.
	'file-plus': { outline: IconFilePlus, filled: IconFilePlus },
	'file-x': { outline: IconFileX, filled: IconFileX },
	message: { outline: IconMessageCircle, filled: IconMessageCircleFilled },
	code: { outline: IconCode, filled: IconCode },
	flask: { outline: IconFlask2, filled: IconFlask2Filled },
	search: { outline: IconSearch, filled: IconSearch },
	// Tabler ships no filled search-off — outline doubles as the filled slot.
	'search-off': { outline: IconSearchOff, filled: IconSearchOff },
	// Tabler ships no filled snowflake — outline doubles as the filled slot.
	snowflake: { outline: IconSnowflake, filled: IconSnowflake },
	bell: { outline: IconBell, filled: IconBellFilled },
	mail: { outline: IconMail, filled: IconMailFilled },
	'device-mobile': { outline: IconDeviceMobile, filled: IconDeviceMobileFilled },
	copy: { outline: IconCopy, filled: IconCopyFilled },
	// Tabler ships no filled download — outline doubles as the filled slot.
	download: { outline: IconDownload, filled: IconDownload },
	sunrise: { outline: IconSunrise, filled: IconSunriseFilled },
	'alarm-clock': { outline: IconAlarm, filled: IconAlarmFilled },
	// Tabler ships no filled trending-up — outline doubles as the filled slot.
	'trending-up': { outline: IconTrendingUp, filled: IconTrendingUp },
	sparkles: { outline: IconSparkles, filled: IconSparklesFilled },
	'shield-check': { outline: IconShieldCheck, filled: IconShieldCheckFilled },
	sun: { outline: IconSun, filled: IconSunFilled },
	moon: { outline: IconMoon, filled: IconMoonFilled },
	// Tabler ships no filled x — outline doubles as the filled slot.
	x: { outline: IconX, filled: IconX }
};

/** Named icon sizes (no free pixel values) — keeps icon sizing consistent across the app. */
export type AppIconSize = 'small' | 'medium' | 'large';

const ICON_SIZE_PX: Record<AppIconSize, number> = {
	small: 14,
	medium: 18,
	large: 24
};

interface AppIconProps {
	name: AppIconName;
	size?: AppIconSize;
	strokeWidth?: number;
	// Render the filled variant — use for active/selected state.
	filled?: boolean;
	style?: CSSProperties;
}

export function AppIcon({ name, size = 'medium', strokeWidth = 1.5, filled = false, style }: AppIconProps) {
	const pair = ICONS[name];
	const Glyph = filled ? pair.filled : pair.outline;
	return <Glyph size={ICON_SIZE_PX[size]} stroke={strokeWidth} color='currentColor' style={style} />;
}
