"use client";

import { Archive, Link2, Plus, RefreshCw, Webcam } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { api } from "@/lib/api";

interface Device {
	id: string;
	name: string;
	type: string;
	host: string;
	model?: string;
	connectionStatus: "UNTESTED" | "ONLINE" | "OFFLINE" | "ERROR";
	_count: { cameras: number };
}

export default function DevicesPage() {
	const [devices, setDevices] = useState<Device[]>([]);
	const load = () => void api<Device[]>("/devices").then(setDevices);
	useEffect(load, []);
	const pg = useClientPagination(devices, 20);
	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>Perangkat</h1>
					<p>Kelola NVR, DVR, dan kamera IP Hikvision.</p>
				</div>
				<div className="toolbar-spacer" />
				<Button variant="secondary" asChild>
					<Link href="/webcams/new">
						<Webcam aria-hidden size={15} />
						Tambah Webcam
					</Link>
				</Button>
				<Button variant="secondary" asChild>
					<Link href="/devices/new/rtsp">
						<Link2 aria-hidden size={15} />
						Tambah Sumber RTSP
					</Link>
				</Button>
				<Button asChild>
					<Link href="/devices/new">
						<Plus aria-hidden size={15} />
						Tambah NVR/IP Cam
					</Link>
				</Button>
			</header>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Nama</th>
							<th>Jenis</th>
							<th>Host</th>
							<th>Model</th>
							<th>Channel</th>
							<th>Status</th>
							<th>Aksi</th>
						</tr>
					</thead>
					<tbody>
						{pg.slice.map((device) => (
							<tr key={device.id}>
								<td data-label="Nama">{device.name}</td>
								<td data-label="Jenis">{device.type}</td>
								<td data-label="Host">{device.host}</td>
								<td data-label="Model">{device.model ?? "—"}</td>
								<td data-label="Channel">{device._count.cameras}</td>
								<td data-label="Status">
									<StatusBadge status={device.connectionStatus} />
								</td>
								<td data-label="Aksi">
									<Button
										size="icon"
										variant="ghost"
										title="Deteksi ulang"
										onClick={async () => {
											await api(`/devices/${device.id}/redetect`, {
												method: "POST",
											});
											load();
										}}
									>
										<RefreshCw aria-hidden size={15} />
									</Button>
									<Button
										size="icon"
										variant="ghost"
										title="Arsipkan"
										onClick={async () => {
											await api(`/devices/${device.id}/archive`, {
												method: "POST",
											});
											load();
										}}
									>
										<Archive aria-hidden size={15} />
									</Button>
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
		</main>
	);
}
