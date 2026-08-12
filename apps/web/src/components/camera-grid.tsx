import type { Camera } from "@/lib/api";
import { CameraTile } from "./camera-tile";

export function CameraGrid({
	cameras,
	layout,
}: {
	cameras: Camera[];
	layout: 1 | 4 | 9 | 16;
}) {
	if (!cameras.length)
		return (
			<div className="empty-state">
				<strong>Belum ada kamera aktif</strong>
				<span>Aktifkan kamera H.265/HEVC dan masukkan ke grup default.</span>
			</div>
		);
	return (
		<section
			className="camera-grid"
			data-layout={layout}
			aria-label="Live CCTV"
		>
			{cameras.slice(0, layout).map((camera) => (
				<CameraTile camera={camera} key={camera.id} />
			))}
		</section>
	);
}
