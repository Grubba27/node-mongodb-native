import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  Connection,
  HandshakeDecorator,
  HandshakeDocument,
  HandshakeGenerator,
  LEGACY_HELLO_COMMAND
} from '../../../mongodb';

class TestDecorator implements HandshakeDecorator {
  async decorate(handshake: HandshakeDocument): Promise<HandshakeDocument> {
    handshake.foo = 'bar';
    return handshake;
  }
}

describe('HandshakeGenerator', function () {
  describe('#generate', function () {
    context('when decorators are provided', function () {
      const mockConnection = sinon.createStubInstance(Connection);
      const decorator = new TestDecorator();
      const generator = new HandshakeGenerator([decorator]);

      it('decorates the handshake', async function () {
        const handshake = await generator.generate(mockConnection);
        expect(handshake).to.deep.equal({ [LEGACY_HELLO_COMMAND]: 1, foo: 'bar' });
      });
    });

    context('when decorators are not provided', function () {
      const generator = new HandshakeGenerator([]);

      context('when using the stable api', function () {
        const mockConnection = sinon.createStubInstance(Connection);
        mockConnection.serverApi = { version: '1' };

        it('uses the hello command', async function () {
          const handshake = await generator.generate(mockConnection);
          expect(handshake).to.deep.equal({ hello: 1 });
        });
      });

      context('when not using the stable api', function () {
        const mockConnection = sinon.createStubInstance(Connection);

        it('uses the legacy hello command', async function () {
          const handshake = await generator.generate(mockConnection);
          expect(handshake).to.deep.equal({ [LEGACY_HELLO_COMMAND]: 1 });
        });
      });
    });
  });
});
