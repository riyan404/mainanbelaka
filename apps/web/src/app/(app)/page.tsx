"use client";

import { ChevronLeft, ChevronRight, Maximize } from "lucide-react";
import { useEffect, useState } from "react";
import { CameraGrid } from "@/components/camera-grid";
import { Button } from "@/components/ui/button";
import { api, type DashboardData } from "@/lib/api";

const layouts = [1, 4, 9, 16] as const;
type Layout = (typeof layouts)[number];

export default function DashboardPage() {
	const [layout, setLayout] = useState<Layout>(4);
	const [page, setPage] = useState(1);
	const [data, setData] = useState<DashboardData>({
		cameras: [],
		pagination: { page: 1, pageSize: 4, total: 0, pages: 0 },
	});
	const [error, setError] = useState("");

	useEffect(() => {
		void api<DashboardData>(`/dashboard?page=${page}&layout=${layout}`)
			.then(setData)
			.catch((value) =>
				setError(
					value instanceof Error ? value.message : "Dashboard gagal dimuat",
				),
			);
	}, [layout, page]);

	return (
		<main className="dashboard" id="dashboard-grid">
			<header className="dashboard-toolbar">
				<div>
					<h1>{data.group?.name ?? "Semua Kamera"}</h1>
					<div className="count">{data.pagination.total} kamera aktif</div>
				</div>
				<div className="toolbar-spacer" />
				<div className="layout-switcher" aria-label="Pilih layout">
					{layouts.map((value) => (
						<button
							key={value}
							aria-label={`Layout ${value}`}
							aria-pressed={layout === value}
							onClick={() => {
								setLayout(value);
								setPage(1);
							}}
						>
							{value}
						</button>
					))}
				</div>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Halaman sebelumnya"
					disabled={page <= 1}
					onClick={() => setPage((value) => value - 1)}
				>
					<ChevronLeft aria-hidden size={17} />
				</Button>
				<span className="count">
					{page}/{Math.max(data.pagination.pages, 1)}
				</span>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Halaman berikutnya"
					disabled={page >= data.pagination.pages}
					onClick={() => setPage((value) => value + 1)}
				>
					<ChevronRight aria-hidden size={17} />
				</Button>
				<Button
					variant="secondary"
					size="icon"
					aria-label="Fullscreen grid"
					onClick={() =>
						document.getElementById("dashboard-grid")?.requestFullscreen()
					}
				>
					<Maximize aria-hidden size={16} />
				</Button>
			</header>
			{error ? (
				<div className="empty-state">
					<strong>Dashboard gagal dimuat</strong>
					<span>{error}</span>
				</div>
			) : (
				<CameraGrid cameras={data.cameras} layout={layout} />
			)}
		</main>
	);
}
