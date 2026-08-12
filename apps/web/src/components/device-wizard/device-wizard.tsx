"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";

interface Channel {
	channelNumber: number;
	sourceName?: string;
	main: { available: boolean; codec?: string; resolution?: string };
	sub: { available: boolean; codec?: string; resolution?: string };
}
interface Detection {
	detectionToken: string;
	device: { model?: string; serialNumber?: string; firmwareVersion?: string };
	channels: Channel[];
}
const steps = ["Data Koneksi", "Test & Detect", "Review Channel", "Simpan"];

export function DeviceWizard() {
	const router = useRouter();
	const [step, setStep] = useState(0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [detection, setDetection] = useState<Detection>();
	const [form, setForm] = useState({
		name: "",
		type: "NVR",
		host: "",
		httpPort: 80,
		rtspPort: 554,
		username: "",
		password: "",
	});
	const update = (key: string, value: string | number) =>
		setForm((current) => ({ ...current, [key]: value }));
	async function detect() {
		setLoading(true);
		setError("");
		try {
			const result = await api<Detection>("/devices/test-detect", {
				method: "POST",
				body: JSON.stringify(form),
			});
			setDetection(result);
			setStep(2);
		} catch (value) {
			setError(value instanceof Error ? value.message : "Deteksi gagal");
			setStep(1);
		} finally {
			setLoading(false);
		}
	}
	async function save() {
		if (!detection) return;
		setLoading(true);
		try {
			await api("/devices", {
				method: "POST",
				body: JSON.stringify({
					...form,
					detectionToken: detection.detectionToken,
				}),
			});
			setStep(3);
			setTimeout(() => router.push("/devices"), 800);
		} catch (value) {
			setError(value instanceof Error ? value.message : "Simpan gagal");
		} finally {
			setLoading(false);
		}
	}
	return (
		<div className="wizard">
			<div className="stepper">
				{steps.map((label, index) => (
					<div
						className={`step ${index === step ? "step-active" : ""} ${index < step ? "step-done" : ""}`}
						key={label}
					>
						{index < step ? <Check aria-hidden size={13} /> : `${index + 1}.`}{" "}
						{label}
					</div>
				))}
			</div>
			<section className="panel">
				{step === 0 ? (
					<>
						<div className="form-grid">
							<div className="field wide">
								<label htmlFor="name">Nama perangkat</label>
								<input
									id="name"
									className="input"
									value={form.name}
									onChange={(e) => update("name", e.target.value)}
								/>
							</div>
							<div className="field">
								<label htmlFor="type">Jenis</label>
								<select
									id="type"
									className="select"
									value={form.type}
									onChange={(e) => update("type", e.target.value)}
								>
									<option>NVR</option>
									<option>DVR</option>
									<option value="IP_CAMERA">IP Camera</option>
								</select>
							</div>
							<div className="field">
								<label htmlFor="host">IP/hostname</label>
								<input
									id="host"
									className="input"
									value={form.host}
									onChange={(e) => update("host", e.target.value)}
									placeholder="192.168.1.20"
								/>
							</div>
							<div className="field">
								<label htmlFor="httpPort">HTTP port</label>
								<input
									id="httpPort"
									className="input"
									type="number"
									value={form.httpPort}
									onChange={(e) => update("httpPort", Number(e.target.value))}
								/>
							</div>
							<div className="field">
								<label htmlFor="rtspPort">RTSP port</label>
								<input
									id="rtspPort"
									className="input"
									type="number"
									value={form.rtspPort}
									onChange={(e) => update("rtspPort", Number(e.target.value))}
								/>
							</div>
							<div className="field">
								<label htmlFor="username">Username</label>
								<input
									id="username"
									className="input"
									value={form.username}
									onChange={(e) => update("username", e.target.value)}
								/>
							</div>
							<div className="field">
								<label htmlFor="password">Password</label>
								<input
									id="password"
									className="input"
									type="password"
									value={form.password}
									onChange={(e) => update("password", e.target.value)}
								/>
							</div>
						</div>
						<div className="form-actions">
							<Button
								disabled={
									!form.name || !form.host || !form.username || !form.password
								}
								onClick={detect}
							>
								Test & Detect
							</Button>
						</div>
					</>
				) : null}
				{step === 1 ? (
					<div className="empty-state" style={{ minHeight: 320 }}>
						{loading ? <LoaderCircle aria-hidden /> : null}
						<strong>
							{loading
								? "Menguji koneksi dan mendeteksi channel"
								: "Deteksi gagal"}
						</strong>
						<span>
							{error || "Proses dapat memerlukan beberapa detik per channel."}
						</span>
						{!loading ? (
							<Button variant="secondary" onClick={() => setStep(0)}>
								Kembali
							</Button>
						) : null}
					</div>
				) : null}
				{step === 2 && detection ? (
					<>
						<div className="page-head">
							<div>
								<h1>{detection.device.model || form.name}</h1>
								<p>
									{detection.channels.length} channel ditemukan. Semua disimpan
									sebagai nonaktif.
								</p>
							</div>
						</div>
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Channel</th>
										<th>Nama</th>
										<th>Main</th>
										<th>Sub</th>
									</tr>
								</thead>
								<tbody>
									{detection.channels.map((channel) => (
										<tr key={channel.channelNumber}>
											<td data-label="Channel">{channel.channelNumber}</td>
											<td data-label="Nama">
												{channel.sourceName ||
													`Channel ${channel.channelNumber}`}
											</td>
											<td data-label="Main">
												<StatusBadge
													status={
														channel.main.available &&
														channel.main.codec === "hevc"
															? "ONLINE"
															: "OFFLINE"
													}
												/>{" "}
												{channel.main.codec?.toUpperCase()}{" "}
												{channel.main.resolution}
											</td>
											<td data-label="Sub">
												<StatusBadge
													status={
														channel.sub.available &&
														channel.sub.codec === "hevc"
															? "ONLINE"
															: "OFFLINE"
													}
												/>{" "}
												{channel.sub.codec?.toUpperCase()}{" "}
												{channel.sub.resolution}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div className="form-actions">
							<Button variant="secondary" onClick={() => setStep(0)}>
								Kembali
							</Button>
							<Button disabled={loading} onClick={save}>
								{loading ? "Menyimpan…" : "Simpan Perangkat"}
							</Button>
						</div>
					</>
				) : null}
				{step === 3 ? (
					<div className="empty-state" style={{ minHeight: 320 }}>
						<Check aria-hidden />
						<strong>Perangkat tersimpan</strong>
						<span>Membuka daftar perangkat…</span>
					</div>
				) : null}
			</section>
		</div>
	);
}
