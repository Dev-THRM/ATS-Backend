import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('app/download')
  downloadApk(@Res() res: Response) {
    const localApk = path.resolve(process.cwd(), 'storage/downloads/thrm-universe-ats.apk');
    if (fs.existsSync(localApk)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="thrm-universe-ats.apk"');
      return res.sendFile(localApk);
    }
    return res.redirect('https://api.expo.dev/v2/artifacts/eas/l1iHUTLN4oK_uRt0srgyQ8hfJ1dXyYxhSH5YdmCNdiM');
  }
}
