"use client";

import { Activity, Camera, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
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

export default function AnalyticsPage() {
	const [cameras, setCameras] = useState<CameraInfo[]>([]);
	const [statuses, setStatuses] = useState<AnalyticsModuleStatus[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [toggling, setToggling] = useState<string | null>(null);

	const [loadTrigger, setLoadTrigger] = useState(0);
	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const [cams, stats] = await Promise.all([
					api<CameraInfo[]>("/cameras"),
					fetchAllAnalyticsStatuses(),
				]);
				if (!cancelled) {
					setCameras(cams);
					setStatuses(stats);
					setError("");
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Gagal memuat data");
				}
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

	async function toggle(cameraId: string, currentlyEnabled: boolean) {
		setToggling(cameraId);
		try {
			if (currentlyEnabled) {
				await disableAnalytics(cameraId);
			} else {
				await enableAnalytics(cameraId);
			}
			setLoadTrigger((v) => v + 1);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Gagal mengubah status");
		} finally {
			setToggling(null);
		}
	}

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
					Kelola modul analitik per kamera dan definisikan zona pengamatan.
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

			{/* Camera list with analytics status */}
			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{cameras.map((camera) => {
					const status = getStatus(camera.id);
					const isAnalyticsEnabled = status?.analyticsEnabled ?? false;
					const workerStatus = status?.workerStatus ?? "IDLE";

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
							}}
						>
							<Camera size={18} style={{ color: "#737373", flexShrink: 0 }} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<div
									style={{ fontSize: 14, color: "#e5e5e5", fontWeight: 500 }}
								>
									{camera.name}
								</div>
								<div style={{ fontSize: 12, color: "#737373" }}>
									{camera.device.name}
								</div>
							</div>
							<StatusBadge status={workerStatus} />
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
							<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
								{isAnalyticsEnabled && (
									<Link href={`/analytics/zones?cameraId=${camera.id}`}>
										<Button variant="ghost" size="sm">
											<Pencil size={14} aria-hidden />
											Zona
										</Button>
									</Link>
								)}
								<Button
									variant={isAnalyticsEnabled ? "secondary" : "ghost"}
									size="sm"
									disabled={!camera.enabled || toggling === camera.id}
									onClick={() => toggle(camera.id, isAnalyticsEnabled)}
								>
									{toggling === camera.id
										? "..."
										: isAnalyticsEnabled
											? "Nonaktifkan"
											: "Aktifkan"}
								</Button>
							</div>
						</div>
					);
				})}
			</div>

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

			{/* Link to dashboard */}
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
