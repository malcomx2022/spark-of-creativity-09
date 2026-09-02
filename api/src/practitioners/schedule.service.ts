import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { AvailabilityDto, AvailabilityUpdateDto, ExceptionDto, RateDto, RateUpdateDto } from './practitioners.dto';

/** Disponibilités hebdomadaires, exceptions par date et tarifs (ex useAvailability / usePractitionerRates). */
@Injectable()
export class ScheduleService {
  constructor(private readonly database: DatabaseService) {}

  // --- Disponibilités ---
  listAvailability(practitionerId: string) {
    return this.database.db.selectFrom('practitioner_availability').selectAll().where('practitioner_id', '=', practitionerId).orderBy('day_of_week').orderBy('start_time').execute();
  }

  async addAvailability(userId: string, practitionerId: string, dto: AvailabilityDto) {
    // Chevauchement interdit sur le même jour (règle de useAvailability).
    const overlap = await this.database.db
      .selectFrom('practitioner_availability')
      .select('id')
      .where('practitioner_id', '=', practitionerId)
      .where('day_of_week', '=', dto.dayOfWeek)
      .where('start_time', '<', dto.endTime)
      .where('end_time', '>', dto.startTime)
      .executeTakeFirst();
    if (overlap) throw new ConflictException('Ce créneau chevauche une disponibilité existante');
    return this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx
        .insertInto('practitioner_availability')
        .values({ practitioner_id: practitionerId, day_of_week: dto.dayOfWeek, start_time: dto.startTime, end_time: dto.endTime, is_active: dto.isActive ?? true })
        .returningAll()
        .executeTakeFirstOrThrow(),
    );
  }

  async updateAvailability(userId: string, practitionerId: string, id: string, dto: AvailabilityUpdateDto) {
    const row = await this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx
        .updateTable('practitioner_availability')
        .set({ ...(dto.startTime ? { start_time: dto.startTime } : {}), ...(dto.endTime ? { end_time: dto.endTime } : {}), ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}) })
        .where('id', '=', id)
        .where('practitioner_id', '=', practitionerId)
        .returningAll()
        .executeTakeFirst(),
    );
    if (!row) throw new NotFoundException('Disponibilité introuvable');
    return row;
  }

  async deleteAvailability(userId: string, practitionerId: string, id: string) {
    const res = await this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx.deleteFrom('practitioner_availability').where('id', '=', id).where('practitioner_id', '=', practitionerId).executeTakeFirst(),
    );
    if (Number(res.numDeletedRows) === 0) throw new NotFoundException('Disponibilité introuvable');
    return { deleted: true };
  }

  // --- Exceptions ---
  listExceptions(practitionerId: string, from?: string) {
    let q = this.database.db.selectFrom('practitioner_exceptions').selectAll().where('practitioner_id', '=', practitionerId);
    if (from) q = q.where('date', '>=', from);
    return q.orderBy('date').execute();
  }

  addException(userId: string, practitionerId: string, dto: ExceptionDto) {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx.insertInto('practitioner_exceptions').values({ practitioner_id: practitionerId, date: dto.date, reason: dto.reason ?? null, is_available: dto.isAvailable }).returningAll().executeTakeFirstOrThrow(),
    );
  }

  async deleteException(userId: string, practitionerId: string, id: string) {
    const res = await this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx.deleteFrom('practitioner_exceptions').where('id', '=', id).where('practitioner_id', '=', practitionerId).executeTakeFirst(),
    );
    if (Number(res.numDeletedRows) === 0) throw new NotFoundException('Exception introuvable');
    return { deleted: true };
  }

  // --- Tarifs ---
  listRates(practitionerId: string) {
    return this.database.db.selectFrom('practitioner_rates').selectAll().where('practitioner_id', '=', practitionerId).orderBy('service_type').execute();
  }

  addRate(userId: string, practitionerId: string, dto: RateDto) {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx.insertInto('practitioner_rates').values({ practitioner_id: practitionerId, service_type: dto.serviceType, base_price: dto.basePrice, duration_minutes: dto.durationMinutes }).returningAll().executeTakeFirstOrThrow(),
    );
  }

  async updateRate(userId: string, practitionerId: string, id: string, dto: RateUpdateDto) {
    const row = await this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx
        .updateTable('practitioner_rates')
        .set({ ...(dto.serviceType ? { service_type: dto.serviceType } : {}), ...(dto.basePrice !== undefined ? { base_price: dto.basePrice } : {}), ...(dto.durationMinutes !== undefined ? { duration_minutes: dto.durationMinutes } : {}), updated_at: new Date() })
        .where('id', '=', id)
        .where('practitioner_id', '=', practitionerId)
        .returningAll()
        .executeTakeFirst(),
    );
    if (!row) throw new NotFoundException('Tarif introuvable');
    return row;
  }

  async deleteRate(userId: string, practitionerId: string, id: string) {
    const res = await this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx.deleteFrom('practitioner_rates').where('id', '=', id).where('practitioner_id', '=', practitionerId).executeTakeFirst(),
    );
    if (Number(res.numDeletedRows) === 0) throw new NotFoundException('Tarif introuvable');
    return { deleted: true };
  }
}
