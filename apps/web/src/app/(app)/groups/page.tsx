"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface GroupRow {
	id: string;
	name: string;
	description?: string;
	isDefault: boolean;
	_count: { cameras: number };
}
export default function GroupsPage() {
	const [groups, setGroups] = useState<GroupRow[]>([]);
	const [name, setName] = useState("");
	const load = () => void api<GroupRow[]>("/groups").then(setGroups);
	useEffect(load, []);
	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>Grup</h1>
					<p>Satu kamera dapat berada dalam beberapa grup.</p>
				</div>
			</header>
			<form
				className="page-head"
				onSubmit={async (event) => {
					event.preventDefault();
					await api("/groups", {
						method: "POST",
						body: JSON.stringify({ name }),
					});
					setName("");
					load();
				}}
			>
				<input
					className="input"
					style={{ maxWidth: 280 }}
					aria-label="Nama grup baru"
					placeholder="Nama grup baru"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<Button type="submit" disabled={name.length < 2}>
					Tambah Grup
				</Button>
			</form>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Nama</th>
							<th>Deskripsi</th>
							<th>Kamera</th>
							<th>Default</th>
						</tr>
					</thead>
					<tbody>
						{groups.map((group) => (
							<tr key={group.id}>
								<td data-label="Nama">{group.name}</td>
								<td data-label="Deskripsi">{group.description || "—"}</td>
								<td data-label="Kamera">{group._count.cameras}</td>
								<td data-label="Default">
									<Button
										size="sm"
										variant={group.isDefault ? "secondary" : "ghost"}
										disabled={group.isDefault}
										onClick={async () => {
											await api(`/groups/${group.id}/default`, {
												method: "POST",
											});
											load();
										}}
									>
										{group.isDefault ? "Grup default" : "Jadikan default"}
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
