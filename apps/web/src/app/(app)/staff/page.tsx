"use client";

import { Trash2, Upload, UserCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface StaffFace {
	id: string;
	staffName: string;
	photoPath: string;
	createdAt: string;
}

export default function StaffPage() {
	const [faces, setFaces] = useState<StaffFace[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [uploading, setUploading] = useState(false);
	const [staffName, setStaffName] = useState("");
	const [staffSuggestions, setStaffSuggestions] = useState<string[]>([]);
	const fileRef = useRef<HTMLInputElement>(null);

	async function load() {
		setLoading(true);
		setError("");
		try {
			const [data, names] = await Promise.all([
				api<StaffFace[]>("/staff/faces"),
				api<string[]>("/staff/faces/names"),
			]);
			setFaces(data);
			setStaffSuggestions(names);
		} catch {
			setError("Gagal memuat data staf");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void load();
	}, []);

	async function handleUpload() {
		const file = fileRef.current?.files?.[0];
		if (!file || !staffName.trim()) {
			setError("Nama staf dan foto wajib diisi");
			return;
		}

		setUploading(true);
		setError("");
		try {
			const formData = new FormData();
			formData.append("staffName", staffName.trim());
			formData.append("photo", file);

			await fetch("/api/staff/faces", {
				method: "POST",
				body: formData,
				credentials: "include",
			}).then(async (r) => {
				if (!r.ok) {
					const body = await r.json().catch(() => ({}));
					throw new Error(body.message ?? `Upload gagal (HTTP ${r.status})`);
				}
			});

			setStaffName("");
			if (fileRef.current) fileRef.current.value = "";
			void load();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Upload gagal");
		} finally {
			setUploading(false);
		}
	}

	async function handleDelete(id: string, name: string) {
		if (!confirm(`Hapus foto ${name}?`)) return;
		try {
			await api(`/staff/faces/${id}`, { method: "DELETE" });
			void load();
		} catch {
			setError("Gagal menghapus");
		}
	}

	async function handleDeleteSlot(name: string) {
		if (
			!confirm(
				`Hapus semua data wajah untuk "${name}"? Semua foto akan dihapus permanen.`,
			)
		)
			return;
		try {
			await api(`/staff/faces/by-name/${encodeURIComponent(name)}`, {
				method: "DELETE",
			});
			void load();
		} catch {
			setError("Gagal menghapus staf");
		}
	}

	// Grupkan foto per staffName
	const grouped = new Map<string, StaffFace[]>();
	for (const f of faces) {
		const list = grouped.get(f.staffName) ?? [];
		list.push(f);
		grouped.set(f.staffName, list);
	}

	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>
						<UserCircle
							size={18}
							style={{
								display: "inline",
								verticalAlign: "middle",
								marginRight: 6,
							}}
							aria-hidden
						/>
						Manajemen Staf & Wajah
					</h1>
					<p>
						Upload foto wajah karyawan untuk face recognition otomatis di kamera
						kasir.
					</p>
				</div>
			</header>

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

			{/* Form Upload */}
			<div
				className="panel"
				style={{
					display: "flex",
					gap: 12,
					alignItems: "flex-end",
					flexWrap: "wrap",
					marginBottom: 20,
				}}
			>
				<div className="field" style={{ flex: "1 1 180px" }}>
					<label htmlFor="sf-name">Nama Staf</label>
					<input
						id="sf-name"
						className="input"
						value={staffName}
						onChange={(e) => setStaffName(e.target.value)}
						placeholder="mis. Aqil"
						list="staff-suggest"
					/>
					<datalist id="staff-suggest">
						{staffSuggestions.map((n) => (
							<option key={n} value={n} />
						))}
					</datalist>
				</div>
				<div className="field" style={{ flex: "1 1 200px" }}>
					<label htmlFor="sf-photo">Foto Wajah</label>
					<input
						id="sf-photo"
						className="input"
						type="file"
						accept="image/jpeg,image/png,image/webp"
						ref={fileRef}
					/>
				</div>
				<Button
					size="sm"
					onClick={() => void handleUpload()}
					disabled={uploading}
				>
					<Upload size={14} aria-hidden />
					{uploading ? "Mengupload…" : "Upload"}
				</Button>
			</div>

			{/* Daftar Staf */}
			{loading ? (
				<p style={{ color: "var(--muted)" }}>Memuat…</p>
			) : grouped.size === 0 ? (
				<div className="empty-state" style={{ minHeight: 200 }}>
					<UserCircle size={32} style={{ color: "var(--muted)" }} />
					<strong>Belum ada data staf</strong>
					<p style={{ color: "var(--muted)" }}>
						Upload foto wajah pertama untuk mulai face recognition.
					</p>
				</div>
			) : (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
						gap: 14,
					}}
				>
					{[...grouped.entries()].map(([name, photos]) => (
						<div key={name} className="panel" style={{ padding: 14 }}>
							<div
								style={{
									fontWeight: 700,
									fontSize: 15,
									marginBottom: 10,
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
								}}
							>
								{name}
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<span
										style={{
											fontSize: 11,
											color: "var(--muted)",
											background: "var(--panel)",
											border: "1px solid var(--border)",
											borderRadius: 99,
											padding: "2px 8px",
										}}
									>
										{photos.length} foto
									</span>
									<button
										type="button"
										onClick={() => void handleDeleteSlot(name)}
										title={`Hapus semua data ${name}`}
										style={{
											background: "none",
											border:
												"1px solid color-mix(in srgb, var(--error), transparent 50%)",
											color: "var(--error)",
											borderRadius: 6,
											width: 26,
											height: 26,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											cursor: "pointer",
											padding: 0,
										}}
									>
										<Trash2 size={12} />
									</button>
								</div>
							</div>
							<div
								style={{
									display: "flex",
									gap: 8,
									flexWrap: "wrap",
								}}
							>
								{photos.map((f) => (
									<div
										key={f.id}
										style={{
											position: "relative",
											width: 72,
											height: 72,
											borderRadius: 8,
											overflow: "hidden",
											border: "1px solid var(--border)",
										}}
									>
										<img
											src={`/api/staff/faces/${f.id}/photo`}
											alt={f.staffName}
											style={{
												width: "100%",
												height: "100%",
												objectFit: "cover",
											}}
										/>
										<button
											type="button"
											onClick={() => void handleDelete(f.id, f.staffName)}
											title="Hapus foto"
											style={{
												position: "absolute",
												top: 2,
												right: 2,
												background: "rgba(0,0,0,0.6)",
												color: "#fff",
												border: "none",
												borderRadius: 4,
												width: 20,
												height: 20,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												cursor: "pointer",
												padding: 0,
											}}
										>
											<Trash2 size={10} />
										</button>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</main>
	);
}
