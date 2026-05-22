import { Component, type ReactNode } from 'react';

interface SilentErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface SilentErrorBoundaryState {
	hasError: boolean;
}

// Catches render errors below and renders `fallback` (default: null) instead of
// propagating up the tree. Use ONLY for non-essential widgets — the rule is "if
// this widget breaks, the rest of the app must still work." Notifications, badge
// counts, presence indicators fit; primary content does not.
export class SilentErrorBoundary extends Component<SilentErrorBoundaryProps, SilentErrorBoundaryState> {
	override state: SilentErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): SilentErrorBoundaryState {
		return { hasError: true };
	}

	override render() {
		if (this.state.hasError) {
			return this.props.fallback ?? null;
		}
		return this.props.children;
	}
}
