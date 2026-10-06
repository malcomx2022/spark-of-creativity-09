import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { HttpException, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { APP_CONFIG, AppConfig } from './config/config.module';

/** Construit l'application (utilisé par main.ts et par les tests e2e). */
export async function createApp(): Promise<NestFastifyApplication> {
  // Jusqu'à trois documents KYC de 5 Mo encodés en base64 (~20 Mo).
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true, bodyLimit: 22 * 1024 * 1024 }), {
    rawBody: true, // corps brut conservé (req.rawBody) pour la vérification HMAC du webhook FedaPay
    logger: process.env.NODE_ENV === 'test' ? ['error', 'warn'] : ['log', 'error', 'warn'],
  });
  const config = app.get<AppConfig>(APP_CONFIG);

  // Le type du plugin est lié à la version de fastify embarquée par @fastify/cookie ; le cast
  // évite un conflit de déclarations entre les deux copies de fastify (comportement identique).
  await app.register(fastifyCookie as unknown as Parameters<typeof app.register>[0]);
  await app.register(fastifyRateLimit as unknown as Parameters<typeof app.register>[0], {
    max: 60,
    timeWindow: 15 * 60 * 1000,
    errorResponseBuilder: () => new HttpException('Trop de tentatives. Réessayez plus tard.', 429),
    // Per-process/IP protection for public auth endpoints, in addition to DB account locks.
    allowList: (request: { method: string; url: string; routeOptions: { url?: string } }) => request.method !== 'POST'
      || !new Set(['login', 'register', 'otp/send', 'otp/verify', 'password/forgot', 'password/reset', 'verify-email/resend'])
        .has((request.routeOptions.url ?? request.url.split('?')[0]).replace(`/${config.API_PREFIX}/auth/`, '')),
  });
  app.setGlobalPrefix(config.API_PREFIX);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();

  // La documentation OpenAPI décrit toute la surface de l'API, routes et schémas des corps
  // de requête compris. Publiée en production, elle en donne la carte complète à n'importe
  // quel visiteur : les routes restent protégées, mais l'inventaire n'a pas à être offert.
  // Elle reste ouverte hors production, et API_DOCS_ENABLED tranche explicitement si besoin.
  if (config.API_DOCS_ENABLED ?? config.NODE_ENV !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('Domicares API')
      .setDescription("Back-end natif Domicares — remplace Supabase Auth, PostgREST et les Edge Functions")
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(`${config.API_PREFIX}/docs`, app, SwaggerModule.createDocument(app, doc));
    Logger.log(`Documentation OpenAPI : /${config.API_PREFIX}/docs`, 'Bootstrap');
  } else {
    Logger.log('Documentation OpenAPI non publiée (API_DOCS_ENABLED=true pour l\'ouvrir)', 'Bootstrap');
  }
  return app;
}
