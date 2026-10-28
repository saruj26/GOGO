import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { SavePlaceDto } from './dto/places.dto';

/**
 * A customer's saved addresses — home, work, anywhere they book from often.
 *
 * Every query is scoped to the signed-in user, so a place id belonging to
 * somebody else simply does not resolve.
 */
@Injectable()
export class SavedPlacesService {
  private static readonly MAX_PER_USER = 25;

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const places = await this.prisma.savedPlace.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        label: true,
        addressLine: true,
        latitude: true,
        longitude: true,
        createdAt: true,
      },
    });

    return places.map((place) => ({
      id: place.id,
      label: place.label,
      address: place.addressLine,
      lat: Number(place.latitude),
      lng: Number(place.longitude),
      createdAt: place.createdAt,
    }));
  }

  async create(userId: string, dto: SavePlaceDto) {
    const count = await this.prisma.savedPlace.count({ where: { userId, deletedAt: null } });

    if (count >= SavedPlacesService.MAX_PER_USER) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `You can save up to ${SavedPlacesService.MAX_PER_USER} places. Remove one first.`,
      );
    }

    try {
      const place = await this.prisma.savedPlace.create({
        data: {
          userId,
          label: dto.label,
          addressLine: dto.address,
          latitude: dto.lat,
          longitude: dto.lng,
        },
        select: { id: true, label: true, addressLine: true, latitude: true, longitude: true },
      });

      return {
        id: place.id,
        label: place.label,
        address: place.addressLine,
        lat: Number(place.latitude),
        lng: Number(place.longitude),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw DomainError.conflict(
          DomainErrorCode.CONFLICT,
          `You already have a place called “${dto.label}”.`,
        );
      }
      throw error;
    }
  }

  /** Soft delete, so a historical booking that referenced it stays readable. */
  async remove(userId: string, placeId: string) {
    const result = await this.prisma.savedPlace.updateMany({
      where: { id: placeId, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) throw DomainError.notFound('Saved place');
    return { id: placeId, removed: true };
  }
}
