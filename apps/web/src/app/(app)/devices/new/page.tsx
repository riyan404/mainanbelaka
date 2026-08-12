import { DeviceWizard } from "@/components/device-wizard/device-wizard";

export default function NewDevicePage() {
	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>Tambah Perangkat</h1>
					<p>Hubungkan Hikvision melalui ISAPI dan RTSP.</p>
				</div>
			</header>
			<DeviceWizard />
		</main>
	);
}
