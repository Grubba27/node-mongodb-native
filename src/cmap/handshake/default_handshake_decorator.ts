import type { AuthContext } from '../auth/auth_provider';
import { makeClientMetadata } from './client_metadata';
import type { HandshakeDecorator } from './handshake_decorator';
import type { HandshakeDocument } from './handshake_document';

/**
 * Decorates the handshake with the initial connection handshake
 * values.
 * @internal
 */
export class DefaultHandshakeDecorator implements HandshakeDecorator {
  context?: AuthContext;
  constructor(context?: AuthContext) {
    this.context = context;
  }
  async decorate(handshake: HandshakeDocument): Promise<HandshakeDocument> {
    handshake.helloOk = true;

    if (this.context) {
      const options = this.context.options;
      const compressors = options.compressors ? options.compressors : [];

      handshake.client = options.metadata || makeClientMetadata(options);
      handshake.compression = compressors;

      if (options.loadBalanced === true) {
        handshake.loadBalanced = true;
      }
    }
    return handshake;
  }
}
