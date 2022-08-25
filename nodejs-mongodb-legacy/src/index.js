'use strict';

const mongodb = require('../../src/index');

const { makeLegacyMongoClient } = require('./legacy_wrappers/mongo_client');
const { makeLegacyDb } = require('./legacy_wrappers/db');
const { makeLegacyCollection } = require('./legacy_wrappers/collection');
const { makeLegacyAdmin } = require('./legacy_wrappers/admin');
const {
  makeLegacyAggregationCursor,
  makeLegacyFindCursor,
  makeLegacyListCollectionsCursor,
  makeLegacyListIndexesCursor
} = require('./legacy_wrappers/cursors');
const {
  makeLegacyGridFSBucket,
  makeLegacyGridFSBucketWriteStream
} = require('./legacy_wrappers/gridfs');
const { makeLegacyChangeStream } = require('./legacy_wrappers/change_stream');
const { makeLegacyClientSession } = require('./legacy_wrappers/session');
const {
  makeLegacyUnorderedBulkOperation,
  makeLegacyOrderedBulkOperation
} = require('./legacy_wrappers/bulk');

/** @type {import('..')} */
module.exports = Object.create(null);
Object.defineProperty(module.exports, '__esModule', { value: true });

const classesWithAsyncAPIs = new Map([
  ['Admin', makeLegacyAdmin],
  ['FindCursor', makeLegacyFindCursor],
  ['ListCollectionsCursor', makeLegacyListCollectionsCursor],
  ['ListIndexesCursor', makeLegacyListIndexesCursor],
  ['AggregationCursor', makeLegacyAggregationCursor],
  ['ChangeStream', makeLegacyChangeStream],
  ['Collection', makeLegacyCollection],
  ['Db', makeLegacyDb],
  ['GridFSBucket', makeLegacyGridFSBucket],
  ['ClientSession', makeLegacyClientSession],
  ['MongoClient', makeLegacyMongoClient],

  // Need to be exported top-level still
  ['ClientSession', makeLegacyClientSession],
  ['GridFSBucketWriteStream', makeLegacyGridFSBucketWriteStream],
  ['OrderedBulkOperation', makeLegacyOrderedBulkOperation],
  ['UnorderedBulkOperation', makeLegacyUnorderedBulkOperation]
]);

const TODO_SPECIAL_IMPORTS = new Map([
  ['ClientSession', 'src/sessions'],
  ['GridFSBucketWriteStream', 'src/gridfs/upload'],
  ['OrderedBulkOperation', 'src/bulk/ordered'],
  ['UnorderedBulkOperation', 'src/bulk/unordered']
]);

for (const [missingTopLevelClassName, location] of TODO_SPECIAL_IMPORTS) {
  mongodb[missingTopLevelClassName] = require(`../../${location}`)[missingTopLevelClassName];
}

for (const [mongodbExportName, mongodbExportValue] of Object.entries(mongodb)) {
  let makeLegacyClass = classesWithAsyncAPIs.get(mongodbExportName);
  if (makeLegacyClass != null) {
    const patchedClass = makeLegacyClass(mongodbExportValue);
    Object.defineProperty(module.exports, mongodbExportName, {
      enumerable: true,
      get: function () {
        return patchedClass;
      }
    });
  } else {
    Object.defineProperty(module.exports, mongodbExportName, {
      enumerable: true,
      get: function () {
        return mongodbExportValue;
      }
    });
  }
}
