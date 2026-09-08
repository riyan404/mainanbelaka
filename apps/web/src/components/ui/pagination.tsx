"use client";

import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";

interface PaginationProps {
	/** Halaman saat ini (1-based) */
	page: number;
	/** Total halaman */
	pages: number;
	/** Total item (opsional, untuk label "X-Y dari Z") */
	total?: number;
	/** Jumlah item per halaman (opsional) */
	pageSize?: number;
	onChange: (page: number) => void;
	/** Tampilkan tombol first/last? Default true jika pages > 5 */
	showEdges?: boolean;
}

/**
 * Komponen pagination reusable.
 * Tampilkan max 5 nomor halaman di tengah, dengan ellipsis jika perlu.
 */
export function Pagination({
	page,
	pages,
	total,
	pageSize,
	onChange,
	showEdges,
}: PaginationProps) {
	if (pages <= 1 && !total) return null;

	const showEdgeButtons = showEdges ?? pages > 5;

	// Bangun daftar nomor halaman yang ditampilkan
	function pageNumbers(): (number | "…")[] {
		if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

		const delta = 2; // halaman di kiri/kanan current
		const left = Math.max(2, page - delta);
		const right = Math.min(pages - 1, page + delta);

		const nums: (number | "…")[] = [1];
		if (left > 2) nums.push("…");
		for (let i = left; i <= right; i++) nums.push(i);
		if (right < pages - 1) nums.push("…");
		nums.push(pages);
		return nums;
	}

	// Label info "X–Y dari Z"
	function rangeLabel() {
		if (!total || !pageSize) return null;
		const from = (page - 1) * pageSize + 1;
		const to = Math.min(page * pageSize, total);
		return (
			<span className="pager-info">
				{from}–{to} dari {total}
			</span>
		);
	}

	return (
		<div className="pager" role="navigation" aria-label="Navigasi halaman">
			{rangeLabel()}

			<div className="pager-btns">
				{/* First */}
				{showEdgeButtons && (
					<button
						type="button"
						className="pager-btn"
						disabled={page <= 1}
						onClick={() => onChange(1)}
						aria-label="Halaman pertama"
					>
						<ChevronsLeft size={14} />
					</button>
				)}

				{/* Prev */}
				<button
					type="button"
					className="pager-btn"
					disabled={page <= 1}
					onClick={() => onChange(page - 1)}
					aria-label="Halaman sebelumnya"
				>
					<ChevronLeft size={14} />
				</button>

				{/* Nomor halaman */}
				{pageNumbers().map((n, i) =>
					n === "…" ? (
						<span
							 
							key={`ellipsis-${i}`}
							className="pager-ellipsis"
						>
							…
						</span>
					) : (
						<button
							key={n}
							type="button"
							className={`pager-btn${n === page ? " pager-btn-active" : ""}`}
							onClick={() => onChange(n)}
							aria-label={`Halaman ${n}`}
							aria-current={n === page ? "page" : undefined}
						>
							{n}
						</button>
					),
				)}

				{/* Next */}
				<button
					type="button"
					className="pager-btn"
					disabled={page >= pages}
					onClick={() => onChange(page + 1)}
					aria-label="Halaman berikutnya"
				>
					<ChevronRight size={14} />
				</button>

				{/* Last */}
				{showEdgeButtons && (
					<button
						type="button"
						className="pager-btn"
						disabled={page >= pages}
						onClick={() => onChange(pages)}
						aria-label="Halaman terakhir"
					>
						<ChevronsRight size={14} />
					</button>
				)}
			</div>
		</div>
	);
}
