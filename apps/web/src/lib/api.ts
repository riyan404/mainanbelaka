const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		...init,
		credentials: "include",
		headers: { "content-type": "application/json", ...init?.headers },
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as {
			message?: string | string[];
		};
		const message = Array.isArray(body.message)
			? body.message.join(", ")
			: body.message;
		throw new Error(message ?? `Permintaan gagal (${response.status})`);
	}
	return response.json() as Promise<T>;
}

export interface Camera {
	id: string;
	name: string;
	location?: string;
	connectionStatus: "UNTESTED" | "ONLINE" | "OFFLINE" | "ERROR";
	device: { name: string };
}

export interface DashboardData {
	group?: { id: string; name: string };
	cameras: Camera[];
	pagination: { page: number; pageSize: number; total: number; pages: number };
}
