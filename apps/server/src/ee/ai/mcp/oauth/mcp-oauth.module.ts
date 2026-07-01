import { Module } from '@nestjs/common';
import { TokenModule } from '../../../../core/auth/token.module';
import { ApiKeyModule } from '../../../api-key/api-key.module';
import { McpOauthService } from './mcp-oauth.service';
import { McpOauthClientRepo } from './mcp-oauth-client.repo';
import { McpOauthRefreshTokenRepo } from './mcp-oauth-refresh-token.repo';
import { McpAuthGuard } from './mcp-auth.guard';
import { OauthMetadataController } from './oauth-metadata.controller';
import { OauthRegisterController } from './oauth-register.controller';
import { OauthAuthorizeController } from './oauth-authorize.controller';
import { OauthTokenController } from './oauth-token.controller';

/**
 * Minimal OAuth 2.1 authorization server for the MCP resource. Discovery, DCR,
 * authorize/consent, and token endpoints; plus the McpAuthGuard used by the MCP
 * resource controllers.
 */
@Module({
  imports: [TokenModule, ApiKeyModule],
  controllers: [
    OauthMetadataController,
    OauthRegisterController,
    OauthAuthorizeController,
    OauthTokenController,
  ],
  providers: [
    McpOauthService,
    McpOauthClientRepo,
    McpOauthRefreshTokenRepo,
    McpAuthGuard,
  ],
  exports: [McpAuthGuard],
})
export class McpOauthModule {}
