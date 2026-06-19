import { Toast, type ToastTone } from '@/components/Toast.component';
import Box from '@mui/material/Box';
import Portal from '@mui/material/Portal';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Imperative toast API. `toast({ tone, title, body })` pushes a transient notification onto the
 * stack; convenience helpers wrap the common tones. Returns the toast id so a caller can dismiss
 * it early (e.g. a long-running action that resolves to a fresh toast).
 */
export interface ToastInput {
	tone?: ToastTone;
	title: string;
	body?: string;
	/** Auto-dismiss delay in ms. `0` keeps the toast until dismissed manually. Defaults to 4000. */
	duration?: number;
}

interface ToastContextValue {
	toast: (input: ToastInput) => string;
	success: (title: string, body?: string) => string;
	error: (title: string, body?: string) => string;
	info: (title: string, body?: string) => string;
	dismiss: (id: string) => void;
}

interface ActiveToast extends ToastInput {
	id: string;
}

const DEFAULT_DURATION = 4000;

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hosts the toast stack + exposes the imperative API via `useToast`. Mount once near the root
 * (under the theme provider so tokens resolve). The stack renders through a MUI `Portal` pinned
 * bottom-right, newest-on-top, so toasts overlay any surface without affecting layout. Each toast
 * auto-dismisses after its `duration` (default 4 s) and is dismissible manually via the close
 * button. `aria-live="polite"` lives on each `Toast`, so screen readers announce without stealing
 * focus.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<ActiveToast[]>([]);
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	const dismiss = useCallback((id: string): void => {
		setToasts(prev => prev.filter(t => t.id !== id));
		const timer = timers.current.get(id);
		if (timer) {
			clearTimeout(timer);
			timers.current.delete(id);
		}
	}, []);

	const toast = useCallback(
		(input: ToastInput): string => {
			const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			setToasts(prev => [...prev, { ...input, id }]);

			const duration = input.duration ?? DEFAULT_DURATION;
			if (duration > 0) {
				const timer = setTimeout(() => dismiss(id), duration);
				timers.current.set(id, timer);
			}
			return id;
		},
		[dismiss]
	);

	const success = useCallback((title: string, body?: string) => toast({ tone: 'success', title, body }), [toast]);
	const error = useCallback((title: string, body?: string) => toast({ tone: 'error', title, body }), [toast]);
	const info = useCallback((title: string, body?: string) => toast({ tone: 'info', title, body }), [toast]);

	const value = useMemo<ToastContextValue>(
		() => ({ toast, success, error, info, dismiss }),
		[toast, success, error, info, dismiss]
	);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<Portal>
				<Box
					sx={theme => ({
						position: 'fixed',
						right: 16,
						bottom: 16,
						zIndex: theme.zIndex.snackbar,
						display: 'flex',
						flexDirection: 'column',
						gap: 1,
						pointerEvents: 'none',
						// Children re-enable pointer events so the close button + content stay interactive.
						'& > *': { pointerEvents: 'auto' }
					})}
				>
					{toasts.map(t => (
						<Toast key={t.id} tone={t.tone} title={t.title} body={t.body} onDismiss={() => dismiss(t.id)} />
					))}
				</Box>
			</Portal>
		</ToastContext.Provider>
	);
}

/** Read the imperative toast API. Must be used under `ToastProvider`. */
export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) {
		throw new Error('useToast must be used within a ToastProvider');
	}
	return ctx;
}
