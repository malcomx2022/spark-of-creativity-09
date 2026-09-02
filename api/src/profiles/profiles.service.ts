import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizePhoneNumber } from '../auth/phone.util';
import { DatabaseService } from '../database/database.service';
import type { Profile, ProfileUpdate } from '../database/types';
import type { UpdateProfileDto } from './profiles.dto';

/** Table profiles : lecture/écriture de son propre profil (ex policies "Users can view/update own profile"). */
@Injectable()
export class ProfilesService {
  constructor(private readonly database: DatabaseService) {}

  async getOwn(userId: string): Promise<Profile> {
    const profile = await this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx.selectFrom('profiles').selectAll().where('id', '=', userId).executeTakeFirst(),
    );
    if (!profile) throw new NotFoundException('Profil introuvable');
    return profile;
  }

  async updateOwn(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    const patch: ProfileUpdate = {
      ...(dto.fullName !== undefined ? { full_name: dto.fullName } : {}),
      ...(dto.phone !== undefined ? { phone: normalizePhoneNumber(dto.phone) } : {}),
      ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      ...(dto.dateOfBirth !== undefined ? { date_of_birth: dto.dateOfBirth } : {}),
      ...(dto.avatarUrl !== undefined ? { avatar_url: dto.avatarUrl } : {}),
      updated_at: new Date(),
    };
    try {
      const profile = await this.database.runAs({ role: 'authenticated', userId }, (trx) =>
        trx.updateTable('profiles').set(patch).where('id', '=', userId).returningAll().executeTakeFirst(),
      );
      if (!profile) throw new NotFoundException('Profil introuvable');
      return profile;
    } catch (err) {
      // Trigger check_phone_uniqueness() : RAISE EXCEPTION 'Phone number … already exists'
      if (err instanceof Error && /already exists/i.test(err.message)) throw new ConflictException('Ce numéro de téléphone est déjà utilisé');
      throw err;
    }
  }
}
