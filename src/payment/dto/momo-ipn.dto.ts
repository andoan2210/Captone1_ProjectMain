import { IsString, IsNumber, IsOptional } from 'class-validator';

export class MomoIpnDto {
  @IsString() partnerCode: string;
  @IsString() orderId: string;
  @IsString() requestId: string;
  @IsNumber() amount: number;
  @IsString() orderInfo: string;
  @IsString() orderType: string;
  @IsNumber() transId: number;
  @IsNumber() resultCode: number;
  @IsString() message: string;
  @IsString() payType: string;
  @IsNumber() responseTime: number;
  @IsString() extraData: string;
  @IsString() signature: string;
}