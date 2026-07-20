import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../../integrations/environment/environment.module';
import { SpeechmaticsBatchProvider } from './speechmatics/speechmatics-batch.provider';
import { BATCH_TRANSCRIPTION_PROVIDER } from './transcription-provider.interface';

@Module({
  imports: [EnvironmentModule],
  providers: [
    SpeechmaticsBatchProvider,
    {
      provide: BATCH_TRANSCRIPTION_PROVIDER,
      useExisting: SpeechmaticsBatchProvider,
    },
  ],
  exports: [BATCH_TRANSCRIPTION_PROVIDER, SpeechmaticsBatchProvider],
})
export class TranscriptionModule {}
