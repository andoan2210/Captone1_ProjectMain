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
        // Here you would typically use the profile data to query your database
        // and find or create a user. For now, we return the profile object.
        console.log(profile);
        const user = await this.authService.validateGoogleUser({
            name : profile.displayName,
            email : profile.emails[0].value,
            avatarUrl : profile.photos[0].value,
            providerId : profile.id,
            role : "Client",
            isActive : true,
        });  
        done(null,user);
    
    }
}