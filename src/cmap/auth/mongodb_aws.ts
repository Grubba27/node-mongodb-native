import * as crypto from 'crypto';
import * as http from 'http';
import * as process from 'process';
import * as url from 'url';

import type { Binary, BSONSerializeOptions } from '../../bson';
import * as BSON from '../../bson';
import { aws4, getAwsCredentialProvider } from '../../deps';
import {
  MongoAWSError,
  MongoCompatibilityError,
  MongoMissingCredentialsError,
  MongoRuntimeError
} from '../../error';
import { ByteUtils, Callback, maxWireVersion, ns } from '../../utils';
import { AuthContext, AuthProvider } from './auth_provider';
import { MongoCredentials } from './mongo_credentials';
import { AuthMechanism } from './providers';

const ASCII_N = 110;
const AWS_RELATIVE_URI = 'http://169.254.170.2';
const AWS_EC2_URI = 'http://169.254.169.254';
const AWS_EC2_PATH = '/latest/meta-data/iam/security-credentials';
const bsonOptions: BSONSerializeOptions = {
  useBigInt64: false,
  promoteLongs: true,
  promoteValues: true,
  promoteBuffers: false,
  bsonRegExp: false
};

interface AWSSaslContinuePayload {
  a: string;
  d: string;
  t?: string;
}

export class MongoDBAWS extends AuthProvider {
  override auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials } = authContext;
    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }

    if ('kModuleError' in aws4) {
      return callback(aws4['kModuleError']);
    }
    const { sign } = aws4;

    if (maxWireVersion(connection) < 9) {
      callback(
        new MongoCompatibilityError(
          'MONGODB-AWS authentication requires MongoDB version 4.4 or later'
        )
      );
      return;
    }

    if (!credentials.username) {
      makeTempCredentials(credentials, (err, tempCredentials) => {
        if (err || !tempCredentials) return callback(err);

        authContext.credentials = tempCredentials;
        this.auth(authContext, callback);
      });

      return;
    }

    const accessKeyId = credentials.username;
    const secretAccessKey = credentials.password;
    const sessionToken = credentials.mechanismProperties.AWS_SESSION_TOKEN;

    // If all three defined, include sessionToken, else include username and pass, else no credentials
    const awsCredentials =
      accessKeyId && secretAccessKey && sessionToken
        ? { accessKeyId, secretAccessKey, sessionToken }
        : accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined;

    const db = credentials.source;
    crypto.randomBytes(32, (err, nonce) => {
      if (err) {
        callback(err);
        return;
      }

      const saslStart = {
        saslStart: 1,
        mechanism: 'MONGODB-AWS',
        payload: BSON.serialize({ r: nonce, p: ASCII_N }, bsonOptions)
      };

      connection.command(ns(`${db}.$cmd`), saslStart, undefined, (err, res) => {
        if (err) return callback(err);

        const serverResponse = BSON.deserialize(res.payload.buffer, bsonOptions) as {
          s: Binary;
          h: string;
        };
        const host = serverResponse.h;
        const serverNonce = serverResponse.s.buffer;
        if (serverNonce.length !== 64) {
          callback(
            // TODO(NODE-3483)
            new MongoRuntimeError(`Invalid server nonce length ${serverNonce.length}, expected 64`)
          );

          return;
        }

        if (!ByteUtils.equals(serverNonce.subarray(0, nonce.byteLength), nonce)) {
          // throw because the serverNonce's leading 32 bytes must equal the client nonce's 32 bytes
          // https://github.com/mongodb/specifications/blob/875446db44aade414011731840831f38a6c668df/source/auth/auth.rst#id11

          // TODO(NODE-3483)
          callback(new MongoRuntimeError('Server nonce does not begin with client nonce'));
          return;
        }

        if (host.length < 1 || host.length > 255 || host.indexOf('..') !== -1) {
          // TODO(NODE-3483)
          callback(new MongoRuntimeError(`Server returned an invalid host: "${host}"`));
          return;
        }

        const body = 'Action=GetCallerIdentity&Version=2011-06-15';
        const options = sign(
          {
            method: 'POST',
            host,
            region: deriveRegion(serverResponse.h),
            service: 'sts',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': body.length,
              'X-MongoDB-Server-Nonce': ByteUtils.toBase64(serverNonce),
              'X-MongoDB-GS2-CB-Flag': 'n'
            },
            path: '/',
            body
          },
          awsCredentials
        );

        const payload: AWSSaslContinuePayload = {
          a: options.headers.Authorization,
          d: options.headers['X-Amz-Date']
        };
        if (sessionToken) {
          payload.t = sessionToken;
        }

        const saslContinue = {
          saslContinue: 1,
          conversationId: 1,
          payload: BSON.serialize(payload, bsonOptions)
        };

        connection.command(ns(`${db}.$cmd`), saslContinue, undefined, callback);
      });
    });
  }
}

interface AWSTempCredentials {
  AccessKeyId?: string;
  SecretAccessKey?: string;
  Token?: string;
  RoleArn?: string;
  Expiration?: Date;
}

/* @internal */
export interface AWSCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  expiration?: Date;
}

function makeTempCredentials(credentials: MongoCredentials, callback: Callback<MongoCredentials>) {
  function done(creds: AWSTempCredentials) {
    if (!creds.AccessKeyId || !creds.SecretAccessKey || !creds.Token) {
      callback(
        new MongoMissingCredentialsError('Could not obtain temporary MONGODB-AWS credentials')
      );
      return;
    }

    callback(
      undefined,
      new MongoCredentials({
        username: creds.AccessKeyId,
        password: creds.SecretAccessKey,
        source: credentials.source,
        mechanism: AuthMechanism.MONGODB_AWS,
        mechanismProperties: {
          AWS_SESSION_TOKEN: creds.Token
        }
      })
    );
  }

  const credentialProvider = getAwsCredentialProvider();

  // Check if the AWS credential provider from the SDK is present. If not,
  // use the old method.
  if ('kModuleError' in credentialProvider) {
    // If the environment variable AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
    // is set then drivers MUST assume that it was set by an AWS ECS agent
    if (process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) {
      request(
        `${AWS_RELATIVE_URI}${process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}`,
        undefined,
        (err, res) => {
          if (err) return callback(err);
          done(res);
        }
      );

      return;
    }

    // Otherwise assume we are on an EC2 instance

    // get a token
    request(
      `${AWS_EC2_URI}/latest/api/token`,
      { method: 'PUT', json: false, headers: { 'X-aws-ec2-metadata-token-ttl-seconds': 30 } },
      (err, token) => {
        if (err) return callback(err);

        // get role name
        request(
          `${AWS_EC2_URI}/${AWS_EC2_PATH}`,
          { json: false, headers: { 'X-aws-ec2-metadata-token': token } },
          (err, roleName) => {
            if (err) return callback(err);

            // get temp credentials
            request(
              `${AWS_EC2_URI}/${AWS_EC2_PATH}/${roleName}`,
              { headers: { 'X-aws-ec2-metadata-token': token } },
              (err, creds) => {
                if (err) return callback(err);
                done(creds);
              }
            );
          }
        );
      }
    );
  } else {
    /*
     * Creates a credential provider that will attempt to find credentials from the
     * following sources (listed in order of precedence):
     *
     * - Environment variables exposed via process.env
     * - SSO credentials from token cache
     * - Web identity token credentials
     * - Shared credentials and config ini files
     * - The EC2/ECS Instance Metadata Service
     */
    const { fromNodeProviderChain } = credentialProvider;
    const provider = fromNodeProviderChain();
    provider()
      .then((creds: AWSCredentials) => {
        done({
          AccessKeyId: creds.accessKeyId,
          SecretAccessKey: creds.secretAccessKey,
          Token: creds.sessionToken,
          Expiration: creds.expiration
        });
      })
      .catch((error: Error) => {
        callback(new MongoAWSError(error.message));
      });
  }
}

function deriveRegion(host: string) {
  const parts = host.split('.');
  if (parts.length === 1 || parts[1] === 'amazonaws') {
    return 'us-east-1';
  }

  return parts[1];
}

interface RequestOptions {
  json?: boolean;
  method?: string;
  timeout?: number;
  headers?: http.OutgoingHttpHeaders;
}

function request(uri: string, _options: RequestOptions | undefined, callback: Callback) {
  const options = Object.assign(
    {
      method: 'GET',
      timeout: 10000,
      json: true
    },
    url.parse(uri),
    _options
  );

  const req = http.request(options, res => {
    res.setEncoding('utf8');

    let data = '';
    res.on('data', d => (data += d));
    res.on('end', () => {
      if (options.json === false) {
        callback(undefined, data);
        return;
      }

      try {
        const parsed = JSON.parse(data);
        callback(undefined, parsed);
      } catch (err) {
        // TODO(NODE-3483)
        callback(new MongoRuntimeError(`Invalid JSON response: "${data}"`));
      }
    });
  });

  req.on('timeout', () => {
    req.destroy(new MongoAWSError(`AWS request to ${uri} timed out after ${options.timeout} ms`));
  });

  req.on('error', err => callback(err));
  req.end();
}
