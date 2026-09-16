import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: configService.get<string>('WEB_ORIGIN') ?? 'http://localhost:3742',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Railway and most PaaS platforms inject PORT. API_PORT is used for local dev.
  const port = process.env.PORT ?? configService.get<number>('API_PORT') ?? 4732;
  await app.listen(port);

  new Logger('Bootstrap').log(`ProjectFlow API listening on http://localhost:${port}`);
}

void bootstrap();
