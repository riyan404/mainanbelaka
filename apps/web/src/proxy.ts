import { type NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL;

if (!API_URL) {
	throw new Error("API_INTERNAL_URL wajib diatur");
}

async function hasValidSession(request: NextRequest): Promise<boolean> {
	const cookie = request.headers.get("cookie");
	if (!cookie) return false;
	try {
		const response = await fetch(`${API_URL}/auth/session`, {
			headers: { cookie },
			cache: "no-store",
			signal: AbortSignal.timeout(2000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

export async function proxy(request: NextRequest) {
	const isLogin = request.nextUrl.pathname === "/login";
	const validSession = await hasValidSession(request);

	if (!validSession && !isLogin) {
		const response = NextResponse.redirect(new URL("/login", request.url));
		response.cookies.delete("cctv_session");
		return response;
	}
	if (validSession && isLogin) {
		return NextResponse.redirect(new URL("/", request.url));
	}
	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
