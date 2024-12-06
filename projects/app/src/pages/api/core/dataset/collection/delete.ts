import type { NextApiRequest } from 'next';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(req: NextApiRequest) {
  const { id: collectionId } = req.query as { id: string };

  if (!collectionId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { teamId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  // find all delete id
  const collections = await findCollectionAndChild({
    teamId,
    datasetId: collection.datasetId._id,
    collectionId,
    fields: '_id teamId datasetId fileId metadata'
  });

  // delete
  await mongoSessionRun((session) =>
    delCollection({
      collections,
      delRelatedSource: true,
      session
    })
  );
}

export default NextAPI(handler);
