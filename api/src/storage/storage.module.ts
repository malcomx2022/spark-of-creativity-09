import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { FakeStorageProvider, S3StorageProvider, STORAGE_PROVIDER } from './storage.provider';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [
    FakeStorageProvider,
    S3StorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [APP_CONFIG, FakeStorageProvider, S3StorageProvider],
      useFactory: (config: AppConfig, fake: FakeStorageProvider, s3: S3StorageProvider) => (config.STORAGE_PROVIDER === 's3' ? s3 : fake),
    },
    StorageService,
  ],
  exports: [StorageService, STORAGE_PROVIDER, FakeStorageProvider],
})
export class StorageModule {}
