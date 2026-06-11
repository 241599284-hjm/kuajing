import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

@Controller()
class SupportController {
  @Get("/health")
  health() {
    return {
      service: "support-service",
      status: "ok",
      channels: ["ticket", "email", "live-chat-reserved"],
      responsiveClients: ["mobile", "tablet", "desktop"]
    };
  }
}

@Module({ controllers: [SupportController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4107), "0.0.0.0");
}

void bootstrap();

