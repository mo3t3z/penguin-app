import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  imageProcessingPlan,
  validateUploadReadyImage,
  type SelectedPostImage,
  type UploadReadyPostImage,
} from './selected-media';

const PROCESSING_TIMEOUT_MS = 30_000;

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Image processing took too long. Try another image.')), PROCESSING_TIMEOUT_MS);
    operation.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); },
    );
  });
}

async function processImage(image: SelectedPostImage): Promise<SelectedPostImage> {
  const plan = imageProcessingPlan(image.original);
  const context = ImageManipulator.manipulate(image.original.uri);
  if (plan.resize) context.resize(plan.resize);

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    base64: false,
    compress: plan.compression,
    format: plan.outputMimeType === 'image/png' ? SaveFormat.PNG : SaveFormat.JPEG,
  });
  const file = new File(result.uri);
  if (!file.exists) throw new Error('The processed image file could not be saved.');

  const processed: UploadReadyPostImage = validateUploadReadyImage({
    uri: result.uri,
    width: result.width,
    height: result.height,
    mimeType: plan.outputMimeType,
    fileName: file.name || `penguin-image.${plan.outputExtension}`,
    fileSize: file.size,
  });
  return { ...image, processed };
}

export function processPostImage(image: SelectedPostImage): Promise<SelectedPostImage> {
  return withTimeout(processImage(image));
}
