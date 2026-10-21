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
    const candidates = [
      path.resolve(process.cwd(), 'storage/downloads/thrm-universe.apk'),
      path.resolve(process.cwd(), '../ATS-Web/public/downloads/thrm-universe.apk'),
      path.resolve(process.cwd(), 'public/downloads/thrm-universe.apk'),
      path.resolve(process.cwd(), 'storage/downloads/thrm-universe-ats.apk'),
      path.resolve(process.cwd(), '../ATS-Web/public/downloads/thrm-universe-ats.apk'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="thrm-universe.apk"');
        return res.sendFile(candidate);
      }
    }

    return res.redirect('https://thrmuniverse.in/downloads/thrm-universe.apk');
  }

  @Get('download')
  downloadApkAlias(@Res() res: Response) {
    return this.downloadApk(res);
  }
}
