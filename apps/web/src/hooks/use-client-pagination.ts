import { useMemo, useState } from "react";

/**
 * Pagination client-side: potong array yang sudah di-fetch sesuai halaman.
 * Cocok untuk data yang tidak terlalu besar (<500 item).
 */
export function useClientPagination<T>(items: T[], pageSize = 25) {
	const [page, setPage] = useState(1);

	const pages = Math.max(1, Math.ceil(items.length / pageSize));
	// Clamp page jika items berubah (mis. setelah filter)
	const safePage = Math.min(page, pages);

	const slice = useMemo(
		() => items.slice((safePage - 1) * pageSize, safePage * pageSize),
		[items, safePage, pageSize],
	);

	function changePage(p: number) {
		setPage(Math.max(1, Math.min(p, pages)));
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	// Reset ke page 1 saat items berubah ukurannya
	// (dipanggil dari useEffect di komponen)
	function reset() {
		setPage(1);
	}

	return {
		page: safePage,
		pages,
		total: items.length,
		pageSize,
		slice,
		changePage,
		reset,
	};
}
