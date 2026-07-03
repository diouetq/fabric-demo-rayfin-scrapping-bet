import { UserDataFunctions, type RayfinContext } from '@microsoft/fabric-user-data-functions';
import { listPipelineJobInstances, uploadBytesToOneLake } from './paris-import.js';

const udf = new UserDataFunctions();

udf.func('uploadParisImport', async (
  fileName: string,
  contentBase64: string,
  ctx: RayfinContext,
): Promise<{ url: string; bytesUploaded: number }> => {
  ctx.log.info(`uploadParisImport: ${fileName}`);
  const data = Buffer.from(contentBase64, 'base64');
  return uploadBytesToOneLake(fileName, data);
}, []);

udf.func('listImportPipelineJobs', async (
  ctx: RayfinContext,
): Promise<Array<{ id: string; status: string; startTime?: string; endTime?: string; failureReason?: string }>> => {
  ctx.log.info('listImportPipelineJobs');
  return listPipelineJobInstances();
}, []);
