"use client";
import { Pagination } from "@/components/ui/pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ZoneEditor } from "@/components/zone-editor/zone-editor";
import { type AnalyticsZone, fetchZones } from "@/lib/analytics";
import { api } from "@/lib/api";

interface CameraInfo {
	id: string;
	name: string;
	device: { name: string };
}

function ZonesContent() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const cameraId = searchParams.get("cameraId") ?? "";
	const [camera, setCamera] = useState<CameraInfo | null>(null);
	const [zones, setZones] = useState<AnalyticsZone[]>([]);
	const pg = useClientPagination(zones, 20);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const loadZones = useCallback(async () => {
		if (!cameraId) return;
		try {
			const data = await fetchZones(cameraId);
			setZones(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Gagal memuat zona");
		}
	}, [cameraId]);

	useEffect(() => {
		async function load() {
			if (!cameraId) {
				// Redirect ke page Analitik jika tidak ada kamera ID
				router.replace("/analytics");
				return;
			}
			try {
				const cameras = (await api<import("@/lib/api").Paginated<CameraInfo>>("/cameras?pageSize=500")).items;
				const found = cameras.find((c) => c.id === cameraId);
				if (!found) {
					setError("Kamera tidak ditemukan");
					setLoading(false);
					return;
				}
				setCamera(found);
				await loadZones();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Gagal memuat data");
			} finally {
				setLoading(false);
			}
		}
		void load();
	}, [cameraId, loadZones, router]);

	if (loading) {
		return (
			<main style={{ padding: 24 }}>
				<p style={{ color: "#737373" }}>Memuat...</p>
			</main>
		);
	}

	if (error && !camera) {
		return (
			<main style={{ padding: 24 }}>
				<p style={{ color: "#ef4444" }}>{error}</p>
			</main>
		);
	}

	return (
		<main style={{ padding: 24 }}>
			<header style={{ marginBottom: 20 }}>
				<Link
					href="/analytics"
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						color: "#737373",
						fontSize: 13,
						textDecoration: "none",
						marginBottom: 8,
					}}
				>
					<ArrowLeft size={14} /> Kembali ke Analitik
				</Link>
				<h1 style={{ fontSize: 20, fontWeight: 600, color: "#e5e5e5" }}>
					Editor Zona — {camera?.name}
				</h1>
				<p style={{ color: "#737373", fontSize: 13, marginTop: 4 }}>
					{camera?.device.name} — Gambar poligon zona di atas snapshot kamera.
				</p>
			</header>

			{error && (
				<div
					style={{
						background: "rgba(239,68,68,0.1)",
						border: "1px solid rgba(239,68,68,0.3)",
						borderRadius: 8,
						padding: "10px 14px",
						color: "#ef4444",
						fontSize: 13,
						marginBottom: 16,
					}}
				>
					{error}
				</div>
			)}

			{cameraId && (
				<ZoneEditor
					cameraId={cameraId}
					zones={zones}
					onZonesChange={loadZones}
				/>
			)}
			<Pagination page={pg.page} pages={pg.pages} total={pg.total} pageSize={pg.pageSize} onChange={pg.changePage} />
		</main>
	);
}

export default function ZonesPage() {
	return (
		<Suspense
			fallback={
				<main style={{ padding: 24 }}>
					<p style={{ color: "#737373" }}>Memuat...</p>
				</main>
			}
		>
			<ZonesContent />
		</Suspense>
	);
}
