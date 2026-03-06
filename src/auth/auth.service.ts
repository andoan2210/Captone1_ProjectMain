import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { comparePasswordHelpers } from '../helpers/util';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CreateUserGoogleDto } from './dto/create-user-google.dto';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(username);

    if (!user) {
      throw new UnauthorizedException('Invalid username');
    }

    // check neu la google user
    if (!user.PasswordHash) {
      throw new UnauthorizedException('Password not set');
    }

    const isValidPassword = await comparePasswordHelpers(
      pass,
      user.PasswordHash,
    );
    
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid password');
    }

    if (!user.IsActive) {
      throw new UnauthorizedException('User is not active');
    }
    return user;
  }

  private async generateAccessToken(payload: TokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRED')as any,
    });
  }

  private async generateRefreshToken(payload: TokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')as any,
    });
  }

  async login(user: any): Promise<Tokens> {
    const payload: TokenPayload = {
      sub: user.UserId,
      email: user.Email,
      role: user.Role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(payload),
      this.generateRefreshToken(payload),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string }> {
  try {
    const payload = await this.jwtService.verifyAsync<TokenPayload>(
      refreshToken,
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      },
    );

    const user = await this.usersService.findOne(+payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const newPayload: TokenPayload = {
      sub: String(user.UserId),
      email: user.Email,
      role: user.Role,
    };

    const accessToken = await this.generateAccessToken(newPayload);

    return {
      accessToken,
    };
  } catch (error) {
    throw new UnauthorizedException('Invalid refresh token');
  }
}

  async validateGoogleUser(googleUser : CreateUserGoogleDto){
    const user = await this.usersService.findByEmailGoogle(googleUser.email);
    if(user){
       return user;
    }
    return this.usersService.createUserGoogle(googleUser);
  }
}