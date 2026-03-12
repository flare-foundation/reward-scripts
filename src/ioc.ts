import { Container } from "typescript-ioc";

const iocContainer = (_request: unknown) => {
  return Container;
};

// export according to convention
export { iocContainer };
