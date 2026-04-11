import { ConfigService } from '@nestjs/config';
import Fashn from 'fashn';
import { FASHN_CLIENT } from './fashn.constant';

export const FashnProvider = {
  provide: FASHN_CLIENT,
  useFactory: (configService: ConfigService) => {
    const apiKey = configService.get<string>('FASHN_API_KEY');

    if (!apiKey) {
      throw new Error('FASHN_API_KEY is not defined');
    }

    return new Fashn({
      apiKey,
    });
  },
  inject: [ConfigService],
};