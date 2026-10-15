import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { join } from 'path';
import * as fs from 'node:fs';
import fastifyStatic from '@fastify/static';
import { EnvironmentService } from '../environment/environment.service';

@Module({})
export class StaticModule implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly environmentService: EnvironmentService,
  ) {}

  public async onModuleInit() {
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    const app = httpAdapter.getInstance();

    const clientDistPath = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'client/dist',
    );

    const indexFilePath = join(clientDistPath, 'index.html');

    if (fs.existsSync(clientDistPath) && fs.existsSync(indexFilePath)) {
      const indexTemplateFilePath = join(clientDistPath, 'index-template.html');
      const windowVar = '<!--window-config-->';

      const configString = {
        ENV: this.environmentService.getNodeEnv(),
        APP_URL: this.environmentService.getAppUrl(),
        CLOUD: this.environmentService.isCloud(),
        FILE_UPLOAD_SIZE_LIMIT:
          this.environmentService.getFileUploadSizeLimit(),
        FILE_IMPORT_SIZE_LIMIT:
          this.environmentService.getFileImportSizeLimit(),
        DRAWIO_URL: this.environmentService.getDrawioUrl(),
        SUBDOMAIN_HOST: this.environmentService.isCloud()
          ? this.environmentService.getSubdomainHost()
          : undefined,
        COLLAB_URL: this.environmentService.getCollabUrl(),
        BILLING_TRIAL_DAYS: this.environmentService.isCloud()
          ? this.environmentService.getBillingTrialDays()
          : undefined,
        POSTHOG_HOST: this.environmentService.getPostHogHost(),
        POSTHOG_KEY: this.environmentService.getPostHogKey(),
        // Suite applications reachable from this deployment (Paramètres ›
        // Connexions, and the "Retour à ConqrMeet" button of the settings).
        MEET_APP_URL: this.environmentService.getMeetAppUrl() || undefined,
        PLANE_APP_URL: this.environmentService.getPlaneAppUrl() || undefined,
        SERVICE_APP_URL:
          this.environmentService.getServiceAppUrl() || undefined,
        // Client identity on the sign-in pages (e.g. "ltc"); unset = ConqrAI.
        CLIENT_BRAND: process.env.CLIENT_BRAND || undefined,
      };

      const windowScriptContent = `<script>window.CONFIG=${JSON.stringify(configString)};</script>`;

      if (!fs.existsSync(indexTemplateFilePath)) {
        fs.copyFileSync(indexFilePath, indexTemplateFilePath);
      }

      const html = fs.readFileSync(indexTemplateFilePath, 'utf8');
      const transformedHtml = html.replace(windowVar, windowScriptContent);

      fs.writeFileSync(indexFilePath, transformedHtml);

      const RENDER_PATH = '*';

      await app.register(fastifyStatic, {
        root: clientDistPath,
        wildcard: false,
      });

      // Serve index.html for all GET requests except API, MCP, and collab routes.
      app.get(RENDER_PATH, (req: any, res: any) => {
        const url: string = req.url ?? req.raw?.url ?? '';
        if (
          url.startsWith('/api') ||
          url.startsWith('/mcp') ||
          url.startsWith('/collab') ||
          url.startsWith('/socket.io') ||
          url.startsWith('/oauth') ||
          url.startsWith('/.well-known')
        ) {
          return res.callNotFound();
        }
        const stream = fs.createReadStream(indexFilePath);
        res
          .header('Cache-Control', 'no-cache, no-store, must-revalidate')
          .type('text/html')
          .send(stream);
      });
    }
  }
}
