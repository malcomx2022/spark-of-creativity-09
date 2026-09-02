import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RoleResolverService } from './role-resolver.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokensService, RoleResolverService, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard, RoleResolverService],
})
export class AuthModule {}
