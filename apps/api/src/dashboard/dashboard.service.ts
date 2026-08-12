import { Injectable } from "@nestjs/common";
import { DASHBOARD_LAYOUTS, type DashboardLayout } from "../common/domain";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class DashboardService {
	constructor(private readonly prisma: PrismaService) {}

	async get(groupId?: string, page = 1, layout: DashboardLayout = 4) {
		const take = DASHBOARD_LAYOUTS.includes(layout) ? layout : 4;
		const selectedGroup = groupId
			? await this.prisma.group.findUnique({ where: { id: groupId } })
			: await this.prisma.group.findFirst({ where: { isDefault: true } });
		const where = {
			enabled: true,
			availability: "AVAILABLE" as const,
			device: { archivedAt: null },
			...(selectedGroup
				? { groups: { some: { groupId: selectedGroup.id } } }
				: {}),
		};
		const [cameras, total] = await Promise.all([
			this.prisma.cameraChannel.findMany({
				where,
				include: { device: { select: { name: true } } },
				orderBy: { name: "asc" },
				skip: (Math.max(page, 1) - 1) * take,
				take,
			}),
			this.prisma.cameraChannel.count({ where }),
		]);
		return {
			group: selectedGroup,
			cameras,
			pagination: {
				page: Math.max(page, 1),
				pageSize: take,
				total,
				pages: Math.ceil(total / take),
			},
		};
	}
}
