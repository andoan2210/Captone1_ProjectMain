import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule , ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import redisConfig, { mailConfig } from './config/env.config';
import { RedisModule } from './shared/redis.module';
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ConfigModule.forRoot({ isGlobal: true, load: [redisConfig,mailConfig] }),
    UsersModule, 
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            transport: isProduction
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
            level: isProduction ? 'info' : 'debug',
          },
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    MailModule,   
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
