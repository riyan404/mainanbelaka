"use client";

import { BarChart3, ChevronDown, ChevronUp, Download } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { api } from "@/lib/api";
import {
	type ShiftReportRow,
	type StaffReport,
	type StaffSummary,
	fetchStaffNames,
	fetchStaffReport,
	formatDuration,
	formatShiftTime,
	todayLocal,
} from "@/lib/shift";
import type { Paginated } from "@/lib/api";

interface CameraOption {
	id: string;
	name: string;
	device: { name: string };
}

interface ZoneOption {
	id: string;
	name: string;
	cameraChannelId: string;
}

// ─── Attendance bar ──────────────────────────────────────────────────────────

function AttendanceBar({ percent }: { percent: number }) {
	const pct = Math.min(Math.max(percent, 0), 100);
	const color = pct >= 80 ? "#3b82f6" : pct >= 50 ? "#f97316" : "#ef4444";
	return (
		<div
			style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 100 }}
			title={`${pct}%`}
		>
			<div
				style={{
					flex: 1,
					height: 6,
					background: "var(--border)",
					borderRadius: 99,
					overflow: "hidden",
				}}
			>
				<div
					style={{
						height: "100%",
						width: `${pct}%`,
						background: color,
						borderRadius: 99,
						transition: "width .3s",
					}}
				/>
			</div>
			<span
				style={{
					fontSize: 12,
					fontWeight: 600,
					minWidth: 32,
					textAlign: "right",
					fontVariantNumeric: "tabular-nums",
				}}
			>
				{pct}%
			</span>
		</div>
	);
}

// ─── Summary cards ───────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: StaffSummary[] }) {
	if (summary.length === 0) return null;
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
				gap: 10,
				marginBottom: 20,
			}}
		>
			{summary.map((s) => (
				<div
					key={s.staffName}
					className="panel"
					style={{ display: "flex", flexDirection: "column", gap: 10 }}
				>
					<div style={{ fontWeight: 700, fontSize: 15 }}>{s.staffName}</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 1fr",
							gap: "4px 12px",
						}}
					>
						{[
							["Shift", `${s.shiftCount}x`],
							["Total shift", formatDuration(s.totalShiftSeconds)],
							["Hadir efektif", formatDuration(s.totalDwellSeconds)],
							["Duduk", formatDuration(s.sittingSeconds)],
							["Berdiri", formatDuration(s.standingSeconds)],
						].map(([label, val]) => (
							<div key={label}>
								<div style={{ fontSize: 11, color: "var(--muted)" }}>
									{label}
								</div>
								<div style={{ fontWeight: 600, fontSize: 13 }}>{val}</div>
							</div>
						))}
					</div>
					<AttendanceBar percent={s.avgAttendancePercent} />
				</div>
			))}
		</div>
	);
}

// ─── Report table ─────────────────────────────────────────────────────────────

function ThSort({
	col,
	label,
	sortCol,
	sortDir,
	onSort,
}: {
	col: keyof ShiftReportRow;
	label: string;
	sortCol: keyof ShiftReportRow;
	sortDir: "asc" | "desc";
	onSort: (col: keyof ShiftReportRow) => void;
}) {
	const active = sortCol === col;
	return (
		<th>
			<button
				type="button"
				onClick={() => onSort(col)}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 3,
					background: "none",
					border: "none",
					cursor: "pointer",
					color: "inherit",
					font: "inherit",
					fontWeight: 600,
					padding: 0,
				}}
			>
				{label}
				{active ? (
					sortDir === "asc" ? (
						<ChevronUp size={12} />
					) : (
						<ChevronDown size={12} />
					)
				) : null}
			</button>
		</th>
	);
}

function ReportTable({ rows }: { rows: ShiftReportRow[] }) {
	const [sortCol, setSortCol] = useState<keyof ShiftReportRow>("startTime");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

	function toggleSort(col: keyof ShiftReportRow) {
		if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		else {
			setSortCol(col);
			setSortDir("desc");
		}
	}

	const sorted = [...rows].sort((a, b) => {
		const va = a[sortCol],
			vb = b[sortCol];
		let cmp = 0;
		if (typeof va === "string" && typeof vb === "string")
			cmp = va.localeCompare(vb);
		else if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
		return sortDir === "asc" ? cmp : -cmp;
	});
	const pg = useClientPagination(sorted, 25);

	return (
		<>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<ThSort
								col="staffName"
								label="Staf"
								sortCol={sortCol}
								sortDir={sortDir}
								onSort={toggleSort}
							/>
							<th>Kamera</th>
							<th>Zona</th>
							<ThSort
								col="startTime"
								label="Mulai"
								sortCol={sortCol}
								sortDir={sortDir}
								onSort={toggleSort}
							/>
							<ThSort
								col="endTime"
								label="Selesai"
								sortCol={sortCol}
								sortDir={sortDir}
								onSort={toggleSort}
							/>
							<ThSort
								col="shiftDurationSeconds"
								label="Durasi"
								sortCol={sortCol}
								sortDir={sortDir}
								onSort={toggleSort}
							/>
							<ThSort
								col="totalDwellSeconds"
								label="Hadir"
								sortCol={sortCol}
								sortDir={sortDir}
								onSort={toggleSort}
							/>
							<ThSort
								col="attendancePercent"
								label="%"
								sortCol={sortCol}
								sortDir={sortDir}
								onSort={toggleSort}
							/>
							<ThSort
								col="sittingSeconds"
								label="Duduk"
								sortCol={sortCol}
								sortDir={sortDir}
								onSort={toggleSort}
							/>
							<ThSort
								col="standingSeconds"
								label="Berdiri"
								sortCol={sortCol}
								sortDir={sortDir}
								onSort={toggleSort}
							/>
						</tr>
					</thead>
					<tbody>
						{pg.slice.map((r) => (
							<tr key={r.id}>
								<td data-label="Staf" style={{ fontWeight: 600 }}>
									{r.staffName}
								</td>
								<td data-label="Kamera">{r.camera.name}</td>
								<td
									data-label="Zona"
									style={{ color: r.zone ? "inherit" : "var(--muted)" }}
								>
									{r.zone?.name ?? "Semua zona"}
								</td>
								<td data-label="Mulai">{formatShiftTime(r.startTime)}</td>
								<td data-label="Selesai">{formatShiftTime(r.endTime)}</td>
								<td data-label="Durasi">
									{formatDuration(r.shiftDurationSeconds)}
								</td>
								<td data-label="Hadir">
									{formatDuration(r.totalDwellSeconds)}
								</td>
								<td data-label="%">
									<AttendanceBar percent={r.attendancePercent} />
								</td>
								<td data-label="Duduk">{formatDuration(r.sittingSeconds)}</td>
								<td data-label="Berdiri">
									{formatDuration(r.standingSeconds)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<Pagination
				page={pg.page}
				pages={pg.pages}
				total={pg.total}
				pageSize={pg.pageSize}
				onChange={pg.changePage}
			/>
		</>
	);
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function downloadCsv(report: StaffReport) {
	const header = [
		"Staf",
		"Kamera",
		"Mulai",
		"Selesai",
		"Durasi Shift (mnt)",
		"Hadir (mnt)",
		"Kehadiran %",
		"Duduk (mnt)",
		"Berdiri (mnt)",
	].join(",");
	const rows = report.rows.map((r) =>
		[
			`"${r.staffName}"`,
			`"${r.camera.name}"`,
			r.startTime,
			r.endTime,
			Math.round(r.shiftDurationSeconds / 60),
			Math.round(r.totalDwellSeconds / 60),
			r.attendancePercent,
			Math.round(r.sittingSeconds / 60),
			Math.round(r.standingSeconds / 60),
		].join(","),
	);
	const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `laporan-shift-${new Date().toISOString().slice(0, 10)}.csv`;
	a.click();
	URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShiftReportPage() {
	const [cameras, setCameras] = useState<CameraOption[]>([]);
	const [allZones, setAllZones] = useState<ZoneOption[]>([]);
	const [staffSuggestions, setStaffSuggestions] = useState<string[]>([]);
	const [report, setReport] = useState<StaffReport | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const [staffName, setStaffName] = useState("");
	const [cameraId, setCameraId] = useState("");
	const [zoneId, setZoneId] = useState("");
	const [from, setFrom] = useState(todayLocal());
	const [to, setTo] = useState(todayLocal());

	// Zona yang tersedia untuk kamera filter yang dipilih
	const zonesForFilterCamera = allZones.filter(
		(z) => !cameraId || z.cameraChannelId === cameraId,
	);

	useEffect(() => {
		Promise.all([
			api<Paginated<CameraOption>>("/cameras?enabled=true&pageSize=200").then(
				(r) => r.items,
			),
			api<ZoneOption[]>("/analytics/zones").catch(() => [] as ZoneOption[]),
			fetchStaffNames(),
		])
			.then(([cams, zones, names]) => {
				setCameras(cams);
				setAllZones(zones);
				setStaffSuggestions(names);
			})
			.catch(() => {});
	}, []);

	const loadReport = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchStaffReport({
				staffName: staffName || undefined,
				cameraChannelId: cameraId || undefined,
				zoneId: zoneId || undefined,
				from,
				to,
			});
			setReport(data);
		} catch {
			setError("Gagal memuat laporan");
		} finally {
			setLoading(false);
		}
	}, [staffName, cameraId, zoneId, from, to]);

	useEffect(() => {
		void Promise.resolve()
			.then(() => loadReport())
			.catch(() => {});
	}, []);

	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>
						<BarChart3
							size={18}
							style={{
								display: "inline",
								verticalAlign: "middle",
								marginRight: 6,
							}}
							aria-hidden
						/>
						Laporan Kehadiran Kasir
					</h1>
					<p>Berapa lama kasir benar-benar berada di depan PC per shift.</p>
				</div>
				<div className="toolbar-spacer" />
				<Button variant="secondary" size="sm" asChild>
					<Link href="/shifts">Kelola Shift</Link>
				</Button>
				{report && report.rows.length > 0 && (
					<Button
						variant="secondary"
						size="sm"
						onClick={() => downloadCsv(report)}
					>
						<Download size={14} aria-hidden /> Export CSV
					</Button>
				)}
			</header>

			{/* Filter */}
			<div className="shift-filters">
				<input
					className="input"
					placeholder="Nama staf (kosong = semua)"
					value={staffName}
					onChange={(e) => setStaffName(e.target.value)}
					list="staff-report-list"
				/>
				<datalist id="staff-report-list">
					{staffSuggestions.map((n) => (
						<option key={n} value={n} />
					))}
				</datalist>
				<select
					className="input select"
					value={cameraId}
					onChange={(e) => {
						setCameraId(e.target.value);
						setZoneId(""); // reset zona saat kamera ganti
					}}
				>
					<option value="">Semua kamera</option>
					{cameras.map((c) => (
						<option key={c.id} value={c.id}>
							{c.device.name} / {c.name}
						</option>
					))}
				</select>
				{/* Dropdown zona — muncul kalau ada zona tersedia */}
				{zonesForFilterCamera.length > 0 && (
					<select
						className="input select"
						value={zoneId}
						onChange={(e) => setZoneId(e.target.value)}
					>
						<option value="">Semua zona</option>
						{zonesForFilterCamera.map((z) => (
							<option key={z.id} value={z.id}>
								{z.name}
							</option>
						))}
					</select>
				)}
				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						whiteSpace: "nowrap",
					}}
				>
					<span style={{ fontSize: 13, color: "var(--muted)" }}>Dari</span>
					<input
						className="input"
						type="date"
						value={from}
						onChange={(e) => setFrom(e.target.value)}
						style={{ width: 145 }}
					/>
				</label>
				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						whiteSpace: "nowrap",
					}}
				>
					<span style={{ fontSize: 13, color: "var(--muted)" }}>Sampai</span>
					<input
						className="input"
						type="date"
						value={to}
						onChange={(e) => setTo(e.target.value)}
						style={{ width: 145 }}
					/>
				</label>
				<Button size="sm" onClick={() => void loadReport()} disabled={loading}>
					{loading ? "Memuat…" : "Tampilkan"}
				</Button>
			</div>

			{/* Error */}
			{error && (
				<div
					className="panel"
					role="alert"
					style={{
						marginBottom: 12,
						borderColor: "color-mix(in srgb, var(--error), transparent 45%)",
						background: "color-mix(in srgb, var(--error), transparent 92%)",
						color: "#fecaca",
					}}
				>
					{error}
				</div>
			)}

			{/* Report output */}
			{report && (
				<>
					{report.summary.length > 0 && (
						<section>
							<h2
								style={{
									fontSize: 14,
									fontWeight: 600,
									margin: "16px 0 10px",
									color: "var(--muted)",
								}}
							>
								RINGKASAN PER STAF
							</h2>
							<SummaryCards summary={report.summary} />
						</section>
					)}

					<section>
						<h2
							style={{
								fontSize: 14,
								fontWeight: 600,
								margin: "16px 0 10px",
								color: "var(--muted)",
								display: "flex",
								alignItems: "center",
								gap: 8,
							}}
						>
							DETAIL SHIFT
							{report.rows.length > 0 && (
								<span
									style={{
										fontWeight: 400,
										fontSize: 12,
										background: "var(--panel)",
										border: "1px solid var(--border)",
										borderRadius: 99,
										padding: "1px 8px",
									}}
								>
									{report.rows.length} shift
								</span>
							)}
						</h2>
						{report.rows.length === 0 ? (
							<div className="empty-state" style={{ minHeight: 200 }}>
								<strong>Tidak ada shift</strong>
								<p style={{ color: "var(--muted)" }}>
									Tidak ada jadwal shift dalam rentang tanggal ini.
								</p>
								<Button asChild>
									<Link href="/shifts">Tambah jadwal shift</Link>
								</Button>
							</div>
						) : (
							<ReportTable rows={report.rows} />
						)}
					</section>
				</>
			)}
		</main>
	);
}
