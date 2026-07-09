import { Toast, type ToastTone } from '@/components/Toast.component';
import GlobalStyles from '@mui/material/GlobalStyles';
import { useMemo, type ReactNode } from 'react';
import { cssTransition, toast as toastify, ToastContainer } from 'react-toastify';
import 'react-toastify/ReactToastify.css';

/**
 * Imperative toast API. `toast({ tone, title, body })` pushes a transient notification onto the
 * stack; convenience helpers wrap the common tones. Returns the toast id so a caller can dismiss
 * it early (e.g. a long-running action that resolves to a fresh toast).
 */
export interface ToastInput {
	tone?: ToastTone;
	title: string;
	body?: string;
	/** Auto-dismiss delay in ms. `0` keeps the toast until dismissed manually. Defaults to 5000. */
	duration?: number;
}

interface ToastContextValue {
	toast: (input: ToastInput) => string;
	success: (title: string, body?: string) => string;
	error: (title: string, body?: string) => string;
	info: (title: string, body?: string) => string;
	dismiss: (id: string) => void;
}

const DEFAULT_DURATION = 5000;

// Vertical slide + fade matching the design's original toast motion, driven by react-toastify's
// transition lifecycle. The keyframes/classes live in the GlobalStyles block below.
const offertumSlide = cssTransition({
	enter: 'offertum-toast-enter',
	exit: 'offertum-toast-exit'
});

/** Push a toast through react-toastify, rendering our presentational `Toast` as its content. */
function pushToast({ tone = 'info', title, body, duration }: ToastInput): string {
	const id = toastify(({ closeToast }) => <Toast tone={tone} title={title} body={body} onDismiss={closeToast} />, {
		autoClose: duration === 0 ? false : (duration ?? DEFAULT_DURATION)
	});
	return String(id);
}

// The API is stateless (react-toastify owns the store), so the helpers are module-level singletons.
const toastApi: ToastContextValue = {
	toast: pushToast,
	success: (title, body) => pushToast({ tone: 'success', title, body }),
	error: (title, body) => pushToast({ tone: 'error', title, body }),
	info: (title, body) => pushToast({ tone: 'info', title, body }),
	dismiss: id => toastify.dismiss(id)
};

/**
 * Hosts the react-toastify container + the CSS overrides that strip its default chrome so our
 * `Toast` card is the only visible surface. Mount once near the root (under the theme provider so
 * tokens resolve). The container is pinned bottom-right; each toast auto-dismisses after its
 * `duration` and is dismissible via the card's close button (react-toastify's own close button,
 * icon, and progress bar are disabled). `aria-live="polite"` lives on each `Toast`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
	return (
		<>
			{children}
			<GlobalStyles
				styles={theme => ({
					// Strip react-toastify's default box — our Toast card supplies the full surface.
					// The doubled class (`.a.a`) raises specificity to (0,2,0) so these win over BOTH
					// react-toastify v11's base `.Toastify__toast` (padding/shadow/radius) AND its
					// `.Toastify__toast-theme--light` background — its stylesheet loads after this
					// emotion block, so an equal-specificity override would otherwise lose the tie.
					'.Toastify__toast.Toastify__toast': {
						width: 'auto',
						minHeight: 0,
						marginBottom: theme.spacing(1),
						padding: 0,
						background: 'transparent',
						boxShadow: 'none',
						borderRadius: 0,
						overflow: 'visible'
					},
					'.Toastify__toast-body.Toastify__toast-body': {
						margin: 0,
						padding: 0,
						width: '100%'
					},
					'@keyframes offertumToastIn': {
						from: { opacity: 0, transform: 'translateY(12px)' },
						to: { opacity: 1, transform: 'translateY(0)' }
					},
					'@keyframes offertumToastOut': {
						from: { opacity: 1, transform: 'translateY(0)' },
						to: { opacity: 0, transform: 'translateY(12px)' }
					},
					'.offertum-toast-enter': {
						animation: `offertumToastIn ${theme.tokens.motion.durBase}ms ${theme.tokens.motion.easeOut}`
					},
					'.offertum-toast-exit': {
						animation: `offertumToastOut ${theme.tokens.motion.durBase}ms ${theme.tokens.motion.easeInOut} forwards`
					}
				})}
			/>
			<ToastContainer
				position='bottom-right'
				autoClose={DEFAULT_DURATION}
				transition={offertumSlide}
				closeButton={false}
				icon={false}
				hideProgressBar
				closeOnClick={false}
				draggable={false}
				pauseOnHover
			/>
		</>
	);
}

/** Read the imperative toast API. Backed by react-toastify; no provider state required. */
export function useToast(): ToastContextValue {
	return useMemo(() => toastApi, []);
}
