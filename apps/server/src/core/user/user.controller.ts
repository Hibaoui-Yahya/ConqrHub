import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { isUserDisabled } from '../../common/helpers';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('me')
  async getUserInfo(
    @AuthUser() authUser: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    // Authentication may reuse a short-lived snapshot. Account settings must
    // reflect the current profile when moving between suite applications.
    const [user, currentWorkspace, memberCount] = await Promise.all([
      this.userService.findById(authUser.id, workspace.id),
      this.workspaceRepo.findById(workspace.id),
      this.workspaceRepo.getActiveUserCount(workspace.id),
    ]);
    if (!user || isUserDisabled(user) || !currentWorkspace) {
      throw new UnauthorizedException();
    }

    const { licenseKey, ...rest } = currentWorkspace;

    const workspaceInfo = {
      ...rest,
      memberCount,
    };

    return { user, workspace: workspaceInfo };
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateUser(
    @Body() updateUserDto: UpdateUserDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.update(updateUserDto, user.id, workspace);
  }
}
