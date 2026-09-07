import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AddressesController, CareNotesController, ConsultationReportsController, MedicalController, TriageController } from './medical.controller';
import { MedicalService } from './medical.service';

@Module({ imports: [AuthModule], controllers: [MedicalController, AddressesController, CareNotesController, ConsultationReportsController, TriageController], providers: [MedicalService], exports: [MedicalService] })
export class MedicalModule {}
