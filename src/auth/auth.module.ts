import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './passport/local.strategy';
import { JwtStrategy } from './passport/jwt.strategy';
  

@Module({
  controllers: [AuthController],
  providers: [AuthService,LocalStrategy,JwtStrategy],
  imports: [UsersModule,

    // Source - https://stackoverflow.com/a/54310397
// Posted by Kim Kern, modified by community. See post 'Timeline' for change history
// Retrieved 2026-03-04, License - CC BY-SA 4.0
    JwtModule.registerAsync({
      useFactory: async (configService: ConfigService) => ({
        global : true,
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
            expiresIn: configService.get<number>('JWT_ACCESS_TOKEN_EXPIRED'),
        },
  }),
  inject: [ConfigService],
}),
            PassportModule,

  ],
})
export class AuthModule {}
