export async function supportsHevcWebRtc(): Promise<boolean> {
	if (typeof window === "undefined") return true;
	const hasCodec = RTCRtpReceiver.getCapabilities("video")?.codecs.some(
		(codec) => codec.mimeType.toLowerCase() === "video/h265",
	);
	if (!hasCodec) return false;
	try {
		const result = await navigator.mediaCapabilities?.decodingInfo({
			type: "webrtc",
			video: {
				contentType: "video/H265",
				width: 640,
				height: 360,
				bitrate: 768_000,
				framerate: 20,
			},
		});
		return result?.supported ?? hasCodec;
	} catch {
		return hasCodec;
	}
}
