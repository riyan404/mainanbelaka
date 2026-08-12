import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
	title: "CCTV Monitor",
	description: "Pemantauan CCTV Hikvision lokal",
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="id" className={inter.className}>
			<body>{children}</body>
		</html>
	);
}
