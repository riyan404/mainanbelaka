"use client";

import { useCallback, useEffect, useState } from "react";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { type Paginated, api } from "@/lib/api";

const PAGE_SIZE = 25;

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
	const [data, setData] = useState<Paginated<CameraRow> | null>(null);
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [actionError, setActionError] = useState("");
	const [pendingCameraId, setPendingCameraId] = useState("");

	const load = useCallback(() => {
		const q = new URLSearchParams({
			search,
			page: String(page),
			pageSize: String(PAGE_SIZE),
		});
		void api<Paginated<CameraRow>>(`/cameras?${q.toString()}`).then(setData);
	}, [search, page]);

	// Reset ke page 1 saat search berubah
	useEffect(() => {
		void Promise.resolve().then(() => setPage(1));
	}, [search]);
	useEffect(() => {
		load();
	}, [load]);

	const rows = data?.items ?? [];
	const pagination = data?.pagination;

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
											const newEnabled = !camera.enabled;
											try {
												await api(`/cameras/${camera.id}/enabled`, {
													method: "POST",
													body: JSON.stringify({ enabled: newEnabled }),
												});
												// Update optimistic: ubah state lokal langsung
												// supaya tombol update instan tanpa tunggu load()
												setData((prev) =>
													prev
														? {
																...prev,
																items: prev.items.map((c) =>
																	c.id === camera.id
																		? { ...c, enabled: newEnabled }
																		: c,
																),
															}
														: prev,
												);
												load(); // fetch ulang untuk sync connectionStatus dll
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

			{pagination && (
				<Pagination
					page={pagination.page}
					pages={pagination.pages}
					total={pagination.total}
					pageSize={pagination.pageSize}
					onChange={(p) => {
						setPage(p);
						window.scrollTo({ top: 0, behavior: "smooth" });
					}}
				/>
			)}
		</main>
	);
}
