import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)')({
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({
				to: '/sign-in'
			});
		}
	},
	component: RouteComponent
});

function RouteComponent() {
	return <Outlet />;
}
