import { Content } from '@google/generative-ai';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsOptional()
  @IsArray()
  conversationHistory?: Content[];
}
