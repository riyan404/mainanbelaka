"use client";

import { useEffect, useRef, useState } from "react";
import type { CameraLiveState, LiveTrack, LiveZone } from "@/lib/analytics";
import { fetchCameraLiveState } from "@/lib/analytics";

/** Interval polling live state (harus < TTL 15s di server). */
const POLL_INTERVAL_MS = 1000;

export function postureLabel(posture: string | null): string {
	switch (posture) {
		case "SITTING":
			return "Duduk";
		case "STANDING":
			return "Berdiri";
		default:
			return "";
	}
}

/** Warna kotak per postur. */
function boxClass(posture: string | null): string {
	switch (posture) {
		case "SITTING":
			return "live-person-box sitting";
		case "STANDING":
			return "live-person-box standing";
		default:
			return "live-person-box";
	}
}

/**
 * Overlay realtime di atas tile kamera: hanya orang yang berada DI DALAM
 * zona yang ditampilkan (kotak tracking + label postur), plus poligon zona.
 * Koordinat relatif 0-1, di-scale via SVG viewBox="0 0 1 1".
 */
export function LiveTrackingOverlay({ cameraId }: { cameraId: string }) {
	const [state, setState] = useState<CameraLiveState | null>(null);
	const [hasZones, setHasZones] = useState<boolean | null>(null);
	const [enabled, setEnabled] = useState(true);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		let cancelled = false;
		let failedOnce = false;

		async function poll() {
			try {
				const data = await fetchCameraLiveState(cameraId);
				if (cancelled) return;
				setState(data);
				setHasZones(data.zones.length > 0);
			} catch {
				if (!cancelled && !failedOnce) {
					failedOnce = true;
					setHasZones(false);
				}
			}
		}

		void poll();
		timerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [cameraId]);

	// Kamera tidak punya zona → jangan render apa pun
	if (hasZones === false || hasZones === null) return null;

	// Hanya orang yang berada di dalam zona yang ditampilkan
	const zoneTracks = (state?.tracks ?? []).filter((t) => t.zoneId);
	const occupiedZoneIds = new Set(zoneTracks.map((t) => t.zoneId as string));
	const zoneNames = new Map(
		(state?.zones ?? []).map((z) => [z.id, z.name] as const),
	);

	return (
		<>
			<button
				type="button"
				className={`live-overlay-toggle live-overlay-toggle-always${
					enabled ? " live-overlay-toggle-active" : ""
				}`}
				onClick={() => setEnabled((v) => !v)}
				aria-label={
					enabled ? "Sembunyikan zona analitik" : "Tampilkan zona analitik"
				}
				aria-pressed={enabled}
			>
				Zona
			</button>
			{enabled && state ? (
				<>
					<svg
						className="live-zone-svg"
						viewBox="0 0 1 1"
						preserveAspectRatio="none"
						aria-hidden
					>
						{state.zones.map((zone: LiveZone) => {
							const points = zone.polygon.map((p) => `${p.x},${p.y}`).join(" ");
							const occupied = occupiedZoneIds.has(zone.id);
							return (
								<polygon
									key={zone.id}
									points={points}
									className={
										occupied ? "live-zone-poly occupied" : "live-zone-poly"
									}
								/>
							);
						})}
						{zoneTracks.map((t: LiveTrack) => {
							const [x1, y1, x2, y2] = t.bbox;
							if (
								typeof x1 !== "number" ||
								typeof y1 !== "number" ||
								typeof x2 !== "number" ||
								typeof y2 !== "number"
							)
								return null;
							return (
								<rect
									key={t.trackRef}
									x={x1}
									y={y1}
									width={x2 - x1}
									height={y2 - y1}
									className={boxClass(t.posture)}
								/>
							);
						})}
					</svg>
					{zoneTracks.map((t: LiveTrack) => {
						const [x1, y1, x2] = t.bbox;
						if (
							typeof x1 !== "number" ||
							typeof y1 !== "number" ||
							typeof x2 !== "number"
						)
							return null;
						const label = postureLabel(t.posture);
						const zoneName = t.zoneId ? zoneNames.get(t.zoneId) : undefined;
						const duration =
							t.durationSeconds > 0
								? `${Math.floor(t.durationSeconds / 60)}:${String(
										t.durationSeconds % 60,
									).padStart(2, "0")}`
								: "";
						return (
							<div
								key={t.trackRef}
								className="live-person-label"
								style={{
									left: `${x1 * 100}%`,
									top: `${y1 * 100}%`,
									maxWidth: `${(x2 - x1) * 100}%`,
								}}
							>
								{zoneName ? <span className="lp-zone">{zoneName}</span> : null}
								{label ? <span className="lp-posture">{label}</span> : null}
								{duration ? <span className="lp-dur">{duration}</span> : null}
							</div>
						);
					})}
				</>
			) : null}
		</>
	);
}
