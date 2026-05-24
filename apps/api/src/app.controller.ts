import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/decorators/public.decorator";

@Controller()
export class AppController {
  @Public()
  @Get()
  home() {
    return {
      name: "Work Calendar AI API",
      ok: true,
      web: "http://localhost:3000",
      health: "/health",
      docs: "/docs"
    };
  }

  @Public()
  @Get("health")
  health() {
    return {
      ok: true
    };
  }
}

