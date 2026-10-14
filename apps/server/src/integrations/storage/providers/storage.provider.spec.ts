import {
  createStorageDriver,
  storageDriverConfigProvider,
} from './storage.provider';
import { StorageOption } from '../interfaces';
import { LocalDriver, LocalReadFallbackDriver, S3Driver } from '../drivers';
import { EnvironmentService } from '../../environment/environment.service';
import { LOCAL_STORAGE_PATH } from '../../../common/helpers';

function env(values: Record<string, string | undefined>) {
  const config = { get: (key: string, def?: unknown) => values[key] ?? def };
  return new EnvironmentService(config as any);
}

const B2_ENV = {
  STORAGE_DRIVER: 's3',
  AWS_S3_REGION: 'us-east-005',
  AWS_S3_ENDPOINT: 'https://s3.us-east-005.backblazeb2.com',
  AWS_S3_BUCKET: 'ConqrHubLTCENV',
  AWS_S3_FORCE_PATH_STYLE: 'true',
};

describe('storage provider wiring', () => {
  it('keeps the plain S3 driver unless the fallback is explicitly enabled', async () => {
    const cfg: any = await storageDriverConfigProvider.useFactory(env(B2_ENV));
    expect(cfg.localReadFallback).toBeUndefined();
    expect(cfg.config).toMatchObject({
      bucket: 'ConqrHubLTCENV',
      region: 'us-east-005',
      forcePathStyle: true,
    });
    expect(createStorageDriver(cfg)).toBeInstanceOf(S3Driver);
  });

  it.each(['false', '0', 'no', '', 'maybe'])(
    'STORAGE_LOCAL_READ_FALLBACK=%j stays disabled',
    async (v) => {
      const cfg: any = await storageDriverConfigProvider.useFactory(
        env({ ...B2_ENV, STORAGE_LOCAL_READ_FALLBACK: v }),
      );
      expect(cfg.localReadFallback).toBeUndefined();
    },
  );

  it('wraps S3 with the read-only fallback on the retained local path when enabled', async () => {
    const cfg: any = await storageDriverConfigProvider.useFactory(
      env({ ...B2_ENV, STORAGE_LOCAL_READ_FALLBACK: 'true' }),
    );
    expect(cfg.localReadFallback).toEqual({ storagePath: LOCAL_STORAGE_PATH });
    const driver = createStorageDriver(cfg);
    expect(driver).toBeInstanceOf(LocalReadFallbackDriver);
    expect(driver.getDriverName()).toBe(StorageOption.S3);
  });

  it('honours an explicit retained path', async () => {
    const cfg: any = await storageDriverConfigProvider.useFactory(
      env({
        ...B2_ENV,
        STORAGE_LOCAL_READ_FALLBACK: 'TRUE',
        STORAGE_LOCAL_READ_FALLBACK_PATH: ' /app/data/storage ',
      }),
    );
    expect(cfg.localReadFallback).toEqual({ storagePath: '/app/data/storage' });
  });

  it('ignores the fallback flag for local storage', async () => {
    const cfg: any = await storageDriverConfigProvider.useFactory(
      env({ STORAGE_DRIVER: 'local', STORAGE_LOCAL_READ_FALLBACK: 'true' }),
    );
    expect(cfg.localReadFallback).toBeUndefined();
    expect(createStorageDriver(cfg)).toBeInstanceOf(LocalDriver);
  });

  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['false', false],
    ['0', false],
    [undefined, undefined],
  ])('AWS_S3_FORCE_PATH_STYLE=%j -> %j', (raw, expected) => {
    expect(env({ AWS_S3_FORCE_PATH_STYLE: raw }).getAwsS3ForcePathStyle()).toBe(
      expected,
    );
  });
});
