import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";
import { Scope } from "../../../common/access/access.service";

export class CalendarChatDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @IsIn(["self", "department", "company"])
  scope?: Scope;

  @IsOptional()
  @IsString()
  departmentId?: string;
}
