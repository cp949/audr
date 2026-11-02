// CSS Modules와 SVG 가져오기 타입 선언
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module "*.svg" {
  const url: string;
  export default url;
}
