"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";

interface CameraRow {
	id: string;
	name: string;
	location?: string;
	channelNumber: number;
	enabled: boolean;
	connectionStatus: "UNTESTED" | "ONLINE" | "OFFLINE" | "ERROR";
	mainCodec?: string;
	subCodec?: string;
	device: { name: string; host: string };
}
export default function CamerasPage() {
	const [rows, setRows] = useState<CameraRow[]>([]);
	const [search, setSearch] = useState("");
	const [actionError, setActionError] = useState("");
	const [pendingCameraId, setPendingCameraId] = useState("");
	const load = () =>
		void api<CameraRow[]>(`/cameras?search=${encodeURIComponent(search)}`).then(
			setRows,
		);
	useEffect(load, [search]);
	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>Inventaris Kamera</h1>
					<p>Aktifkan hanya channel H.265/HEVC yang dibutuhkan.</p>
				</div>
			</header>
			{actionError ? (
				<div className="panel camera-action-error" role="alert">
					<strong>Kamera gagal diaktifkan</strong>
					<span>{actionError}</span>
				</div>
			) : null}
			<div className="field" style={{ maxWidth: 320, marginBottom: 12 }}>
				<label htmlFor="search">Cari kamera</label>
				<input
					id="search"
					className="input"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Nama, lokasi, atau perangkat"
				/>
			</div>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Nama</th>
							<th>Lokasi</th>
							<th>Perangkat</th>
							<th>Channel</th>
							<th>Codec</th>
							<th>Status</th>
							<th>Live</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((camera) => (
							<tr key={camera.id}>
								<td data-label="Nama">{camera.name}</td>
								<td data-label="Lokasi">{camera.location || "—"}</td>
								<td data-label="Perangkat">{camera.device.name}</td>
								<td data-label="Channel">{camera.channelNumber}</td>
								<td data-label="Codec">
									{camera.mainCodec?.toUpperCase() || "—"} /{" "}
									{camera.subCodec?.toUpperCase() || "—"}
								</td>
								<td data-label="Status">
									<StatusBadge status={camera.connectionStatus} />
								</td>
								<td data-label="Live">
									<Button
										size="sm"
										variant={camera.enabled ? "secondary" : "primary"}
										disabled={pendingCameraId === camera.id}
										onClick={async () => {
											setActionError("");
											setPendingCameraId(camera.id);
											try {
												await api(`/cameras/${camera.id}/enabled`, {
													method: "POST",
													body: JSON.stringify({ enabled: !camera.enabled }),
												});
												load();
											} catch (error) {
												setActionError(
													error instanceof Error
														? error.message
														: "Kamera gagal diaktifkan",
												);
											} finally {
												setPendingCameraId("");
											}
										}}
									>
										{pendingCameraId === camera.id
											? "Menguji…"
											: camera.enabled
												? "Nonaktifkan"
												: "Tes & Aktifkan"}
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</main>
	);
}
