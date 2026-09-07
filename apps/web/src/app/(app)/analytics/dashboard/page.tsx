"use client";

import { BarChart3, Clock, TrendingUp, Users } from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import {
	type AnalyticsZone,
	type DwellEvent,
	type EventsResponse,
	type AnalyticsSummary,
	fetchEvents,
	fetchSummary,
	fetchZones,
} from "@/lib/analytics";
import { api } from "@/lib/api";

interface CameraInfo {
	id: string;
	name: string;
	device: { name: string };
}

function formatDuration(seconds: number | undefined): string {
	if (seconds === undefined || seconds === null) return "-";
	if (seconds < 60) return `${seconds}s`;
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	if (mins < 60) return `${mins}m ${secs}s`;
	const hours = Math.floor(mins / 60);
	const remainMins = mins % 60;
	return `${hours}h ${remainMins}m`;
}

function formatDateTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString("id-ID", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function DashboardContent() {
	const [cameras, setCameras] = useState<CameraInfo[]>([]);
	const [zones, setZones] = useState<AnalyticsZone[]>([]);
	const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
	const [eventsData, setEventsData] = useState<EventsResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Filters
	const [cameraId, setCameraId] = useState("");
	const [zoneId, setZoneId] = useState("");
	const [posture, setPosture] = useState("");
	const [range, setRange] = useState("today");
	const [page, setPage] = useState(1);

	// Compute date range
	const getDateRange = useCallback((): { from?: string; to?: string } => {
		const now = new Date();
		switch (range) {
			case "today": {
				const start = new Date(now);
				start.setHours(0, 0, 0, 0);
				return { from: start.toISOString(), to: now.toISOString() };
			}
			case "7days": {
				const start = new Date(now);
				start.setDate(start.getDate() - 7);
				return { from: start.toISOString(), to: now.toISOString() };
			}
			case "30days": {
				const start = new Date(now);
				start.setDate(start.getDate() - 30);
				return { from: start.toISOString(), to: now.toISOString() };
			}
			default:
				return {};
		}
	}, [range]);

	// Load cameras and zones on mount
	useEffect(() => {
		async function init() {
			try {
				const [cams, zns] = await Promise.all([
					api<import("@/lib/api").Paginated<CameraInfo>>("/cameras?pageSize=500").then((r) => r.items),
					fetchZones(),
				]);
				setCameras(cams);
				setZones(zns);
			} catch {
				// ignore
			}
		}
		void init();
	}, []);

	// Load data when filters change
	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const dateRange = getDateRange();
				const params = {
					...(cameraId && { cameraId }),
					...(zoneId && { zoneId }),
					...dateRange,
				};

				const [sum, evts] = await Promise.all([
					fetchSummary(params),
					fetchEvents({
						...params,
						...(posture && { posture }),
						page,
					}),
				]);
				if (!cancelled) {
					setSummary(sum);
					setEventsData(evts);
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
	}, [cameraId, zoneId, posture, range, page, getDateRange]);

	const filteredZones = cameraId
		? zones.filter((z) => z.cameraChannelId === cameraId)
		: zones;

	if (loading && !summary) {
		return (
			<main style={{ padding: 24 }}>
				<p style={{ color: "#737373" }}>Memuat dashboard analitik...</p>
			</main>
		);
	}

	return (
		<main style={{ padding: 24 }}>
			<header style={{ marginBottom: 20 }}>
				<h1 style={{ fontSize: 20, fontWeight: 600, color: "#e5e5e5" }}>
					<BarChart3
						size={20}
						style={{
							display: "inline",
							marginRight: 8,
							verticalAlign: "middle",
						}}
					/>
					Dashboard Dwell-Time
				</h1>
				<p style={{ color: "#737373", fontSize: 13, marginTop: 4 }}>
					Riwayat kehadiran dan durasi per zona analitik.
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

			{/* Filters */}
			<div
				style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}
			>
				<select
					value={cameraId}
					onChange={(e) => {
						setCameraId(e.target.value);
						setZoneId("");
						setPage(1);
					}}
					style={selectStyle}
				>
					<option value="">Semua Kamera</option>
					{cameras.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
				<select
					value={zoneId}
					onChange={(e) => {
						setZoneId(e.target.value);
						setPage(1);
					}}
					style={selectStyle}
				>
					<option value="">Semua Zona</option>
					{filteredZones.map((z) => (
						<option key={z.id} value={z.id}>
							{z.name}
						</option>
					))}
				</select>
				<select
					value={posture}
					onChange={(e) => {
						setPosture(e.target.value);
						setPage(1);
					}}
					style={selectStyle}
				>
					<option value="">Semua Postur</option>
					<option value="SITTING">Duduk</option>
					<option value="STANDING">Berdiri</option>
					<option value="UNKNOWN">Tidak Diketahui</option>
				</select>
				<select
					value={range}
					onChange={(e) => {
						setRange(e.target.value);
						setPage(1);
					}}
					style={selectStyle}
				>
					<option value="today">Hari Ini</option>
					<option value="7days">7 Hari Terakhir</option>
					<option value="30days">30 Hari Terakhir</option>
					<option value="all">Semua</option>
				</select>
			</div>

			{/* Summary cards */}
			{summary && (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
						gap: 12,
						marginBottom: 20,
					}}
				>
					<SummaryCard
						icon={<Users size={18} />}
						label="Total Kehadiran"
						value={String(summary.totalEvents)}
					/>
					<SummaryCard
						icon={<Clock size={18} />}
						label="Rata-rata Durasi"
						value={formatDuration(summary.avgDurationSeconds)}
					/>
					<SummaryCard
						icon={<TrendingUp size={18} />}
						label="Durasi Terlama"
						value={formatDuration(summary.maxDurationSeconds)}
					/>
					<SummaryCard
						icon={<BarChart3 size={18} />}
						label="Sedang Berlangsung"
						value={String(summary.ongoingEvents)}
					/>
				</div>
			)}

			{/* Posture breakdown */}
			{summary && Object.keys(summary.postureBreakdown).length > 0 && (
				<div
					style={{
						display: "flex",
						gap: 12,
						marginBottom: 20,
						flexWrap: "wrap",
					}}
				>
					{Object.entries(summary.postureBreakdown).map(([key, count]) => (
						<div
							key={key}
							style={{
								padding: "6px 14px",
								background: "#171717",
								borderRadius: 6,
								border: "1px solid #262626",
								fontSize: 13,
								color: "#a3a3a3",
							}}
						>
							{key === "SITTING"
								? "🪑 Duduk"
								: key === "STANDING"
									? "🧍 Berdiri"
									: "❓ Tidak diketahui"}
							: <strong style={{ color: "#e5e5e5" }}>{count}</strong>
						</div>
					))}
				</div>
			)}

			{/* Events table */}
			{eventsData && eventsData.events.length > 0 ? (
				<>
					<div style={{ overflowX: "auto" }}>
						<table
							style={{
								width: "100%",
								borderCollapse: "collapse",
								fontSize: 13,
							}}
						>
							<thead>
								<tr style={{ borderBottom: "1px solid #262626" }}>
									<th style={thStyle}>Zona</th>
									<th style={thStyle}>Kamera</th>
									<th style={thStyle}>Masuk</th>
									<th style={thStyle}>Keluar</th>
									<th style={thStyle}>Durasi</th>
									<th style={thStyle}>Postur</th>
								</tr>
							</thead>
							<tbody>
								{eventsData.events.map((event) => (
									<EventRow key={event.id} event={event} />
								))}
							</tbody>
						</table>
					</div>

					{/* Pagination */}
					<Pagination
						page={eventsData.pagination.page}
						pages={eventsData.pagination.pages}
						total={eventsData.pagination.total}
						pageSize={eventsData.pagination.pageSize}
						onChange={setPage}
					/>
				</>
			) : (
				!loading && (
					<div
						style={{
							textAlign: "center",
							color: "#525252",
							padding: "48px 0",
							fontSize: 14,
						}}
					>
						Belum ada event dwell-time. Aktifkan analitik dan tunggu worker
						mendeteksi orang.
					</div>
				)
			)}
		</main>
	);
}

function EventRow({ event }: { event: DwellEvent }) {
	const isOngoing = !event.exitedAt;
	const runningDuration = isOngoing
		? Math.max(
				0,
				Math.floor(
					(new Date().getTime() - new Date(event.enteredAt).getTime()) / 1000,
				),
			)
		: event.durationSeconds;

	return (
		<tr style={{ borderBottom: "1px solid #1a1a1a", height: 40 }}>
			<td style={tdStyle}>{event.zone?.name ?? "-"}</td>
			<td style={tdStyle}>{event.zone?.camera?.name ?? "-"}</td>
			<td style={tdStyle}>{formatDateTime(event.enteredAt)}</td>
			<td style={tdStyle}>
				{isOngoing ? (
					<span style={{ color: "#3b82f6" }}>Berlangsung</span>
				) : (
					formatDateTime(event.exitedAt!)
				)}
			</td>
			<td style={{ ...tdStyle, fontWeight: 500, color: "#e5e5e5" }}>
				{formatDuration(runningDuration)}
			</td>
			<td style={tdStyle}>
				{event.posture ? (
					<StatusBadge
						status={
							event.posture === "SITTING"
								? "IDLE"
								: event.posture === "STANDING"
									? "RUNNING"
									: "UNTESTED"
						}
					/>
				) : (
					<span style={{ color: "#525252" }}>-</span>
				)}
			</td>
		</tr>
	);
}

function SummaryCard({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div
			style={{
				padding: "14px 16px",
				background: "#171717",
				borderRadius: 8,
				border: "1px solid #262626",
				display: "flex",
				alignItems: "center",
				gap: 12,
			}}
		>
			<span style={{ color: "#3b82f6" }}>{icon}</span>
			<div>
				<div
					style={{
						fontSize: 11,
						color: "#737373",
						textTransform: "uppercase",
						letterSpacing: 0.5,
					}}
				>
					{label}
				</div>
				<div style={{ fontSize: 20, fontWeight: 600, color: "#e5e5e5" }}>
					{value}
				</div>
			</div>
		</div>
	);
}

const selectStyle: React.CSSProperties = {
	padding: "8px 12px",
	borderRadius: 6,
	border: "1px solid #404040",
	background: "#171717",
	color: "#d4d4d4",
	fontSize: 13,
};

const thStyle: React.CSSProperties = {
	textAlign: "left",
	padding: "8px 12px",
	color: "#737373",
	fontWeight: 500,
	fontSize: 12,
	textTransform: "uppercase",
	letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
	padding: "8px 12px",
	color: "#a3a3a3",
};

export default function AnalyticsDashboardPage() {
	return (
		<Suspense
			fallback={
				<main style={{ padding: 24 }}>
					<p style={{ color: "#737373" }}>Memuat...</p>
				</main>
			}
		>
			<DashboardContent />
		</Suspense>
	);
}
