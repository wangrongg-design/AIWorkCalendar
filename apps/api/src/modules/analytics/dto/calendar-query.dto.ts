import { IsIn, IsOptional, IsString, Matches } from "class-validator";
import { Scope } from "../../../common/access/access.service";

export class CalendarQueryDto {
  @Matches(/^\d{4}-\d{2}$/)
  month: string;

  @IsOptional()
  @IsIn(["self", "department", "company"])
  scope?: Scope;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class CalendarDayQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @IsOptional()
  @IsIn(["self", "department", "company"])
  scope?: Scope;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

