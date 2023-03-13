import { expect } from 'chai';
import * as os from 'os';
import * as sinon from 'sinon';

import {
  AuthHandshakeDecorator,
  Connection,
  HostAddress,
  MongoCredentials
} from '../../../mongodb';

describe('AuthHandshakeDecorator', function () {
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
  const authContext = {
    credentials: new MongoCredentials({
      username: 'foo',
      password: 'bar',
      source: '$external',
      mechanismProperties: {}
    }),
    connection: mockConnection,
    options: options
  };

  describe('#decorate', function () {
    context('when no mechanism provided', function () {
      const decorator = new AuthHandshakeDecorator(authContext);

      it('returns the handshake', async function () {
        const handshake = await decorator.decorate({});
        expect(handshake).to.deep.equal({ saslSupportedMechs: '$external.foo' });
      });
    });
  });
});
