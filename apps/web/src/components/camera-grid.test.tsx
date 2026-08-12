import { render, screen } from "@testing-library/react";
import { CameraGrid } from "./camera-grid";

it("shows actionable empty state", () => {
	render(<CameraGrid cameras={[]} layout={4} />);
	expect(screen.getByText("Belum ada kamera aktif")).toBeInTheDocument();
});
