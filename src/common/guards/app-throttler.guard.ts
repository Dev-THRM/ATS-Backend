import { Injectable, Inject } from '@nestjs/common';
import { ThrottlerGuard, getOptionsToken, getStorageToken } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: any,
    @Inject(getStorageToken()) storageService: any,
    @Inject(Reflector) reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }
}
