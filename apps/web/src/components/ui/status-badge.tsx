import {
	AlertCircle,
	CheckCircle2,
	CircleDashed,
	MinusCircle,
} from "lucide-react";

const config = {
	ONLINE: { label: "Online", icon: CheckCircle2, tone: "success" },
	OFFLINE: { label: "Offline", icon: AlertCircle, tone: "error" },
	ERROR: { label: "Error", icon: AlertCircle, tone: "error" },
	UNTESTED: { label: "Belum dites", icon: CircleDashed, tone: "warning" },
	DISABLED: { label: "Nonaktif", icon: MinusCircle, tone: "neutral" },
	IDLE: { label: "Idle", icon: MinusCircle, tone: "neutral" },
	RUNNING: { label: "Running", icon: CheckCircle2, tone: "success" },
} as const;

export function StatusBadge({ status }: { status: keyof typeof config }) {
	const item = config[status];
	const Icon = item.icon;
	return (
		<span className={`status status-${item.tone}`}>
			<Icon aria-hidden size={12} />
			{item.label}
		</span>
	);
}
