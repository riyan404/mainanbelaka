"use client";

import { Expand, RefreshCw, VideoOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { Camera } from "@/lib/api";
import { api } from "@/lib/api";
import { supportsHevcWebRtc } from "@/lib/hevc";
import { LiveTrackingOverlay } from "./live-tracking-overlay";
import { Button } from "./ui/button";
import { StatusBadge } from "./ui/status-badge";

export function CameraTile({ camera }: { camera: Camera }) {
	const [quality, setQuality] = useState<"sub" | "main">("sub");
	const [stream, setStream] = useState({ url: "", error: "" });
	const [reload, setReload] = useState(0);
	const { url, error } = stream;

	useEffect(() => {
		let active = true;
		void supportsHevcWebRtc()
			.then((supported) => {
				if (!supported) {
					throw new Error(
						"Browser atau perangkat ini tidak mendukung WebRTC H.265/HEVC",
					);
				}
				return api<{ url: string }>(
					`/streams/${camera.id}/session?quality=${quality}`,
					{ method: "POST" },
				);
			})
			.then((result) => {
				if (active) setStream({ url: result.url, error: "" });
			})
			.catch((value) => {
				if (active) {
					setStream({
						url: "",
						error: value instanceof Error ? value.message : "Stream gagal",
					});
				}
			});
		return () => {
			active = false;
		};
	}, [camera.id, quality, reload]);

	async function fullscreen() {
		setStream({ url: "", error: "" });
		setQuality("main");
		await document.getElementById(`camera-${camera.id}`)?.requestFullscreen();
	}

	useEffect(() => {
		let ownedFullscreen = false;
		const tileId = `camera-${camera.id}`;
		const handler = () => {
			if (document.fullscreenElement?.id === tileId) {
				ownedFullscreen = true;
				return;
			}
			if (ownedFullscreen && !document.fullscreenElement) {
				ownedFullscreen = false;
				setStream({ url: "", error: "" });
				setQuality("sub");
			}
		};
		document.addEventListener("fullscreenchange", handler);
		return () => document.removeEventListener("fullscreenchange", handler);
	}, [camera.id]);

	return (
		<article
			id={`camera-${camera.id}`}
			className={`camera-tile ${error ? "camera-tile-error" : ""}`}
		>
			{!url && !error ? (
				<div
					className="skeleton"
					style={{ width: "100%", height: "100%" }}
					aria-label="Menghubungkan stream"
				/>
			) : null}
			{url ? (
				<iframe
					key={url}
					src={url}
					title={`Live ${camera.name}`}
					allow="autoplay; fullscreen"
				/>
			) : null}
			{error ? (
				<div className="empty-state" style={{ minHeight: 0, height: "100%" }}>
					<VideoOff aria-hidden />
					<strong>Stream tidak tersedia</strong>
					<span>{error}</span>
					<Button
						size="sm"
						variant="secondary"
						onClick={() => {
							setStream({ url: "", error: "" });
							setReload((value) => value + 1);
						}}
					>
						<RefreshCw aria-hidden size={14} />
						Coba Lagi
					</Button>
				</div>
			) : null}
			<div className="camera-actions">
				<Button
					size="icon"
					variant="secondary"
					title="Fullscreen kamera"
					aria-label={`Fullscreen ${camera.name}`}
					onClick={fullscreen}
				>
					<Expand aria-hidden size={16} />
				</Button>
			</div>
			<LiveTrackingOverlay cameraId={camera.id} />
			<div className="camera-overlay">
				<div>
					<div className="camera-name">{camera.name}</div>
					<div className="camera-location">
						{camera.location || camera.device.name}
					</div>
				</div>
				<StatusBadge status={error ? "OFFLINE" : camera.connectionStatus} />
			</div>
		</article>
	);
}
