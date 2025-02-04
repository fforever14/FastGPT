import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { loadSystemModels, updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { updateFastGPTConfigBuffer } from '@fastgpt/service/common/system/config/controller';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type updateDefaultQuery = {};

export type updateDefaultBody = {
  [ModelTypeEnum.llm]?: string;
  [ModelTypeEnum.embedding]?: string;
  [ModelTypeEnum.tts]?: string;
  [ModelTypeEnum.stt]?: string;
  [ModelTypeEnum.rerank]?: string;
};

export type updateDefaultResponse = {};

async function handler(
  req: ApiRequestProps<updateDefaultBody, updateDefaultQuery>,
  res: ApiResponseType<any>
): Promise<updateDefaultResponse> {
  await authSystemAdmin({ req });

  const { llm, embedding, tts, stt, rerank } = req.body;

  await mongoSessionRun(async (session) => {
    await MongoSystemModel.updateMany({}, { $unset: { 'metadata.isDefault': 1 } }, { session });

    if (llm) {
      await MongoSystemModel.updateOne(
        { model: llm },
        { $set: { 'metadata.isDefault': true } },
        { session }
      );
    }
    if (embedding) {
      await MongoSystemModel.updateOne(
        { model: embedding },
        { $set: { 'metadata.isDefault': true } },
        { session }
      );
    }
    if (tts) {
      await MongoSystemModel.updateOne(
        { model: tts },
        { $set: { 'metadata.isDefault': true } },
        { session }
      );
    }
    if (stt) {
      await MongoSystemModel.updateOne(
        { model: stt },
        { $set: { 'metadata.isDefault': true } },
        { session }
      );
    }
    if (rerank) {
      await MongoSystemModel.updateOne(
        { model: rerank },
        { $set: { 'metadata.isDefault': true } },
        { session }
      );
    }
  });

  await updatedReloadSystemModel();

  return {};
}

export default NextAPI(handler);
