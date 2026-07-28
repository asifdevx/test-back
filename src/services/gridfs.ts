import mongoose from 'mongoose';
import { Readable } from 'stream';


export const uploadToGridFS = (
  bucket: mongoose.mongo.GridFSBucket,
  file: Express.Multer.File,
  metadata: Record<string, any> = {}
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const filename = `${Date.now()}-${file.originalname}`;

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: file.mimetype,
      metadata,
    });

    const readStream = new Readable();
    readStream.push(file.buffer);
    readStream.push(null);

    readStream
      .pipe(uploadStream)
      .on('error', reject)
      .on('finish', () => resolve(uploadStream.id.toString()));
  });
};
