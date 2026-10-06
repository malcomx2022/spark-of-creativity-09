import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RoleResolverService } from './role-resolver.service';
import { TokensService } from './tokens.service';
import { AccountStatusService } from './account-status.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokensService, RoleResolverService, AccountStatusService, JwtAuthGuard, OptionalJwtAuthGuard, AdminRolesGuard],
  exports: [JwtModule, JwtAuthGuard, OptionalJwtAuthGuard, AdminRolesGuard, RoleResolverService, AccountStatusService],
})
export class AuthModule {}
