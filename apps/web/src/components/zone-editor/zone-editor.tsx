"use client";

import { Save, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	type AnalyticsZone,
	type PolygonPoint,
	createZone,
	deleteZone,
	getSnapshotUrl,
	updateZone,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { ZoneCanvas } from "./zone-canvas";

interface ZoneEditorProps {
	cameraId: string;
	zones: AnalyticsZone[];
	onZonesChange: () => void;
}

export function ZoneEditor({
	cameraId,
	zones,
	onZonesChange,
}: ZoneEditorProps) {
	const [selectedZone, setSelectedZone] = useState<AnalyticsZone | null>(null);
	const [name, setName] = useState("");
	const [polygon, setPolygon] = useState<PolygonPoint[]>([]);
	const [trackPosture, setTrackPosture] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	function selectZone(zone: AnalyticsZone | null) {
		setSelectedZone(zone);
		setName(zone?.name ?? "");
		setPolygon(zone?.polygon ?? []);
		setTrackPosture(zone?.trackPosture ?? false);
		setError("");
	}

	async function handleSave() {
		if (polygon.length < 3) {
			setError("Poligon minimal 3 titik");
			return;
		}
		if (!name.trim()) {
			setError("Nama zona wajib diisi");
			return;
		}

		setSaving(true);
		setError("");
		try {
			if (selectedZone) {
				await updateZone(selectedZone.id, { name, polygon, trackPosture });
			} else {
				await createZone({
					cameraChannelId: cameraId,
					name,
					polygon,
					trackPosture,
				});
			}
			selectZone(null);
			onZonesChange();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Gagal menyimpan zona");
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		if (!selectedZone) return;
		setSaving(true);
		try {
			await deleteZone(selectedZone.id);
			selectZone(null);
			onZonesChange();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Gagal menghapus zona");
		} finally {
			setSaving(false);
		}
	}

	const otherZones = zones
		.filter((z) => z.id !== selectedZone?.id)
		.map((z) => ({ name: z.name, polygon: z.polygon }));

	return (
		<div
			className="zone-editor"
			style={{ display: "flex", flexDirection: "column", gap: 16 }}
		>
			{/* Zone list */}
			{zones.length > 0 && (
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					{zones.map((zone) => (
						<button
							key={zone.id}
							onClick={() => selectZone(zone)}
							style={{
								padding: "4px 12px",
								borderRadius: 6,
								border: "1px solid #404040",
								background:
									selectedZone?.id === zone.id ? "#262626" : "transparent",
								color: "#d4d4d4",
								fontSize: 13,
								cursor: "pointer",
							}}
						>
							{zone.name}
							{zone.trackPosture && " 📐"}
						</button>
					))}
					<button
						onClick={() => selectZone(null)}
						style={{
							padding: "4px 12px",
							borderRadius: 6,
							border: "1px dashed #525252",
							background: "transparent",
							color: "#a3a3a3",
							fontSize: 13,
							cursor: "pointer",
						}}
					>
						+ Zona Baru
					</button>
				</div>
			)}

			{/* Canvas */}
			<ZoneCanvas
				snapshotUrl={getSnapshotUrl(cameraId)}
				polygon={polygon}
				onChange={setPolygon}
				existingZones={otherZones}
			/>

			{/* Form */}
			<div
				style={{
					display: "flex",
					gap: 12,
					alignItems: "flex-end",
					flexWrap: "wrap",
				}}
			>
				<div style={{ flex: "1 1 200px" }}>
					<label
						htmlFor="zone-name"
						style={{
							display: "block",
							fontSize: 13,
							color: "#a3a3a3",
							marginBottom: 4,
						}}
					>
						Nama Zona
					</label>
					<input
						id="zone-name"
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Contoh: Meja Resepsionis"
						style={{
							width: "100%",
							padding: "8px 12px",
							borderRadius: 6,
							border: "1px solid #404040",
							background: "#171717",
							color: "#d4d4d4",
							fontSize: 14,
						}}
					/>
				</div>
				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						fontSize: 13,
						color: "#d4d4d4",
						cursor: "pointer",
						paddingBottom: 8,
					}}
				>
					<input
						type="checkbox"
						checked={trackPosture}
						onChange={(e) => setTrackPosture(e.target.checked)}
						style={{ accentColor: "#3b82f6" }}
					/>
					Lacak postur duduk/berdiri
				</label>
				<div style={{ display: "flex", gap: 8, paddingBottom: 2 }}>
					<Button
						variant="secondary"
						size="sm"
						disabled={saving || polygon.length < 3 || !name.trim()}
						onClick={handleSave}
					>
						<Save size={14} aria-hidden />
						{selectedZone ? "Perbarui" : "Simpan"}
					</Button>
					{selectedZone && (
						<Button
							variant="ghost"
							size="sm"
							disabled={saving}
							onClick={handleDelete}
						>
							<Trash2 size={14} aria-hidden />
							Hapus
						</Button>
					)}
				</div>
			</div>

			{error && <div style={{ color: "#ef4444", fontSize: 13 }}>{error}</div>}
		</div>
	);
}
