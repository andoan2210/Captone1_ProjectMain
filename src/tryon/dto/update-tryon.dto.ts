import { PartialType } from '@nestjs/mapped-types';
import { CreateTryonDto } from './create-tryon.dto';

export class UpdateTryonDto extends PartialType(CreateTryonDto) {}
