import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

@Controller()
class StoreController {
  @Get("/health")
  health() {
    return { service: "store-service", status: "ok" };
  }

  @Get("/default-store")
  defaultStore() {
    return {
      storeId: process.env.DEFAULT_STORE_ID ?? "00000000-0000-4000-8000-000000000001",
      slug: process.env.DEFAULT_STORE_SLUG ?? "demo-teaware",
      region: process.env.DEFAULT_STORE_REGION ?? "local",
      timezone: process.env.DEFAULT_STORE_TIMEZONE ?? "Asia/Hong_Kong"
    };
  }
}

@Module({ controllers: [StoreController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4101), "0.0.0.0");
}

void bootstrap();

