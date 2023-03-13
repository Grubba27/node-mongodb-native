import { expect } from 'chai';
import * as os from 'os';
import * as sinon from 'sinon';

import { Connection, DefaultHandshakeDecorator, HostAddress } from '../../../mongodb';

describe('DefaultHandshakeDecorator', function () {
  const mockConnection = sinon.createStubInstance(Connection);
  const metadata = {
    driver: {
      name: 'Node',
      version: '5.0.0'
    },
    os: {
      type: os.type(),
      name: process.platform,
      architecture: process.arch,
      version: os.release()
    },
    platform: 'MacOS'
  };
  const options = {
    id: 1,
    generation: 2,
    hostAddress: new HostAddress('127.0.0.1:27017'),
    monitorCommands: false,
    tls: false,
    loadBalanced: false,
    metadata: metadata
  };

  describe('#constructor', function () {
    context('when the auth context is provided', function () {
      const context = { connection: mockConnection, options: options };
      const decorator = new DefaultHandshakeDecorator(context);

      it('sets the auth context', function () {
        expect(decorator.context).to.equal(context);
      });
    });

    context('when the auth context is not provided', function () {
      const decorator = new DefaultHandshakeDecorator();

      it('does not set an auth context', function () {
        expect(decorator.context).to.not.exist;
      });
    });
  });

  describe('#generate', function () {
    context('when the auth context exists', function () {
      context('when compressor options exist', function () {
        const newOptions = { ...options, compressors: ['zstd'] as any };
        const context = { connection: mockConnection, options: newOptions };
        const decorator = new DefaultHandshakeDecorator(context);

        it('sets the options with the compressors on the handshake', async function () {
          const handshake = await decorator.decorate({});
          expect(handshake).to.deep.equal({
            client: metadata,
            helloOk: true,
            compression: ['zstd']
          });
        });
      });

      context('when compressor options do not exist', function () {
        const context = { connection: mockConnection, options: options };
        const decorator = new DefaultHandshakeDecorator(context);

        it('sets the options with empty compressors on the handshake', async function () {
          const handshake = await decorator.decorate({});
          expect(handshake).to.deep.equal({
            client: metadata,
            helloOk: true,
            compression: []
          });
        });
      });
    });

    context('when the auth context does not exist', function () {
      const decorator = new DefaultHandshakeDecorator();

      it('returns the handshake with helloOk', async function () {
        const handshake = await decorator.decorate({});
        expect(handshake).to.deep.equal({ helloOk: true });
      });
    });
  });
});
