import{PassportStrategy} from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import googleOauthConfig from "src/config/google-oauth.config";
import { AuthService } from "../auth.service";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy){
    constructor(
        @Inject(googleOauthConfig.KEY)
        private googleConfiguration:ConfigType<typeof googleOauthConfig>,
        private authService: AuthService,
    ){
        super({
            clientID : googleConfiguration.clientId!,
            clientSecret :googleConfiguration.clientSecret!,
            callbackURL : googleConfiguration.callbackUrl!,
            scope : ['email','profile'],
        })
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: VerifyCallback
    ): Promise<any> {
        try {
            console.log("Google profile:", profile);
            const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
            
            if (!email) {
                return done(new Error("No email found in Google profile"), false);
            }

            const user = await this.authService.validateGoogleUser({
                name : profile.displayName || profile.username || 'Google User',
                email : email,
                avatarUrl : avatarUrl,
                providerId : profile.id,
                role : "Client",
                isActive : true,
            });  
            done(null, user);
        } catch (error) {
            console.error("Error in GoogleStrategy validate:", error);
            done(error, false);
        }
    }
}