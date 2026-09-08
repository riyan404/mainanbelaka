"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function SettingsPage() {
	const [message, setMessage] = useState("");
	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>Pengaturan</h1>
					<p>Kelola keamanan akun admin.</p>
				</div>
			</header>
			<section className="panel" style={{ maxWidth: 480 }}>
				<form
					className="login-form"
					action={async (formData) => {
						try {
							await api("/auth/password", {
								method: "PUT",
								body: JSON.stringify({
									currentPassword: formData.get("currentPassword"),
									newPassword: formData.get("newPassword"),
								}),
							});
							setMessage("Password berhasil diubah");
						} catch (value) {
							setMessage(
								value instanceof Error
									? value.message
									: "Gagal mengubah password",
							);
						}
					}}
				>
					<div className="field">
						<label htmlFor="currentPassword">Password saat ini</label>
						<input
							className="input"
							id="currentPassword"
							name="currentPassword"
							type="password"
							required
						/>
					</div>
					<div className="field">
						<label htmlFor="newPassword">Password baru</label>
						<input
							className="input"
							id="newPassword"
							name="newPassword"
							type="password"
							minLength={8}
							required
						/>
					</div>
					{message ? <div role="status">{message}</div> : null}
					<Button type="submit">Ubah Password</Button>
				</form>
			</section>

			<FaceRecognitionSettings />
		</main>
	);
}

// ─── Face Recognition Settings ──────────────────────────────────────────────

interface SettingEntry {
	key: string;
	value: string;
}

function FaceRecognitionSettings() {
	const [threshold, setThreshold] = useState("0.5");
	const [retention, setRetention] = useState("2");
	const [saving, setSaving] = useState(false);
	const [msg, setMsg] = useState("");

	useEffect(() => {
		api<SettingEntry[]>("/staff/settings")
			.then((settings) => {
				for (const s of settings) {
					if (s.key === "faceRecognitionThreshold") setThreshold(s.value);
					if (s.key === "unknownEventRetentionDays") setRetention(s.value);
				}
			})
			.catch(() => {});
	}, []);

	async function save() {
		setSaving(true);
		setMsg("");
		try {
			await Promise.all([
				api("/staff/settings", {
					method: "PUT",
					body: JSON.stringify({
						key: "faceRecognitionThreshold",
						value: threshold,
					}),
				}),
				api("/staff/settings", {
					method: "PUT",
					body: JSON.stringify({
						key: "unknownEventRetentionDays",
						value: retention,
					}),
				}),
			]);
			setMsg("Tersimpan");
		} catch {
			setMsg("Gagal menyimpan");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="panel" style={{ maxWidth: 480, marginTop: 20 }}>
			<h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
				Face Recognition
			</h2>
			<div className="field">
				<label htmlFor="fr-threshold">
					Threshold Kemiripan Wajah
					<span
						style={{
							marginLeft: 6,
							fontSize: 11,
							color: "var(--muted)",
							fontWeight: 400,
						}}
					>
						0.3 (longgar) — 0.7 (ketat)
					</span>
				</label>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<input
						id="fr-threshold"
						type="range"
						min="0.3"
						max="0.7"
						step="0.05"
						value={threshold}
						onChange={(e) => setThreshold(e.target.value)}
						style={{ flex: 1 }}
					/>
					<span
						style={{
							minWidth: 40,
							textAlign: "center",
							fontWeight: 600,
							fontVariantNumeric: "tabular-nums",
						}}
					>
						{threshold}
					</span>
				</div>
			</div>
			<div className="field" style={{ marginTop: 10 }}>
				<label htmlFor="fr-retention">
					Retensi Event Tidak Dikenal
					<span
						style={{
							marginLeft: 6,
							fontSize: 11,
							color: "var(--muted)",
							fontWeight: 400,
						}}
					>
						hari sebelum event UNKNOWN dihapus otomatis
					</span>
				</label>
				<input
					id="fr-retention"
					className="input"
					type="number"
					min="1"
					max="30"
					value={retention}
					onChange={(e) => setRetention(e.target.value)}
					style={{ maxWidth: 80 }}
				/>
			</div>
			{msg && (
				<div role="status" style={{ marginTop: 8 }}>
					{msg}
				</div>
			)}
			<Button
				style={{ marginTop: 12 }}
				onClick={() => void save()}
				disabled={saving}
			>
				{saving ? "Menyimpan…" : "Simpan Pengaturan"}
			</Button>
		</section>
	);
}
