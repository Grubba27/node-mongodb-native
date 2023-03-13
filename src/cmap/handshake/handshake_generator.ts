import { LEGACY_HELLO_COMMAND } from '../../constants';
import type { Connection } from '../connection';
import type { HandshakeDecorator } from './handshake_decorator';
import type { HandshakeDocument } from './handshake_document';

/**
 * Generates the initial handshake.
 * @internal
 */
export class HandshakeGenerator {
  decorators: HandshakeDecorator[];

  /**
   * Instantiate the generator. Inject the decorator array to be able to
   * unit test in isolation.
   */
  constructor(decorators: HandshakeDecorator[]) {
    this.decorators = decorators;
  }

  /**
   * Generate the initial handshake.
   */
  async generate(connection: Connection): Promise<HandshakeDocument> {
    const { serverApi } = connection;

    // The only thing the generator puts in the handshake is a hello or
    // legacy hello. The decorators need to ensure the command is the
    // first option in the handshake.
    const handshakeDoc: HandshakeDocument = {
      [serverApi?.version ? 'hello' : LEGACY_HELLO_COMMAND]: 1
    };

    for (const decorator of this.decorators) {
      await decorator.decorate(handshakeDoc);
    }

    return handshakeDoc;
  }
}
