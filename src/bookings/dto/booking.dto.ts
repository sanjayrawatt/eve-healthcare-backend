import { IsEnum, IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { BookingStatus } from '../booking-status';

export class CreateBookingDto {
  @IsUUID()
  centreId: string;

  @IsUUID()
  testId: string;

  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message: 'appointmentAt must include a timezone, e.g. 2026-10-05T10:30:00+05:30',
  })
  appointmentAt: string;
}

export class ListBookingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
