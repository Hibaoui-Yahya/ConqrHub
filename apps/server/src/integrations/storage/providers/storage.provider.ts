import {
  STORAGE_CONFIG_TOKEN,
  STORAGE_DRIVER_TOKEN,
} from '../constants/storage.constants';
import { EnvironmentService } from '../../environment/environment.service';
import {
  LocalStorageConfig,
  S3StorageConfig,
  StorageConfig,
  StorageDriver,
  StorageOption,
} from '../interfaces';
import { LocalDriver, LocalReadFallbackDriver, S3Driver } from '../drivers';
import { Logger } from '@nestjs/common';
import * as process from 'node:process';
import { LOCAL_STORAGE_PATH } from '../../../common/helpers';
import path from 'path';

export function createStorageDriver(disk: StorageConfig): StorageDriver {
  switch (disk.driver) {
    case StorageOption.LOCAL:
      return new LocalDriver(disk.config as LocalStorageConfig);
    case StorageOption.S3: {
      const s3 = new S3Driver(disk.config as S3StorageConfig);
      if (!disk.localReadFallback) return s3;
      new Logger('StorageProvider').log(
        `STORAGE_LOCAL_READ_FALLBACK is ON: objects missing in S3 are read from ${disk.localReadFallback.storagePath}. Disable it once the cutover reconciliation is complete.`,
      );
      return new LocalReadFallbackDriver(
        s3,
        new LocalDriver(disk.localReadFallback),
      );
    }
    default:
      throw new Error(`Unknown storage driver`);
  }
}

export const storageDriverConfigProvider = {
  provide: STORAGE_CONFIG_TOKEN,
  useFactory: async (environmentService: EnvironmentService) => {
    const driver = environmentService.getStorageDriver().toLowerCase();

    switch (driver) {
      case StorageOption.LOCAL:
        return {
          driver,
          config: {
            storagePath: LOCAL_STORAGE_PATH,
          },
        };

      case StorageOption.S3:
        { const s3Config = {
          driver,
          // Temporary local -> S3 cutover aid, off unless explicitly enabled.
          localReadFallback: environmentService.getStorageLocalReadFallback()
            ? {
                storagePath:
                  environmentService.getStorageLocalReadFallbackPath() ||
                  LOCAL_STORAGE_PATH,
              }
            : undefined,
          config: {
            region: environmentService.getAwsS3Region(),
            endpoint: environmentService.getAwsS3Endpoint(),
            bucket: environmentService.getAwsS3Bucket(),
            baseUrl: environmentService.getAwsS3Url(),
            forcePathStyle: environmentService.getAwsS3ForcePathStyle(),
            credentials: undefined,
          },
        };

        /**
         * This makes use of AWS_S3_ACCESS_KEY_ID and AWS_S3_SECRET_ACCESS_KEY if present,
         * If not present, it makes it lenient for the AWS SDK to use
         * AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY if they are present in the environment
         */
        if (
          environmentService.getAwsS3AccessKeyId() ||
          environmentService.getAwsS3SecretAccessKey()
        ) {
          s3Config.config.credentials = {
            accessKeyId: environmentService.getAwsS3AccessKeyId(),
            secretAccessKey: environmentService.getAwsS3SecretAccessKey(),
          };
        }

        return s3Config; }

      default:
        throw new Error(`Unknown storage driver: ${driver}`);
    }
  },

  inject: [EnvironmentService],
};

export const storageDriverProvider = {
  provide: STORAGE_DRIVER_TOKEN,
  useFactory: (config: StorageConfig) => createStorageDriver(config),
  inject: [STORAGE_CONFIG_TOKEN],
};
