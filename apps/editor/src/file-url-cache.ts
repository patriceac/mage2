const fileUrlCache = new Map<string, Promise<string>>();

export function resolveFileUrl(filePath: string): Promise<string> {
  const cachedUrl = fileUrlCache.get(filePath);
  if (cachedUrl) {
    return cachedUrl;
  }

  const nextUrl = window.editorApi.pathToFileUrl(filePath).catch((error) => {
    fileUrlCache.delete(filePath);
    throw error;
  });
  fileUrlCache.set(filePath, nextUrl);
  return nextUrl;
}
