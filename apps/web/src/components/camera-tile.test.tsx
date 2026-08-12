import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { CameraTile } from "./camera-tile";

vi.mock("@/lib/hevc", () => ({
	supportsHevcWebRtc: vi.fn().mockResolvedValue(true),
}));

const apiMock = vi.fn().mockImplementation((path: string) =>
	Promise.resolve({
		url: path.includes("camera-1") ? "http://stream/one" : "http://stream/two",
	}),
);
vi.mock("@/lib/api", () => ({ api: (path: string) => apiMock(path) }));

it("keeps unrelated camera stream mounted when another tile exits fullscreen", async () => {
	const { container } = render(
		<>
			<CameraTile
				camera={{
					id: "camera-1",
					name: "Camera 1",
					connectionStatus: "ONLINE",
					device: { name: "NVR" },
				}}
			/>
			<CameraTile
				camera={{
					id: "camera-2",
					name: "Camera 2",
					connectionStatus: "ONLINE",
					device: { name: "NVR" },
				}}
			/>
		</>,
	);
	await waitFor(() =>
		expect(container.querySelectorAll("iframe")).toHaveLength(2),
	);
	const firstTile = container.querySelector("#camera-camera-1");
	Object.defineProperty(document, "fullscreenElement", {
		configurable: true,
		value: firstTile,
	});
	act(() => fireEvent(document, new Event("fullscreenchange")));
	Object.defineProperty(document, "fullscreenElement", {
		configurable: true,
		value: null,
	});
	act(() => fireEvent(document, new Event("fullscreenchange")));

	expect(
		container.querySelector('iframe[title="Live Camera 2"]'),
	).toBeInTheDocument();
});
