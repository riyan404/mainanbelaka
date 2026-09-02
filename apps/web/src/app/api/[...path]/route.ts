import { type NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL;

if (!API_URL) {
	throw new Error("API_INTERNAL_URL wajib diatur");
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: RouteContext) {
	try {
		const { path } = await context.params;
		const url = new URL(`${API_URL}/${path.join("/")}`);
		url.search = request.nextUrl.search;
		const headers = new Headers(request.headers);
		const originalHost = headers.get("host");
		headers.delete("host");
		if (originalHost) headers.set("x-forwarded-host", originalHost);
		const hasBody = !["GET", "HEAD"].includes(request.method);
		const response = await fetch(url, {
			method: request.method,
			headers,
			body: hasBody ? await request.arrayBuffer() : undefined,
			redirect: "manual",
		});
		const responseHeaders = new Headers(response.headers);
		responseHeaders.delete("content-encoding");
		responseHeaders.delete("content-length");
		return new NextResponse(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders,
		});
	} catch {
		return NextResponse.json(
			{ message: "API tidak dapat dihubungi" },
			{ status: 502 },
		);
	}
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
