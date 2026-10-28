import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { NodeEnv } from './config/env.validation';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  // `rawBody` keeps the exact bytes of an incoming request available.
  // A payment webhook's signature covers those bytes, and a body that has been
  // parsed and re-serialised will not verify against it.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const config = app.get(ConfigService);
  const isProduction = config.get<string>('NODE_ENV') === NodeEnv.Production;

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    // In production the allow-list is mandatory; an empty list means no browser
    // origin is permitted, which is safer than reflecting whatever asks.
    origin: origins.length > 0 ? origins : isProduction ? false : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject unknown properties outright rather than silently dropping them,
      // so a client cannot smuggle a field past a DTO.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);
  app.enableShutdownHooks();

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Tugo Platform API')
      .setDescription(
        'Ride hailing, route-aware dynamic shared rides, food delivery and parcel delivery.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
    logger.log('API documentation available at /api/docs');
  }

  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port} (${config.get<string>('NODE_ENV')})`);
}

void bootstrap();
