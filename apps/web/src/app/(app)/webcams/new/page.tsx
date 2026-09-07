"use client";

import {
	Camera,
	CheckCircle2,
	Loader2,
	Radio,
	StopCircle,
	VideoOff,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { listVideoDevices, useWhip } from "@/hooks/use-whip";

/** URL WebRTC/WHIP MediaMTX (public, bisa diakses dari browser host) */
const MEDIAMTX_WEBRTC_URL =
	process.env.NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL ?? "http://localhost:8918";

function buildWhipUrl(streamPath: string) {
	const clean = streamPath.replace(/^\/+/, "");
	return `${MEDIAMTX_WEBRTC_URL}/${clean}/whip`;
}

function buildStreamPath(slotName: string) {
	return `webcam-${slotName.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

type Step = "setup" | "streaming" | "done";

export default function NewWebcamPage() {
	// ─── Device list ──────────────────────────────────────────────────────────
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [deviceId, setDeviceId] = useState<string>("");
	const [devicesLoaded, setDevicesLoaded] = useState(false);

	// ─── Form ─────────────────────────────────────────────────────────────────
	const [deviceName, setDeviceName] = useState("PC Kasir 1");
	const [slotName, setSlotName] = useState("kasir-1");
	const [location, setLocation] = useState("");

	// ─── State ────────────────────────────────────────────────────────────────
	const [step, setStep] = useState<Step>("setup");
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState("");
	const [savedCamera, setSavedCamera] = useState<{
		id: string;
		name: string;
	} | null>(null);

	// ─── WHIP ─────────────────────────────────────────────────────────────────
	const streamPath = buildStreamPath(slotName);
	const whipUrl = step === "streaming" ? buildWhipUrl(streamPath) : null;
	const whip = useWhip(whipUrl);
	const videoRef = useRef<HTMLVideoElement>(null);

	// Sambungkan stream lokal ke <video>
	useEffect(() => {
		if (videoRef.current && whip.localStream) {
			videoRef.current.srcObject = whip.localStream;
		}
	}, [whip.localStream]);

	// Load daftar kamera
	useEffect(() => {
		listVideoDevices()
			.then((list) => {
				setDevices(list);
				if (list.length && list[0]) setDeviceId(list[0].deviceId);
			})
			.catch(() => {})
			.finally(() => setDevicesLoaded(true));
	}, []);

	// Auto-start WHIP saat masuk step streaming
	// Daftarkan path MediaMTX dulu (publisher), baru WHIP push
	useEffect(() => {
		if (step !== "streaming" || whip.status !== "idle") return;
		async function startStream() {
			// 1. Daftarkan path di MediaMTX via API (supaya WHIP tidak 400)
			try {
				await api("/devices/webcam/prepare-path", {
					method: "POST",
					body: JSON.stringify({ streamPath }),
				});
			} catch {
				// Non-fatal: lanjut saja, WHIP akan memberi error yang jelas jika gagal
			}
			// 2. Mulai WHIP
			await whip.start(deviceId || undefined);
		}
		void startStream();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [step]);

	// ─── Handlers ─────────────────────────────────────────────────────────────

	function goStreaming() {
		if (!slotName.trim()) return;
		setStep("streaming");
	}

	async function handleSave() {
		setSaving(true);
		setSaveError("");
		try {
			const result = await api<{
				id: string;
				cameras: { id: string; name: string }[];
			}>("/devices/webcam", {
				method: "POST",
				body: JSON.stringify({
					name: deviceName.trim(),
					streamPath,
					location: location.trim() || undefined,
				}),
			});
			whip.stop();
			setSavedCamera(result.cameras[0] ?? { id: "", name: deviceName });
			setStep("done");
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : "Gagal menyimpan");
		} finally {
			setSaving(false);
		}
	}

	function handleRetry() {
		whip.stop();
		void whip.start(deviceId || undefined);
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>
						<Camera
							size={18}
							style={{
								display: "inline",
								verticalAlign: "middle",
								marginRight: 6,
							}}
							aria-hidden
						/>
						Tambah Webcam
					</h1>
					<p>
						Streaming webcam dari browser langsung ke sistem via WebRTC (WHIP).
					</p>
				</div>
			</header>

			{/* ── Step: Setup ──────────────────────────────────────────────── */}
			{step === "setup" && (
				<div style={{ maxWidth: 520 }}>
					<div
						className="panel"
						style={{ display: "flex", flexDirection: "column", gap: 16 }}
					>
						{/* Pilih kamera */}
						<div className="field">
							<label htmlFor="wc-device">Kamera</label>
							{!devicesLoaded ? (
								<p style={{ color: "var(--muted)", fontSize: 13 }}>
									<Loader2
										size={13}
										style={{ display: "inline", marginRight: 4 }}
									/>
									Mendeteksi kamera…
								</p>
							) : devices.length === 0 ? (
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
										color: "var(--muted)",
										fontSize: 13,
									}}
								>
									<VideoOff size={14} />
									Tidak ada kamera ditemukan. Izinkan akses kamera di browser.
								</div>
							) : (
								<select
									id="wc-device"
									className="input select"
									value={deviceId}
									onChange={(e) => setDeviceId(e.target.value)}
								>
									{devices.map((d) => (
										<option key={d.deviceId} value={d.deviceId}>
											{d.label || `Kamera ${d.deviceId.slice(0, 8)}`}
										</option>
									))}
								</select>
							)}
						</div>

						{/* Nama tampilan */}
						<div className="field">
							<label htmlFor="wc-name">Nama Perangkat</label>
							<input
								id="wc-name"
								className="input"
								value={deviceName}
								onChange={(e) => setDeviceName(e.target.value)}
								placeholder="mis. PC Kasir 1"
								required
							/>
						</div>

						{/* Slot name → jadi stream path */}
						<div className="field">
							<label htmlFor="wc-slot">Nama Slot Stream</label>
							<input
								id="wc-slot"
								className="input"
								value={slotName}
								onChange={(e) =>
									setSlotName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ""))
								}
								placeholder="kasir-1"
								required
							/>
							<small style={{ color: "var(--muted)", fontSize: 12 }}>
								Stream path: <code>/{streamPath}</code>
							</small>
						</div>

						{/* Lokasi */}
						<div className="field">
							<label htmlFor="wc-loc">Lokasi (opsional)</label>
							<input
								id="wc-loc"
								className="input"
								value={location}
								onChange={(e) => setLocation(e.target.value)}
								placeholder="mis. Meja Kasir Lantai 1"
							/>
						</div>

						<Button
							disabled={
								!slotName.trim() || !deviceName.trim() || devices.length === 0
							}
							onClick={goStreaming}
						>
							<Radio size={14} aria-hidden />
							Mulai Streaming
						</Button>
					</div>
				</div>
			)}

			{/* ── Step: Streaming ──────────────────────────────────────────── */}
			{step === "streaming" && (
				<div style={{ maxWidth: 640 }}>
					{/* Preview video */}
					<div
						style={{
							position: "relative",
							background: "#000",
							borderRadius: 8,
							overflow: "hidden",
							aspectRatio: "4/3",
							marginBottom: 16,
							border: "1px solid var(--border)",
						}}
					>
						{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
						<video
							ref={videoRef}
							autoPlay
							playsInline
							muted
							style={{ width: "100%", height: "100%", objectFit: "cover" }}
						/>

						{/* Status overlay */}
						{whip.status !== "streaming" && (
							<div
								style={{
									position: "absolute",
									inset: 0,
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									justifyContent: "center",
									gap: 8,
									background: "rgba(0,0,0,0.7)",
									color: "#fff",
									fontSize: 14,
								}}
							>
								{whip.status === "requesting" && (
									<>
										<Loader2
											size={28}
											style={{ animation: "spin 1s linear infinite" }}
										/>
										<span>Menghubungkan ke MediaMTX…</span>
									</>
								)}
								{whip.status === "error" && (
									<>
										<VideoOff size={28} color="#ef4444" />
										<span
											style={{
												color: "#fca5a5",
												textAlign: "center",
												padding: "0 16px",
											}}
										>
											{whip.error}
										</span>
										<Button size="sm" variant="secondary" onClick={handleRetry}>
											Coba Lagi
										</Button>
									</>
								)}
							</div>
						)}

						{/* LIVE badge */}
						{whip.status === "streaming" && (
							<div
								style={{
									position: "absolute",
									top: 10,
									left: 10,
									background: "#ef4444",
									color: "#fff",
									fontSize: 11,
									fontWeight: 700,
									padding: "3px 8px",
									borderRadius: 4,
									letterSpacing: "0.05em",
								}}
							>
								● LIVE
							</div>
						)}
					</div>

					{/* Info stream */}
					<div className="panel" style={{ marginBottom: 16, fontSize: 13 }}>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: "6px 12px",
							}}
						>
							{[
								["Nama", deviceName],
								["Stream path", `/${streamPath}`],
								["Lokasi", location || "—"],
								[
									"Status",
									whip.status === "streaming" ? "🟢 Streaming" : whip.status,
								],
							].map(([k, v]) => (
								<div key={k}>
									<div style={{ color: "var(--muted)", fontSize: 11 }}>{k}</div>
									<div style={{ fontWeight: 600 }}>{v}</div>
								</div>
							))}
						</div>
					</div>

					{saveError && (
						<div
							className="panel"
							role="alert"
							style={{
								marginBottom: 12,
								borderColor:
									"color-mix(in srgb, var(--error), transparent 45%)",
								background: "color-mix(in srgb, var(--error), transparent 92%)",
								color: "#fecaca",
								fontSize: 13,
							}}
						>
							{saveError}
						</div>
					)}

					<div style={{ display: "flex", gap: 8 }}>
						<Button
							variant="ghost"
							onClick={() => {
								whip.stop();
								setStep("setup");
							}}
						>
							<StopCircle size={14} aria-hidden /> Kembali
						</Button>
						<Button
							disabled={whip.status !== "streaming" || saving}
							onClick={() => void handleSave()}
						>
							{saving ? (
								<Loader2
									size={14}
									style={{ animation: "spin 1s linear infinite" }}
								/>
							) : (
								<CheckCircle2 size={14} aria-hidden />
							)}
							{saving ? "Menyimpan…" : "Simpan & Daftarkan Kamera"}
						</Button>
					</div>
				</div>
			)}

			{/* ── Step: Done ───────────────────────────────────────────────── */}
			{step === "done" && (
				<div style={{ maxWidth: 480 }}>
					<div
						className="panel"
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 14,
							padding: 32,
							textAlign: "center",
						}}
					>
						<CheckCircle2 size={44} color="#3b82f6" />
						<div>
							<div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
								Webcam berhasil didaftarkan!
							</div>
							<div style={{ color: "var(--muted)", fontSize: 13 }}>
								Kamera <strong>{savedCamera?.name}</strong> sudah aktif dan siap
								digunakan.
							</div>
						</div>
						<div
							style={{
								display: "flex",
								gap: 8,
								flexWrap: "wrap",
								justifyContent: "center",
							}}
						>
							<Button variant="secondary" asChild>
								<Link href="/cameras">Lihat Inventaris Kamera</Link>
							</Button>
							<Button asChild>
								<Link href="/analytics">Aktifkan Analitik</Link>
							</Button>
						</div>
						<div
							style={{
								borderTop: "1px solid var(--border)",
								paddingTop: 14,
								width: "100%",
								fontSize: 12,
								color: "var(--muted)",
							}}
						>
							<strong>Catatan:</strong> Stream WHIP berhenti saat halaman ini
							ditutup. Untuk streaming yang terus berjalan di background,
							gunakan <code>scripts/webcam-bridge/mac-push.sh</code> atau{" "}
							<code>windows-push.ps1</code>.
						</div>
					</div>
				</div>
			)}
		</main>
	);
}
