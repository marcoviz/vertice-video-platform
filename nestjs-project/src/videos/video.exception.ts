import { DomainException } from '../common/exceptions/domain.exception';

export class VideoException extends DomainException {
  constructor(code: string, status: number, message: string) {
    super(code, status, message);
  }
}
