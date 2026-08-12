import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<div className="app-shell">
			<AppSidebar />
			<div className="app-content">{children}</div>
		</div>
	);
}
