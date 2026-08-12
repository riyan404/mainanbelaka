"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function SettingsPage() {
	const [message, setMessage] = useState("");
	return (
		<main className="page">
			<header className="page-head">
				<div>
					<h1>Pengaturan</h1>
					<p>Kelola keamanan akun admin.</p>
				</div>
			</header>
			<section className="panel" style={{ maxWidth: 480 }}>
				<form
					className="login-form"
					action={async (formData) => {
						try {
							await api("/auth/password", {
								method: "PUT",
								body: JSON.stringify({
									currentPassword: formData.get("currentPassword"),
									newPassword: formData.get("newPassword"),
								}),
							});
							setMessage("Password berhasil diubah");
						} catch (value) {
							setMessage(
								value instanceof Error
									? value.message
									: "Gagal mengubah password",
							);
						}
					}}
				>
					<div className="field">
						<label htmlFor="currentPassword">Password saat ini</label>
						<input
							className="input"
							id="currentPassword"
							name="currentPassword"
							type="password"
							required
						/>
					</div>
					<div className="field">
						<label htmlFor="newPassword">Password baru</label>
						<input
							className="input"
							id="newPassword"
							name="newPassword"
							type="password"
							minLength={8}
							required
						/>
					</div>
					{message ? <div role="status">{message}</div> : null}
					<Button type="submit">Ubah Password</Button>
				</form>
			</section>
		</main>
	);
}
