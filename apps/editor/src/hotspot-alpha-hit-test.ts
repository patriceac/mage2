export interface HotspotVisualAlphaMask {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
}

export interface ContainedImageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HotspotVisualHitPointOptions {
  pointX: number;
  pointY: number;
  hotspotWidth: number;
  hotspotHeight: number;
  visualBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rotationDegrees: number;
  imageWidth: number;
  imageHeight: number;
}

const hotspotVisualAlphaMaskCache = new Map<string, Promise<HotspotVisualAlphaMask | undefined>>();

export function resolveContainedImageBox(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): ContainedImageBox {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    };
  }

  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height
  };
}

export function resolveHotspotVisualHitPoint({
  pointX,
  pointY,
  hotspotWidth,
  hotspotHeight,
  visualBox,
  rotationDegrees,
  imageWidth,
  imageHeight
}: HotspotVisualHitPointOptions): { x: number; y: number } | undefined {
  if (
    hotspotWidth <= 0 ||
    hotspotHeight <= 0 ||
    visualBox.width <= 0 ||
    visualBox.height <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return undefined;
  }

  const centerX = (visualBox.x + visualBox.width / 2) * hotspotWidth;
  const centerY = (visualBox.y + visualBox.height / 2) * hotspotHeight;
  const relativeX = pointX - centerX;
  const relativeY = pointY - centerY;
  const rotationRadians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  const unrotatedX = relativeX * cos + relativeY * sin + centerX;
  const unrotatedY = -relativeX * sin + relativeY * cos + centerY;
  const visualLeft = visualBox.x * hotspotWidth;
  const visualTop = visualBox.y * hotspotHeight;
  const localVisualX = unrotatedX - visualLeft;
  const localVisualY = unrotatedY - visualTop;
  const visualWidth = visualBox.width * hotspotWidth;
  const visualHeight = visualBox.height * hotspotHeight;

  if (localVisualX < 0 || localVisualY < 0 || localVisualX > visualWidth || localVisualY > visualHeight) {
    return undefined;
  }

  const imageBox = resolveContainedImageBox(visualWidth, visualHeight, imageWidth, imageHeight);
  if (imageBox.width <= 0 || imageBox.height <= 0) {
    return undefined;
  }

  const imageLocalX = localVisualX - imageBox.x;
  const imageLocalY = localVisualY - imageBox.y;
  if (imageLocalX < 0 || imageLocalY < 0 || imageLocalX > imageBox.width || imageLocalY > imageBox.height) {
    return undefined;
  }

  return {
    x: Math.min(Math.floor((imageLocalX / imageBox.width) * imageWidth), imageWidth - 1),
    y: Math.min(Math.floor((imageLocalY / imageBox.height) * imageHeight), imageHeight - 1)
  };
}

export function isOpaqueHotspotVisualHit(
  alphaMask: HotspotVisualAlphaMask,
  options: HotspotVisualHitPointOptions
): boolean {
  const hitPoint = resolveHotspotVisualHitPoint({
    ...options,
    imageWidth: alphaMask.width,
    imageHeight: alphaMask.height
  });
  if (!hitPoint) {
    return false;
  }

  const alphaIndex = hitPoint.y * alphaMask.width + hitPoint.x;
  return alphaMask.alpha[alphaIndex] > 0;
}

export async function loadHotspotVisualAlphaMask(url: string): Promise<HotspotVisualAlphaMask | undefined> {
  const cachedMask = hotspotVisualAlphaMaskCache.get(url);
  if (cachedMask) {
    return cachedMask;
  }

  const nextMask = readHotspotVisualAlphaMask(url).catch((error) => {
    hotspotVisualAlphaMaskCache.delete(url);
    throw error;
  });
  hotspotVisualAlphaMaskCache.set(url, nextMask);
  return nextMask;
}

async function readHotspotVisualAlphaMask(url: string): Promise<HotspotVisualAlphaMask | undefined> {
  if (typeof Image === "undefined" || typeof document === "undefined") {
    return undefined;
  }

  const image = await loadImage(url);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width <= 0 || height <= 0) {
    return undefined;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return undefined;
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  try {
    const imageData = context.getImageData(0, 0, width, height);
    const alpha = new Uint8ClampedArray(width * height);

    for (let index = 0; index < alpha.length; index += 1) {
      alpha[index] = imageData.data[index * 4 + 3];
    }

    return {
      width,
      height,
      alpha
    };
  } catch {
    return undefined;
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;

  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return image;
  }

  if (typeof image.decode === "function") {
    try {
      await image.decode();
      return image;
    } catch {
      // Fall back to load/error events when decode fails for file-backed images.
    }
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const handleLoad = () => {
      cleanup();
      resolve(image);
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Failed to load hotspot visual alpha mask from '${url}'.`));
    };
    const cleanup = () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };

    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);
  });
}
