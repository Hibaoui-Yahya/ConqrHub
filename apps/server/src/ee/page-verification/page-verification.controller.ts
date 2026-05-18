import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageVerificationService } from './page-verification.service';
import {
  CreateVerificationDto,
  DeleteVerificationDto,
  MarkObsoleteDto,
  RejectApprovalDto,
  SubmitForApprovalDto,
  UpdateVerificationDto,
  VerificationInfoDto,
  VerificationsListDto,
  VerifyPageDto,
} from './dto/page-verification.dto';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PageVerificationController {
  constructor(
    private readonly verificationService: PageVerificationService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('verification-info')
  async getVerificationInfo(
    @Body() dto: VerificationInfoDto,
    @AuthUser() user: User,
  ) {
    return this.verificationService.getVerificationInfo(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create-verification')
  async createVerification(
    @Body() dto: CreateVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.verificationService.createVerification(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-verification')
  async updateVerification(
    @Body() dto: UpdateVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.verificationService.updateVerification(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete-verification')
  async deleteVerification(
    @Body() dto: DeleteVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.verificationService.deleteVerification(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify')
  async verifyPage(
    @Body() dto: VerifyPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.verificationService.verifyPage(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('submit-for-approval')
  async submitForApproval(
    @Body() dto: SubmitForApprovalDto,
    @AuthUser() user: User,
  ) {
    await this.verificationService.submitForApproval(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reject-approval')
  async rejectApproval(
    @Body() dto: RejectApprovalDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.verificationService.rejectApproval(
      dto.pageId,
      dto.comment,
      user,
      workspace,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('mark-obsolete')
  async markObsolete(
    @Body() dto: MarkObsoleteDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.verificationService.markObsolete(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verifications')
  async listVerifications(
    @Body() dto: VerificationsListDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.verificationService.listVerifications(dto, user, workspace);
  }
}
