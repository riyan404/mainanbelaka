"use client";

import { Archive, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
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
	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>Perangkat</h1>
					<p>Kelola NVR, DVR, dan kamera IP Hikvision.</p>
				</div>
				<div className="toolbar-spacer" />
				<Button asChild>
					<Link href="/devices/new">
						<Plus aria-hidden size={15} />
						Tambah
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
						{devices.map((device) => (
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
		</main>
	);
}
