"use client";

import { AlertCircle, CheckCircle2, Link2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type Status = "idle" | "testing" | "saving" | "done" | "error";

export default function NewRtspPage() {
	const [rtspUrl, setRtspUrl] = useState("rtsp://");
	const [name, setName] = useState("");
	const [location, setLocation] = useState("");
	const [status, setStatus] = useState<Status>("idle");
	const [error, setError] = useState("");
	const [savedName, setSavedName] = useState("");

	const urlValid =
		rtspUrl.startsWith("rtsp://") && rtspUrl.replace("rtsp://", "").length > 3;

	async function handleSave() {
		if (!urlValid || !name.trim()) return;
		setStatus("saving");
		setError("");
		try {
			const device = await api<{ name: string }>("/devices/rtsp", {
				method: "POST",
				body: JSON.stringify({
					rtspUrl: rtspUrl.trim(),
					name: name.trim(),
					location: location.trim() || undefined,
				}),
			});
			setSavedName(device.name);
			setStatus("done");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Gagal menyimpan");
			setStatus("error");
		}
	}

	if (status === "done") {
		return (
			<main className="page">
				<div
					style={{ maxWidth: 480, margin: "2rem auto", textAlign: "center" }}
				>
					<CheckCircle2 size={48} color="var(--color-success)" />
					<h2 style={{ marginTop: "1rem" }}>{savedName} terdaftar</h2>
					<p
						style={{ color: "var(--muted-foreground)", marginBottom: "1.5rem" }}
					>
						Stream RTSP akan tersedia di dashboard kamera secara otomatis.
					</p>
					<div
						style={{
							display: "flex",
							gap: "0.75rem",
							justifyContent: "center",
						}}
					>
						<Link href="/devices">
							<Button variant="secondary">Lihat Perangkat</Button>
						</Link>
						<Link href="/cameras">
							<Button>Buka Kamera</Button>
						</Link>
					</div>
				</div>
			</main>
		);
	}

	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>Tambah Sumber RTSP</h1>
					<p>
						Daftarkan stream RTSP langsung tanpa username/password. Cocok untuk
						screen capture, IP cam sederhana, atau encoder lokal.
					</p>
				</div>
			</header>

			<div style={{ maxWidth: 480 }}>
				{/* URL RTSP */}
				<div className="form-group" style={{ marginBottom: "1rem" }}>
					<label className="form-label" htmlFor="rtsp-url">
						URL RTSP <span style={{ color: "var(--destructive)" }}>*</span>
					</label>
					<input
						id="rtsp-url"
						className="form-input"
						type="text"
						value={rtspUrl}
						onChange={(e) => setRtspUrl(e.target.value)}
						placeholder="rtsp://10.0.9.254:8554/screenlive"
						spellCheck={false}
						autoComplete="off"
						style={{ fontFamily: "monospace", fontSize: "0.875rem" }}
					/>
					{rtspUrl.length > 7 && !urlValid && (
						<p
							style={{
								fontSize: "0.8rem",
								color: "var(--destructive)",
								marginTop: "0.25rem",
							}}
						>
							URL harus diawali rtsp:// dan berisi host/path yang valid.
						</p>
					)}
				</div>

				{/* Nama */}
				<div className="form-group" style={{ marginBottom: "1rem" }}>
					<label className="form-label" htmlFor="device-name">
						Nama tampilan <span style={{ color: "var(--destructive)" }}>*</span>
					</label>
					<input
						id="device-name"
						className="form-input"
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Screen Live, Kamera Entrance, …"
					/>
				</div>

				{/* Lokasi */}
				<div className="form-group" style={{ marginBottom: "1.5rem" }}>
					<label className="form-label" htmlFor="location">
						Lokasi{" "}
						<span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>
							(opsional)
						</span>
					</label>
					<input
						id="location"
						className="form-input"
						type="text"
						value={location}
						onChange={(e) => setLocation(e.target.value)}
						placeholder="Lobby, Kasir 1, Gudang, …"
					/>
				</div>

				{/* Catatan teknis */}
				<div
					style={{
						background: "var(--muted)",
						borderRadius: "var(--radius)",
						padding: "0.75rem 1rem",
						fontSize: "0.82rem",
						color: "var(--muted-foreground)",
						marginBottom: "1.5rem",
						lineHeight: 1.6,
					}}
				>
					<strong>
						<Link2
							size={12}
							style={{ verticalAlign: "middle", marginRight: 4 }}
						/>
						Cara kerja
					</strong>
					<br />
					MediaMTX akan menarik stream dari URL yang diberikan dan meneruskannya
					ke player browser. Stream hanya di-pull saat ada yang menonton (
					<em>on-demand</em>).
				</div>

				{error && (
					<div
						style={{
							display: "flex",
							gap: "0.5rem",
							alignItems: "flex-start",
							color: "var(--destructive)",
							marginBottom: "1rem",
							fontSize: "0.875rem",
						}}
					>
						<AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
						<span>{error}</span>
					</div>
				)}

				<div style={{ display: "flex", gap: "0.75rem" }}>
					<Link href="/devices">
						<Button variant="secondary" disabled={status === "saving"}>
							Batal
						</Button>
					</Link>
					<Button
						onClick={handleSave}
						disabled={!urlValid || !name.trim() || status === "saving"}
					>
						{status === "saving" && (
							<Loader2
								size={14}
								style={{ marginRight: 6, animation: "spin 1s linear infinite" }}
							/>
						)}
						Simpan &amp; Daftarkan
					</Button>
				</div>
			</div>
		</main>
	);
}
