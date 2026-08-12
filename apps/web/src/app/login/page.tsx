"use client";

import { Camera, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function LoginPage() {
	const router = useRouter();
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function submit(formData: FormData) {
		setLoading(true);
		setError("");
		try {
			await api("/auth/login", {
				method: "POST",
				body: JSON.stringify({
					username: formData.get("username"),
					password: formData.get("password"),
				}),
			});
			router.replace("/");
			router.refresh();
		} catch (value) {
			setError(value instanceof Error ? value.message : "Login gagal");
		} finally {
			setLoading(false);
		}
	}

	return (
		<main className="login-page">
			<section className="login-card" aria-labelledby="login-title">
				<div className="login-mark">
					<Camera aria-hidden size={19} />
				</div>
				<h1 id="login-title">CCTV Monitor</h1>
				<p>Masuk untuk memantau kamera lokal.</p>
				<form className="login-form" action={submit}>
					<div className="field">
						<label htmlFor="username">Username</label>
						<input
							className="input"
							id="username"
							name="username"
							autoComplete="username"
							required
						/>
					</div>
					<div className="field">
						<label htmlFor="password">Password</label>
						<input
							className="input"
							id="password"
							name="password"
							type="password"
							autoComplete="current-password"
							minLength={8}
							required
						/>
					</div>
					{error ? (
						<div className="login-error" role="alert">
							{error}
						</div>
					) : null}
					<Button disabled={loading} type="submit">
						{loading ? (
							<>
								<LoaderCircle aria-hidden size={15} />
								Memproses
							</>
						) : (
							"Masuk"
						)}
					</Button>
				</form>
				<div className="login-version">CCTV Monitor v0.1.0</div>
			</section>
		</main>
	);
}
