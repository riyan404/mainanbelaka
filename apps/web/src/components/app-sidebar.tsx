"use client";

import {
	Activity,
	Camera,
	Group,
	LayoutGrid,
	LogOut,
	MonitorCog,
	Settings,
	CalendarClock,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

const items = [
	{ href: "/", label: "Dashboard", icon: LayoutGrid },
	{ href: "/devices", label: "Perangkat", icon: MonitorCog },
	{ href: "/cameras", label: "Kamera", icon: Camera },
	{ href: "/groups", label: "Grup", icon: Group },
	{ href: "/analytics", label: "Analitik", icon: Activity },
	{ href: "/shifts", label: "Shift", icon: CalendarClock },
	{ href: "/settings", label: "Pengaturan", icon: Settings },
];

export function AppSidebar() {
	const pathname = usePathname();
	const router = useRouter();
	return (
		<aside className="sidebar" aria-label="Navigasi utama">
			<Link href="/" className="sidebar-logo" aria-label="CCTV Monitor">
				<Camera aria-hidden size={19} />
			</Link>
			<nav className="sidebar-nav">
				{items.map((item) => (
					<Link
						key={item.href}
						href={item.href}
						title={item.label}
						aria-label={item.label}
						className={`sidebar-link ${pathname === item.href ? "sidebar-link-active" : ""}`}
					>
						<item.icon aria-hidden size={18} />
					</Link>
				))}
			</nav>
			<button
				className="sidebar-link"
				title="Logout"
				aria-label="Logout"
				onClick={async () => {
					await api("/auth/logout", { method: "POST" });
					router.replace("/login");
				}}
			>
				<LogOut aria-hidden size={18} />
			</button>
		</aside>
	);
}
