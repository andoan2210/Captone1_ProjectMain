import { Injectable } from "@nestjs/common";
import { MomoStrategy } from "./strategies/momo.strategy";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PaymentFactory {
  constructor(private config: ConfigService) {}

  get(method: string) {
    switch (method) {
      case 'MOMO':
        return new MomoStrategy(this.config);
    }
  }
}