// Client-only decoding keeps raster uploads local and limits memory / session storage use.
export async function readProductImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("请选择 JPG、PNG 或 WebP 图片，不支持 SVG / GIF。");
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("图片不能超过 8 MB，请压缩后重试。");
  if (file.size === 0) throw new Error("图片为空，请重新选择。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40_000_000) {
      throw new Error("图片分辨率过大，请选择 4000 万像素以内的图片。");
    }
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理图片，请换一个浏览器重试。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/webp", 0.82);
    if (result.length > 2_000_000) throw new Error("图片压缩后仍然过大，请使用更小的图片。");
    return result;
  } catch (error) {
    if (error instanceof DOMException) throw new Error("图片无法解码，请使用有效的 JPG、PNG 或 WebP 文件。");
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}
