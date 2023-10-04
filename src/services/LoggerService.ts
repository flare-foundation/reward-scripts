import { Factory, Singleton } from 'typescript-ioc';
import { AttLogger, getGlobalLogger } from '../logger/logger';

@Singleton
@Factory(() => new LoggerService())
export class LoggerService {
   public logger: AttLogger;

   constructor() {
      this.logger = getGlobalLogger();
   }
}
