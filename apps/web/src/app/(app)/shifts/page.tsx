"use client";

import {
	CalendarClock,
	Check,
	Pencil,
	PlusCircle,
	Trash2,
	X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { type Paginated } from "@/lib/api";
import { Pagination } from "@/components/ui/pagination";
import {
	type ShiftSchedule,
	createShift,
	deleteShift,
	fetchShifts,
	fetchStaffNames,
	formatShiftTime,
	todayLocal,
	updateShift,
} from "@/lib/shift";

interface CameraOption {
	id: string;
	name: string;
	device: { name: string };
}

function toLocalDatetimeInput(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
	return new Date(local).toISOString();
}

export default function ShiftsPage() {
	const [shifts, setShifts] = useState<Paginated<ShiftSchedule> | null>(null);
	const [page, setPage] = useState(1);
	const [cameras, setCameras] = useState<CameraOption[]>([]);
	const [staffSuggestions, setStaffSuggestions] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [showForm, setShowForm] = useState(false);
	const [editId, setEditId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const [filterStaff, setFilterStaff] = useState("");
	const [filterCamera, setFilterCamera] = useState("");
	const [filterFrom, setFilterFrom] = useState("");
	const [filterTo, setFilterTo] = useState("");

	const [form, setForm] = useState({
		staffName: "",
		cameraChannelId: "",
		startTime: `${todayLocal()}T08:00`,
		endTime: `${todayLocal()}T16:00`,
		notes: "",
	});

	async function load() {
		setLoading(true);
		setError("");
		try {
			const params: Record<string, string> = {
				page: String(page),
				pageSize: "25",
			};
			if (filterStaff) params.staffName = filterStaff;
			if (filterCamera) params.cameraChannelId = filterCamera;
			if (filterFrom)
				params.from = new Date(`${filterFrom}T00:00:00`).toISOString();
			if (filterTo) params.to = new Date(`${filterTo}T23:59:59`).toISOString();
			const [data, names] = await Promise.all([
				fetchShifts(params),
				fetchStaffNames(),
			]);
			setShifts(data);
			setStaffSuggestions(names);
		} catch {
			setError("Gagal memuat data shift");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		void load();
		api<import("@/lib/api").Paginated<CameraOption>>("/cameras?enabled=true&pageSize=200").then((r) => r.items)
			.then(setCameras)
			.catch(() => {});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function openNew() {
		setEditId(null);
		setForm({
			staffName: "",
			cameraChannelId: cameras[0]?.id ?? "",
			startTime: `${todayLocal()}T08:00`,
			endTime: `${todayLocal()}T16:00`,
			notes: "",
		});
		setShowForm(true);
	}

	function openEdit(shift: ShiftSchedule) {
		setEditId(shift.id);
		setForm({
			staffName: shift.staffName,
			cameraChannelId: shift.cameraChannelId,
			startTime: toLocalDatetimeInput(shift.startTime),
			endTime: toLocalDatetimeInput(shift.endTime),
			notes: shift.notes ?? "",
		});
		setShowForm(true);
	}

	async function handleSave() {
		if (!form.staffName.trim() || !form.cameraChannelId) {
			setError("Nama staf dan kamera wajib diisi");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = {
				staffName: form.staffName.trim(),
				cameraChannelId: form.cameraChannelId,
				startTime: localInputToIso(form.startTime),
				endTime: localInputToIso(form.endTime),
				notes: form.notes.trim() || undefined,
			};
			if (editId) {
				await updateShift(editId, payload);
			} else {
				await createShift(payload);
			}
			setShowForm(false);
			// eslint-disable-next-line react-hooks/set-state-in-effect
			void load();
		} catch {
			setError("Gagal menyimpan shift");
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(id: string, name: string) {
		if (!confirm(`Hapus shift ${name}?`)) return;
		try {
			await deleteShift(id);
			// eslint-disable-next-line react-hooks/set-state-in-effect
			void load();
		} catch {
			setError("Gagal menghapus shift");
		}
	}

	return (
		<main className="page">
			{/* Header */}
			<header className="page-head">
				<div>
					<h1>Jadwal Shift</h1>
					<p>Kelola jadwal shift kasir / staf untuk laporan kehadiran.</p>
				</div>
				<div className="toolbar-spacer" />
				<Button variant="secondary" size="sm" asChild>
					<Link href="/shifts/report">
						<CalendarClock size={14} aria-hidden />
						Laporan
					</Link>
				</Button>
				<Button size="sm" onClick={openNew}>
					<PlusCircle size={14} aria-hidden />
					Tambah Shift
				</Button>
			</header>

			{/* Error banner */}
			{error && (
				<div
					className="panel"
					role="alert"
					style={{
						marginBottom: 12,
						borderColor: "color-mix(in srgb, var(--error), transparent 45%)",
						background: "color-mix(in srgb, var(--error), transparent 92%)",
						color: "#fecaca",
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					{error}
				</div>
			)}

			{/* Filter bar */}
			<div className="shift-filters">
				<input
					className="input"
					placeholder="Cari nama staf..."
					value={filterStaff}
					onChange={(e) => setFilterStaff(e.target.value)}
					list="staff-list"
				/>
				<datalist id="staff-list">
					{staffSuggestions.map((n) => (
						<option key={n} value={n} />
					))}
				</datalist>
				<select
					className="input select"
					value={filterCamera}
					onChange={(e) => setFilterCamera(e.target.value)}
				>
					<option value="">Semua kamera</option>
					{cameras.map((c) => (
						<option key={c.id} value={c.id}>
							{c.device.name} / {c.name}
						</option>
					))}
				</select>
				<input
					className="input"
					type="date"
					value={filterFrom}
					onChange={(e) => setFilterFrom(e.target.value)}
					title="Dari tanggal"
				/>
				<input
					className="input"
					type="date"
					value={filterTo}
					onChange={(e) => setFilterTo(e.target.value)}
					title="Sampai tanggal"
				/>
				<Button variant="secondary" size="sm" onClick={() => void load()}>
					Cari
				</Button>
			</div>

			{/* Modal form */}
			{showForm && (
				<div
					className="shift-modal-overlay"
					role="dialog"
					aria-modal
					aria-label="Form shift"
					onClick={(e) => {
						if (e.target === e.currentTarget) setShowForm(false);
					}}
				>
					<div className="shift-modal">
						<div className="shift-modal-head">
							<h2>{editId ? "Edit Shift" : "Tambah Shift"}</h2>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setShowForm(false)}
								aria-label="Tutup"
							>
								<X size={15} />
							</Button>
						</div>

						<div className="shift-modal-body">
							<div className="field">
								<label htmlFor="sf-staff">Nama Staf / Kasir</label>
								<input
									id="sf-staff"
									className="input"
									value={form.staffName}
									onChange={(e) =>
										setForm((f) => ({ ...f, staffName: e.target.value }))
									}
									placeholder="mis. Budi Santoso"
									list="staff-list-modal"
									required
								/>
								<datalist id="staff-list-modal">
									{staffSuggestions.map((n) => (
										<option key={n} value={n} />
									))}
								</datalist>
							</div>

							<div className="field">
								<label htmlFor="sf-camera">Kamera PC Kasir</label>
								<select
									id="sf-camera"
									className="input select"
									value={form.cameraChannelId}
									onChange={(e) =>
										setForm((f) => ({ ...f, cameraChannelId: e.target.value }))
									}
									required
								>
									<option value="">— pilih kamera —</option>
									{cameras.map((c) => (
										<option key={c.id} value={c.id}>
											{c.device.name} / {c.name}
										</option>
									))}
								</select>
							</div>

							<div className="form-grid">
								<div className="field">
									<label htmlFor="sf-start">Mulai Shift</label>
									<input
										id="sf-start"
										className="input"
										type="datetime-local"
										value={form.startTime}
										onChange={(e) =>
											setForm((f) => ({ ...f, startTime: e.target.value }))
										}
										required
									/>
								</div>
								<div className="field">
									<label htmlFor="sf-end">Selesai Shift</label>
									<input
										id="sf-end"
										className="input"
										type="datetime-local"
										value={form.endTime}
										onChange={(e) =>
											setForm((f) => ({ ...f, endTime: e.target.value }))
										}
										required
									/>
								</div>
							</div>

							<div className="field">
								<label htmlFor="sf-notes">Catatan (opsional)</label>
								<input
									id="sf-notes"
									className="input"
									value={form.notes}
									onChange={(e) =>
										setForm((f) => ({ ...f, notes: e.target.value }))
									}
									placeholder="mis. Shift pagi"
								/>
							</div>
						</div>

						<div className="shift-modal-foot">
							<Button variant="ghost" onClick={() => setShowForm(false)}>
								<X size={14} aria-hidden /> Batal
							</Button>
							<Button onClick={() => void handleSave()} disabled={saving}>
								<Check size={14} aria-hidden />
								{saving ? "Menyimpan…" : "Simpan"}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Konten */}
			{loading ? (
				<p style={{ color: "var(--muted)", marginTop: 24 }}>Memuat…</p>
			) : (shifts?.items ?? []).length === 0 ? (
				<div className="empty-state" style={{ minHeight: 240 }}>
					<strong>Belum ada jadwal shift</strong>
					<p>
						Tambahkan jadwal shift pertama untuk mulai melacak kehadiran kasir.
					</p>
					<Button onClick={openNew}>
						<PlusCircle size={14} aria-hidden /> Tambah shift pertama
					</Button>
				</div>
			) : (
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Staf</th>
								<th>Kamera</th>
								<th>Mulai</th>
								<th>Selesai</th>
								<th>Catatan</th>
								<th aria-label="Aksi" />
							</tr>
						</thead>
						<tbody>
							{(shifts?.items ?? []).map((s) => (
								<tr key={s.id}>
									<td data-label="Staf" style={{ fontWeight: 600 }}>
										{s.staffName}
									</td>
									<td data-label="Kamera">{s.camera.name}</td>
									<td data-label="Mulai">{formatShiftTime(s.startTime)}</td>
									<td data-label="Selesai">{formatShiftTime(s.endTime)}</td>
									<td data-label="Catatan" style={{ color: "var(--muted)" }}>
										{s.notes ?? "—"}
									</td>
									<td data-label="Aksi" style={{ whiteSpace: "nowrap" }}>
										<Button
											variant="ghost"
											size="icon"
											title="Edit"
											onClick={() => openEdit(s)}
										>
											<Pencil size={14} />
										</Button>
										<Button
											variant="danger"
											size="icon"
											title="Hapus"
											onClick={() => void handleDelete(s.id, s.staffName)}
										>
											<Trash2 size={14} />
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{shifts?.pagination && (
				<Pagination
					page={shifts.pagination.page}
					pages={shifts.pagination.pages}
					total={shifts.pagination.total}
					pageSize={shifts.pagination.pageSize}
					onChange={(p) => {
						setPage(p);
						void load();
					}}
				/>
			)}
		</main>
	);
}
