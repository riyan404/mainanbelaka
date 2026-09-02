"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PolygonPoint } from "@/lib/analytics";

interface ZoneCanvasProps {
	snapshotUrl: string;
	polygon: PolygonPoint[];
	onChange: (polygon: PolygonPoint[]) => void;
	readonly?: boolean;
	existingZones?: { name: string; polygon: PolygonPoint[] }[];
}

function drawPolygonOnCanvas(
	ctx: CanvasRenderingContext2D,
	points: PolygonPoint[],
	w: number,
	h: number,
	style: {
		fill: string;
		stroke: string;
		pointRadius: number;
		label?: string;
	},
) {
	if (points.length === 0) return;

	const pixelPoints = points.map((p) => ({
		x: p.x * w,
		y: p.y * h,
	}));

	// Fill
	if (pixelPoints.length >= 3) {
		ctx.beginPath();
		ctx.moveTo(pixelPoints[0]!.x, pixelPoints[0]!.y);
		for (let i = 1; i < pixelPoints.length; i++) {
			ctx.lineTo(pixelPoints[i]!.x, pixelPoints[i]!.y);
		}
		ctx.closePath();
		ctx.fillStyle = style.fill;
		ctx.fill();
	}

	// Stroke
	ctx.beginPath();
	ctx.moveTo(pixelPoints[0]!.x, pixelPoints[0]!.y);
	for (let i = 1; i < pixelPoints.length; i++) {
		ctx.lineTo(pixelPoints[i]!.x, pixelPoints[i]!.y);
	}
	if (pixelPoints.length >= 3) ctx.closePath();
	ctx.strokeStyle = style.stroke;
	ctx.lineWidth = 2;
	ctx.stroke();

	// Points
	if (style.pointRadius > 0) {
		for (const p of pixelPoints) {
			ctx.beginPath();
			ctx.arc(p.x, p.y, style.pointRadius, 0, Math.PI * 2);
			ctx.fillStyle = style.stroke;
			ctx.fill();
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
	}

	// Label
	if (style.label && pixelPoints.length > 0) {
		const cx = pixelPoints.reduce((s, p) => s + p.x, 0) / pixelPoints.length;
		const cy = pixelPoints.reduce((s, p) => s + p.y, 0) / pixelPoints.length;
		ctx.font = "12px Inter, sans-serif";
		ctx.fillStyle = "rgba(255,255,255,0.8)";
		ctx.textAlign = "center";
		ctx.fillText(style.label, cx, cy);
	}
}

export function ZoneCanvas({
	snapshotUrl,
	polygon,
	onChange,
	readonly = false,
	existingZones = [],
}: ZoneCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [imageError, setImageError] = useState(false);

	// Load snapshot image
	useEffect(() => {
		let cancelled = false;
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			if (!cancelled) setImage(img);
		};
		img.onerror = () => {
			if (!cancelled) setImageError(true);
		};
		img.src = snapshotUrl;
		return () => {
			cancelled = true;
			img.onload = null;
			img.onerror = null;
		};
	}, [snapshotUrl]);

	// Aspect ratio container = aspect ratio snapshot asli (bukan 16:9 hardcode),
	// supaya koordinat klik = koordinat frame video sebenarnya (tanpa letterbox).
	const imageAspect = image ? image.width / image.height : 16 / 9;

	// Draw canvas
	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const rect = container.getBoundingClientRect();
		canvas.width = rect.width;
		canvas.height = rect.height;

		// Background
		ctx.fillStyle = "#0a0a0a";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		if (image) {
			// Full-bleed: gambar memenuhi canvas persis (canvas aspect = image aspect)
			ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

			// Draw existing zones (read-only)
			for (const zone of existingZones) {
				drawPolygonOnCanvas(ctx, zone.polygon, canvas.width, canvas.height, {
					fill: "rgba(59, 130, 246, 0.1)",
					stroke: "rgba(59, 130, 246, 0.4)",
					pointRadius: 0,
					label: zone.name,
				});
			}

			// Draw current polygon
			if (polygon.length > 0) {
				drawPolygonOnCanvas(ctx, polygon, canvas.width, canvas.height, {
					fill: "rgba(249, 115, 22, 0.15)",
					stroke: "rgba(249, 115, 22, 0.8)",
					pointRadius: readonly ? 0 : 6,
				});
			}
		}
	}, [image, polygon, existingZones, readonly]);

	useEffect(() => {
		draw();
	}, [draw]);

	// Redraw on resize
	useEffect(() => {
		const observer = new ResizeObserver(() => draw());
		if (containerRef.current) observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, [draw]);

	// Convert screen coords to relative coords
	function toRelative(e: React.MouseEvent): PolygonPoint {
		const canvas = canvasRef.current!;
		const rect = canvas.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
			y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
		};
	}

	function findNearbyPoint(
		e: React.MouseEvent,
		threshold = 0.02,
	): number | null {
		const rel = toRelative(e);
		for (let i = 0; i < polygon.length; i++) {
			const point = polygon[i]!;
			const dx = point.x - rel.x;
			const dy = point.y - rel.y;
			if (Math.sqrt(dx * dx + dy * dy) < threshold) return i;
		}
		return null;
	}

	function handleMouseDown(e: React.MouseEvent) {
		if (readonly) return;
		e.preventDefault();

		if (e.button === 2) {
			const idx = findNearbyPoint(e);
			if (idx !== null) {
				const next = [...polygon];
				next.splice(idx, 1);
				onChange(next);
			}
			return;
		}

		const idx = findNearbyPoint(e);
		if (idx !== null) {
			setDragIndex(idx);
			return;
		}

		const rel = toRelative(e);
		onChange([...polygon, rel]);
	}

	function handleMouseMove(e: React.MouseEvent) {
		if (dragIndex === null || readonly) return;
		const rel = toRelative(e);
		const next = [...polygon];
		next[dragIndex] = rel;
		onChange(next);
	}

	function handleMouseUp() {
		setDragIndex(null);
	}

	return (
		<div
			ref={containerRef}
			className="zone-canvas-container"
			style={{
				position: "relative",
				width: "100%",
				aspectRatio: imageAspect,
				backgroundColor: "#0a0a0a",
				borderRadius: 8,
				overflow: "hidden",
				cursor: readonly ? "default" : "crosshair",
			}}
		>
			<canvas
				ref={canvasRef}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				onContextMenu={(e) => e.preventDefault()}
				style={{ display: "block", width: "100%", height: "100%" }}
			/>
			{imageError && (
				<div
					style={{
						position: "absolute",
						inset: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "#737373",
						fontSize: 14,
					}}
				>
					Snapshot belum tersedia. Aktifkan analitik terlebih dahulu.
				</div>
			)}
			{!readonly && polygon.length > 0 && (
				<div
					style={{
						position: "absolute",
						bottom: 8,
						left: 8,
						color: "#a3a3a3",
						fontSize: 11,
						background: "rgba(0,0,0,0.6)",
						padding: "2px 8px",
						borderRadius: 4,
					}}
				>
					{polygon.length} titik — klik kiri tambah, klik kanan hapus, drag
					pindahkan
				</div>
			)}
		</div>
	);
}
