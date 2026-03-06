
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(username: string, password: string): Promise<any> {
    if(password ==="") throw new UnauthorizedException("Password is required");
    if(username ==="") throw new UnauthorizedException("Username is required");
    const user = await this.authService.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException("Username or password is incorrect");
    }
    return user;
  }
}
