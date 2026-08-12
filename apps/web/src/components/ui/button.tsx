"use client";

import { Slot } from "@radix-ui/react-slot";
import { type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "secondary" | "ghost" | "danger";
	size?: "sm" | "md" | "icon";
	asChild?: boolean;
}

export function Button({
	className,
	variant = "primary",
	size = "md",
	asChild,
	...props
}: ButtonProps) {
	const Component = asChild ? Slot : "button";
	return (
		<Component
			className={cn("button", `button-${variant}`, `button-${size}`, className)}
			{...props}
		/>
	);
}
