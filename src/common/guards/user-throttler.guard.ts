import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  // Track theo userId (từ JWT) thay vì IP
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.userId ? `user_${req.user.userId}` : req.ip;
  }
}
