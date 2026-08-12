import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { CreateGroupDto } from "./groups.dto";

@Injectable()
export class GroupsService {
	constructor(private readonly prisma: PrismaService) {}

	list() {
		return this.prisma.group.findMany({
			include: { _count: { select: { cameras: true } } },
			orderBy: { name: "asc" },
		});
	}

	create(dto: CreateGroupDto) {
		return this.prisma.group.create({ data: dto });
	}

	async update(id: string, dto: CreateGroupDto) {
		await this.requireGroup(id);
		return this.prisma.group.update({ where: { id }, data: dto });
	}

	async remove(id: string) {
		await this.requireGroup(id);
		return this.prisma.group.delete({ where: { id } });
	}

	async setCameras(id: string, cameraIds: string[]) {
		await this.requireGroup(id);
		return this.prisma.$transaction(async (tx) => {
			await tx.cameraGroup.deleteMany({ where: { groupId: id } });
			if (cameraIds.length)
				await tx.cameraGroup.createMany({
					data: cameraIds.map((cameraChannelId) => ({
						cameraChannelId,
						groupId: id,
					})),
					skipDuplicates: true,
				});
			return tx.group.findUnique({
				where: { id },
				include: { cameras: { include: { camera: true } } },
			});
		});
	}

	async setDefault(id: string) {
		await this.requireGroup(id);
		return this.prisma.$transaction(async (tx) => {
			await tx.group.updateMany({ data: { isDefault: false } });
			return tx.group.update({ where: { id }, data: { isDefault: true } });
		});
	}

	private async requireGroup(id: string) {
		const group = await this.prisma.group.findUnique({ where: { id } });
		if (!group) throw new NotFoundException("Grup tidak ditemukan");
		return group;
	}
}
