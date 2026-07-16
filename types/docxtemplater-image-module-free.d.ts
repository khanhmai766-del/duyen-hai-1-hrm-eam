declare module "docxtemplater-image-module-free" {
  interface ImageModuleOptions {
    centered?: boolean;
    fileType?: string;
    getImage: (tagValue: unknown, tagName: string) => Buffer | ArrayBuffer;
    getSize: (img: Buffer | ArrayBuffer, tagValue: unknown, tagName: string) => [number, number];
  }
  export default class ImageModule {
    constructor(options: ImageModuleOptions);
  }
}
