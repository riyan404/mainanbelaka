"use client";

import { Activity, Camera, Pencil, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useClientPagination } from "@/hooks/use-client-pagination";
import {
	type AnalyticsMode,
	type AnalyticsModuleStatus,
	disableAnalytics,
	enableAnalytics,
	fetchAllAnalyticsStatuses,
} from "@/lib/analytics";
import { api } from "@/lib/api";

interface CameraInfo {
	id: string;
	name: string;
	enabled: boolean;
	device: { name: string };
}

const MODE_LABELS: Record<AnalyticsMode, { label: string; desc: string }> = {
	POSE: {
		label: "Pose (tubuh)",
		desc: "Deteksi orang + klasifikasi duduk/berdiri. Untuk kamera CCTV ruangan.",
	},
	FACE: {
		label: "Face (wajah)",
		desc: "Deteksi wajah / kehadiran di depan kamera. Untuk webcam PC kasir.",
	},
};

export default function AnalyticsPage() {
	const [cameras, setCameras] = useState<CameraInfo[]>([]);
	const [statuses, setStatuses] = useState<AnalyticsModuleStatus[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [toggling, setToggling] = useState<string | null>(null);
	// mode yang sedang dipilih per kamera (sebelum simpan)
	const [pendingMode, setPendingMode] = useState<Record<string, AnalyticsMode>>(
		{},
	);

	const [loadTrigger, setLoadTrigger] = useState(0);
	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const [cams, stats] = await Promise.all([
					api<import("@/lib/api").Paginated<CameraInfo>>(
						"/cameras?pageSize=500",
					).then((r) => r.items),
					fetchAllAnalyticsStatuses(),
				]);
				if (!cancelled) {
					setCameras(cams);
					setStatuses(stats);
					setError("");
				}
			} catch (err) {
				if (!cancelled)
					setError(err instanceof Error ? err.message : "Gagal memuat data");
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [loadTrigger]);

	function getStatus(cameraId: string): AnalyticsModuleStatus | undefined {
		return statuses.find((s) => s.cameraChannelId === cameraId);
	}

	function getMode(cameraId: string): AnalyticsMode {
		// pending override → status dari DB → default POSE
		return (
			pendingMode[cameraId] ?? getStatus(cameraId)?.analyticsMode ?? "POSE"
		);
	}

	async function toggle(cameraId: string, currentlyEnabled: boolean) {
		setToggling(cameraId);
		try {
			if (currentlyEnabled) {
				await disableAnalytics(cameraId);
			} else {
				// aktifkan dengan mode yang dipilih
				const mode = getMode(cameraId);
				await enableAnalytics(cameraId, mode);
			}
			setLoadTrigger((v) => v + 1);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Gagal mengubah status");
		} finally {
			setToggling(null);
		}
	}

	async function changeMode(cameraId: string, newMode: AnalyticsMode) {
		// Simpan pilihan pending
		setPendingMode((p) => ({ ...p, [cameraId]: newMode }));
		const status = getStatus(cameraId);
		// Kalau sudah aktif → langsung re-enable dengan mode baru
		if (status?.analyticsEnabled) {
			setToggling(cameraId);
			try {
				await enableAnalytics(cameraId, newMode);
				setLoadTrigger((v) => v + 1);
				// setelah reload, hapus pending karena DB sudah sinkron
				setPendingMode((p) => {
					const n = { ...p };
					delete n[cameraId];
					return n;
				});
			} catch (err) {
				setError(err instanceof Error ? err.message : "Gagal mengubah mode");
			} finally {
				setToggling(null);
			}
		}
	}

	const [search, setSearch] = useState("");
	const [filterActive, setFilterActive] = useState<"all" | "active">("all");

	// Filter + search client-side dari semua kamera yang sudah di-fetch
	const filtered = useMemo(() => {
		return cameras.filter((c) => {
			if (filterActive === "active") {
				const s = getStatus(c.id);
				if (!s?.analyticsEnabled) return false;
			}
			if (search) {
				const q = search.toLowerCase();
				return (
					c.name.toLowerCase().includes(q) ||
					c.device.name.toLowerCase().includes(q)
				);
			}
			return true;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cameras, search, filterActive, statuses]);

	const pg = useClientPagination(filtered, 25);

	if (loading) {
		return (
			<main style={{ padding: 24 }}>
				<h1 style={{ fontSize: 20, fontWeight: 600, color: "#e5e5e5" }}>
					Analitik
				</h1>
				<p style={{ color: "#737373", marginTop: 8 }}>Memuat...</p>
			</main>
		);
	}

	return (
		<main style={{ padding: 24 }}>
			<header style={{ marginBottom: 24 }}>
				<h1 style={{ fontSize: 20, fontWeight: 600, color: "#e5e5e5" }}>
					<Activity
						size={20}
						style={{
							display: "inline",
							marginRight: 8,
							verticalAlign: "middle",
						}}
					/>
					Analitik Dwell-Time
				</h1>
				<p style={{ color: "#737373", fontSize: 13, marginTop: 4 }}>
					Kelola modul analitik per kamera. Pilih mode sesuai jenis kamera.
				</p>
			</header>

			{error && (
				<div
					style={{
						background: "rgba(239,68,68,0.1)",
						border: "1px solid rgba(239,68,68,0.3)",
						borderRadius: 8,
						padding: "10px 14px",
						color: "#ef4444",
						fontSize: 13,
						marginBottom: 16,
					}}
				>
					{error}
				</div>
			)}

			{/* Search + filter bar */}
			<div
				style={{
					display: "flex",
					gap: 8,
					marginBottom: 12,
					flexWrap: "wrap",
					alignItems: "center",
				}}
			>
				<div style={{ position: "relative", flex: "1 1 200px", minWidth: 0 }}>
					<Search
						size={14}
						style={{
							position: "absolute",
							left: 10,
							top: "50%",
							transform: "translateY(-50%)",
							color: "#737373",
							pointerEvents: "none",
						}}
					/>
					<input
						className="input"
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							pg.reset();
						}}
						placeholder="Cari nama kamera atau perangkat…"
						style={{ paddingLeft: 30 }}
					/>
				</div>
				<div style={{ display: "flex", gap: 4 }}>
					{(["all", "active"] as const).map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => {
								setFilterActive(f);
								pg.reset();
							}}
							style={{
								padding: "4px 12px",
								borderRadius: "var(--radius)",
								border: "1px solid",
								borderColor:
									filterActive === f ? "var(--text)" : "var(--border)",
								background: filterActive === f ? "var(--text)" : "transparent",
								color: filterActive === f ? "var(--bg)" : "var(--muted)",
								fontSize: 12,
								fontWeight: 600,
								cursor: "pointer",
							}}
						>
							{f === "all" ? "Semua" : "Aktif"}
						</button>
					))}
				</div>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{pg.slice.map((camera) => {
					const status = getStatus(camera.id);
					const isEnabled = status?.analyticsEnabled ?? false;
					const workerStatus = status?.workerStatus ?? "IDLE";
					const currentMode = getMode(camera.id);
					const modeInfo = MODE_LABELS[currentMode];
					const isBusy = toggling === camera.id;

					return (
						<div
							key={camera.id}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "12px 16px",
								background: "#171717",
								borderRadius: 8,
								border: "1px solid #262626",
								flexWrap: "wrap",
							}}
						>
							<Camera size={18} style={{ color: "#737373", flexShrink: 0 }} />

							{/* Nama kamera */}
							<div style={{ flex: 1, minWidth: 140 }}>
								<div
									style={{ fontSize: 14, color: "#e5e5e5", fontWeight: 500 }}
								>
									{camera.name}
								</div>
								<div style={{ fontSize: 12, color: "#737373" }}>
									{camera.device.name}
								</div>
							</div>

							{/* Status worker */}
							<StatusBadge status={workerStatus} />

							{/* Error message */}
							{status?.lastErrorMessage && (
								<span
									style={{
										fontSize: 11,
										color: "#ef4444",
										maxWidth: 200,
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
									title={status.lastErrorMessage}
								>
									{status.lastErrorMessage}
								</span>
							)}

							{/* Mode selector */}
							<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
								<label
									htmlFor={`mode-${camera.id}`}
									style={{
										fontSize: 12,
										color: "#737373",
										whiteSpace: "nowrap",
									}}
								>
									Mode:
								</label>
								<select
									id={`mode-${camera.id}`}
									value={currentMode}
									disabled={isBusy}
									title={modeInfo.desc}
									onChange={(e) =>
										void changeMode(camera.id, e.target.value as AnalyticsMode)
									}
									style={{
										background: "#262626",
										color: "#e5e5e5",
										border: "1px solid #404040",
										borderRadius: 6,
										padding: "3px 8px",
										fontSize: 12,
										cursor: "pointer",
									}}
								>
									{(Object.keys(MODE_LABELS) as AnalyticsMode[]).map((m) => (
										<option key={m} value={m} title={MODE_LABELS[m].desc}>
											{MODE_LABELS[m].label}
										</option>
									))}
								</select>
							</div>

							{/* Aksi */}
							<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
								{isEnabled && (
									<Link href={`/analytics/zones?cameraId=${camera.id}`}>
										<Button variant="ghost" size="sm">
											<Pencil size={14} aria-hidden />
											Zona
										</Button>
									</Link>
								)}
								<Button
									variant={isEnabled ? "secondary" : "ghost"}
									size="sm"
									disabled={!camera.enabled || isBusy}
									onClick={() => void toggle(camera.id, isEnabled)}
								>
									{isBusy ? "..." : isEnabled ? "Nonaktifkan" : "Aktifkan"}
								</Button>
							</div>
						</div>
					);
				})}
			</div>

			<Pagination
				page={pg.page}
				pages={pg.pages}
				total={pg.total}
				pageSize={pg.pageSize}
				onChange={pg.changePage}
			/>

			{cameras.length === 0 && !error && (
				<div
					style={{
						textAlign: "center",
						color: "#525252",
						padding: "48px 0",
						fontSize: 14,
					}}
				>
					Belum ada kamera. Tambahkan perangkat terlebih dahulu.
				</div>
			)}

			<div style={{ marginTop: 24 }}>
				<Link
					href="/analytics/dashboard"
					style={{ color: "#3b82f6", fontSize: 13 }}
				>
					Lihat Dashboard Riwayat Dwell-Time →
				</Link>
			</div>
		</main>
	);
}
