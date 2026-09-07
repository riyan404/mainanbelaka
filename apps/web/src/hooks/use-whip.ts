"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WhipStatus =
	| "idle"
	| "requesting" // minta izin kamera
	| "streaming" // stream aktif ke MediaMTX
	| "stopped"
	| "error";

export interface WhipState {
	status: WhipStatus;
	error: string | null;
	/** MediaStream lokal untuk preview <video> */
	localStream: MediaStream | null;
}

/**
 * Hook WHIP — push webcam ke MediaMTX via WebRTC.
 *
 * @param whipUrl URL endpoint WHIP MediaMTX,
 *   mis. "http://localhost:8918/webcam-kasir-1/whip"
 */
export function useWhip(whipUrl: string | null) {
	const [state, setState] = useState<WhipState>({
		status: "idle",
		error: null,
		localStream: null,
	});

	const pcRef = useRef<RTCPeerConnection | null>(null);
	const streamRef = useRef<MediaStream | null>(null);

	const stop = useCallback(() => {
		// Tutup semua track lokal
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
		// Tutup PeerConnection
		pcRef.current?.close();
		pcRef.current = null;
		setState({ status: "stopped", error: null, localStream: null });
	}, []);

	const start = useCallback(
		async (deviceId?: string) => {
			if (!whipUrl) {
				setState((s) => ({
					...s,
					status: "error",
					error: "URL WHIP belum diset",
				}));
				return;
			}

			// Hentikan stream sebelumnya jika ada
			streamRef.current?.getTracks().forEach((t) => t.stop());
			pcRef.current?.close();

			setState({ status: "requesting", error: null, localStream: null });

			// 1. Minta akses kamera
			let stream: MediaStream;
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: {
						deviceId: deviceId ? { exact: deviceId } : undefined,
						width: { ideal: 640 },
						height: { ideal: 480 },
						frameRate: { ideal: 10, max: 15 },
					},
					audio: false,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Akses kamera ditolak";
				setState({ status: "error", error: msg, localStream: null });
				return;
			}

			streamRef.current = stream;
			setState((s) => ({ ...s, status: "requesting", localStream: stream }));

			// 2. Buat RTCPeerConnection
			const pc = new RTCPeerConnection({
				iceServers: [], // LAN-only: tidak butuh STUN/TURN
			});
			pcRef.current = pc;

			// Tambahkan track video ke PeerConnection
			stream.getTracks().forEach((track) => pc.addTrack(track, stream));

			// 3. Tunggu ICE gathering selesai (untuk LAN langsung selesai cepat)
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);

			// Tunggu ICE gathering complete
			await new Promise<void>((resolve) => {
				if (pc.iceGatheringState === "complete") {
					resolve();
					return;
				}
				pc.addEventListener("icegatheringstatechange", () => {
					if (pc.iceGatheringState === "complete") resolve();
				});
				// Timeout fallback 3 detik (untuk LAN harusnya jauh lebih cepat)
				setTimeout(resolve, 3000);
			});

			// 4. WHIP POST ke MediaMTX
			let resp: Response;
			try {
				resp = await fetch(whipUrl, {
					method: "POST",
					headers: { "Content-Type": "application/sdp" },
					body: pc.localDescription!.sdp,
				});
			} catch (err) {
				stop();
				const msg =
					err instanceof Error
						? `Gagal terhubung ke MediaMTX: ${err.message}`
						: "Gagal terhubung ke MediaMTX";
				setState({ status: "error", error: msg, localStream: null });
				return;
			}

			if (!resp.ok) {
				const body = await resp.text().catch(() => "");
				stop();
				setState({
					status: "error",
					error: `MediaMTX menolak stream (HTTP ${resp.status}): ${body.slice(0, 100)}`,
					localStream: null,
				});
				return;
			}

			// 5. Set remote answer dari MediaMTX
			const answerSdp = await resp.text();
			try {
				await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
			} catch (err) {
				stop();
				setState({
					status: "error",
					error: `SDP answer tidak valid: ${err instanceof Error ? err.message : String(err)}`,
					localStream: null,
				});
				return;
			}

			setState({ status: "streaming", error: null, localStream: stream });
		},
		[whipUrl, stop],
	);

	// Cleanup saat unmount
	useEffect(() => {
		return () => {
			streamRef.current?.getTracks().forEach((t) => t.stop());
			pcRef.current?.close();
		};
	}, []);

	return { ...state, start, stop };
}

/** Daftar semua video input device yang tersedia. */
export async function listVideoDevices(): Promise<MediaDeviceInfo[]> {
	// Minta izin sementara supaya label tersedia
	let tempStream: MediaStream | null = null;
	try {
		tempStream = await navigator.mediaDevices.getUserMedia({
			video: true,
			audio: false,
		});
	} catch {
		// Izin ditolak: kembalikan daftar kosong
		return [];
	} finally {
		tempStream?.getTracks().forEach((t) => t.stop());
	}

	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices.filter((d) => d.kind === "videoinput");
}
