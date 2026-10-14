import { UserRepo } from '@docmost/db/repos/user/user.repo';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { NotificationSettingKey } from '../notification/notification.constants';
import {
  comparePasswordHash,
  diffAuditTrackedFields,
} from 'src/common/helpers/utils';
import { Workspace } from '@docmost/db/types/entity.types';
import { validateSsoEnforcement } from '../auth/auth.util';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AccountEmailService } from '../../integrations/mail/account-email.service';

@Injectable()
export class UserService {
  constructor(
    private userRepo: UserRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @Optional() private readonly accountEmails?: AccountEmailService,
  ) {}

  async findById(userId: string, workspaceId: string) {
    return this.userRepo.findById(userId, workspaceId);
  }

  async update(
    updateUserDto: UpdateUserDto,
    userId: string,
    workspace: Workspace,
  ) {
    const includePassword =
      updateUserDto.email != null && updateUserDto.confirmPassword != null;

    const user = await this.userRepo.findById(userId, workspace.id, {
      includePassword,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // preference update
    if (typeof updateUserDto.fullPageWidth !== 'undefined') {
      return this.userRepo.setFullPageWidth(
        userId,
        updateUserDto.fullPageWidth,
      );
    }

    if (typeof updateUserDto.pageEditMode !== 'undefined') {
      return this.userRepo.setPageEditMode(
        userId,
        updateUserDto.pageEditMode.toLowerCase(),
      );
    }

    if (typeof updateUserDto.notificationSounds !== 'undefined') {
      const incoming = updateUserDto.notificationSounds ?? {};
      const value: Record<string, unknown> = {};
      for (const key of [
        'enabled',
        'volume',
        'backgroundOnly',
        'muteWhileRecording',
        'doNotDisturb',
      ] as const) {
        if (typeof incoming[key] !== 'undefined') value[key] = incoming[key];
      }
      if (incoming.categories) {
        const current =
          (user.settings as any)?.preferences?.notificationSounds?.categories ??
          {};
        value.categories = { ...current };
        for (const [k, v] of Object.entries(incoming.categories)) {
          if (typeof v === 'string') (value.categories as any)[k] = v;
        }
      }
      return this.userRepo.setPreferenceObject(
        userId,
        'notificationSounds',
        value,
      );
    }

    if (typeof updateUserDto.meetingDefaults !== 'undefined') {
      const incoming = updateUserDto.meetingDefaults ?? {};
      const value: Record<string, unknown> = {};
      for (const key of [
        'defaultMeetingType',
        'defaultLanguage',
        'autoProcess',
      ] as const) {
        if (typeof incoming[key] !== 'undefined') {
          value[key] = incoming[key];
        }
      }
      return this.userRepo.setMeetingDefaults(userId, value);
    }

    if (typeof updateUserDto.theme !== 'undefined') {
      const value: Record<string, unknown> = { theme: updateUserDto.theme };
      if (updateUserDto.theme === 'custom' && updateUserDto.themeCustom) {
        value.custom = {
          primary: updateUserDto.themeCustom.primary,
          background: updateUserDto.themeCustom.background,
          darkPalette: updateUserDto.themeCustom.darkPalette,
        };
      }
      return this.userRepo.setThemePreference(userId, value);
    }

    const notificationSettings: Record<string, NotificationSettingKey> = {
      notificationPageUpdates: 'page.updated',
      notificationPageUserMention: 'page.userMention',
      notificationCommentUserMention: 'comment.userMention',
      notificationCommentCreated: 'comment.created',
      notificationCommentResolved: 'comment.resolved',
    };

    for (const [dtoField, settingKey] of Object.entries(notificationSettings)) {
      if (typeof updateUserDto[dtoField] !== 'undefined') {
        return this.userRepo.updateNotificationSetting(
          userId,
          settingKey,
          updateUserDto[dtoField],
        );
      }
    }

    const userBefore = {
      name: user.name,
      email: user.email,
      locale: user.locale,
    };

    if (updateUserDto.name) {
      user.name = updateUserDto.name;
    }

    if (updateUserDto.email && user.email != updateUserDto.email) {
      validateSsoEnforcement(workspace);

      if (!updateUserDto.confirmPassword) {
        throw new BadRequestException(
          'You must provide a password to change your email',
        );
      }

      const isPasswordMatch = await comparePasswordHash(
        updateUserDto.confirmPassword,
        user.password,
      );

      if (!isPasswordMatch) {
        throw new BadRequestException(
          'You must provide the correct password to change your email',
        );
      }

      if (await this.userRepo.findByEmail(updateUserDto.email, workspace.id)) {
        throw new BadRequestException('A user with this email already exists');
      }

      user.email = updateUserDto.email;
    }

    if (updateUserDto.locale) {
      user.locale = updateUserDto.locale;
    }

    delete updateUserDto.confirmPassword;

    await this.userRepo.updateUser(updateUserDto, userId, workspace.id);

    const changes = diffAuditTrackedFields(
      ['name', 'email'],
      updateUserDto,
      userBefore,
      user,
    );

    if (changes) {
      this.auditService.log({
        event: AuditEvent.USER_UPDATED,
        resourceType: AuditResource.USER,
        resourceId: userId,
        changes,
      });
    }

    if (userBefore.email && user.email !== userBefore.email) {
      await this.accountEmails?.emailChanged(
        {
          id: userId,
          name: user.name,
          email: user.email,
          workspaceId: workspace.id,
        },
        userBefore.email,
        user.email,
      );
    }

    return user;
  }
}
